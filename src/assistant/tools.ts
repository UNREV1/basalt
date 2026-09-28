// The assistant's tools: the very same workspace tools the MCP server gives
// Claude Desktop / Claude Code (mcp/workspace-tools.ts), plus a few that drive
// the app itself (open a page, go to a view). Tools run in the browser on the
// live Y.Doc, so every edit syncs to the user's other devices like any other.

import { z } from "zod";
import type { BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { displayTitle } from "../../shared/model.ts";
import { ToolError, ref, resolvePage } from "../../mcp/ops.ts";
import { registerWorkspaceTools, type ToolFn } from "../../mcp/workspace-tools.ts";
import { browserConverter } from "../components/import-export/converter.ts";
import { navigate, type ViewName } from "../lib/router.ts";
import { getSettings } from "../lib/settings.ts";
import type { Workspace } from "../lib/workspace.ts";
import { ASSISTANT_ORIGIN } from "./chats.ts";

export interface ToolActivity {
  /** Page the tool is working on (the companion flies to it). */
  pageId?: string;
  /** Short, human description ("Writing “Linear algebra”"). */
  activity: string;
}

export interface AssistantTool {
  name: string;
  title: string;
  description: string;
  schema: z.ZodObject<Record<string, z.ZodType>>;
  readOnly: boolean;
  run(args: Record<string, unknown>): Promise<string>;
}

const VIEWS: Record<string, { view: ViewName; label: string }> = {
  today: { view: "home", label: "Today" },
  skills: { view: "skills", label: "Skill tree" },
  flashcards: { view: "learn", label: "Flashcards" },
  graph: { view: "graph", label: "Graph" },
  types: { view: "types", label: "Types" },
  trash: { view: "trash", label: "Trash" },
};

export function buildTools(ws: Workspace, onActivity: (a: ToolActivity) => void): AssistantTool[] {
  const tools: AssistantTool[] = [];
  const collect: ToolFn = (name, config, run) => {
    tools.push({
      name,
      title: config.title,
      description: config.description,
      schema: z.object(config.input),
      readOnly: !!config.readOnly,
      run: async (args) => run(args),
    });
  };

  registerWorkspaceTools(collect, {
    doc: ws.doc,
    conv: browserConverter(),
    agent: getSettings().assistant.name,
    origin: ASSISTANT_ORIGIN,
    presence: (pageId, activity) => onActivity({ pageId, activity }),
  });

  // ---- the app itself ----------------------------------------------------------------

  collect(
    "open_page",
    {
      title: "Open a page",
      description:
        "Show a page to the user in the app (by id, exact title or Parent/Child path). Use it when the user asks to see or go to something, or after creating something they will want to look at.",
      input: { page: z.string().describe("Page id, exact title or Parent/Child path") },
    },
    ({ page }) => {
      const meta = resolvePage(ws.doc, String(page));
      navigate({ name: "page", wsId: ws.id, pageId: meta.id });
      onActivity({ pageId: meta.id, activity: `Opening “${displayTitle(meta)}”` });
      return `Opened ${ref(meta)}.`;
    },
  );

  collect(
    "open_view",
    {
      title: "Open a screen",
      description: `Show one of the app's screens: ${Object.keys(VIEWS).join(", ")}. "skills" is the user's life skill tree, "today" the home screen (quests, cards due, courses), "flashcards" the review screen, "graph" the map of linked pages.`,
      input: { view: z.enum(Object.keys(VIEWS) as [string, ...string[]]) },
    },
    ({ view }) => {
      const v = VIEWS[String(view)];
      if (!v) throw new ToolError(`Unknown screen "${String(view)}".`);
      navigate({ name: "view", wsId: ws.id, view: v.view });
      onActivity({ activity: `Opening ${v.label}` });
      return `Opened ${v.label}.`;
    },
  );

  return tools;
}

/** JSON Schema for a tool's input (without the $schema marker). */
function inputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Tool definitions for the Messages API. */
export function apiTools(tools: AssistantTool[]): BetaToolUnion[] {
  return tools.map(
    (t) =>
      ({
        name: t.name,
        description: t.description,
        input_schema: inputSchema(t.schema),
        // Page content can be long: stream tool input as it is written.
        eager_input_streaming: true,
      }) as BetaToolUnion,
  );
}

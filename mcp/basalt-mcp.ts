// Basalt as an MCP server: lets Claude (Claude Code, Claude Desktop, any MCP
// client) use a Basalt workspace as long-term memory and knowledge vault.
// The server works on a live Y.Doc; the caller keeps it synced (see index.ts),
// so every edit shows up for collaborators in real time.

import type * as Y from "yjs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Awareness } from "y-protocols/awareness";
import type { BlockConverter } from "../shared/vault.ts";
import { nodeConverter } from "./convert.ts";
import { ToolError } from "./ops.ts";
import { MEMORY_PROTOCOL, SERVER_INSTRUCTIONS, teachMePrompt } from "./prompts.ts";
import { LEVEL_UP_PROMPT } from "./skill-tools.ts";
import { registerWorkspaceTools } from "./workspace-tools.ts";

export interface BasaltMcpOptions {
  doc: Y.Doc;
  /** Presence: when given, Claude shows up live in the app (page + activity). */
  awareness?: Awareness;
  /** Markdown converter (defaults to the Node BlockNote converter). */
  converter?: BlockConverter;
  /** Name recorded as page author (default "Claude"). */
  agentName?: string;
  /** Transaction origin for all writes (default "claude"). */
  origin?: unknown;
  version?: string;
}

type Args = Record<string, any>;
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export function createBasaltMcp(opts: BasaltMcpOptions): McpServer {
  const { doc, awareness } = opts;
  const conv = opts.converter ?? nodeConverter();
  const agent = opts.agentName ?? "Claude";
  const origin = opts.origin ?? "claude";

  const server = new McpServer(
    { name: "basalt", title: "Basalt workspace", version: opts.version ?? "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const presence = (pageId: string | undefined, activity: string) => {
    if (!awareness) return;
    const cur = (awareness.getLocalState() ?? {}) as Record<string, unknown>;
    awareness.setLocalState({ ...cur, pageId: pageId ?? cur.pageId, activity, activityAt: Date.now() });
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const s = (awareness.getLocalState() ?? {}) as Record<string, unknown>;
      if (s.activity) awareness.setLocalState({ ...s, activity: undefined });
    }, 15000);
    (idleTimer as { unref?: () => void }).unref?.();
  };

  const tool = (
    name: string,
    config: { title: string; description: string; input: Record<string, z.ZodType>; readOnly?: boolean; destructive?: boolean },
    run: (args: Args) => Promise<string> | string,
  ) => {
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        inputSchema: config.input,
        annotations: {
          title: config.title,
          readOnlyHint: !!config.readOnly,
          destructiveHint: !!config.destructive,
          openWorldHint: false,
        },
      },
      (async (args: Args): Promise<ToolResult> => {
        try {
          return { content: [{ type: "text", text: await run(args ?? {}) }] };
        } catch (err) {
          const msg = err instanceof ToolError ? err.message : `Error: ${err instanceof Error ? err.message : String(err)}`;
          return { content: [{ type: "text", text: msg }], isError: true };
        }
      }) as any,
    );
  };

  registerWorkspaceTools(tool, { doc, conv, agent, origin, presence });

  // ---- prompts ----------------------------------------------------------------------------

  server.registerPrompt(
    "teach_me",
    {
      title: "Teach me (scratch → PhD)",
      description: "Become a tutor that takes you from scratch to PhD level on a topic, using a Basalt course with lessons, quizzes and flashcards.",
      argsSchema: {
        topic: z.string().describe("What you want to learn"),
        level: z.string().optional().describe("Your current level (default: complete beginner)"),
      },
    },
    ({ topic, level }) => ({
      messages: [{ role: "user", content: { type: "text", text: teachMePrompt(topic, level) } }],
    }),
  );

  server.registerPrompt(
    "memory_protocol",
    {
      title: "Use Basalt as memory",
      description: "Load your long-term memory from Basalt and keep it up to date during the conversation.",
    },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: MEMORY_PROTOCOL } }],
    }),
  );

  server.registerPrompt(
    "level_up_my_life",
    {
      title: "Level up my life",
      description: "Coach me like an RPG: design my real-life skill tree, set habit quests and log my progress as XP.",
      argsSchema: { goal: z.string().optional().describe("What you want to get better at (any area of life)") },
    },
    ({ goal }) => ({
      messages: [{ role: "user", content: { type: "text", text: LEVEL_UP_PROMPT(goal) } }],
    }),
  );

  return server;
}

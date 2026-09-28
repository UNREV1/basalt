// The assistant's agent loop: Claude with the workspace tools (tools.ts), web
// search/fetch, and any remote MCP servers the user added, streamed from the
// browser with the user's own API key.
//
// One call handles one user message: stream a response, run the tools it
// asks for, send the results back, and repeat until Claude is done. Earlier
// messages of the chat are sent as plain text (with a note of what was done),
// so only the current turn carries tool calls and thinking.

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SERVER_INSTRUCTIONS } from "../../mcp/prompts.ts";
import { ToolError } from "../../mcp/ops.ts";
import { client, modelParams } from "../lib/ai.ts";
import { getSettings } from "../lib/settings.ts";
import type { Workspace } from "../lib/workspace.ts";
import type { ChatMessage } from "./chats.ts";
import { apiTools, buildTools, type AssistantTool, type ToolActivity } from "./tools.ts";

const MAX_STEPS = 30;
const MAX_RESULT_CHARS = 40_000;
const HISTORY_MESSAGES = 40;

export interface AgentStep {
  id: string;
  /** Tool name. */
  tool: string;
  /** Human label ("Search notes", "Web search"). */
  title: string;
  state: "running" | "done" | "error";
  /** Short result or error, for the step list. */
  detail?: string;
}

export interface AgentEvents {
  /** The reply so far. */
  onText(full: string): void;
  /** Latest summarized thinking (for the companion's thought bubble). */
  onThinking(text: string): void;
  onStep(step: AgentStep): void;
  onActivity(a: ToolActivity): void;
}

export interface AgentResult {
  text: string;
  /** What changed in the workspace, one line each. */
  actions: string[];
}

export function systemPrompt(name: string): string {
  return `You are ${name}, the user's personal assistant inside Basalt: their private workspace for notes, canvases, databases, notebooks, courses, flashcards and a real-life skill tree. Think of a capable, calm, slightly witty chief of staff (like Jarvis): you act on the user's behalf rather than explain how they could do it themselves.

How you work:
- When the user asks for something you can do in the workspace, do it now with your tools. Don't describe steps the user would have to take, and don't ask for permission for ordinary edits.
- Look before you write: search or read pages before changing them. Add to pages rather than replacing their content unless the user asks for a rewrite, and never delete content without being asked.
- Everything is a page. Your conversations with the user are saved as pages too.
- Keep the user's workspace tidy: sensible titles, pages under a fitting parent, [[links]] between related pages.
- Answer questions about the user's own notes from their pages (search first) and cite them as [[Page Title]] links. For current events or facts beyond the workspace, use web search and link your sources.
- Replies appear in a small panel next to the app, and may be read aloud: keep them short and conversational. After acting, say in one to three sentences what you did, linking the pages you touched as [[Page Title]]. Use lists or headings only when they genuinely help.
- If a request is ambiguous in a way that matters, ask one short question instead of guessing.
- Each user message starts with a <context> block describing what the user is looking at right now; use it to resolve "this page", "here" and similar.

${SERVER_INSTRUCTIONS}`;
}

/** What the user is looking at, for the <context> block of their message. */
export interface ViewContext {
  userName: string;
  workspaceName: string;
  /** Open page, if any. */
  page?: { id: string; title: string; kind: string };
  /** Screen name when no page is open ("Home", "Skill tree"…). */
  view?: string;
}

function contextBlock(c: ViewContext): string {
  const now = new Date();
  const when = now.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lines = [`Now: ${when} (${zone})`, `User: ${c.userName}`, `Workspace: ${c.workspaceName}`];
  if (c.page) lines.push(`Open page: "${c.page.title}" (id ${c.page.id}, ${c.page.kind})`);
  else if (c.view) lines.push(`Open screen: ${c.view}`);
  return `<context>\n${lines.join("\n")}\n</context>`;
}

/** Earlier messages as plain text turns, starting with the user and alternating. */
function historyToApi(history: ChatMessage[]): BetaMessageParam[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history.slice(-HISTORY_MESSAGES)) {
    let text = m.text.trim();
    if (m.role === "assistant") {
      if (m.actions?.length) text += `\n\n(What I did: ${m.actions.join("; ")})`;
      if (m.status === "stopped") text += "\n\n(The user stopped this reply.)";
      if (m.status === "error") text = text || "(This reply failed.)";
    }
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

// Web tools can be switched off for an organization; remember that for this session.
let webRejected = false;

function serverTools(model: string): BetaToolUnion[] {
  if (!getSettings().assistant.web || webRejected) return [];
  const basic = model.startsWith("claude-haiku");
  return [
    { type: basic ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: 5 },
    { type: basic ? "web_fetch_20250910" : "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
  ] as BetaToolUnion[];
}

function mcpConfig(): { servers: Record<string, unknown>[]; tools: BetaToolUnion[] } {
  const servers = getSettings().assistant.mcpServers.filter((s) => s.enabled && s.url.trim());
  return {
    servers: servers.map((s) => ({
      type: "url",
      url: s.url.trim(),
      name: s.name.trim() || "mcp",
      ...(s.token.trim() ? { authorization_token: s.token.trim() } : {}),
    })),
    tools: servers.map((s) => ({ type: "mcp_toolset", mcp_server_name: s.name.trim() || "mcp" }) as unknown as BetaToolUnion),
  };
}

const SERVER_TOOL_TITLES: Record<string, string> = { web_search: "Web search", web_fetch: "Reading a web page" };

/** A one-line summary of a tool result, for the step list and the chat's action log. */
function firstLine(text: string, max = 140): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export async function runAgent(opts: {
  ws: Workspace;
  history: ChatMessage[];
  message: string;
  context: ViewContext;
  signal: AbortSignal;
  events: AgentEvents;
}): Promise<AgentResult> {
  const { ws, events, signal } = opts;
  const settings = getSettings();
  const tools = buildTools(ws, events.onActivity);
  const byName = new Map<string, AssistantTool>(tools.map((t) => [t.name, t]));
  const { params, betas } = modelParams("medium");
  const model = String(params.model);
  // Show a summary of Claude's reasoning in the companion's thought bubble.
  if (params.thinking) params.thinking = { type: "adaptive", display: "summarized" };
  const mcp = mcpConfig();
  if (mcp.servers.length) betas.push("mcp-client-2025-11-20");

  const messages: BetaMessageParam[] = historyToApi(opts.history);
  const userContent = `${contextBlock(opts.context)}\n\n${opts.message}`;
  const last = messages[messages.length - 1];
  if (last?.role === "user") last.content = `${last.content as string}\n\n${userContent}`;
  else messages.push({ role: "user", content: userContent });

  let text = "";
  const actions: string[] = [];
  let jsonRetries = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const web = serverTools(model);
    const toolDefs = [...apiTools(tools), ...web, ...mcp.tools];
    let message: BetaMessage;
    const iterationStart = text;
    try {
      const stream = client().beta.messages.stream(
        {
          ...(params as { model: string }),
          max_tokens: 32000,
          // Tools + system prompt are stable, so they are cached across turns.
          cache_control: { type: "ephemeral" },
          system: systemPrompt(settings.assistant.name),
          tools: toolDefs,
          messages,
          ...(mcp.servers.length ? { mcp_servers: mcp.servers } : {}),
          ...(betas.length ? { betas } : {}),
        } as Parameters<ReturnType<typeof client>["beta"]["messages"]["stream"]>[0],
        { signal },
      );
      let thinking = "";
      stream.on("streamEvent", (ev) => {
        if (ev.type === "content_block_start") {
          const b = ev.content_block;
          if (b.type === "text" && text && !text.endsWith("\n\n")) {
            // A new paragraph after tool calls.
            text += "\n\n";
          } else if (b.type === "tool_use") {
            const t = byName.get(b.name);
            events.onStep({ id: b.id, tool: b.name, title: t?.title ?? b.name, state: "running" });
          } else if (b.type === "server_tool_use") {
            events.onStep({ id: b.id, tool: b.name, title: SERVER_TOOL_TITLES[b.name] ?? b.name, state: "running" });
            events.onActivity({ activity: SERVER_TOOL_TITLES[b.name] ?? b.name });
          } else if (b.type === "mcp_tool_use") {
            events.onStep({ id: b.id, tool: b.name, title: `${b.server_name}: ${b.name}`, state: "running" });
            events.onActivity({ activity: `Using ${b.server_name}` });
          }
        } else if (ev.type === "content_block_delta") {
          if (ev.delta.type === "text_delta") {
            text += ev.delta.text;
            events.onText(text);
          } else if (ev.delta.type === "thinking_delta") {
            thinking += ev.delta.thinking;
            events.onThinking(thinking);
          }
        }
      });
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Web tools disabled for this organization: carry on without them.
      if (err instanceof Anthropic.BadRequestError && web.length && /web_(search|fetch)/i.test(err.message)) {
        webRejected = true;
        text = iterationStart;
        step--;
        continue;
      }
      // A tool input that couldn't be parsed at all: re-issue the turn (a few times).
      const badJson =
        err instanceof Anthropic.AnthropicError &&
        !(err instanceof Anthropic.APIError) &&
        /parse tool parameter JSON/i.test(err.message);
      if (badJson && !signal.aborted && jsonRetries++ < 2) {
        text = iterationStart;
        continue;
      }
      throw err;
    }

    // Mark server-side tool calls (web search, MCP) as done.
    for (const b of message.content as BetaContentBlock[]) {
      if (b.type === "web_search_tool_result" || b.type === "web_fetch_tool_result" || b.type === "mcp_tool_result") {
        const id = "tool_use_id" in b ? String(b.tool_use_id) : "";
        if (id) events.onStep({ id, tool: b.type, title: "", state: "done" });
      }
    }

    if (message.stop_reason === "refusal") {
      if (!text.trim()) text = "I can't help with that one.";
      break;
    }
    if (message.stop_reason === "pause_turn") {
      // A long server-side tool run paused; let it continue.
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const uses = (message.content as BetaContentBlock[]).filter((b): b is BetaToolUseBlock => b.type === "tool_use");
    if (!uses.length) break;
    if (message.stop_reason === "max_tokens") {
      throw new Error("The reply got too long to finish. Try asking for less at once.");
    }

    messages.push({ role: "assistant", content: message.content });
    const results: BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const tool = byName.get(use.name);
      const fail = (msg: string) => {
        events.onStep({ id: use.id, tool: use.name, title: tool?.title ?? use.name, state: "error", detail: msg });
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: msg });
      };
      if (!tool) {
        fail(`Unknown tool "${use.name}".`);
        continue;
      }
      // With eager input streaming the input is not validated by the API: check it here.
      const parsed = tool.schema.safeParse(use.input);
      if (!parsed.success) {
        fail(`Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`);
        continue;
      }
      if (signal.aborted) throw new DOMException("Stopped", "AbortError");
      try {
        let out = await tool.run(parsed.data as Record<string, unknown>);
        if (out.length > MAX_RESULT_CHARS) out = `${out.slice(0, MAX_RESULT_CHARS)}\n…(truncated)`;
        results.push({ type: "tool_result", tool_use_id: use.id, content: out });
        events.onStep({ id: use.id, tool: use.name, title: tool.title, state: "done", detail: firstLine(out) });
        if (!tool.readOnly) actions.push(firstLine(out));
      } catch (err) {
        fail(err instanceof ToolError ? err.message : `Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // All results for this turn go back in one message.
    messages.push({ role: "user", content: results });
    if (step === MAX_STEPS - 1) text += "\n\n(I stopped here: that took a lot of steps. Ask me to continue.)";
  }

  return { text: text.trim(), actions };
}

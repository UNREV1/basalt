// The assistant through Claude Code (desktop app): each reply is a
// `claude -p` run with Basalt's connector, resuming the chat's Claude Code
// session, so it works with the user's Claude sign-in and no API key.

import { getPage } from "../../shared/model.ts";
import { runClaude, toolActivity, type ClaudeRun } from "../lib/claude.ts";
import { getSettings } from "../lib/settings.ts";
import { shareLink, type Workspace } from "../lib/workspace.ts";
import type { AgentStep, ViewContext } from "./agent.ts";

let active: ClaudeRun | null = null;

export function cancelClaudeCodeReply() {
  active?.cancel();
}

function contextText(c: ViewContext): string {
  const lines = [`Now: ${new Date().toLocaleString()}`, `User: ${c.userName}`, `Workspace: ${c.workspaceName}`];
  if (c.page) lines.push(`Open page: "${c.page.title}" (id ${c.page.id}, ${c.page.kind})`);
  else if (c.view) lines.push(`Open screen: ${c.view}`);
  return `<context>\n${lines.join("\n")}\n</context>`;
}

export async function replyWithClaudeCode(opts: {
  ws: Workspace;
  chatId: string;
  message: string;
  context: ViewContext;
  onText: (full: string) => void;
  onStep: (step: AgentStep) => void;
  onActivity: (text: string) => void;
}): Promise<{ text: string; actions: string[] }> {
  const { ws, chatId } = opts;
  const page = getPage(ws.doc, chatId);
  const resume = (page?.get("claudeSession") as string | undefined) || undefined;
  const name = getSettings().assistant.name;
  const system = `You are ${name}: Claude inside Basalt, the user's learning app (Brilliant-style courses with interactive lessons, a D&D-style skill tree, flashcards, notes and canvases). You work through its MCP tools (mcp__basalt__*), and the user sees your changes live in the app. Keep replies short, warm and concrete, in markdown. When they want to learn something, research it, map the branch with add_skills (branch = their goal), create a course for the first skill with create_course, link it with link_to_skill and write the first lessons with write_interactive_lesson. Teach the way the app does: preview, understand, explain in their own words, recall, apply, and review later; for skills, deliberate practice with feedback.`;
  let text = "";
  let n = 0;
  const steps: AgentStep[] = [];
  const finishRunning = () => {
    const last = steps.at(-1);
    if (last?.state === "running") {
      last.state = "done";
      opts.onStep({ ...last });
    }
  };
  const run = await runClaude({ prompt: `${contextText(opts.context)}\n\n${opts.message}`, system, resume, web: true, link: shareLink(ws.info) }, (ev) => {
    if (ev.type === "turn") {
      // A new assistant message after tool calls: show its text.
      text = "";
    } else if (ev.type === "text") {
      finishRunning();
      text += ev.text;
      opts.onText(text);
    } else if (ev.type === "tool") {
      finishRunning();
      const step: AgentStep = { id: `c${n++}`, tool: ev.name, title: toolActivity(ev.name), state: "running" };
      steps.push(step);
      opts.onStep({ ...step });
      opts.onActivity(step.title);
    }
  });
  active = run;
  const end = await run.done;
  active = null;
  finishRunning();
  if (end.sessionId && page) page.set("claudeSession", end.sessionId);
  if (!end.ok) {
    const err = new Error(end.cancelled ? "Stopped" : end.error || "Claude stopped unexpectedly.");
    if (end.cancelled) err.name = "AbortError";
    throw err;
  }
  return { text: (end.result || text).trim(), actions: steps.map((s) => s.title) };
}

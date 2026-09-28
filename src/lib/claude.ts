// Claude in the app, through the user's Claude Code (desktop app): no API key.
// Runs go through desktop/claude-run.cjs, which starts `claude -p` with
// Basalt's MCP connector, so Claude works with the same tools as in Claude
// Code. Background jobs (building a course, writing lessons ahead) are kept
// here so any view can show what Claude is doing.

import { useSyncExternalStore } from "react";
import { desktop, type ClaudeRunEvent, type ClaudeRunOptions } from "./desktop.ts";

export const claudeBridge = desktop?.claude ?? null;

type Handler = (ev: ClaudeRunEvent) => void;
const handlers = new Map<string, Handler>();
/** Events that arrive before their run id is known. */
const early = new Map<string, ClaudeRunEvent[]>();
let listening = false;

function listen() {
  if (listening || !claudeBridge) return;
  listening = true;
  claudeBridge.onEvent((ev) => {
    const h = handlers.get(ev.id);
    if (h) h(ev);
    else {
      const list = early.get(ev.id) ?? [];
      list.push(ev);
      early.set(ev.id, list);
    }
    if (ev.type === "done") handlers.delete(ev.id);
  });
}

export interface ClaudeRun {
  id: string;
  cancel(): void;
  /** Resolves when Claude finishes. */
  done: Promise<Extract<ClaudeRunEvent, { type: "done" }>>;
}

/** Start a Claude Code run; `onEvent` gets everything Claude says and does. */
export async function runClaude(opts: ClaudeRunOptions, onEvent: Handler = () => {}): Promise<ClaudeRun> {
  if (!claudeBridge) throw new Error("Claude runs from the Basalt desktop app.");
  listen();
  const res = await claudeBridge.run(opts);
  if (!res?.id) throw new Error(res?.error || "Claude couldn't start.");
  const id = res.id;
  let resolve!: (ev: Extract<ClaudeRunEvent, { type: "done" }>) => void;
  const done = new Promise<Extract<ClaudeRunEvent, { type: "done" }>>((r) => (resolve = r));
  const handle: Handler = (ev) => {
    onEvent(ev);
    if (ev.type === "done") resolve(ev);
  };
  handlers.set(id, handle);
  for (const ev of early.get(id) ?? []) handle(ev);
  early.delete(id);
  return { id, cancel: () => void claudeBridge!.cancel(id), done };
}

/** Friendly words for what a tool call is doing. */
export function toolActivity(name: string): string {
  const map: Record<string, string> = {
    WebSearch: "Researching",
    WebFetch: "Reading a source",
    create_course: "Designing the course",
    update_course: "Revising the course",
    extend_course: "Extending the path",
    get_course: "Reading the course",
    write_interactive_lesson: "Writing a lesson",
    get_skill_tree: "Looking at your skills",
    add_skills: "Adding a skill",
    link_to_skill: "Linking it to your skill",
    search_notes: "Searching your notes",
    read_note: "Reading a note",
    create_note: "Writing a note",
    update_note: "Editing a note",
    add_flashcards: "Making flashcards",
    memory_view: "Checking its memory",
  };
  return map[name] ?? "Working";
}

// ---- background jobs ------------------------------------------------------------------

export interface ClaudeJob {
  key: string;
  label: string;
  status: "running" | "done" | "error";
  activity: string;
  error?: string;
  startedAt: number;
  run?: ClaudeRun;
}

let jobs: ClaudeJob[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function patch(key: string, p: Partial<ClaudeJob>) {
  jobs = jobs.map((j) => (j.key === key ? { ...j, ...p } : j));
  emit();
}

export function useClaudeJobs(): ClaudeJob[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => jobs,
  );
}

export function claudeJob(key: string): ClaudeJob | undefined {
  return jobs.find((j) => j.key === key);
}

export const isJobRunning = (key: string) => claudeJob(key)?.status === "running";

/** Start a background job unless one with this key is already running. */
export async function startClaudeJob(key: string, label: string, opts: ClaudeRunOptions): Promise<ClaudeJob | undefined> {
  if (isJobRunning(key)) return claudeJob(key);
  jobs = [...jobs.filter((j) => j.key !== key), { key, label, status: "running", activity: "Starting Claude", startedAt: Date.now() }];
  emit();
  try {
    const run = await runClaude(opts, (ev) => {
      if (ev.type === "tool") patch(key, { activity: toolActivity(ev.name) });
      else if (ev.type === "init" && !ev.connected) patch(key, { activity: "Connecting to Basalt" });
    });
    patch(key, { run });
    const end = await run.done;
    patch(key, end.ok ? { status: "done", activity: "Done", run: undefined } : { status: "error", error: end.error, activity: "", run: undefined });
  } catch (err) {
    patch(key, { status: "error", error: err instanceof Error ? err.message : String(err), activity: "" });
  }
  return claudeJob(key);
}

export function cancelClaudeJob(key: string) {
  claudeJob(key)?.run?.cancel();
}

export function dismissClaudeJob(key: string) {
  jobs = jobs.filter((j) => j.key !== key);
  emit();
}

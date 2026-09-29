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
  /** "auth": Claude Code needs signing in; "limit": usage limit reached. */
  errorCode?: "auth" | "limit" | "other";
  /** What was asked, so it can be tried again. */
  opts?: ClaudeRunOptions;
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
  jobs = [...jobs.filter((j) => j.key !== key), { key, label, status: "running", activity: "Starting Claude", startedAt: Date.now(), opts }];
  emit();
  try {
    const run = await runClaude(opts, (ev) => {
      if (ev.type === "tool") patch(key, { activity: toolActivity(ev.name) });
      else if (ev.type === "init" && !ev.connected) patch(key, { activity: "Connecting to Basalt" });
    });
    patch(key, { run });
    const end = await run.done;
    patch(key, end.ok ? { status: "done", activity: "Done", run: undefined } : { status: "error", error: end.error, errorCode: end.code, activity: "", run: undefined });
  } catch (err) {
    patch(key, { status: "error", error: err instanceof Error ? err.message : String(err), activity: "" });
  }
  return claudeJob(key);
}

/** Run a job that failed again, exactly as it was asked. */
export function retryClaudeJob(key: string) {
  const job = claudeJob(key);
  if (job?.opts && job.status !== "running") return startClaudeJob(key, job.label, job.opts);
}

export function cancelClaudeJob(key: string) {
  claudeJob(key)?.run?.cancel();
}

export function dismissClaudeJob(key: string) {
  jobs = jobs.filter((j) => j.key !== key);
  emit();
}

// ---- signing in to Claude Code ----------------------------------------------------------

export interface ClaudeSignIn {
  status: "idle" | "waiting" | "done" | "error";
  /** The sign-in page Claude Code printed (the fallback when the browser didn't open). */
  url?: string;
  error?: string;
  /** Signing in without a terminal didn't work here: offer the terminal. */
  fallback?: boolean;
  account?: string | null;
}

let signInState: ClaudeSignIn = { status: "idle" };
const signInListeners = new Set<() => void>();
let signInHooked = false;

function setSignIn(next: ClaudeSignIn) {
  signInState = next;
  for (const l of signInListeners) l();
}

function hookSignIn() {
  if (signInHooked || !claudeBridge?.onSignIn) return;
  signInHooked = true;
  claudeBridge.onSignIn((ev) => {
    if (ev.type === "url") setSignIn({ ...signInState, url: ev.url });
    else if (ev.cancelled) setSignIn({ status: "idle" });
    else if (ev.ok) {
      setSignIn({ status: "done", account: ev.account });
      // Signed in: everything that stopped for it goes again by itself.
      for (const j of jobs) if (j.status === "error" && j.errorCode === "auth") void retryClaudeJob(j.key);
    } else setSignIn({ status: "error", error: ev.error || "Signing in didn't finish.", fallback: ev.fallback });
  });
}

export function useClaudeSignIn(): ClaudeSignIn {
  return useSyncExternalStore(
    (cb) => {
      signInListeners.add(cb);
      return () => signInListeners.delete(cb);
    },
    () => signInState,
  );
}

/** Sign in to Claude Code: Basalt runs `claude auth login`, which opens the browser. */
export async function signInToClaude() {
  if (!claudeBridge?.signIn) return;
  hookSignIn();
  setSignIn({ status: "waiting" });
  const res = await claudeBridge.signIn().catch((e: unknown) => ({ ok: false, message: String(e) }));
  if (!res?.ok) setSignIn({ status: "error", error: res?.message || "Claude Code couldn't start signing in.", fallback: true });
}

export const sendSignInCode = (code: string) => claudeBridge?.signInCode?.(code) ?? Promise.resolve(false);
export const cancelSignIn = () => void claudeBridge?.signInCancel?.();
export const openSignInPage = () => claudeBridge?.signInPage?.() ?? Promise.resolve(false);

/** The fallback: a terminal window with `claude` running. */
export async function signInInTerminal(): Promise<{ ok: boolean; message?: string }> {
  const res = await claudeBridge?.signInTerminal?.();
  return res ?? { ok: false, message: "Open a terminal and run `claude auth login` to sign in." };
}

// The assistant's runtime state, shared by the panel, the companion and chat
// pages. Lives at module level so a reply keeps streaming while the panel is
// closed or the user navigates.

import { useSyncExternalStore } from "react";
import { getPage } from "../../shared/model.ts";
import { aiErrorMessage } from "../lib/ai.ts";
import { getSettings } from "../lib/settings.ts";
import type { Workspace } from "../lib/workspace.ts";
import type { AgentStep, ViewContext } from "./agent.ts";
import { appendMessage, createChat, readChat } from "./chats.ts";
import { speak, stopSpeaking } from "./voice.ts";

/** The companion's expression. */
export type Mood = "idle" | "listening" | "thinking" | "working" | "talking" | "happy" | "sad";

export interface Draft {
  text: string;
  thinking: string;
  steps: AgentStep[];
}

export interface AssistantState {
  open: boolean;
  /** Current chat page (null: a new chat starts with the next message). */
  chatId: string | null;
  running: boolean;
  /** The reply in progress. */
  draft: Draft | null;
  /** What it is doing right now, and where. */
  activity: { text: string; pageId?: string; at: number } | null;
  mood: Mood;
  error: string | null;
}

let state: AssistantState = {
  open: false,
  chatId: null,
  running: false,
  draft: null,
  activity: null,
  mood: "idle",
  error: null,
};
const listeners = new Set<() => void>();

// Streaming updates arrive per token; publish at most once per frame.
let pending: Partial<AssistantState> | null = null;
let frame = 0;

function publish() {
  for (const l of listeners) l();
}

function set(patch: Partial<AssistantState>) {
  if (pending) {
    patch = { ...pending, ...patch };
    pending = null;
    cancelAnimationFrame(frame);
    frame = 0;
  }
  state = { ...state, ...patch };
  publish();
}

function setSoon(patch: Partial<AssistantState>) {
  pending = { ...(pending ?? {}), ...patch };
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const p = pending;
    pending = null;
    if (p) {
      state = { ...state, ...p };
      publish();
    }
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAssistant(): AssistantState {
  return useSyncExternalStore(subscribe, () => state);
}

export function getAssistant(): AssistantState {
  return state;
}

export function openAssistant(open = true) {
  set({ open });
}

export function toggleAssistant() {
  set({ open: !state.open });
}

export function newChat() {
  if (state.running) return;
  set({ chatId: null, draft: null, error: null });
}

export function openChat(chatId: string) {
  if (state.running && chatId !== state.chatId) return;
  set({ chatId, open: true, error: null });
}

export function setMood(mood: Mood) {
  set({ mood });
}

let controller: AbortController | null = null;
let moodTimer: ReturnType<typeof setTimeout> | null = null;

function settleMood(mood: Mood, after = 1800) {
  if (moodTimer) clearTimeout(moodTimer);
  set({ mood });
  moodTimer = setTimeout(() => {
    moodTimer = null;
    if (!state.running && state.mood === mood) set({ mood: "idle" });
  }, after);
}

export function stopAssistant() {
  controller?.abort();
  stopSpeaking();
}

/** Send a message in the current chat (starting one if needed). */
export async function sendMessage(ws: Workspace, text: string, context: ViewContext, chatId = state.chatId) {
  const message = text.trim();
  if (!message || state.running) return;
  const who = getSettings().identity.name;
  const id = chatId && getPage(ws.doc, chatId) ? chatId : createChat(ws.doc, message, who);
  const history = readChat(ws.doc, id);
  appendMessage(ws.doc, id, { role: "user", text: message });
  stopSpeaking();
  if (moodTimer) clearTimeout(moodTimer);
  set({ chatId: id, running: true, draft: { text: "", thinking: "", steps: [] }, mood: "thinking", error: null, activity: null });
  controller = new AbortController();
  const signal = controller.signal;
  let draft: Draft = { text: "", thinking: "", steps: [] };
  const update = (patch: Partial<Draft>, extra: Partial<AssistantState> = {}) => {
    draft = { ...draft, ...patch };
    setSoon({ draft, ...extra });
  };
  try {
    // The agent (tools, markdown converter) loads on first use.
    const { runAgent } = await import("./agent.ts");
    const result = await runAgent({
      ws,
      history,
      message,
      context,
      signal,
      events: {
        onText: (full) => update({ text: full }, { mood: "talking" }),
        onThinking: (t) => update({ thinking: t }, { mood: "thinking" }),
        onStep: (step) => {
          const steps = [...draft.steps];
          const i = steps.findIndex((s) => s.id === step.id);
          if (i === -1) steps.push(step);
          else steps[i] = { ...steps[i], ...step, title: step.title || steps[i].title };
          update({ steps }, step.state === "running" ? { mood: "working" } : {});
        },
        onActivity: (a) => setSoon({ activity: { text: a.activity, pageId: a.pageId, at: Date.now() }, mood: "working" }),
      },
    });
    appendMessage(ws.doc, id, { role: "assistant", text: result.text, actions: result.actions });
    set({ running: false, draft: null });
    settleMood("happy");
    if (getSettings().assistant.voice && result.text) {
      speak(result.text, {
        onStart: () => set({ mood: "talking" }),
        onEnd: () => {
          if (!state.running && state.mood === "talking") set({ mood: "idle" });
        },
      });
    }
  } catch (err) {
    const stopped = signal.aborted || (err instanceof Error && err.name === "AbortError");
    appendMessage(ws.doc, id, {
      role: "assistant",
      text: draft.text.trim(),
      actions: draft.steps.filter((s) => s.state === "done" && s.detail).map((s) => s.detail!),
      status: stopped ? "stopped" : "error",
    });
    set({ running: false, draft: null, error: stopped ? null : aiErrorMessage(err) });
    settleMood(stopped ? "idle" : "sad", stopped ? 0 : 3500);
  } finally {
    controller = null;
  }
}

// A chat with the assistant: the messages (stored on the chat page), the reply
// in progress, and the composer. Used by the floating panel and by chat pages.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import * as Y from "yjs";
import { getPage, type PageMeta } from "../../shared/model.ts";
import { Icon } from "../components/ui.tsx";
import { useApp, usePage, usePages } from "../lib/hooks.ts";
import { useRoute, type ViewName } from "../lib/router.ts";
import { useSettings } from "../lib/settings.ts";
import type { Workspace } from "../lib/workspace.ts";
import { Dots, ErrorNote, Markdown } from "../views/tutor/ai-ui.tsx";
import type { ViewContext } from "./agent.ts";
import { chatArray, readChat, type ChatMessage } from "./chats.ts";
import { sendMessage, setMood, stopAssistant, useAssistant } from "./store.ts";
import { canListen, listen } from "./voice.ts";

const VIEW_NAMES: Record<ViewName, string> = {
  home: "Today",
  graph: "Graph",
  learn: "Flashcards",
  skills: "Skill tree",
  trash: "Trash",
  types: "Types",
  memory: "Claude memory",
};

/** Messages of a chat page, live. */
export function useChatMessages(ws: Workspace, chatId: string | null): ChatMessage[] {
  const [msgs, setMsgs] = useState<ChatMessage[]>(() => readChat(ws.doc, chatId));
  useEffect(() => {
    setMsgs(readChat(ws.doc, chatId));
    if (!chatId) return;
    const page = getPage(ws.doc, chatId);
    if (!page) return;
    let arr = chatArray(page);
    const update = () => setMsgs(readChat(ws.doc, chatId));
    const onPage = (ev: Y.YMapEvent<unknown>) => {
      if (!ev.keysChanged.has("chat")) return;
      arr?.unobserve(update);
      arr = chatArray(page);
      arr?.observe(update);
      update();
    };
    arr?.observe(update);
    page.observe(onPage);
    return () => {
      arr?.unobserve(update);
      page.unobserve(onPage);
    };
  }, [ws, chatId]);
  return msgs;
}

/** What the user is looking at, for the assistant. */
export function useViewContext(ws: Workspace): () => ViewContext {
  const route = useRoute();
  const settings = useSettings();
  const pageId = route.name === "page" ? route.pageId : null;
  const { meta } = usePage(ws, pageId);
  return useCallback(
    () => ({
      userName: settings.identity.name,
      workspaceName: ws.info.name,
      page: meta ? { id: meta.id, title: meta.title || "Untitled", kind: meta.kind } : undefined,
      view: route.name === "view" ? VIEW_NAMES[route.view] : undefined,
    }),
    [settings.identity.name, ws.info.name, meta, route],
  );
}

function useTitleLinks(ws: Workspace) {
  const app = useApp();
  const pages = usePages(ws);
  const byTitle = useMemo(() => {
    const m = new Map<string, PageMeta>();
    for (const p of pages) if (!p.deletedAt) m.set((p.title || "Untitled").trim().toLowerCase(), p);
    return m;
  }, [pages]);
  const isKnownTitle = useCallback((t: string) => byTitle.has(t.trim().toLowerCase()), [byTitle]);
  const openTitle = useCallback(
    (t: string) => {
      const p = byTitle.get(t.trim().toLowerCase());
      if (p) app.openPage(p.id);
      else app.toast(`No page named “${t}”`);
    },
    [byTitle, app],
  );
  return { isKnownTitle, openTitle };
}

export function ChatThread({ ws, chatId, onSuggest }: { ws: Workspace; chatId: string | null; onSuggest?: (text: string) => void }) {
  const s = useAssistant();
  const messages = useChatMessages(ws, chatId);
  const { isKnownTitle, openTitle } = useTitleLinks(ws);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const mine = s.chatId === chatId || (!chatId && !s.chatId);
  const draft = s.running && mine ? s.draft : null;

  // Follow new content while the user is at the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, draft?.text, draft?.steps.length]);

  return (
    <div
      ref={listRef}
      className="as-thread"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {messages.length === 0 && !draft && <Welcome ws={ws} onSuggest={onSuggest} />}
      {messages.map((m) => (
        <MessageView key={m.id} m={m} isKnownTitle={isKnownTitle} openTitle={openTitle} />
      ))}
      {draft && (
        <div className="as-msg as-msg-assistant">
          {draft.steps.length > 0 && (
            <ul className="as-steps">
              {draft.steps.map((st) => (
                <li key={st.id} className={`as-step as-step-${st.state}`}>
                  <span className="as-step-icon">{st.state === "running" ? <span className="spinner spinner-sm" /> : st.state === "done" ? "✓" : "!"}</span>
                  <span className="ellipsis">{st.detail || st.title}</span>
                </li>
              ))}
            </ul>
          )}
          {draft.text ? (
            <Markdown md={draft.text} onWikiLink={openTitle} isKnownTitle={isKnownTitle} streaming />
          ) : (
            <Dots label={draft.steps.some((x) => x.state === "running") ? "Working" : "Thinking"} />
          )}
        </div>
      )}
      {mine && s.error && !s.running && <ErrorNote message={s.error} />}
    </div>
  );
}

function MessageView({ m, isKnownTitle, openTitle }: { m: ChatMessage; isKnownTitle: (t: string) => boolean; openTitle: (t: string) => void }) {
  if (m.role === "user") {
    return (
      <div className="as-msg as-msg-user">
        <div className="as-bubble">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="as-msg as-msg-assistant">
      {m.actions && m.actions.length > 0 && (
        <details className="as-actions">
          <summary>
            {m.actions.length} change{m.actions.length === 1 ? "" : "s"} in your workspace
          </summary>
          <ul>
            {m.actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}
      {m.text && <Markdown md={m.text} onWikiLink={openTitle} isKnownTitle={isKnownTitle} />}
      {m.status === "stopped" && <div className="as-note">Stopped.</div>}
      {m.status === "error" && !m.text && <div className="as-note">This reply didn't finish.</div>}
    </div>
  );
}

function Welcome({ ws, onSuggest }: { ws: Workspace; onSuggest?: (text: string) => void }) {
  const settings = useSettings();
  const route = useRoute();
  const pageId = route.name === "page" ? route.pageId : null;
  const { meta } = usePage(ws, pageId);
  const onPage = meta && meta.kind !== "chat";
  const ideas = onPage
    ? [
        "Summarize this page",
        "Make flashcards from this page",
        "Find related pages and link them",
        "Turn this into a checklist of next steps",
      ]
    : [
        "What should I focus on today?",
        "Teach me something new, from scratch",
        "Plan a workout routine and add it to my skill tree",
        "Start a weekly review page",
      ];
  return (
    <div className="as-welcome">
      <div className="as-welcome-title">Hi {settings.identity.name.split(" ")[0]}, what can I do for you?</div>
      <div className="as-welcome-sub">
        I can search, write and organize your pages, plan your skills and quests, build courses and flashcards, and look things up
        on the web.
      </div>
      <div className="as-ideas">
        {ideas.map((t) => (
          <button key={t} type="button" className="as-idea" onClick={() => onSuggest?.(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Composer({
  ws,
  chatId,
  autoFocus = false,
  seed,
}: {
  ws: Workspace;
  chatId: string | null;
  autoFocus?: boolean;
  /** Text to send right away (from a suggestion). */
  seed?: { text: string; n: number } | null;
}) {
  const s = useAssistant();
  const settings = useSettings();
  const context = useViewContext(ws);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const busy = s.running;

  const send = useCallback(
    (value: string) => {
      const t = value.trim();
      if (!t || busy) return;
      setText("");
      void sendMessage(ws, t, context(), chatId);
    },
    [ws, context, chatId, busy],
  );

  useEffect(() => {
    if (seed?.text) send(seed.text);
    // Only when a new suggestion arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.n]);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  // Grow with the text, up to a limit.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  useEffect(() => () => stopRef.current?.(), []);

  const toggleMic = () => {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setVoiceError("");
    setListening(true);
    setMood("listening");
    stopRef.current = listen(
      (t) => setText(t),
      (final, error) => {
        setListening(false);
        stopRef.current = null;
        setMood("idle");
        if (error) setVoiceError(error);
        else if (final) send(final);
      },
    );
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(text);
    }
  };

  return (
    <div className="as-composer">
      {voiceError && <div className="as-voice-error small">{voiceError}</div>}
      <div className="as-composer-row">
        <textarea
          ref={areaRef}
          className="as-input"
          rows={1}
          value={text}
          placeholder={listening ? "Listening…" : `Ask ${settings.assistant.name} anything, or tell it what to do`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          aria-label={`Message ${settings.assistant.name}`}
        />
        {canListen() && (
          <button
            type="button"
            className={`icon-btn as-mic${listening ? " active" : ""}`}
            onClick={toggleMic}
            title={listening ? "Stop listening" : "Talk"}
            aria-label={listening ? "Stop listening" : "Talk"}
            aria-pressed={listening}
            disabled={busy}
          >
            <Icon name="mic" />
          </button>
        )}
        {busy ? (
          <button type="button" className="btn btn-sm as-send" onClick={stopAssistant} title="Stop" aria-label="Stop">
            <span className="as-stop-square" />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm as-send"
            onClick={() => send(text)}
            disabled={!text.trim()}
            title="Send (Enter)"
            aria-label="Send"
          >
            <Icon name="arrowUp" />
          </button>
        )}
      </div>
    </div>
  );
}

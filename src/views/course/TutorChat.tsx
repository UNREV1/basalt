// Socratic tutor chat scoped to the current lesson or the whole course.
// Conversations are stored in the course's `chats` Y.Map so they sync to
// every device and collaborator; the reply being streamed is local until done.

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import type * as Y from "yjs";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ChatMessage, Curriculum } from "../../../shared/course.ts";
import { Menu, type Anchor } from "../../components/ui.tsx";
import { aiErrorMessage, streamText } from "../../lib/ai.ts";
import { useY } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Dots, ErrorNote, Markdown, NoKeyPanel, useRafText } from "../tutor/ai-ui.tsx";
import { appendChat, lessonMarkdown } from "./generate.ts";
import { chatsMap, courseInfo, progressReader, TUTOR_ORIGIN, type LessonRef } from "./model.ts";
import { clip, QUICK_PROMPTS, tutorSystem } from "./prompts.ts";

const EMPTY: ChatMessage[] = [];

/** API messages must alternate and start with the user. */
function toApiMessages(history: ChatMessage[]): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  for (const m of history) {
    if (!m.text.trim()) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) prev.content = `${prev.content as string}\n\n${m.text}`;
    else out.push({ role: m.role, content: m.text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export interface TutorChatProps {
  ws: Workspace;
  page: Y.Map<any>;
  curriculum: Curriculum;
  /** Lesson open in study mode, if any. */
  lessonRef?: LessonRef;
  hasKey: boolean;
  courseTitle: string;
  /** Desktop side panel (true) or mobile bottom sheet (false). */
  docked: boolean;
  onClose: () => void;
}

export function TutorChat({ ws, page, curriculum, lessonRef, hasKey, courseTitle, docked, onClose }: TutorChatProps) {
  const [scope, setScope] = useState<"lesson" | "course">(lessonRef ? "lesson" : "course");
  const lessonKey = lessonRef?.lesson.id;
  useEffect(() => setScope(lessonKey ? "lesson" : "course"), [lessonKey]);
  const activeRef = scope === "lesson" ? lessonRef : undefined;
  const scopeKey = activeRef ? activeRef.lesson.id : "course";

  const chats = chatsMap(page);
  useY(chats);
  const messages = chats?.get(scopeKey) ?? EMPTY;

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamed, pushStreamed, resetStreamed] = useRafText();
  const partial = useRef("");
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [drag, setDrag] = useState(0);

  // Switching scope (or closing) stops a reply in flight.
  useEffect(() => () => abort.current?.abort(), [scopeKey]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, streamed, busy, error]);

  const run = useCallback(
    async (history: ChatMessage[]) => {
      const key = scopeKey;
      const controller = new AbortController();
      abort.current?.abort();
      abort.current = controller;
      setBusy(true);
      setError(null);
      partial.current = "";
      resetStreamed("");
      stick.current = true;
      try {
        const progressOf = progressReader(page);
        const system = tutorSystem({
          info: courseInfo(page),
          curriculum,
          progressOf,
          ref: activeRef,
          lessonMarkdown: activeRef ? clip(lessonMarkdown(ws, progressOf(activeRef.lesson.id).lessonPageId), 40000) : undefined,
        });
        const text = await streamText({
          system,
          messages: toApiMessages(history.slice(-40)),
          signal: controller.signal,
          effort: "medium",
          maxTokens: 16000,
          onText: (_, full) => {
            partial.current = full;
            pushStreamed(full);
          },
        });
        appendChat(page, key, { role: "assistant", text, at: Date.now() });
      } catch (err) {
        if (controller.signal.aborted) {
          if (abort.current === controller && partial.current.trim()) appendChat(page, key, { role: "assistant", text: `${partial.current}\n\n*(stopped)*`, at: Date.now() });
        } else {
          setError(aiErrorMessage(err));
        }
      } finally {
        // A newer request may have replaced this one; leave its state alone.
        if (abort.current === controller) {
          abort.current = null;
          setBusy(false);
          resetStreamed("");
        }
      }
    },
    [scopeKey, page, curriculum, activeRef, ws, pushStreamed, resetStreamed],
  );

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy || !hasKey) return;
    const msg: ChatMessage = { role: "user", text: t, at: Date.now() };
    appendChat(page, scopeKey, msg);
    setDraft("");
    void run([...messages, msg]);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(draft);
  };

  const clear = () => {
    // Detach the request first so its partial reply isn't saved into the cleared chat.
    const inFlight = abort.current;
    abort.current = null;
    inFlight?.abort();
    setBusy(false);
    resetStreamed("");
    if (chats) ws.doc.transact(() => chats.delete(scopeKey), TUTOR_ORIGIN);
    setError(null);
  };

  // Bottom-sheet drag-to-dismiss.
  const dragStart = useRef<number | null>(null);
  const onHandleDown = (e: ReactPointerEvent) => {
    dragStart.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    if (dragStart.current !== null) setDrag(Math.max(0, e.clientY - dragStart.current));
  };
  const onHandleUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (drag > 110) onClose();
    setDrag(0);
  };

  const quickScope = activeRef ? "lesson" : "course";
  const title = activeRef ? activeRef.lesson.title : courseTitle;

  const panel = (
    <aside
      className={`co-chat ${docked ? "docked" : "sheet"}`}
      aria-label="Tutor chat"
      style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !docked) onClose();
      }}
    >
      {!docked && (
        <div className="co-chat-handle" onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}>
          <span />
        </div>
      )}
      <header className="co-chat-head">
        <span className="co-chat-avatar" aria-hidden>
          🎓
        </span>
        <div className="grow co-chat-titles">
          <div className="co-chat-title">Tutor</div>
          <div className="co-chat-sub ellipsis">{title}</div>
        </div>
        <button type="button" className="icon-btn" aria-label="Chat options" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
          ⋯
        </button>
        <button type="button" className="icon-btn" aria-label="Close tutor" onClick={onClose}>
          ✕
        </button>
      </header>
      {lessonRef && (
        <div className="co-chat-scope">
          <div className="tabs">
            <button type="button" className={`tab${scope === "lesson" ? " active" : ""}`} onClick={() => setScope("lesson")}>
              This lesson
            </button>
            <button type="button" className={`tab${scope === "course" ? " active" : ""}`} onClick={() => setScope("course")}>
              Whole course
            </button>
          </div>
        </div>
      )}

      <div
        className="co-chat-list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {messages.length === 0 && !busy && (
          <div className="co-chat-intro">
            <div className="co-chat-intro-title">Hi! I'm your tutor.</div>
            <p>
              {activeRef
                ? "Ask me anything about this lesson. I'll guide you with questions so the ideas really stick, and give you straight answers when you ask for them."
                : "Ask me anything about the course: what to focus on, how ideas connect, or where you're stuck."}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={`${m.at}-${i}`} className={`co-msg ${m.role}`}>
            <Markdown md={m.text} />
          </div>
        ))}
        {busy && (
          <div className="co-msg assistant">
            {streamed ? <Markdown md={streamed} streaming /> : <Dots label="Tutor is thinking" />}
          </div>
        )}
        {error && (
          <ErrorNote
            message={error}
            onRetry={() => {
              setError(null);
              void run(messages);
            }}
          />
        )}
      </div>

      {hasKey ? (
        <>
          <div className="co-chat-quick">
            {QUICK_PROMPTS.map((q) => (
              <button key={q.label} type="button" className="co-quick" disabled={busy} onClick={() => send(q.text(quickScope))}>
                <span aria-hidden>{q.icon}</span> {q.label}
              </button>
            ))}
          </div>
          <form className="co-chat-compose" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              className="co-chat-input"
              rows={1}
              value={draft}
              placeholder={activeRef ? "Ask about this lesson…" : "Ask about the course…"}
              onChange={(e) => {
                setDraft(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            {busy ? (
              <button type="button" className="btn btn-sm co-chat-send" onClick={() => abort.current?.abort()}>
                ■ Stop
              </button>
            ) : (
              <button type="submit" className="btn btn-primary btn-sm co-chat-send" disabled={!draft.trim()}>
                Send
              </button>
            )}
          </form>
        </>
      ) : (
        <div className="co-chat-nokey">
          <NoKeyPanel
            ws={ws}
            compact
            title="Connect Claude to chat"
            lead="The tutor chat runs on Claude."
            claudePrompt={`Tutor me on “${title}” from my Basalt course “${courseTitle}”.`}
          />
        </div>
      )}
      {menu && (
        <Menu
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[{ label: "Clear this conversation", icon: "🗑", danger: true, disabled: messages.length === 0, onClick: clear }]}
        />
      )}
    </aside>
  );

  if (docked) return panel;
  return (
    <>
      <div className="co-chat-backdrop" onClick={onClose} />
      {panel}
    </>
  );
}

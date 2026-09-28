// The assistant's chat panel: slides in over the app (full screen on phones),
// with the current chat, its history, and quick toggles.

import { useMemo, useState } from "react";
import { childPages } from "../../mcp/ops.ts";
import { Icon } from "../components/ui.tsx";
import { useApp, useMediaQuery, usePages } from "../lib/hooks.ts";
import { updateSettings, useSettings } from "../lib/settings.ts";
import { NoKeyPanel, useAiAvailable } from "../views/tutor/ai-ui.tsx";
import { CHATS_SYSTEM } from "./chats.ts";
import { ChatThread, Composer } from "./ChatThread.tsx";
import { Pebble } from "./Pebble.tsx";
import { newChat, openAssistant, openChat, useAssistant, type AssistantState } from "./store.ts";
import { canSpeak, stopSpeaking } from "./voice.ts";
import "./assistant.css";

export function statusLine(s: AssistantState): string {
  if (s.running) {
    if (s.activity && Date.now() - s.activity.at < 8000) return s.activity.text;
    if (s.draft?.steps.some((x) => x.state === "running")) return "Working…";
    return s.draft?.text ? "Writing…" : "Thinking…";
  }
  if (s.mood === "listening") return "Listening…";
  if (s.error) return "Something went wrong";
  return "Ready";
}

export default function AssistantPanel() {
  const { ws, openPage } = useApp();
  const s = useAssistant();
  const settings = useSettings();
  const a = settings.assistant;
  const available = useAiAvailable();
  const phone = useMediaQuery("(max-width: 800px)");
  const [history, setHistory] = useState(false);
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);
  if (!s.open) return null;

  return (
    <aside className={`as-panel${phone ? " as-phone" : ""}`} role="dialog" aria-label={`${a.name}, your assistant`}>
      <header className="as-head">
        <Pebble size={34} mood={s.mood} className="as-avatar" />
        <div className="as-head-text">
          <div className="as-name">{a.name}</div>
          <div className="as-status ellipsis">{statusLine(s)}</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          title="New chat"
          aria-label="New chat"
          disabled={s.running}
          onClick={() => {
            newChat();
            setHistory(false);
          }}
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          className={`icon-btn${history ? " active" : ""}`}
          title="Past chats"
          aria-label="Past chats"
          aria-pressed={history}
          onClick={() => setHistory((h) => !h)}
        >
          <Icon name="clock" />
        </button>
        {canSpeak() && (
          <button
            type="button"
            className={`icon-btn${a.voice ? " active" : ""}`}
            title={a.voice ? "Spoken replies: on" : "Spoken replies: off"}
            aria-label="Spoken replies"
            aria-pressed={a.voice}
            onClick={() => {
              if (a.voice) stopSpeaking();
              updateSettings({ assistant: { ...a, voice: !a.voice } });
            }}
          >
            <Icon name={a.voice ? "volume" : "volumeOff"} />
          </button>
        )}
        {s.chatId && (
          <button type="button" className="icon-btn" title="Open this chat as a page" aria-label="Open as page" onClick={() => openPage(s.chatId!)}>
            <Icon name="open" />
          </button>
        )}
        <button type="button" className="icon-btn" title="Close (Esc)" aria-label="Close" onClick={() => openAssistant(false)}>
          <Icon name="x" />
        </button>
      </header>
      {!available ? (
        <div className="as-body-scroll">
          <NoKeyPanel
            ws={ws}
            compact
            title={`Connect Claude to talk to ${a.name}`}
            lead={`${a.name} is Claude working inside your workspace. Pick whichever route suits you:`}
            appHint="It can read and edit your pages, skills, courses and flashcards."
            claudePrompt="Look through my Basalt workspace and tell me what I should focus on today."
          />
        </div>
      ) : history ? (
        <ChatHistory
          onPick={(id) => {
            openChat(id);
            setHistory(false);
          }}
        />
      ) : (
        <>
          <ChatThread ws={ws} chatId={s.chatId} onSuggest={(text) => setSeed({ text, n: Date.now() })} />
          <Composer ws={ws} chatId={s.chatId} autoFocus={!phone} seed={seed} />
        </>
      )}
    </aside>
  );
}

function ChatHistory({ onPick }: { onPick: (id: string) => void }) {
  const { ws } = useApp();
  const pages = usePages(ws);
  const s = useAssistant();
  const chats = useMemo(() => {
    const root = pages.find((p) => p.system === CHATS_SYSTEM && !p.deletedAt);
    if (!root) return [];
    return childPages(ws.doc, root.id)
      .filter((p) => p.kind === "chat")
      .sort((x, y) => y.updatedAt - x.updatedAt);
  }, [pages, ws]);
  if (!chats.length) return <div className="as-empty-history">No chats yet. Everything you ask is saved here as a page.</div>;
  return (
    <ul className="as-history">
      {chats.map((c) => (
        <li key={c.id}>
          <button type="button" className={`as-history-item${c.id === s.chatId ? " active" : ""}`} onClick={() => onPick(c.id)}>
            <span className="ellipsis">{c.title || "Chat"}</span>
            <span className="as-history-when">{new Date(c.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

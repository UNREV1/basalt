// The assistant as a dock panel (when you've moved it into a dock instead
// of using the floating chat).

import { useState } from "react";
import { Icon } from "../components/ui.tsx";
import { useApp } from "../lib/hooks.ts";
import { useSettings } from "../lib/settings.ts";
import { NoKeyPanel, useAiAvailable } from "../views/tutor/ai-ui.tsx";
import { claudeBridge } from "../lib/claude.ts";
import { statusLine } from "./AssistantPanel.tsx";
import { ChatThread, Composer } from "./ChatThread.tsx";
import { newChat, useAssistant } from "./store.ts";
import "./assistant.css";

export default function DockedAssistant() {
  const { ws, openPage } = useApp();
  const s = useAssistant();
  const name = useSettings().assistant.name;
  // Claude Code (desktop app) or an API key.
  const available = useAiAvailable() || !!claudeBridge;
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);
  if (!available) {
    return (
      <div className="dock-assistant-nokey">
        <NoKeyPanel ws={ws} compact title={`Connect Claude to talk to ${name}`} lead={`${name} is Claude working inside your workspace.`} />
      </div>
    );
  }
  return (
    <div className="dock-assistant">
      <div className="row dock-assistant-bar">
        <span className="grow small faint ellipsis">{statusLine(s)}</span>
        {s.chatId && (
          <button className="icon-btn" title="Open this chat as a page" aria-label="Open as page" onClick={() => openPage(s.chatId!)}>
            <Icon name="open" size={14} />
          </button>
        )}
        <button className="icon-btn" title="New chat" aria-label="New chat" disabled={s.running} onClick={newChat}>
          <Icon name="plus" size={14} />
        </button>
      </div>
      <ChatThread ws={ws} chatId={s.chatId} onSuggest={(text) => setSeed({ text, n: Date.now() })} />
      <Composer ws={ws} chatId={s.chatId} seed={seed} />
    </div>
  );
}

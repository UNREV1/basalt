// A chat page: a conversation with the assistant, stored as a page like any
// other. Continue it right here; the floating assistant follows along.

import { useEffect, useState } from "react";
import { ChatThread, Composer } from "../../assistant/ChatThread.tsx";
import { openChat, useAssistant } from "../../assistant/store.ts";
import { useAiAvailable, NoKeyPanel } from "../tutor/ai-ui.tsx";
import type { PageViewProps } from "../types.ts";
import "../../assistant/assistant.css";

export default function ChatView({ ws, pageId }: PageViewProps) {
  const s = useAssistant();
  const available = useAiAvailable();
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null);

  // Viewing a chat makes it the assistant's current chat (unless it's busy elsewhere).
  useEffect(() => {
    if (!s.running && s.chatId !== pageId) openChat(pageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  return (
    <div className="as-page">
      <ChatThread ws={ws} chatId={pageId} onSuggest={(text) => setSeed({ text, n: Date.now() })} />
      {available ? <Composer ws={ws} chatId={pageId} seed={seed} /> : <NoKeyPanel ws={ws} compact />}
    </div>
  );
}

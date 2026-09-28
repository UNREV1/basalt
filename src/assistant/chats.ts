// Conversations with the assistant are pages (kind "chat") under a "Chats"
// system page: searchable, linkable and synced like everything else.
//
// A chat page keeps its messages in page.get("chat"), a Y.Array of plain
// objects. Only finished messages are stored; the reply in progress lives in
// the assistant's runtime state (store.ts).

import * as Y from "yjs";
import { randomId } from "../../shared/crypto.ts";
import { createPage, ensureSystemPage, getPage, updatePage } from "../../shared/model.ts";

export const CHATS_SYSTEM = "chats";

/** Transaction origin for everything the assistant writes. */
export const ASSISTANT_ORIGIN = "basalt-assistant";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** What the assistant did while answering ("Created “Workout plan”"). */
  actions?: string[];
  /** The reply was stopped, or failed. */
  status?: "stopped" | "error";
  at: number;
}

export function chatArray(page: Y.Map<any>): Y.Array<ChatMessage> | null {
  const a = page.get("chat");
  return a instanceof Y.Array ? (a as Y.Array<ChatMessage>) : null;
}

export function readChat(doc: Y.Doc, chatId: string | null): ChatMessage[] {
  if (!chatId) return [];
  const page = getPage(doc, chatId);
  const arr = page && chatArray(page);
  return arr ? arr.toArray().filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string") : [];
}

export function chatsRoot(doc: Y.Doc, createdBy = ""): string {
  return ensureSystemPage(doc, CHATS_SYSTEM, { title: "Chats", icon: "💬", createdBy });
}

/** A short title from the first message. */
export function chatTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 48 ? `${oneLine.slice(0, 47).trimEnd()}…` : oneLine || "New chat";
}

export function createChat(doc: Y.Doc, firstMessage: string, createdBy: string): string {
  let id = "";
  doc.transact(() => {
    const parentId = chatsRoot(doc, createdBy);
    id = createPage(doc, { kind: "chat", title: chatTitle(firstMessage), icon: "💬", parentId, createdBy });
  }, ASSISTANT_ORIGIN);
  return id;
}

export function appendMessage(doc: Y.Doc, chatId: string, msg: Omit<ChatMessage, "id" | "at">): ChatMessage | null {
  const page = getPage(doc, chatId);
  if (!page) return null;
  const full: ChatMessage = { id: randomId(), at: Date.now(), ...msg };
  doc.transact(() => {
    let arr = chatArray(page);
    if (!arr) page.set("chat", (arr = new Y.Array<ChatMessage>()));
    arr.push([full]);
    updatePage(doc, chatId, {});
  }, ASSISTANT_ORIGIN);
  return full;
}

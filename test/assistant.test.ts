import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { ensureDefaults, getPage, pageMeta } from "../shared/model.ts";
import { appendMessage, chatsRoot, createChat, readChat } from "../src/assistant/chats.ts";
import { searchPages } from "../mcp/ops.ts";

test("assistant chats are pages under Chats, with their messages searchable", () => {
  const doc = new Y.Doc();
  ensureDefaults(doc, "Assistant test");
  const id = createChat(doc, "Plan a   workout routine for my first 5k race please, with rest days", "Ada");
  const meta = pageMeta(getPage(doc, id)!);
  assert.equal(meta.kind, "chat");
  assert.equal(meta.parentId, chatsRoot(doc));
  assert.ok(meta.title.length <= 48 && meta.title.startsWith("Plan a workout routine"));
  appendMessage(doc, id, { role: "user", text: "Plan a workout routine" });
  appendMessage(doc, id, { role: "assistant", text: "Done: I made [[5k plan]] with intervals.", actions: ["Created “5k plan”"] });
  const msgs = readChat(doc, id);
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant"]);
  assert.deepEqual(msgs[1].actions, ["Created “5k plan”"]);
  const hits = searchPages(doc, "intervals", { limit: 5 });
  assert.ok(hits.some((h) => h.meta.id === id), "chat text is searchable");
  assert.equal(chatsRoot(doc), meta.parentId, "one Chats page");
});

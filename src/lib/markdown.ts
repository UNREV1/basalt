// Markdown <-> page content conversion in the browser, via a headless
// BlockNote editor sharing the app's schema.

import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYXmlFragment, yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import type * as Y from "yjs";
import { headlessSchema } from "../../shared/schema.ts";
import {
  fixWikilinkEscapes,
  linkifyBlocks,
  mathifyBlocks,
  protectMath,
  restoreMath,
  unlinkBlocks,
  unmathBlocks,
  type LinkResolver,
} from "../../shared/markdown.ts";
import { displayTitle, getPage, listPages, pageMeta } from "../../shared/model.ts";
import type { Workspace } from "./workspace.ts";

let headless: BlockNoteEditor<any, any, any> | null = null;

function editor(): BlockNoteEditor<any, any, any> {
  headless ??= BlockNoteEditor.create({ schema: headlessSchema });
  return headless;
}

/** Resolve [[Title]] to existing (non-deleted) pages by case-insensitive title. */
export function titleResolver(ws: Workspace): LinkResolver {
  const byTitle = new Map<string, { id: string; title: string }>();
  for (const p of listPages(ws.doc)) {
    const key = displayTitle(p).toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, { id: p.id, title: displayTitle(p) });
  }
  return (title) => byTitle.get(title.toLowerCase()) ?? null;
}

export function markdownToBlocks(ws: Workspace, md: string, resolve: LinkResolver = titleResolver(ws)) {
  return mathifyBlocks(linkifyBlocks(editor().tryParseMarkdownToBlocks(protectMath(md)) as any[], resolve));
}

/** Replace a fragment's content with parsed markdown. */
export function setFragmentMarkdown(ws: Workspace, fragment: Y.XmlFragment, md: string, resolve?: LinkResolver) {
  const blocks = markdownToBlocks(ws, md, resolve);
  ws.doc.transact(() => blocksToYXmlFragment(editor(), blocks as any, fragment));
}

/** Append markdown to the end of a page's content. */
export function appendMarkdown(ws: Workspace, pageId: string, md: string) {
  const page = getPage(ws.doc, pageId);
  if (!page) return;
  const fragment = page.get("content") as Y.XmlFragment;
  const existing = yXmlFragmentToBlocks(editor(), fragment) as any[];
  // Drop a trailing empty paragraph so appended content doesn't leave a gap.
  const last = existing[existing.length - 1];
  if (last && last.type === "paragraph" && Array.isArray(last.content) && last.content.length === 0) existing.pop();
  const blocks = [...existing, ...markdownToBlocks(ws, md)];
  ws.doc.transact(() => {
    blocksToYXmlFragment(editor(), blocks as any, fragment);
    page.set("updatedAt", Date.now());
  });
}

/** Replace a page's content with markdown. */
export function setPageMarkdown(ws: Workspace, pageId: string, md: string) {
  const page = getPage(ws.doc, pageId);
  if (!page) return;
  ws.doc.transact(() => {
    setFragmentMarkdown(ws, page.get("content") as Y.XmlFragment, md);
    page.set("updatedAt", Date.now());
  });
}

export function fragmentToMarkdown(ws: Workspace, fragment: Y.XmlFragment): string {
  const blocks = yXmlFragmentToBlocks(editor(), fragment) as any[];
  const titleOf = (id: string) => {
    const p = getPage(ws.doc, id);
    return p ? displayTitle(pageMeta(p)) : undefined;
  };
  return restoreMath(fixWikilinkEscapes(editor().blocksToMarkdownLossy(unmathBlocks(unlinkBlocks(blocks, titleOf)) as any)));
}

export function pageToMarkdown(ws: Workspace, pageId: string): string {
  const page = getPage(ws.doc, pageId);
  if (!page) return "";
  return fragmentToMarkdown(ws, page.get("content") as Y.XmlFragment);
}

export function downloadText(filename: string, text: string, type = "text/markdown") {
  downloadBlob(filename, new Blob([text], { type }));
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

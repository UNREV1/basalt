// Obsidian-style linked and unlinked mentions for a page.

import { useEffect, useState } from "react";
import * as Y from "yjs";
import {
  displayTitle,
  fragmentLinks,
  getPage,
  listPages,
  pageMeta,
  pageText,
  pagesMap,
  type PageMeta,
} from "../../shared/model.ts";
import { useApp } from "../lib/hooks.ts";
import { appendMarkdown } from "../lib/markdown.ts";
import { Icon } from "./ui.tsx";
import { PageIcon } from "./customize/PageIcon.tsx";

interface Mention {
  page: PageMeta;
  snippet: string;
}

function snippetAround(text: string, needle: string): string {
  const i = text.toLowerCase().indexOf(needle.toLowerCase());
  if (i < 0) return text.slice(0, 140);
  const lineStart = text.lastIndexOf("\n", i) + 1;
  const lineEnd = text.indexOf("\n", i);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  return line.length > 200 ? `…${line.slice(Math.max(0, i - lineStart - 80), i - lineStart + 120)}…` : line;
}

function compute(doc: Y.Doc, pageId: string): { linked: Mention[]; unlinked: Mention[] } {
  const target = getPage(doc, pageId);
  if (!target) return { linked: [], unlinked: [] };
  const title = displayTitle(pageMeta(target));
  const linked: Mention[] = [];
  const unlinked: Mention[] = [];
  for (const meta of listPages(doc)) {
    if (meta.id === pageId) continue;
    const page = getPage(doc, meta.id)!;
    const links = fragmentLinks(page.get("content") as Y.XmlFragment);
    if (links.includes(pageId)) {
      linked.push({ page: meta, snippet: snippetAround(pageText(doc, meta.id), `[[${title}]]`) });
    } else if (title.length >= 3 && title !== "Untitled") {
      const text = pageText(doc, meta.id);
      const re = new RegExp(`\\b${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(text)) unlinked.push({ page: meta, snippet: snippetAround(text, title) });
    }
  }
  const byRecent = (a: Mention, b: Mention) => b.page.updatedAt - a.page.updatedAt;
  return { linked: linked.sort(byRecent), unlinked: unlinked.sort(byRecent).slice(0, 20) };
}

export function Backlinks({ pageId }: { pageId: string }) {
  const { ws, openPage } = useApp();
  const [data, setData] = useState(() => compute(ws.doc, pageId));
  const [showUnlinked, setShowUnlinked] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        setData(compute(ws.doc, pageId));
      }, 1200);
    };
    setData(compute(ws.doc, pageId));
    const map = pagesMap(ws.doc);
    map.observeDeep(refresh);
    return () => {
      map.unobserveDeep(refresh);
      if (timer) clearTimeout(timer);
    };
  }, [ws, pageId]);

  if (!data.linked.length && !data.unlinked.length) return null;

  const row = (m: Mention, unlinked = false) => (
    <div key={m.page.id} className="backlink">
      <button className="backlink-title" onClick={() => openPage(m.page.id)}>
        <PageIcon meta={m.page} />
        <span className="ellipsis">{displayTitle(m.page)}</span>
      </button>
      <div className="backlink-snippet small muted">{m.snippet}</div>
      {unlinked && (
        <button
          className="btn btn-sm btn-ghost"
          title="Add a link to this page at the end of that page"
          onClick={() => {
            const target = getPage(ws.doc, pageId);
            if (target) appendMarkdown(ws, m.page.id, `See also [[${displayTitle(pageMeta(target))}]]`);
          }}
        >
          <Icon name="link" size={13} /> Link
        </button>
      )}
    </div>
  );

  return (
    <section className="backlinks">
      {data.linked.length > 0 && (
        <>
          <div className="backlinks-head">
            <Icon name="link" size={14} /> {data.linked.length} linked mention{data.linked.length === 1 ? "" : "s"}
          </div>
          {data.linked.map((m) => row(m))}
        </>
      )}
      {data.unlinked.length > 0 && (
        <>
          <button className="backlinks-head as-button" onClick={() => setShowUnlinked((v) => !v)}>
            <Icon name={showUnlinked ? "down" : "chevron"} size={14} /> {data.unlinked.length} unlinked mention
            {data.unlinked.length === 1 ? "" : "s"}
          </button>
          {showUnlinked && data.unlinked.map((m) => row(m, true))}
        </>
      )}
    </section>
  );
}

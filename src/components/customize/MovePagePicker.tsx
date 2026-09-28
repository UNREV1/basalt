// "Move to…": choose a new parent for a page (or the top level).

import { useEffect, useMemo, useRef, useState } from "react";
import { descendants, displayTitle, getPage, movePage, pageMeta, type PageMeta } from "../../../shared/model.ts";
import { useApp, usePages } from "../../lib/hooks.ts";
import { Icon, Modal } from "../ui.tsx";
import { PageIcon } from "./PageIcon.tsx";

interface Target {
  id: string | null;
  meta?: PageMeta;
  path: string;
}

export function MovePagePicker({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const { ws, toast } = useApp();
  const pages = usePages(ws);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const page = getPage(ws.doc, pageId);
  const meta = page ? pageMeta(page) : undefined;

  const targets = useMemo(() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const excluded = new Set([pageId, ...descendants(ws.doc, pageId)]);
    const pathOf = (p: PageMeta) => {
      const parts: string[] = [];
      let cur = p.parentId ? byId.get(p.parentId) : undefined;
      while (cur && parts.length < 6) {
        parts.unshift(displayTitle(cur));
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return parts.join(" / ");
    };
    const query = q.trim().toLowerCase();
    const list: Target[] = pages
      .filter((p) => !excluded.has(p.id))
      .map((p) => ({ id: p.id, meta: p, path: pathOf(p) }))
      .filter((t) => !query || displayTitle(t.meta!).toLowerCase().includes(query) || t.path.toLowerCase().includes(query))
      .sort((a, b) => {
        if (!query) return b.meta!.updatedAt - a.meta!.updatedAt;
        const at = displayTitle(a.meta!).toLowerCase().startsWith(query) ? 0 : 1;
        const bt = displayTitle(b.meta!).toLowerCase().startsWith(query) ? 0 : 1;
        return at - bt || b.meta!.updatedAt - a.meta!.updatedAt;
      })
      .slice(0, 60);
    return query ? list : [{ id: null, path: "" } as Target, ...list];
  }, [pages, pageId, q, ws]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(".qs-item.selected")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!meta) return null;

  const choose = (t: Target | undefined) => {
    if (!t) return;
    onClose();
    if (t.id === meta.parentId) return;
    movePage(ws.doc, pageId, t.id);
    toast(`Moved to ${t.meta ? `“${displayTitle(t.meta)}”` : "the top level"}`);
  };

  return (
    <Modal
      title={
        <>
          <Icon name="move" /> <span className="ellipsis">Move “{displayTitle(meta)}” to…</span>
        </>
      }
      onClose={onClose}
      width={520}
    >
      <input
        className="input"
        autoFocus
        aria-label="Search pages"
        placeholder="Search for a page…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(s + 1, targets.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(s - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(targets[sel]);
          }
        }}
      />
      <div className="move-list" ref={listRef} role="listbox" aria-label="Destinations">
        {targets.map((t, i) => (
          <button
            key={t.id ?? "root"}
            role="option"
            aria-selected={i === sel}
            className={`qs-item${i === sel ? " selected" : ""}`}
            onMouseEnter={() => setSel(i)}
            onClick={() => choose(t)}
          >
            <span className="qs-icon">{t.meta ? <PageIcon meta={t.meta} /> : <Icon name="home" />}</span>
            <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
              <span className="ellipsis">{t.meta ? displayTitle(t.meta) : "Top level"}</span>
              {(t.path || !t.meta) && <span className="small muted ellipsis">{t.meta ? t.path : "Workspace root"}</span>}
            </span>
            {t.id === meta.parentId && <span className="badge">Current</span>}
          </button>
        ))}
        {targets.length === 0 && <div className="empty small">No matching pages</div>}
      </div>
    </Modal>
  );
}

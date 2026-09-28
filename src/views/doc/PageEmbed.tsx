// A page shown inside another page (the "embed" block, `![[Title]]` in
// markdown). Canvases, databases and notebooks are live and editable right
// there; other pages show as a preview card that opens them.

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { getCurriculum } from "../../../shared/course.ts";
import {
  CREATABLE_KINDS,
  PAGE_KINDS,
  createPage,
  displayTitle,
  getPageStyle,
  pageText,
  restorePage,
  type PageKind,
  type PageMeta,
} from "../../../shared/model.ts";
import { PageIcon } from "../../components/customize/PageIcon.tsx";
import { Icon } from "../../components/ui.tsx";
import { useApp, usePage, usePages } from "../../lib/hooks.ts";
import { getSettings } from "../../lib/settings.ts";
import { courseStats, progressReader } from "../course/model.ts";
import { Lazy, pageViewFor } from "../registry.tsx";

/** The pages being shown around this point, so a page never contains itself. */
export const EmbedChain = createContext<string[]>([]);

const CANVAS: PageKind[] = ["board", "paint"];
const LIVE: PageKind[] = [...CANVAS, "database", "notebook"];
/** Kinds worth creating straight into a page. */
export const EMBED_KINDS: PageKind[] = ["board", "database", "notebook"];
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 1400;

export function PageEmbed({
  pageId,
  height,
  editable,
  onChange,
}: {
  pageId: string;
  height: number;
  editable: boolean;
  onChange: (props: { pageId?: string; height?: number }) => void;
}) {
  const chain = useContext(EmbedChain);
  const { ws, openPage } = useApp();
  const { page, meta } = usePage(ws, pageId || null);

  if (!pageId) return editable ? <EmbedPicker onPick={(id) => onChange({ pageId: id })} /> : null;
  if (!page || !meta) return <div className="embed embed-note">The embedded page was deleted or hasn’t synced to this device yet.</div>;
  if (chain.includes(pageId)) {
    return <div className="embed embed-note">“{displayTitle(meta)}” is already shown here: a page can’t contain itself.</div>;
  }

  const View = pageViewFor(meta.kind);
  const locked = !!getPageStyle(page).locked;
  const label = PAGE_KINDS.find((k) => k.kind === meta.kind)?.label ?? "Page";

  return (
    <EmbedChain.Provider value={[...chain, pageId]}>
      <div className={`embed embed-${meta.kind}`} data-embed-page={pageId}>
        <div className="embed-head">
          <button className="embed-title" onClick={() => openPage(pageId)} title="Open as a full page">
            <PageIcon meta={meta} className="embed-icon" />
            <span className="ellipsis">{displayTitle(meta)}</span>
          </button>
          <span className="embed-kind small faint">{label}</span>
          <span className="grow" />
          <button className="icon-btn" onClick={() => openPage(pageId)} aria-label="Open full page" title="Open full page">
            <Icon name="open" size={15} />
          </button>
        </div>
        {meta.deletedAt ? (
          <div className="embed-body embed-note row">
            <span className="grow">This page is in the trash.</span>
            <button className="btn btn-sm" onClick={() => restorePage(ws.doc, pageId)}>
              Restore
            </button>
          </div>
        ) : CANVAS.includes(meta.kind) ? (
          <>
            <div className="embed-canvas" style={{ height }}>
              <Lazy>
                <View ws={ws} pageId={pageId} page={page} locked={locked} embedded />
              </Lazy>
            </div>
            {editable && <ResizeHandle height={height} onResize={(h) => onChange({ height: h })} />}
          </>
        ) : LIVE.includes(meta.kind) ? (
          <div className="embed-flow">
            <Lazy>
              <View ws={ws} pageId={pageId} page={page} locked={locked} embedded />
            </Lazy>
          </div>
        ) : (
          <Preview meta={meta} />
        )}
      </div>
    </EmbedChain.Provider>
  );
}

/** Drag the bottom edge to make a canvas taller or shorter. */
function ResizeHandle({ height, onResize }: { height: number; onResize: (h: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  return (
    <div
      className={`embed-resize${draft !== null ? " active" : ""}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize"
      title="Drag to resize"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { y: e.clientY, h: height };
        setDraft(height);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const h = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, start.current.h + e.clientY - start.current.y)));
        setDraft(h);
        // Resize live by adjusting the canvas box directly.
        const box = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement | null;
        if (box) box.style.height = `${h}px`;
      }}
      onPointerUp={() => {
        if (draft !== null && draft !== height) onResize(draft);
        start.current = null;
        setDraft(null);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDraft(null);
      }}
    >
      <span />
    </div>
  );
}

/** Pages that aren't live here: a short preview that opens them. */
function Preview({ meta }: { meta: PageMeta }) {
  const { ws, openPage } = useApp();
  const { page } = usePage(ws, meta.id);
  const body = useMemo(() => {
    if (!page) return null;
    if (meta.kind === "course") {
      const c = getCurriculum(page);
      if (!c) return { lines: ["No roadmap yet: open it to design the course."] };
      const st = courseStats(c, progressReader(page));
      return {
        lines: [st.nextUp ? `Next: ${st.nextUp.lesson.title}` : "Course complete"],
        progress: st.total ? st.done / st.total : 0,
        foot: `${st.done}/${st.total} lessons`,
      };
    }
    const text = pageText(ws.doc, meta.id)
      .split("\n")
      .filter((l) => l.trim())
      .slice(0, 6);
    return { lines: text.length ? text : ["Empty page"] };
    // Re-read when the page is edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, meta.id, meta.kind, meta.updatedAt, ws]);
  if (!body) return null;
  return (
    <button className="embed-body embed-preview" onClick={() => openPage(meta.id)}>
      {body.lines.map((l, i) => (
        <span key={i} className="embed-preview-line">
          {l}
        </span>
      ))}
      {"progress" in body && body.progress !== undefined && (
        <span className="embed-progress">
          <span style={{ width: `${Math.round(body.progress * 100)}%` }} />
        </span>
      )}
      {"foot" in body && <span className="small faint">{body.foot}</span>}
    </button>
  );
}

/** An empty embed block: pick a page, or make a new canvas, database or notebook. */
function EmbedPicker({ onPick }: { onPick: (id: string) => void }) {
  const chain = useContext(EmbedChain);
  const { ws } = useApp();
  const pages = usePages(ws);
  const [q, setQ] = useState("");
  const host = chain[chain.length - 1];
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return pages
      .filter((p) => !chain.includes(p.id) && !p.system && displayTitle(p).toLowerCase().includes(query))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
  }, [pages, q, chain]);
  const create = (kind: PageKind) =>
    onPick(createPage(ws.doc, { kind, parentId: host ?? null, title: q.trim(), createdBy: getSettings().identity.name }));
  return (
    <div className="embed embed-picker">
      <input
        className="input"
        autoFocus
        placeholder="Embed a page: type to search…"
        aria-label="Search pages to embed"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) onPick(results[0].id);
        }}
      />
      <div className="embed-picker-list">
        {results.map((p) => (
          <button key={p.id} className="embed-picker-item" onClick={() => onPick(p.id)}>
            <PageIcon meta={p} className="embed-icon" />
            <span className="ellipsis grow">{displayTitle(p)}</span>
            <span className="small faint">{PAGE_KINDS.find((k) => k.kind === p.kind)?.label}</span>
          </button>
        ))}
      </div>
      <div className="row embed-picker-new">
        <span className="small muted">Or make a new</span>
        {CREATABLE_KINDS.filter((k) => EMBED_KINDS.includes(k.kind)).map((k) => (
          <button key={k.kind} className="btn btn-sm" onClick={() => create(k.kind)}>
            <span aria-hidden>{k.icon}</span> {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// "Link to page": pick a workspace page and attach it as the link of the
// selected shapes (written through the normal scene -> Y sync path).

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI, UIAppState } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { PAGE_KINDS, defaultIcon, displayTitle, type PageMeta } from "../../../shared/model.ts";
import { usePages } from "../../lib/hooks.ts";
import { pageHref } from "../../lib/router.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon, Popover, type Anchor } from "../../components/ui.tsx";

/** The page id an element link points to, when it is an in-app page link. */
export function linkedPageId(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = /#\/w\/[^/?#]+\/p\/([^/?#]+)/.exec(link);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Selected elements that should carry the link (bound labels follow their container). */
function linkTargets(api: ExcalidrawImperativeAPI): { ids: Set<string>; elements: readonly ExcalidrawElement[] } {
  const selected = api.getAppState().selectedElementIds;
  const elements = api.getSceneElementsIncludingDeleted();
  const ids = new Set<string>();
  for (const el of elements) {
    if (el.isDeleted || !selected[el.id]) continue;
    if (el.type === "text" && el.containerId && selected[el.containerId]) continue;
    ids.add(el.id);
  }
  return { ids, elements };
}

function setLinks(api: ExcalidrawImperativeAPI, link: string | null): number {
  const { ids, elements } = linkTargets(api);
  if (!ids.size) return 0;
  api.updateScene({
    elements: elements.map((el) => (ids.has(el.id) ? newElementWith(el, { link }) : el)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return ids.size;
}

const KIND_LABEL = new Map(PAGE_KINDS.map((k) => [k.kind, k.label]));

/** Whether the current selection has anything a link can be attached to. */
export function hasLinkTargets(api: ExcalidrawImperativeAPI | null): boolean {
  return !!api && linkTargets(api).ids.size > 0;
}

/** Top-right toolbar trigger (desktop/tablet; phones use the main menu entry). */
export function PageLinkButton({
  appState,
  open,
  onToggle,
}: {
  appState: UIAppState;
  open: boolean;
  onToggle: (anchor: DOMRect | null) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  if (appState.viewModeEnabled) return null;
  const disabled = Object.keys(appState.selectedElementIds).length === 0;
  return (
    <button
      ref={ref}
      type="button"
      className={`sidebar-trigger board-link-trigger${open ? " active" : ""}`}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label="Link to page"
      title={disabled ? "Link to page — select shapes first" : "Link to page"}
      // Keep the picker's outside-click handler from closing it just before this click reopens it.
      onPointerDown={(e) => open && e.nativeEvent.stopPropagation()}
      onClick={() => onToggle(open ? null : (ref.current?.getBoundingClientRect() ?? null))}
    >
      <Icon name="link" size={16} stroke={2} />
      <span className="board-link-trigger__label">Link to page</span>
    </button>
  );
}

export function PagePicker({
  ws,
  pageId,
  anchor,
  getApi,
  onClose,
}: {
  ws: Workspace;
  pageId: string;
  anchor: Anchor;
  getApi: () => ExcalidrawImperativeAPI | null;
  onClose: () => void;
}) {
  const pages = usePages(ws);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => {
    const api = getApi();
    if (!api) return new Set<string>();
    const { ids, elements } = linkTargets(api);
    const out = new Set<string>();
    for (const el of elements) {
      const target = ids.has(el.id) ? linkedPageId(el.link) : null;
      if (target) out.add(target);
    }
    return out;
  }, [getApi]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored: { page: PageMeta; score: number }[] = [];
    for (const p of pages) {
      if (p.id === pageId) continue;
      const title = displayTitle(p).toLowerCase();
      const at = q ? title.indexOf(q) : 0;
      if (at < 0) continue;
      scored.push({ page: p, score: q ? (at === 0 ? 0 : 1) : 0 });
    }
    scored.sort((a, b) => a.score - b.score || b.page.updatedAt - a.page.updatedAt);
    return scored.slice(0, 60).map((s) => s.page);
  }, [pages, pageId, query]);

  const choose = (page: PageMeta | null) => {
    const api = getApi();
    onClose();
    if (!api) return;
    const n = setLinks(api, page ? pageHref(ws.id, page.id) : null);
    if (!n) return;
    api.setToast({
      message: page ? `Linked to “${displayTitle(page)}”` : n > 1 ? "Links removed" : "Link removed",
      duration: 2000,
      closable: false,
    });
  };

  const move = (delta: number) => {
    if (!results.length) return;
    const next = (active + delta + results.length) % results.length;
    setActive(next);
    listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // The picker lives outside Excalidraw's container, but be explicit: typing
    // here must never reach canvas shortcuts.
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[active]) choose(results[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <Popover anchor={anchor} onClose={onClose} align="end" className="menu board-link-picker">
      <div className="board-link-picker__search">
        <Icon name="search" size={14} />
        <input
          autoFocus
          className="board-link-picker__input"
          placeholder="Link to page…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          aria-label="Search pages"
        />
      </div>
      <div className="board-link-picker__list" ref={listRef} role="listbox">
        {results.length === 0 && <div className="board-link-picker__empty">No matching pages</div>}
        {results.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={i === active}
            data-index={i}
            className={`menu-item board-link-picker__item${i === active ? " selected" : ""}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(p)}
          >
            <span className="board-link-picker__icon">{p.icon || defaultIcon(p.kind)}</span>
            <span className="grow ellipsis">{displayTitle(p)}</span>
            {current.has(p.id) ? (
              <span className="board-link-picker__check" aria-label="Linked">
                <Icon name="check" size={14} stroke={2.2} />
              </span>
            ) : (
              <span className="board-link-picker__kind">{KIND_LABEL.get(p.kind) ?? ""}</span>
            )}
          </button>
        ))}
      </div>
      {current.size > 0 && (
        <>
          <div className="menu-sep" />
          <button type="button" className="menu-item danger" onClick={() => choose(null)}>
            <Icon name="x" size={14} />
            <span className="grow">Remove page link</span>
          </button>
        </>
      )}
    </Popover>
  );
}

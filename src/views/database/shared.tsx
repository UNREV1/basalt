// Pieces shared by all database layouts (and the types manager's object table).

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import {
  displayTitle,
  pagesMap,
  updatePage,
  type ObjectType,
  type PageMeta,
  type PropDef,
} from "../../../shared/model.ts";
import { DraftInput, EmojiPicker, PropValueView } from "../../components/properties/PropertiesPanel.tsx";
import { isEmptyValue, pageIconFor } from "../../components/properties/propUtils.ts";
import type { Workspace } from "../../lib/workspace.ts";
import type { Row, ViewSettings } from "./query.ts";

export interface ViewStore {
  settings: ViewSettings;
  update: (patch: Partial<ViewSettings>) => void;
}

export interface NewRowInit {
  /** Values that win over filter-derived defaults (e.g. the board column clicked). */
  props?: Record<string, unknown>;
  /** Values used only when no active filter implies one. */
  fallbackProps?: Record<string, unknown>;
  title?: string;
}

export interface LayoutProps {
  ws: Workspace;
  type: ObjectType;
  rows: Row[];
  view: ViewStore;
  createRow: (init?: NewRowInit) => string;
  /** Row whose title should grab focus (freshly created). */
  editingId: string | null;
  setEditingId: (id: string | null) => void;
}

/** Page icon; optionally clickable to pick a new emoji for the page. */
export function RowIcon({
  ws,
  meta,
  type,
  editable = false,
  className = "",
}: {
  ws: Workspace;
  meta: PageMeta;
  type?: ObjectType;
  editable?: boolean;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const icon = pageIconFor(meta, type);
  if (!editable) return <span className={`db-row-icon ${className}`}>{icon}</span>;
  return (
    <>
      <button
        type="button"
        className={`db-row-icon db-row-icon-btn ${className}`}
        aria-label="Change icon"
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
      >
        {icon}
      </button>
      {anchor && (
        <EmojiPicker
          anchor={anchor}
          onClose={() => setAnchor(null)}
          onPick={(emoji) => updatePage(ws.doc, meta.id, { icon: emoji })}
          onRemove={meta.icon ? () => updatePage(ws.doc, meta.id, { icon: "" }) : undefined}
        />
      )}
    </>
  );
}

/** Live-committing title input (collaborators see keystrokes as they happen). */
export function TitleInput({
  ws,
  meta,
  autoFocus,
  onDone,
  className = "",
  placeholder = "Untitled",
}: {
  ws: Workspace;
  meta: PageMeta;
  autoFocus?: boolean;
  onDone?: () => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <DraftInput
      className={`db-title-input ${className}`}
      value={meta.title}
      placeholder={placeholder}
      aria-label="Title"
      live
      autoFocus={autoFocus}
      onCommit={(v) => updatePage(ws.doc, meta.id, { title: v })}
      onDone={() => onDone?.()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

export function rowTitle(meta: PageMeta): string {
  return displayTitle(meta);
}

/** Non-empty visible property values for cards/lists. */
export function CardProps({
  ws,
  row,
  props,
  max = 4,
  className = "",
}: {
  ws: Workspace;
  row: Row;
  props: PropDef[];
  max?: number;
  className?: string;
}) {
  const shown = props.filter((p) => !isEmptyValue(row.props[p.id]) || (p.kind === "number" && row.props[p.id] === 0)).slice(0, max);
  if (!shown.length) return null;
  return (
    <div className={`db-card-props ${className}`}>
      {shown.map((p) => (
        <div key={p.id} className={`db-card-prop db-card-prop-${p.kind}`} title={p.name}>
          {p.kind === "checkbox" ? (
            <span className="db-card-check">
              <PropValueView ws={ws} def={p} value={row.props[p.id]} /> {p.name}
            </span>
          ) : (
            <PropValueView ws={ws} def={p} value={row.props[p.id]} />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Bumps when rich-text content of any of `ids` changes (usePages ignores
 * content edits), so previews stay live without re-reading on every render.
 */
export function useContentTick(ws: Workspace, ids: string[]): number {
  const [tick, setTick] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    const watch = new Set(key ? key.split(",") : []);
    let scheduled = 0;
    const fn = (events: Y.YEvent<any>[]) => {
      for (const e of events) {
        const id = e.path[0];
        if (typeof id === "string" && e.path[1] === "content" && watch.has(id)) {
          if (!scheduled) scheduled = window.setTimeout(() => ((scheduled = 0), setTick((t) => t + 1)), 250);
          return;
        }
      }
    };
    const map = pagesMap(ws.doc);
    map.observeDeep(fn);
    return () => {
      map.unobserveDeep(fn);
      window.clearTimeout(scheduled);
    };
  }, [ws, key]);
  return tick;
}

export function EmptyRows({ typeName }: { typeName: string }) {
  return (
    <div className="db-empty">
      <div className="db-empty-title">No results</div>
      <div className="muted small">No {typeName} objects match the current filters or search.</div>
    </div>
  );
}

// Gallery (card grid with a live text preview) and List (compact rows) layouts.

import { useMemo } from "react";
import { displayTitle, pageText } from "../../../shared/model.ts";
import { Icon } from "../../components/properties/PropertiesPanel.tsx";
import { pageIconFor } from "../../components/properties/propUtils.ts";
import { useApp } from "../../lib/hooks.ts";
import { visibleProps } from "./query.ts";
import { CardProps, RowIcon, TitleInput, useContentTick, type LayoutProps } from "./shared.tsx";

const PREVIEW_CHARS = 140;

export function GalleryLayout({ ws, type, rows, view, createRow, editingId, setEditingId }: LayoutProps) {
  const { openPage } = useApp();
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
  const tick = useContentTick(ws, ids);
  const previews = useMemo(() => {
    const out = new Map<string, string>();
    for (const id of ids) {
      const text = pageText(ws.doc, id).replace(/\n{2,}/g, "\n").trim();
      out.set(id, text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text);
    }
    return out;
    // `tick` invalidates previews when page content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, ids, tick]);
  const props = visibleProps(type, view.settings.hiddenProps);

  return (
    <div className="db-gallery">
      {rows.map((r) => {
        const preview = previews.get(r.id);
        const editing = editingId === r.id;
        return (
          <article
            key={r.id}
            className="db-gcard"
            role="button"
            tabIndex={0}
            onClick={() => !editing && openPage(r.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) openPage(r.id);
            }}
          >
            <div className={`db-gcard-preview ${preview ? "" : "empty"}`}>
              {preview ? <p>{preview}</p> : <span className="db-gcard-bigicon">{pageIconFor(r.meta, type)}</span>}
            </div>
            <div className="db-gcard-body">
              <div className="db-card-title-row">
                <RowIcon ws={ws} meta={r.meta} type={type} />
                {editing ? (
                  <TitleInput ws={ws} meta={r.meta} autoFocus onDone={() => setEditingId(null)} />
                ) : (
                  <span className={`db-card-title ${r.meta.title.trim() ? "" : "untitled"}`}>{displayTitle(r.meta)}</span>
                )}
              </div>
              <CardProps ws={ws} row={r} props={props} max={4} />
            </div>
          </article>
        );
      })}
      <button type="button" className="db-gcard db-gcard-new" onClick={() => createRow()}>
        <Icon name="plus" size={18} />
        New
      </button>
    </div>
  );
}

export function ListLayout({ ws, type, rows, view, createRow, editingId, setEditingId }: LayoutProps) {
  const { openPage } = useApp();
  const props = visibleProps(type, view.settings.hiddenProps);
  return (
    <div className="db-list">
      {rows.map((r) => {
        const editing = editingId === r.id;
        return (
          <div
            key={r.id}
            className="db-list-row"
            role="button"
            tabIndex={0}
            onClick={() => !editing && openPage(r.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) openPage(r.id);
            }}
          >
            <RowIcon ws={ws} meta={r.meta} type={type} />
            {editing ? (
              <TitleInput ws={ws} meta={r.meta} autoFocus onDone={() => setEditingId(null)} className="db-list-title" />
            ) : (
              <span className={`db-list-title ${r.meta.title.trim() ? "" : "untitled"}`}>{displayTitle(r.meta)}</span>
            )}
            <CardProps ws={ws} row={r} props={props} max={3} className="db-list-props" />
          </div>
        );
      })}
      <button type="button" className="db-new-row" onClick={() => createRow()}>
        <Icon name="plus" size={15} />
        New
      </button>
    </div>
  );
}

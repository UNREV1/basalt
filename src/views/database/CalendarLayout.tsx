// Month calendar laid out by a date property. Click a day to add an item on
// that date; drag chips between days to reschedule.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { deletePageForever, displayTitle, getPage, newPropId, pageText } from "../../../shared/model.ts";
import { Icon, Popover, writeProp } from "../../components/properties/PropertiesPanel.tsx";
import {
  firstDayOfWeek,
  monthGrid,
  mutateType,
  optionById,
  pageIconFor,
  parseDateKey,
  toDateKey,
  uniqueName,
  weekdayLabels,
} from "../../components/properties/propUtils.ts";
import { useApp, useMediaQuery } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { useCardDrag } from "./drag.ts";
import type { Row } from "./query.ts";
import { TitleInput, type LayoutProps } from "./shared.tsx";

const MAX_CHIPS = 3;

function CalChip({
  ws,
  row,
  type,
  color,
  editing,
  onEditDone,
  bindProps,
  className = "",
}: {
  ws: Workspace;
  row: Row;
  type: LayoutProps["type"];
  color?: string;
  editing?: boolean;
  onEditDone?: () => void;
  bindProps?: Record<string, unknown>;
  className?: string;
}) {
  const { openPage } = useApp();
  return (
    <div
      className={`db-cal-chip ${color ? `tag-${color} colored` : ""} ${className}`}
      role="button"
      tabIndex={0}
      title={displayTitle(row.meta)}
      {...bindProps}
      onClick={(e) => {
        e.stopPropagation();
        if (!editing) openPage(row.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) openPage(row.id);
      }}
    >
      <span className="db-cal-chip-icon">{pageIconFor(row.meta, type)}</span>
      {editing ? (
        <TitleInput ws={ws} meta={row.meta} autoFocus onDone={onEditDone} placeholder="New item" />
      ) : (
        <span className={`db-cal-chip-title ${row.meta.title.trim() ? "" : "untitled"}`}>{displayTitle(row.meta)}</span>
      )}
    </div>
  );
}

export default function CalendarLayout({ ws, type, rows, view, createRow, editingId, setEditingId }: LayoutProps) {
  const { settings, update } = view;
  const narrow = useMediaQuery("(max-width: 640px)");
  const dates = type.props.filter((p) => p.kind === "date");
  const dateProp = dates.find((p) => p.id === settings.dateProp) ?? dates[0];
  const selects = type.props.filter((p) => p.kind === "select");
  const colorProp = selects.find((p) => p.id === settings.groupBy) ?? selects[0];
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const weekStart = useMemo(firstDayOfWeek, []);
  const [more, setMore] = useState<{ key: string; el: HTMLElement } | null>(null);
  const [undatedAnchor, setUndatedAnchor] = useState<HTMLElement | null>(null);
  const { drag, bind } = useCardDrag({
    targetAttr: "day",
    onDrop: (id, target, from) => {
      if (dateProp && target !== from) writeProp(ws, id, dateProp.id, target);
    },
  });

  if (!dateProp) {
    return (
      <div className="db-empty db-empty-box">
        <Icon name="calendar" size={28} className="faint" />
        <div className="db-empty-title">Calendar lays out items by a Date property</div>
        <div className="muted small">The {type.name} type has no Date property yet.</div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            const id = newPropId();
            mutateType(ws.doc, type.id, (t) =>
              t.props.push({ id, name: uniqueName(t.props.map((p) => p.name), "Date"), kind: "date" }),
            );
            update({ dateProp: id });
          }}
        >
          <Icon name="plus" size={14} /> Add a Date property
        </button>
      </div>
    );
  }

  const days = monthGrid(month, weekStart);
  const weeks: Date[][] = [];
  for (let i = 0; i < 6; i++) {
    const w = days.slice(i * 7, i * 7 + 7);
    if (i >= 4 && w.every((d) => d.getMonth() !== month.getMonth())) break;
    weeks.push(w);
  }
  const byDay = new Map<string, Row[]>();
  const undated: Row[] = [];
  for (const r of rows) {
    const v = r.props[dateProp.id];
    if (typeof v === "string" && parseDateKey(v)) {
      const k = v.slice(0, 10);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(r);
    } else undated.push(r);
  }
  const todayKey = toDateKey(new Date());
  const colorOf = (r: Row) => (colorProp ? optionById(colorProp, r.props[colorProp.id])?.color : undefined);
  const create = (key: string) => createRow({ props: { [dateProp.id]: key } });
  // A click-created item that was never named is discarded instead of littering the calendar.
  const finishEdit = (id: string) => {
    setEditingId(null);
    const page = getPage(ws.doc, id);
    if (page && !String(page.get("title") ?? "").trim() && !pageText(ws.doc, id).trim()) deletePageForever(ws.doc, id);
  };
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const dragged = drag ? rows.find((r) => r.id === drag.id) : undefined;
  const moreRows = more ? (byDay.get(more.key) ?? []) : [];

  return (
    <div className="db-cal">
      <div className="db-cal-head">
        <h3 className="db-cal-title">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
        <span className="spacer" />
        {undated.length > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={(e) => setUndatedAnchor(e.currentTarget)}>
            {undated.length} without date
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          <Icon name="chevronLeft" size={16} />
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            const d = new Date();
            setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
          }}
        >
          Today
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
      <div className="db-cal-grid" role="grid">
        {weekdayLabels(weekStart, narrow ? "narrow" : "short").map((w, i) => (
          <div key={i} className="db-cal-wd" role="columnheader">
            {w}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const key = toDateKey(d);
          const items = byDay.get(key) ?? [];
          const out = d.getMonth() !== month.getMonth();
          const editingHere = items.findIndex((r) => r.id === editingId);
          const limit = narrow ? 2 : MAX_CHIPS;
          const visible = items.slice(0, Math.max(limit, editingHere + 1));
          return (
            <div
              key={key}
              role="gridcell"
              data-day={key}
              className={`db-cal-day ${out ? "out" : ""} ${key === todayKey ? "today" : ""} ${
                drag && drag.over === key && drag.from !== key ? "over" : ""
              }`}
              onClick={() => create(key)}
              aria-label={d.toLocaleDateString(undefined, { dateStyle: "full" })}
            >
              <div className="db-cal-day-head">
                <span className="db-cal-daynum">
                  {d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.getDate()}
                </span>
                <button
                  type="button"
                  className="icon-btn db-cal-add"
                  aria-label="New item on this day"
                  onClick={(e) => {
                    e.stopPropagation();
                    create(key);
                  }}
                >
                  <Icon name="plus" size={14} />
                </button>
              </div>
              <div className="db-cal-items">
                {visible.map((r) => (
                  <CalChip
                    key={r.id}
                    ws={ws}
                    row={r}
                    type={type}
                    color={colorOf(r)}
                    editing={editingId === r.id}
                    onEditDone={() => finishEdit(r.id)}
                    bindProps={bind(r.id)}
                    className={drag?.id === r.id ? "placeholder" : ""}
                  />
                ))}
                {items.length > visible.length && (
                  <button
                    type="button"
                    className="db-cal-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMore({ key, el: e.currentTarget });
                    }}
                  >
                    +{items.length - visible.length} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {more && (
        <Popover anchor={more.el} onClose={() => setMore(null)} minWidth={240} className="db-cal-more-pop">
          <div className="menu-label">
            {parseDateKey(more.key)?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div className="db-cal-more-list">
            {moreRows.map((r) => (
              <CalChip key={r.id} ws={ws} row={r} type={type} color={colorOf(r)} />
            ))}
          </div>
        </Popover>
      )}
      {undatedAnchor && (
        <Popover anchor={undatedAnchor} onClose={() => setUndatedAnchor(null)} minWidth={260} placement="bottom-end">
          <div className="menu-label">Without {dateProp.name}</div>
          <div className="db-cal-more-list">
            {undated.map((r) => (
              <CalChip key={r.id} ws={ws} row={r} type={type} color={colorOf(r)} />
            ))}
          </div>
        </Popover>
      )}
      {drag &&
        dragged &&
        createPortal(
          <div className="db-drag-ghost" style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}>
            <CalChip ws={ws} row={dragged} type={type} color={colorOf(dragged)} />
          </div>,
          document.body,
        )}
    </div>
  );
}

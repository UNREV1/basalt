// Kanban board grouped by a select property. Cards drag between columns with
// pointer events (mouse, pen and touch via long-press).

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { displayTitle, newPropId, type PropDef } from "../../../shared/model.ts";
import { Icon, OptionEditMenu, OptionTag, writeProp } from "../../components/properties/PropertiesPanel.tsx";
import { addOption, mutateType, uniqueName } from "../../components/properties/propUtils.ts";
import { useApp } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { useCardDrag } from "./drag.ts";
import { visibleProps, type Row } from "./query.ts";
import { CardProps, RowIcon, TitleInput, type LayoutProps } from "./shared.tsx";

const NONE = "__none";

export function statusPropDef(existing: string[]): PropDef {
  return {
    id: newPropId(),
    name: uniqueName(existing, "Status"),
    kind: "select",
    options: [
      { id: newPropId(), name: "Not started", color: "gray" },
      { id: newPropId(), name: "In progress", color: "blue" },
      { id: newPropId(), name: "Done", color: "green" },
    ],
  };
}

export function BoardCard({
  ws,
  row,
  type,
  props,
  editing,
  onEditDone,
  className = "",
  bindProps,
}: {
  ws: Workspace;
  row: Row;
  type: LayoutProps["type"];
  props: PropDef[];
  editing?: boolean;
  onEditDone?: () => void;
  className?: string;
  bindProps?: Record<string, unknown>;
}) {
  const { openPage } = useApp();
  return (
    <div
      className={`db-card ${className}`}
      role="button"
      tabIndex={0}
      data-card={row.id}
      {...bindProps}
      onClick={() => !editing && openPage(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) openPage(row.id);
      }}
    >
      <div className="db-card-title-row">
        <RowIcon ws={ws} meta={row.meta} type={type} />
        {editing ? (
          <TitleInput ws={ws} meta={row.meta} autoFocus onDone={onEditDone} />
        ) : (
          <span className={`db-card-title ${row.meta.title.trim() ? "" : "untitled"}`}>{displayTitle(row.meta)}</span>
        )}
      </div>
      <CardProps ws={ws} row={row} props={props} max={4} />
    </div>
  );
}

export default function BoardLayout({ ws, type, rows, view, createRow, editingId, setEditingId }: LayoutProps) {
  const { settings, update } = view;
  const boardRef = useRef<HTMLDivElement>(null);
  const [optMenu, setOptMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const selects = type.props.filter((p) => p.kind === "select");
  const group = selects.find((p) => p.id === settings.groupBy) ?? selects[0];

  const { drag, bind } = useCardDrag({
    targetAttr: "col",
    scrollContainer: () => boardRef.current,
    onDrop: (id, target, from) => {
      if (!group || target === from) return;
      writeProp(ws, id, group.id, target === NONE ? null : target);
    },
  });

  if (!group) {
    return (
      <div className="db-empty db-empty-box">
        <Icon name="board" size={28} className="faint" />
        <div className="db-empty-title">Board groups cards by a Select property</div>
        <div className="muted small">The {type.name} type has no Select property yet.</div>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => {
            const def = statusPropDef(type.props.map((p) => p.name));
            mutateType(ws.doc, type.id, (t) => t.props.push(def));
            update({ groupBy: def.id });
          }}
        >
          <Icon name="plus" size={14} /> Add a Status property
        </button>
      </div>
    );
  }

  const options = group.options ?? [];
  const byCol = new Map<string, Row[]>([[NONE, []]]);
  for (const o of options) byCol.set(o.id, []);
  for (const r of rows) {
    const v = r.props[group.id];
    byCol.get(typeof v === "string" && byCol.has(v) ? v : NONE)!.push(r);
  }
  const cardProps = visibleProps(type, settings.hiddenProps).filter((p) => p.id !== group.id);
  const columns = [
    { id: NONE, option: null as null | (typeof options)[number] },
    ...options.map((o) => ({ id: o.id, option: o })),
  ].filter((c) => c.id !== NONE || byCol.get(NONE)!.length > 0 || !!drag);

  const add = (colId: string) => {
    const id = createRow({ props: colId === NONE ? {} : { [group.id]: colId } });
    setEditingId(id);
  };
  const addGroup = () => {
    const name = groupName.trim();
    if (name) addOption(ws.doc, type.id, group.id, name);
    setGroupName("");
    setAddingGroup(false);
  };
  const dragged = drag ? rows.find((r) => r.id === drag.id) : undefined;

  return (
    <div className="db-board" ref={boardRef}>
      {columns.map((col) => {
        const cards = byCol.get(col.id) ?? [];
        return (
          <section
            key={col.id}
            className={`db-col ${drag && drag.over === col.id && drag.from !== col.id ? "over" : ""}`}
            data-col={col.id}
            data-color={col.option?.color ?? "none"}
            aria-label={col.option?.name ?? `No ${group.name}`}
          >
            <header className="db-col-head">
              {col.option ? (
                <button
                  type="button"
                  className="db-col-title"
                  title="Rename, recolor or delete this group"
                  onClick={(e) => setOptMenu({ id: col.id, el: e.currentTarget })}
                >
                  <OptionTag option={col.option} />
                </button>
              ) : (
                <span className="db-col-none">No {group.name}</span>
              )}
              <span className="db-col-count">{cards.length}</span>
              <span className="spacer" />
              <button type="button" className="icon-btn db-col-add" aria-label="Add card" onClick={() => add(col.id)}>
                <Icon name="plus" size={15} />
              </button>
            </header>
            <div className="db-col-cards">
              {cards.map((r) => (
                <BoardCard
                  key={r.id}
                  ws={ws}
                  row={r}
                  type={type}
                  props={cardProps}
                  editing={editingId === r.id}
                  onEditDone={() => setEditingId(null)}
                  className={drag?.id === r.id ? "placeholder" : ""}
                  bindProps={bind(r.id)}
                />
              ))}
              <button type="button" className="db-col-new" onClick={() => add(col.id)}>
                <Icon name="plus" size={14} /> New
              </button>
            </div>
          </section>
        );
      })}
      <div className="db-col db-col-ghost-add">
        {addingGroup ? (
          <input
            className="input"
            autoFocus
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onBlur={addGroup}
            onKeyDown={(e) => {
              if (e.key === "Enter") addGroup();
              if (e.key === "Escape") {
                setGroupName("");
                setAddingGroup(false);
              }
            }}
          />
        ) : (
          <button type="button" className="db-col-new" onClick={() => setAddingGroup(true)}>
            <Icon name="plus" size={14} /> Add group
          </button>
        )}
      </div>
      {optMenu && (
        <OptionEditMenu
          ws={ws}
          typeId={type.id}
          def={group}
          optionId={optMenu.id}
          anchor={optMenu.el}
          onClose={() => setOptMenu(null)}
        />
      )}
      {drag &&
        dragged &&
        createPortal(
          <div
            className="db-drag-ghost"
            style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY, width: drag.width }}
          >
            <BoardCard ws={ws} row={dragged} type={type} props={cardProps} />
          </div>,
          document.body,
        )}
    </div>
  );
}

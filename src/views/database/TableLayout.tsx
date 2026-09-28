// Table layout: sticky header, resizable columns, inline cell editing and
// per-column menus. Exported as ObjectTable so the types manager reuses it.

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { trashPage, type PropDef, type PropKind } from "../../../shared/model.ts";
import {
  AddPropertyMenu,
  Icon,
  Popover,
  PropDefMenu,
  PropValueEditor,
} from "../../components/properties/PropertiesPanel.tsx";
import { KIND_INFO, plural } from "../../components/properties/propUtils.ts";
import { useApp, useMediaQuery } from "../../lib/hooks.ts";
import { TITLE_FIELD, visibleProps, type SortRule } from "./query.ts";
import { EmptyRows, RowIcon, TitleInput, type LayoutProps } from "./shared.tsx";

const TITLE_W = 280;
const TITLE_W_NARROW = 190;
const ADD_W = 44;
const MIN_W = 72;
const MAX_W = 900;

const DEFAULT_WIDTH: Record<PropKind, number> = {
  text: 200,
  number: 120,
  select: 160,
  multi: 220,
  date: 140,
  checkbox: 96,
  url: 200,
  page: 200,
};

export function ObjectTable({
  ws,
  type,
  rows,
  view,
  createRow,
  editingId,
  setEditingId,
  filtered = false,
  showCount = true,
}: LayoutProps & { filtered?: boolean; showCount?: boolean }) {
  const { settings, update } = view;
  const { openPage, toast } = useApp();
  const narrow = useMediaQuery("(max-width: 640px)");
  const cols = visibleProps(type, settings.hiddenProps);
  const [live, setLive] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ col: string; el: HTMLElement } | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const widthOf = (col: string, kind?: PropKind) =>
    live[col] ?? settings.widths[col] ?? (kind ? DEFAULT_WIDTH[kind] : narrow ? TITLE_W_NARROW : TITLE_W);
  const titleW = widthOf(TITLE_FIELD);
  const total = titleW + cols.reduce((s, c) => s + widthOf(c.id, c.kind), 0) + ADD_W;

  const sortOf = (col: string) => settings.sort.find((s) => s.prop === col)?.dir;
  const setSort = (col: string, dir: SortRule["dir"] | null) =>
    update({
      sort: dir ? [{ prop: col, dir }, ...settings.sort.filter((s) => s.prop !== col)] : settings.sort.filter((s) => s.prop !== col),
    });

  const startResize = (col: string, base: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    let w = base;
    const move = (ev: PointerEvent) => {
      w = Math.round(Math.max(MIN_W, Math.min(MAX_W, base + ev.clientX - startX)));
      setLive((l) => ({ ...l, [col]: w }));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      setLive((l) => {
        const next = { ...l };
        delete next[col];
        return next;
      });
      if (w !== base) update({ widths: { ...settings.widths, [col]: w } });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const resetWidth = (col: string) => {
    const next = { ...settings.widths };
    delete next[col];
    update({ widths: next });
  };

  const sortItems = (col: string) => (
    <>
      <button type="button" className="menu-item" onClick={() => (setSort(col, "asc"), setMenu(null))}>
        <Icon name="arrowUp" size={15} className="muted" /> Sort ascending
        {sortOf(col) === "asc" && <Icon name="check" size={14} style={{ marginLeft: "auto" }} />}
      </button>
      <button type="button" className="menu-item" onClick={() => (setSort(col, "desc"), setMenu(null))}>
        <Icon name="arrowDown" size={15} className="muted" /> Sort descending
        {sortOf(col) === "desc" && <Icon name="check" size={14} style={{ marginLeft: "auto" }} />}
      </button>
      {sortOf(col) && (
        <button type="button" className="menu-item" onClick={() => (setSort(col, null), setMenu(null))}>
          <Icon name="x" size={15} className="muted" /> Remove sort
        </button>
      )}
    </>
  );

  const header = (col: string, name: string, icon: Parameters<typeof Icon>[0]["name"], w: number) => {
    const dir = sortOf(col);
    return (
      <div className={`db-th ${col === TITLE_FIELD ? "db-th-title" : ""} ${menu?.col === col ? "open" : ""}`} style={{ width: w }} key={col}>
        <button
          type="button"
          className="db-th-btn"
          onClick={(e) => setMenu({ col, el: e.currentTarget.parentElement as HTMLElement })}
        >
          <Icon name={icon} size={14} />
          <span className="ellipsis">{name}</span>
          {dir && <Icon name={dir === "asc" ? "arrowUp" : "arrowDown"} size={13} className="db-th-sort" />}
        </button>
        <div
          className="db-resize"
          role="separator"
          aria-label={`Resize ${name}`}
          onPointerDown={startResize(col, w)}
          onDoubleClick={() => resetWidth(col)}
        />
      </div>
    );
  };

  const menuDef: PropDef | undefined = menu ? type.props.find((p) => p.id === menu.col) : undefined;

  return (
    <div className="db-table">
      <div className="db-thead-wrap" ref={headRef}>
        <div className="db-tr db-thead" style={{ width: total }}>
          {header(TITLE_FIELD, "Name", "title", titleW)}
          {cols.map((c) => header(c.id, c.name, KIND_INFO[c.kind].icon, widthOf(c.id, c.kind)))}
          <button
            type="button"
            className="db-th db-th-add"
            style={{ width: ADD_W }}
            aria-label="Add property"
            title={`Add a property to the ${type.name} type`}
            onClick={(e) => setAddAnchor(e.currentTarget)}
          >
            <Icon name="plus" size={16} />
          </button>
          <div className="db-th db-filler" />
        </div>
      </div>
      <div
        className="db-tbody-scroll"
        ref={bodyRef}
        onScroll={() => {
          if (headRef.current && bodyRef.current) headRef.current.scrollLeft = bodyRef.current.scrollLeft;
        }}
      >
        <div className="db-tbody" style={{ width: total }}>
          {rows.map((row) => (
            <div className="db-tr db-row" key={row.id} data-row={row.id}>
              <div className="db-td db-td-title" style={{ width: titleW }}>
                <RowIcon ws={ws} meta={row.meta} type={type} editable />
                <TitleInput
                  ws={ws}
                  meta={row.meta}
                  autoFocus={editingId === row.id}
                  onDone={() => editingId === row.id && setEditingId(null)}
                />
                <div className="db-row-actions">
                  <button type="button" className="db-open-btn" onClick={() => openPage(row.id)} title="Open page">
                    <Icon name="open" size={13} />
                    <span>Open</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn db-trash-btn"
                    aria-label="Move to trash"
                    title="Move to trash"
                    onClick={() => {
                      trashPage(ws.doc, row.id);
                      toast(`Moved “${row.meta.title.trim() || "Untitled"}” to trash`);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
              {cols.map((c) => (
                <div className="db-td" key={c.id} style={{ width: widthOf(c.id, c.kind) }}>
                  <PropValueEditor
                    ws={ws}
                    pageId={row.id}
                    typeId={type.id}
                    def={c}
                    value={row.props[c.id]}
                    variant="cell"
                  />
                </div>
              ))}
              <div className="db-td db-td-add" style={{ width: ADD_W }} />
              <div className="db-td db-filler" />
            </div>
          ))}
        </div>
      </div>
      {!rows.length && filtered && <EmptyRows typeName={type.name} />}
      <div className="db-table-foot">
        <button type="button" className="db-new-row" onClick={() => createRow()}>
          <Icon name="plus" size={15} />
          New
        </button>
        {showCount && <span className="db-count">{plural(rows.length, "object")}</span>}
      </div>

      {menu && menu.col === TITLE_FIELD && (
        <Popover anchor={menu.el} onClose={() => setMenu(null)} minWidth={220}>
          <div className="menu-label">Name</div>
          {sortItems(TITLE_FIELD)}
        </Popover>
      )}
      {menu && menuDef && (
        <PropDefMenu ws={ws} typeId={type.id} propId={menuDef.id} anchor={menu.el} onClose={() => setMenu(null)}>
          {sortItems(menuDef.id)}
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              update({ hiddenProps: [...settings.hiddenProps, menuDef.id] });
              setMenu(null);
            }}
          >
            <Icon name="eyeOff" size={15} className="muted" /> Hide in this view
          </button>
        </PropDefMenu>
      )}
      {addAnchor && (
        <AddPropertyMenu
          ws={ws}
          typeId={type.id}
          anchor={addAnchor}
          placement="bottom-end"
          onClose={() => setAddAnchor(null)}
          onCreated={(def) => {
            if (settings.hiddenProps.includes(def.id)) update({ hiddenProps: settings.hiddenProps.filter((h) => h !== def.id) });
            requestAnimationFrame(() => {
              const sc = bodyRef.current;
              if (sc) sc.scrollLeft = sc.scrollWidth;
            });
          }}
        />
      )}
    </div>
  );
}

export default function TableLayout(props: LayoutProps & { filtered: boolean }) {
  return <ObjectTable {...props} />;
}

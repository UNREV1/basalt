// Anytype-style "Types & properties" manager: browse, create, edit and delete
// object types, edit their property definitions and see every object of a type
// in the same table the database page uses.

import { useMemo, useState, type CSSProperties } from "react";
import { DEFAULT_TYPE_ID, createPage, type ObjectType, type PropDef } from "../../../shared/model.ts";
import {
  AddPropertyMenu,
  DraftInput,
  EmojiPicker,
  Icon,
  KindMenu,
  OptionsEditor,
  useReorder,
} from "../../components/properties/PropertiesPanel.tsx";
import {
  KIND_INFO,
  changePropKind,
  createType,
  deleteProp,
  deleteType,
  moveProp,
  mutateType,
  plural,
  typeCounts,
  updateProp,
} from "../../components/properties/propUtils.ts";
import { usePages, useTypes } from "../../lib/hooks.ts";
import { getSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { DEFAULT_VIEW, applyView, collectRows, type ViewSettings } from "../database/query.ts";
import type { NewRowInit, ViewStore } from "../database/shared.tsx";
import { ObjectTable } from "../database/TableLayout.tsx";
import "../database/database.css";
import "./types.css";

export default function TypesView({ ws }: { ws: Workspace }) {
  const types = useTypes(ws);
  const pages = usePages(ws);
  const counts = useMemo(() => typeCounts(pages), [pages]);
  const [selected, setSelected] = useState<string | null>(null);
  const type = selected ? types.find((t) => t.id === selected) : undefined;

  return (
    <div className="page-column ty-root">
      {type ? (
        <TypeDetail key={type.id} ws={ws} type={type} count={counts.get(type.id) ?? 0} onBack={() => setSelected(null)} />
      ) : (
        <TypeGrid ws={ws} types={types} counts={counts} onOpen={setSelected} />
      )}
    </div>
  );
}

// ---- overview ----------------------------------------------------------------------

function TypeGrid({
  ws,
  types,
  counts,
  onOpen,
}: {
  ws: Workspace;
  types: ObjectType[];
  counts: Map<string, number>;
  onOpen: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const create = () => {
    if (!name.trim()) return;
    const id = createType(ws.doc, { name, icon });
    setCreating(false);
    setName("");
    setIcon("📦");
    onOpen(id);
  };
  return (
    <>
      <div className="view-header">
        <h1>Types & properties</h1>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={15} strokeWidth={2.2} /> New type
        </button>
      </div>
      <p className="muted ty-intro">
        Every page is an object with a type. A type decides which properties its objects have — edit it here and all of
        its objects follow, in every database that shows them.
      </p>
      {creating && (
        <div className="ty-new card">
          <button type="button" className="pp-icon-btn-lg" aria-label="Choose icon" onClick={(e) => setEmojiAnchor(e.currentTarget)}>
            {icon}
          </button>
          <input
            className="input grow"
            autoFocus
            placeholder="Type name, e.g. Project, Recipe, Meeting"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") setCreating(false);
            }}
          />
          <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={create}>
            Create
          </button>
          {emojiAnchor && <EmojiPicker anchor={emojiAnchor} onClose={() => setEmojiAnchor(null)} onPick={setIcon} />}
        </div>
      )}
      <div className="ty-grid">
        {types.map((t) => (
          <button key={t.id} type="button" className="ty-card" onClick={() => onOpen(t.id)}>
            <div className="ty-card-top">
              <span className="ty-card-icon">{t.icon}</span>
              {t.builtin && <span className="badge ty-badge">Built-in</span>}
            </div>
            <span className="ty-card-name">{t.name}</span>
            <span className="ty-card-meta">
              {plural(counts.get(t.id) ?? 0, "object")} · {plural(t.props.length, "property", "properties")}
            </span>
            {t.props.length > 0 && (
              <span className="ty-card-props">
                {t.props.slice(0, 4).map((p) => (
                  <span key={p.id} className="ty-pill">
                    <Icon name={KIND_INFO[p.kind].icon} size={12} />
                    {p.name}
                  </span>
                ))}
                {t.props.length > 4 && <span className="ty-pill">+{t.props.length - 4}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

// ---- one type -------------------------------------------------------------------------

function TypeDetail({ ws, type, count, onBack }: { ws: Workspace; type: ObjectType; count: number; onBack: () => void }) {
  const pages = usePages(ws);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [local, setLocal] = useState<ViewSettings>({ ...DEFAULT_VIEW, typeId: type.id });
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const reorder = useReorder((from, to) => moveProp(ws.doc, type.id, from, to));
  const view: ViewStore = { settings: local, update: (patch) => setLocal((s) => ({ ...s, ...patch })) };

  const rows = useMemo(() => collectRows(ws.doc, pages, type.id, "type", null), [ws, pages, type.id]);
  const shown = useMemo(() => applyView(ws.doc, rows, type, local, search), [ws, rows, type, local, search]);
  const isDefault = type.id === DEFAULT_TYPE_ID;

  const createRow = (init?: NewRowInit) => {
    const id = createPage(ws.doc, {
      typeId: type.id,
      title: init?.title ?? "",
      props: { ...init?.fallbackProps, ...init?.props },
      createdBy: getSettings().identity.name,
    });
    setEditingId(id);
    setSearch("");
    return id;
  };

  return (
    <>
      <div className="ty-back">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <Icon name="arrowLeft" size={15} /> All types
        </button>
      </div>
      <div className="ty-head">
        <button type="button" className="ty-icon-btn" aria-label="Change icon" onClick={(e) => setEmojiAnchor(e.currentTarget)}>
          {type.icon}
        </button>
        <DraftInput
          className="ty-name-input"
          aria-label="Type name"
          value={type.name}
          onCommit={(v) => v.trim() && mutateType(ws.doc, type.id, (t) => (t.name = v.trim()))}
        />
        {type.builtin && <span className="badge ty-badge">Built-in</span>}
      </div>
      <p className="muted ty-sub">
        {plural(count, "object")} · Changes to this type apply to every one of its objects.
        {isDefault && " Pages without a specific type use this one."}
      </p>

      <section className="ty-section">
        <div className="ty-section-head">
          <h2>Properties</h2>
          <span className="spacer" />
          <button type="button" className="btn btn-sm" onClick={(e) => setAddAnchor(e.currentTarget)}>
            <Icon name="plus" size={14} /> Add property
          </button>
        </div>
        {type.props.length === 0 ? (
          <div className="ty-empty-props muted">
            No properties yet. Add one — it will appear on all {plural(count, "object")} of this type.
          </div>
        ) : (
          <div className="ty-props" ref={reorder.containerRef}>
            {type.props.map((p, i) => (
              <PropRow
                key={p.id}
                ws={ws}
                type={type}
                def={p}
                style={reorder.itemStyle(i)}
                handle={reorder.handleProps(i)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="ty-section">
        <div className="ty-section-head">
          <h2>Objects</h2>
          <span className="ty-count">{shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}</span>
          <span className="spacer" />
          <div className="db-search ty-search">
            <Icon name="search" size={14} />
            <input value={search} placeholder={`Search ${type.name}…`} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => createRow()}>
            <Icon name="plus" size={14} strokeWidth={2.2} /> New {type.name}
          </button>
        </div>
        <ObjectTable
          ws={ws}
          type={type}
          rows={shown}
          view={view}
          createRow={createRow}
          editingId={editingId}
          setEditingId={setEditingId}
          filtered={!!search.trim()}
          showCount={false}
        />
      </section>

      {!type.builtin && (
        <section className="ty-section ty-danger">
          <div>
            <div className="ty-danger-title">Delete this type</div>
            <div className="muted small">
              {count ? `Its ${plural(count, "object")} will keep their content and become plain Pages.` : "No objects use it."}
            </div>
          </div>
          <button
            type="button"
            className={`btn btn-sm ${confirmDelete ? "btn-primary ty-confirm-danger" : "btn-danger"}`}
            onBlur={() => setConfirmDelete(false)}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              deleteType(ws.doc, type.id);
              onBack();
            }}
          >
            <Icon name="trash" size={14} /> {confirmDelete ? "Click again to delete" : "Delete type"}
          </button>
        </section>
      )}

      {emojiAnchor && (
        <EmojiPicker
          anchor={emojiAnchor}
          onClose={() => setEmojiAnchor(null)}
          onPick={(e) => mutateType(ws.doc, type.id, (t) => (t.icon = e))}
        />
      )}
      {addAnchor && <AddPropertyMenu ws={ws} typeId={type.id} anchor={addAnchor} placement="bottom-end" onClose={() => setAddAnchor(null)} />}
    </>
  );
}

function PropRow({
  ws,
  type,
  def,
  style,
  handle,
}: {
  ws: Workspace;
  type: ObjectType;
  def: PropDef;
  style?: CSSProperties;
  handle: ReturnType<ReturnType<typeof useReorder>["handleProps"]>;
}) {
  const [kindAnchor, setKindAnchor] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const hasOptions = def.kind === "select" || def.kind === "multi";
  return (
    <div className="ty-prop pp-reorder-item" data-reorder style={style}>
      <div className="ty-prop-line">
        <span className="pp-grip" {...handle} aria-label="Drag to reorder" title="Drag to reorder">
          <Icon name="grip" size={14} />
        </span>
        <button type="button" className="ty-kind-btn" onClick={(e) => setKindAnchor(e.currentTarget)} title="Change property type">
          <Icon name={KIND_INFO[def.kind].icon} size={15} />
          <span>{KIND_INFO[def.kind].label}</span>
          <Icon name="chevronDown" size={13} className="faint" />
        </button>
        <DraftInput
          className="input ty-prop-name"
          aria-label="Property name"
          value={def.name}
          onCommit={(v) => v.trim() && updateProp(ws.doc, type.id, def.id, { name: v.trim() })}
        />
        {hasOptions ? (
          <button type="button" className={`btn btn-sm btn-ghost ty-opt-toggle ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
            {plural(def.options?.length ?? 0, "option")}
            <Icon name="chevronDown" size={13} />
          </button>
        ) : (
          <span className="ty-opt-toggle ty-opt-slot" aria-hidden="true" />
        )}
        <button
          type="button"
          className={`icon-btn ${confirm ? "pp-danger-active" : ""}`}
          aria-label={confirm ? "Confirm delete property" : "Delete property"}
          title={confirm ? `Click again: removes “${def.name}” from every ${type.name}` : "Delete property"}
          onBlur={() => setConfirm(false)}
          onClick={() => {
            if (!confirm) return setConfirm(true);
            deleteProp(ws.doc, type.id, def.id);
          }}
        >
          <Icon name={confirm ? "check" : "trash"} size={15} />
        </button>
      </div>
      {hasOptions && open && (
        <div className="ty-prop-options">
          <OptionsEditor ws={ws} typeId={type.id} def={def} />
        </div>
      )}
      {kindAnchor && (
        <KindMenu
          anchor={kindAnchor}
          value={def.kind}
          placement="bottom-start"
          onPick={(k) => changePropKind(ws.doc, type.id, def.id, k)}
          onClose={() => setKindAnchor(null)}
        />
      )}
    </div>
  );
}

// Editing property *definitions* (they live on the type, so every object of the
// type is affected): rename, change kind, edit options, delete, add.

import { useState, type ReactNode } from "react";
import type { PropDef, PropKind } from "../../../shared/model.ts";
import { useTypes } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon } from "./icons.tsx";
import { Popover, type Anchor, type Placement } from "./Popover.tsx";
import { ColorMenu } from "./pickers.tsx";
import {
  KIND_INFO,
  KIND_ORDER,
  addOption,
  addProp,
  changePropKind,
  deleteOption,
  deleteProp,
  moveOption,
  typeScopeNote,
  updateOption,
  updateProp,
} from "./propUtils.ts";
import { useReorder } from "./reorder.ts";
import { DraftInput } from "./widgets.tsx";

export function KindMenu({
  anchor,
  value,
  onPick,
  onClose,
  placement = "right-start",
}: {
  anchor: Anchor;
  value?: PropKind;
  onPick: (k: PropKind) => void;
  onClose: () => void;
  placement?: Placement;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} placement={placement} minWidth={220}>
      <div className="menu-label">Property type</div>
      {KIND_ORDER.map((k) => (
        <button
          key={k}
          type="button"
          className="menu-item"
          onClick={() => {
            onPick(k);
            onClose();
          }}
        >
          <Icon name={KIND_INFO[k].icon} size={15} className="muted" />
          {KIND_INFO[k].label}
          <span className="spacer" />
          {value === k && <Icon name="check" size={14} />}
        </button>
      ))}
    </Popover>
  );
}

/** Inline editor for a select/multi property's options: reorder, rename, recolor, delete, add. */
export function OptionsEditor({ ws, typeId, def }: { ws: Workspace; typeId: string; def: PropDef }) {
  const options = def.options ?? [];
  const [adding, setAdding] = useState("");
  const [colorFor, setColorFor] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const reorder = useReorder((from, to) => moveOption(ws.doc, typeId, def.id, from, to));
  const add = () => {
    if (!adding.trim()) return;
    addOption(ws.doc, typeId, def.id, adding);
    setAdding("");
  };
  return (
    <div className="pp-options-editor">
      <div ref={reorder.containerRef} className="pp-options-list">
        {options.map((o, i) => (
          <div key={o.id} data-reorder className="pp-opt-edit-row pp-reorder-item" style={reorder.itemStyle(i)}>
            <span className="pp-grip" {...reorder.handleProps(i)} aria-label="Drag to reorder">
              <Icon name="grip" size={14} />
            </span>
            <button
              type="button"
              className={`pp-swatch-btn tag-${o.color}`}
              aria-label="Change color"
              onClick={(e) => setColorFor({ id: o.id, el: e.currentTarget })}
            />
            <DraftInput
              className="pp-opt-name"
              value={o.name}
              onCommit={(v) => v.trim() && updateOption(ws.doc, typeId, def.id, o.id, { name: v.trim() })}
            />
            <button
              type="button"
              className={`icon-btn ${confirmId === o.id ? "pp-danger-active" : ""}`}
              aria-label={confirmId === o.id ? "Confirm delete" : "Delete option"}
              title={confirmId === o.id ? "Click again to delete from every object" : "Delete option"}
              onBlur={() => setConfirmId(null)}
              onClick={() => {
                if (confirmId !== o.id) return setConfirmId(o.id);
                deleteOption(ws.doc, typeId, def.id, o.id);
                setConfirmId(null);
              }}
            >
              <Icon name={confirmId === o.id ? "check" : "trash"} size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="pp-opt-add">
        <Icon name="plus" size={14} className="faint" />
        <input
          value={adding}
          placeholder="Add an option"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          onBlur={add}
        />
      </div>
      {colorFor && (
        <ColorMenu
          anchor={colorFor.el}
          value={options.find((o) => o.id === colorFor.id)?.color ?? "gray"}
          onPick={(c) => updateOption(ws.doc, typeId, def.id, colorFor.id, { color: c })}
          onClose={() => setColorFor(null)}
        />
      )}
    </div>
  );
}

/**
 * Menu for one property definition. `children` renders view-specific actions
 * (sort, hide…) between the definition controls and the delete action.
 */
export function PropDefMenu({
  ws,
  typeId,
  propId,
  anchor,
  onClose,
  children,
  placement,
}: {
  ws: Workspace;
  typeId: string;
  propId: string;
  anchor: Anchor;
  onClose: () => void;
  children?: ReactNode;
  placement?: Placement;
}) {
  const types = useTypes(ws);
  const type = types.find((t) => t.id === typeId);
  const def = type?.props.find((p) => p.id === propId);
  const [kindAnchor, setKindAnchor] = useState<HTMLElement | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!type || !def) return null;
  const hasOptions = def.kind === "select" || def.kind === "multi";
  return (
    <Popover anchor={anchor} onClose={onClose} className="pp-def-pop" minWidth={260} placement={placement}>
      <div className="pp-menu-pad">
        <DraftInput
          className="input pp-full"
          value={def.name}
          aria-label="Property name"
          autoFocus
          selectOnFocus
          onCommit={(v) => v.trim() && updateProp(ws.doc, typeId, propId, { name: v.trim() })}
        />
      </div>
      <p className="pp-note">
        {type.icon} {typeScopeNote(ws.doc, type)}
      </p>
      <button type="button" className="menu-item" onClick={(e) => setKindAnchor(e.currentTarget)}>
        <Icon name={KIND_INFO[def.kind].icon} size={15} className="muted" />
        Type
        <span className="spacer" />
        <span className="muted">{KIND_INFO[def.kind].label}</span>
        <Icon name="chevronRight" size={14} className="faint" />
      </button>
      {hasOptions && (
        <>
          <div className="menu-sep" />
          <div className="menu-label">Options</div>
          <OptionsEditor ws={ws} typeId={typeId} def={def} />
        </>
      )}
      {children && (
        <>
          <div className="menu-sep" />
          {children}
        </>
      )}
      <div className="menu-sep" />
      <button
        type="button"
        className="menu-item danger"
        onClick={() => {
          if (!confirm) return setConfirm(true);
          deleteProp(ws.doc, typeId, propId);
          onClose();
        }}
      >
        <Icon name="trash" size={15} />
        {confirm ? `Delete from every ${type.name}?` : "Delete property"}
      </button>
      {kindAnchor && (
        <KindMenu
          anchor={kindAnchor}
          value={def.kind}
          onPick={(k) => changePropKind(ws.doc, typeId, propId, k)}
          onClose={() => setKindAnchor(null)}
        />
      )}
    </Popover>
  );
}

/** "+ Add property": name + kind, added to the TYPE. */
export function AddPropertyMenu({
  ws,
  typeId,
  anchor,
  onClose,
  onCreated,
  placement,
}: {
  ws: Workspace;
  typeId: string;
  anchor: Anchor;
  onClose: () => void;
  onCreated?: (def: PropDef) => void;
  placement?: Placement;
}) {
  const types = useTypes(ws);
  const type = types.find((t) => t.id === typeId);
  const [name, setName] = useState("");
  if (!type) return null;
  const create = (kind: PropKind) => {
    const def = addProp(ws.doc, typeId, { name, kind });
    if (def) onCreated?.(def);
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="pp-add-pop" minWidth={260} placement={placement}>
      <div className="pp-menu-pad">
        <input
          className="input pp-full"
          autoFocus
          placeholder="Property name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create("text");
          }}
        />
      </div>
      <p className="pp-note">
        Adds to the {type.icon} {type.name} type — {typeScopeNote(ws.doc, type).replace(/^Applies to/, "shows on")}.
      </p>
      <div className="menu-label">Property type</div>
      {KIND_ORDER.map((k) => (
        <button key={k} type="button" className="menu-item" onClick={() => create(k)}>
          <Icon name={KIND_INFO[k].icon} size={15} className="muted" />
          {KIND_INFO[k].label}
          <span className="spacer" />
          <span className="faint small">{KIND_INFO[k].hint}</span>
        </button>
      ))}
    </Popover>
  );
}

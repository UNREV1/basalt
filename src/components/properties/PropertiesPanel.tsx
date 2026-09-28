// Notion-style property rows rendered by the shell under every page title.
// The page's object type (Anytype-style) decides which properties it has.

import { useState } from "react";
import { DEFAULT_TYPE_ID, updatePage } from "../../../shared/model.ts";
import { usePage, useTypes } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { PropValueEditor } from "./editors.tsx";
import { Icon } from "./icons.tsx";
import { Popover } from "./Popover.tsx";
import { AddPropertyMenu, PropDefMenu } from "./PropDefMenu.tsx";
import { TypePicker } from "./pickers.tsx";
import { KIND_INFO } from "./propUtils.ts";
import "./properties.css";

export { PropValueEditor, PropValueView, writeProp, type EditorVariant } from "./editors.tsx";
export { DateMenu, MiniCalendar, OptionEditMenu, PagePicker, SelectMenu, TypePicker, ColorMenu } from "./pickers.tsx";
export { AddPropertyMenu, KindMenu, OptionsEditor, PropDefMenu } from "./PropDefMenu.tsx";
export { CheckboxBox, DraftInput, EmojiPicker, OptionTag, PageChip } from "./widgets.tsx";
export { Popover, popoverOpen, usePopover, type Anchor, type Placement } from "./Popover.tsx";
export { Icon, type IconName } from "./icons.tsx";
export { useReorder } from "./reorder.ts";

export function PropertiesPanel({ ws, pageId }: { ws: Workspace; pageId: string }) {
  const { meta, props } = usePage(ws, pageId);
  const types = useTypes(ws);
  const [typeAnchor, setTypeAnchor] = useState<HTMLElement | null>(null);
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [defMenu, setDefMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  if (!meta) return null;

  const type = types.find((t) => t.id === meta.typeId) ?? types.find((t) => t.id === DEFAULT_TYPE_ID);
  const typeId = type?.id ?? DEFAULT_TYPE_ID;
  const setType = (id: string) => updatePage(ws.doc, pageId, { typeId: id });
  const plain = !type || (type.id === DEFAULT_TYPE_ID && type.props.length === 0);

  const popovers = (
    <>
      {typeAnchor && (
        <TypePicker
          ws={ws}
          anchor={typeAnchor}
          value={typeId}
          onPick={setType}
          onClose={() => setTypeAnchor(null)}
        />
      )}
      {addAnchor && <AddPropertyMenu ws={ws} typeId={typeId} anchor={addAnchor} onClose={() => setAddAnchor(null)} />}
      {defMenu && (
        <PropDefMenu
          ws={ws}
          typeId={typeId}
          propId={defMenu.id}
          anchor={defMenu.el}
          onClose={() => setDefMenu(null)}
        />
      )}
    </>
  );

  if (plain) {
    return (
      <div className="pp-panel pp-panel-plain">
        <button type="button" className="pp-affordance" onClick={(e) => setMenuAnchor(e.currentTarget)}>
          <Icon name="type" size={14} />
          Add a type or property
        </button>
        {menuAnchor && (
          <Popover anchor={menuAnchor} onClose={() => setMenuAnchor(null)} minWidth={250}>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setTypeAnchor(menuAnchor);
                setMenuAnchor(null);
              }}
            >
              <Icon name="type" size={15} className="muted" />
              Set object type…
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setAddAnchor(menuAnchor);
                setMenuAnchor(null);
              }}
            >
              <Icon name="plus" size={15} className="muted" />
              Add a property to every Page…
            </button>
          </Popover>
        )}
        {popovers}
      </div>
    );
  }

  return (
    <div className="pp-panel" aria-label="Properties">
      <div className="pp-row">
        <div className="pp-label pp-label-static">
          <Icon name="type" size={15} />
          <span className="ellipsis">Type</span>
        </div>
        <div
          className={`pp-value pp-value-panel ${typeAnchor ? "open" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Object type"
          onClick={(e) => setTypeAnchor(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setTypeAnchor(e.currentTarget);
            }
          }}
        >
          <span className="pp-type-chip">
            <span>{type!.icon}</span>
            {type!.name}
          </span>
        </div>
      </div>
      {type!.props.map((def) => (
        <div className="pp-row" key={def.id}>
          <button
            type="button"
            className={`pp-label ${defMenu?.id === def.id ? "open" : ""}`}
            title={`${def.name} · ${KIND_INFO[def.kind].label}`}
            onClick={(e) => setDefMenu({ id: def.id, el: e.currentTarget })}
          >
            <Icon name={KIND_INFO[def.kind].icon} size={15} />
            <span className="ellipsis">{def.name}</span>
          </button>
          <PropValueEditor ws={ws} pageId={pageId} typeId={typeId} def={def} value={props[def.id]} variant="panel" />
        </div>
      ))}
      <button type="button" className="pp-add-row" onClick={(e) => setAddAnchor(e.currentTarget)}>
        <Icon name="plus" size={15} />
        Add property
      </button>
      {popovers}
    </div>
  );
}

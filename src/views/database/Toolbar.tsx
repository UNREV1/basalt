// Database toolbar: layout tabs, source (type + scope), filters, sorts,
// grouping, date property, property visibility, search and "New".

import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { randomId } from "../../../shared/crypto.ts";
import type { ObjectType } from "../../../shared/model.ts";
import {
  AddPropertyMenu,
  DraftInput,
  Icon,
  PageChip,
  PagePicker,
  Popover,
  TypePicker,
  type IconName,
} from "../../components/properties/PropertiesPanel.tsx";
import { KIND_INFO, mutateType, plural } from "../../components/properties/propUtils.ts";
import { navigate } from "../../lib/router.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { statusPropDef } from "./BoardLayout.tsx";
import {
  LAYOUTS,
  fieldsFor,
  isFilterComplete,
  opsFor,
  type Field,
  type FilterRule,
  type Layout,
} from "./query.ts";
import type { ViewStore } from "./shared.tsx";

const LAYOUT_INFO: Record<Layout, { label: string; icon: IconName }> = {
  table: { label: "Table", icon: "table" },
  board: { label: "Board", icon: "board" },
  gallery: { label: "Gallery", icon: "gallery" },
  list: { label: "List", icon: "list" },
  calendar: { label: "Calendar", icon: "calendar" },
};

type MenuName = "source" | "filter" | "sort" | "group" | "date" | "props";

export function Toolbar({
  ws,
  type,
  view,
  shown,
  total,
  search,
  setSearch,
  onNew,
  allowScope = true,
}: {
  ws: Workspace;
  type: ObjectType;
  view: ViewStore;
  shown: number;
  total: number;
  search: string;
  setSearch: (s: string) => void;
  onNew: () => void;
  allowScope?: boolean;
}) {
  const { settings, update } = view;
  const [menu, setMenu] = useState<{ name: MenuName; el: HTMLElement } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const open = (name: MenuName) => (e: ReactMouseEvent<HTMLElement>) =>
    setMenu(menu?.name === name ? null : { name, el: e.currentTarget });
  const close = () => setMenu(null);
  const fields = fieldsFor(type);
  const activeFilters = settings.filters.filter((f) => isFilterComplete(f, fields.find((x) => x.id === f.prop))).length;
  const sorts = settings.sort.filter((s) => fields.some((f) => f.id === s.prop)).length;
  const hidden = settings.hiddenProps.filter((h) => type.props.some((p) => p.id === h)).length;
  const selects = type.props.filter((p) => p.kind === "select");
  const group = selects.find((p) => p.id === settings.groupBy) ?? selects[0];
  const dates = type.props.filter((p) => p.kind === "date");
  const dateProp = dates.find((p) => p.id === settings.dateProp) ?? dates[0];

  return (
    <div className="db-toolbar">
      <div className="tabs db-layout-tabs" role="tablist" aria-label="Layout">
        {LAYOUTS.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={settings.layout === l}
            className={`tab ${settings.layout === l ? "active" : ""}`}
            onClick={() => update({ layout: l })}
            title={LAYOUT_INFO[l].label}
          >
            <Icon name={LAYOUT_INFO[l].icon} size={15} />
            <span className="db-tab-label">{LAYOUT_INFO[l].label}</span>
          </button>
        ))}
      </div>
      <div className="db-tools">
        <span className="db-count-label" aria-live="polite">
          {shown === total ? plural(total, "object") : `${shown} of ${total}`}
        </span>
        {searchOpen || search ? (
          <div className="db-search">
            <Icon name="search" size={14} />
            <input
              autoFocus
              value={search}
              placeholder="Search…"
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => !search && setSearchOpen(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  setSearchOpen(false);
                }
              }}
            />
            {search && (
              <button type="button" className="db-search-x" aria-label="Clear search" onClick={() => setSearch("")}>
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        ) : (
          <button type="button" className="icon-btn" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
            <Icon name="search" size={16} />
          </button>
        )}
        <ToolButton icon="filter" label="Filter" count={activeFilters} active={menu?.name === "filter"} onClick={open("filter")} />
        <ToolButton icon="sort" label="Sort" count={sorts} active={menu?.name === "sort"} onClick={open("sort")} />
        {settings.layout === "board" && group && (
          <ToolButton icon="board" label={group.name} title="Group by" active={menu?.name === "group"} onClick={open("group")} />
        )}
        {settings.layout === "calendar" && dateProp && (
          <ToolButton icon="calendar" label={dateProp.name} title="Date property" active={menu?.name === "date"} onClick={open("date")} />
        )}
        <ToolButton
          icon={hidden ? "eyeOff" : "eye"}
          label="Properties"
          count={hidden}
          countLabel={hidden ? `${hidden} hidden` : undefined}
          iconOnly
          active={menu?.name === "props"}
          onClick={open("props")}
        />
        <button
          type="button"
          className={`db-source-btn ${menu?.name === "source" ? "active" : ""}`}
          onClick={open("source")}
          title="Source & settings"
        >
          <span>{type.icon}</span>
          <span className="db-source-name">{type.name}</span>
          <Icon name="settings" size={14} />
        </button>
        <button type="button" className="btn btn-primary btn-sm db-new-btn" onClick={onNew}>
          <Icon name="plus" size={14} strokeWidth={2.2} />
          New
        </button>
      </div>

      {menu?.name === "filter" && <FilterMenu ws={ws} type={type} view={view} anchor={menu.el} onClose={close} />}
      {menu?.name === "sort" && <SortMenu type={type} view={view} anchor={menu.el} onClose={close} />}
      {menu?.name === "props" && <PropsMenu ws={ws} type={type} view={view} anchor={menu.el} onClose={close} />}
      {menu?.name === "group" && (
        <ChoiceMenu
          anchor={menu.el}
          onClose={close}
          label="Group by"
          items={selects.map((p) => ({ id: p.id, name: p.name, icon: KIND_INFO[p.kind].icon }))}
          value={group?.id}
          onPick={(id) => update({ groupBy: id })}
          footer={
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                const def = statusPropDef(type.props.map((p) => p.name));
                mutateType(ws.doc, type.id, (t) => t.props.push(def));
                update({ groupBy: def.id });
                close();
              }}
            >
              <Icon name="plus" size={15} className="muted" /> New select property
            </button>
          }
        />
      )}
      {menu?.name === "date" && (
        <ChoiceMenu
          anchor={menu.el}
          onClose={close}
          label="Show on calendar by"
          items={dates.map((p) => ({ id: p.id, name: p.name, icon: KIND_INFO[p.kind].icon }))}
          value={dateProp?.id}
          onPick={(id) => update({ dateProp: id })}
        />
      )}
      {menu?.name === "source" && (
        <SourceMenu ws={ws} type={type} view={view} anchor={menu.el} onClose={close} allowScope={allowScope} />
      )}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  title,
  count = 0,
  countLabel,
  active,
  iconOnly = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  title?: string;
  count?: number;
  countLabel?: string;
  active?: boolean;
  iconOnly?: boolean;
  onClick: (e: ReactMouseEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      className={`db-tool-btn ${count ? "on" : ""} ${active ? "active" : ""} ${iconOnly ? "icon-only" : ""}`}
      onClick={onClick}
      title={title ?? label}
      aria-label={title ?? label}
    >
      <Icon name={icon} size={15} />
      {!iconOnly && <span className="db-tool-label">{label}</span>}
      {count > 0 && <span className="db-tool-count">{countLabel ?? count}</span>}
    </button>
  );
}

function ChoiceMenu({
  anchor,
  onClose,
  label,
  items,
  value,
  onPick,
  footer,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  label: string;
  items: { id: string; name: string; icon: IconName }[];
  value?: string;
  onPick: (id: string) => void;
  footer?: ReactNode;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} minWidth={220} placement="bottom-end">
      <div className="menu-label">{label}</div>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className="menu-item"
          onClick={() => {
            onPick(it.id);
            onClose();
          }}
        >
          <Icon name={it.icon} size={15} className="muted" />
          <span className="ellipsis">{it.name}</span>
          <span className="spacer" />
          {value === it.id && <Icon name="check" size={14} />}
        </button>
      ))}
      {footer && (
        <>
          <div className="menu-sep" />
          {footer}
        </>
      )}
    </Popover>
  );
}

// ---- filters ------------------------------------------------------------------------

function FilterMenu({
  ws,
  type,
  view,
  anchor,
  onClose,
}: {
  ws: Workspace;
  type: ObjectType;
  view: ViewStore;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const fields = fieldsFor(type);
  const filters = view.settings.filters;
  const set = (next: FilterRule[]) => view.update({ filters: next });
  const patch = (id: string, p: Partial<FilterRule>) => set(filters.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const add = () => {
    const field = fields.find((f) => f.def && f.kind !== "checkbox") ?? fields[0];
    set([...filters, { id: randomId(6), prop: field.id, op: opsFor(field.kind)[0].op }]);
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="db-filter-pop" minWidth={320} placement="bottom-end">
      <div className="menu-label">Filters{filters.length > 1 ? " · all must match" : ""}</div>
      {!filters.length && <p className="pp-note">Show only objects whose properties match conditions.</p>}
      {filters.map((f) => {
        const field = fields.find((x) => x.id === f.prop);
        return (
          <div key={f.id} className="db-rule-row">
            <select
              className="select"
              value={f.prop}
              aria-label="Property"
              onChange={(e) => {
                const nf = fields.find((x) => x.id === e.target.value)!;
                patch(f.id, { prop: nf.id, op: opsFor(nf.kind)[0].op, value: undefined });
              }}
            >
              {!field && <option value={f.prop}>Deleted property</option>}
              {fields.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            {field && (
              <select
                className="select"
                value={f.op}
                aria-label="Condition"
                onChange={(e) => {
                  const nextOp = opsFor(field.kind).find((o) => o.op === e.target.value);
                  const curOp = opsFor(field.kind).find((o) => o.op === f.op);
                  patch(f.id, { op: e.target.value, value: nextOp?.input === curOp?.input ? f.value : undefined });
                }}
              >
                {opsFor(field.kind).map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {field && <FilterValue ws={ws} field={field} rule={f} onChange={(v) => patch(f.id, { value: v })} />}
            <button type="button" className="icon-btn" aria-label="Remove filter" onClick={() => set(filters.filter((x) => x.id !== f.id))}>
              <Icon name="x" size={14} />
            </button>
          </div>
        );
      })}
      <div className="menu-sep" />
      <button type="button" className="menu-item" onClick={add}>
        <Icon name="plus" size={15} className="muted" /> Add filter
      </button>
      {filters.length > 0 && (
        <button type="button" className="menu-item danger" onClick={() => set([])}>
          <Icon name="trash" size={15} /> Clear all filters
        </button>
      )}
    </Popover>
  );
}

function FilterValue({
  ws,
  field,
  rule,
  onChange,
}: {
  ws: Workspace;
  field: Field;
  rule: FilterRule;
  onChange: (v: unknown) => void;
}) {
  const [pageAnchor, setPageAnchor] = useState<HTMLElement | null>(null);
  const op = opsFor(field.kind).find((o) => o.op === rule.op);
  if (!op || op.input === "none") return <span className="db-rule-spacer" />;
  switch (op.input) {
    case "text":
      return (
        <DraftInput
          className="input db-rule-value"
          value={typeof rule.value === "string" ? rule.value : ""}
          placeholder="Value"
          live
          onCommit={(v) => onChange(v)}
        />
      );
    case "number":
      return (
        <DraftInput
          className="input db-rule-value"
          inputMode="decimal"
          value={typeof rule.value === "number" ? String(rule.value) : ""}
          placeholder="0"
          live
          onCommit={(v) => {
            const n = Number(v.replace(/[, _]/g, ""));
            onChange(v.trim() && Number.isFinite(n) ? n : undefined);
          }}
        />
      );
    case "option":
      return (
        <select
          className="select db-rule-value"
          value={typeof rule.value === "string" ? rule.value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">Choose…</option>
          {(field.def?.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      );
    case "date":
      return (
        <input
          type="date"
          className="input db-rule-value"
          value={typeof rule.value === "string" ? rule.value : ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case "page":
      return (
        <>
          <button type="button" className="btn btn-sm db-rule-value db-rule-page" onClick={(e) => setPageAnchor(e.currentTarget)}>
            {typeof rule.value === "string" ? <PageChip ws={ws} id={rule.value} /> : <span className="muted">Choose page…</span>}
          </button>
          {pageAnchor && (
            <PagePicker
              ws={ws}
              anchor={pageAnchor}
              value={typeof rule.value === "string" ? rule.value : null}
              allowCreate={false}
              onPick={(id) => onChange(id ?? undefined)}
              onClose={() => setPageAnchor(null)}
            />
          )}
        </>
      );
  }
}

// ---- sorts --------------------------------------------------------------------------------

function SortMenu({
  type,
  view,
  anchor,
  onClose,
}: {
  type: ObjectType;
  view: ViewStore;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const fields = fieldsFor(type);
  const sorts = view.settings.sort;
  const set = (next: typeof sorts) => view.update({ sort: next });
  const unused = fields.filter((f) => !sorts.some((s) => s.prop === f.id));
  return (
    <Popover anchor={anchor} onClose={onClose} className="db-sort-pop" minWidth={300} placement="bottom-end">
      <div className="menu-label">Sort{sorts.length > 1 ? " · first rule wins" : ""}</div>
      {!sorts.length && <p className="pp-note">Objects are shown in creation order.</p>}
      {sorts.map((s, i) => (
        <div key={s.prop + i} className="db-rule-row">
          <select
            className="select"
            value={s.prop}
            aria-label="Sort by"
            onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, prop: e.target.value } : x)))}
          >
            {!fields.some((f) => f.id === s.prop) && <option value={s.prop}>Deleted property</option>}
            {fields
              .filter((f) => f.id === s.prop || !sorts.some((x) => x.prop === f.id))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
          <select
            className="select"
            value={s.dir}
            aria-label="Direction"
            onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, dir: e.target.value as "asc" | "desc" } : x)))}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button type="button" className="icon-btn" aria-label="Remove sort" onClick={() => set(sorts.filter((_, j) => j !== i))}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      <div className="menu-sep" />
      {unused.length > 0 && (
        <button type="button" className="menu-item" onClick={() => set([...sorts, { prop: unused[0].id, dir: "asc" }])}>
          <Icon name="plus" size={15} className="muted" /> Add sort
        </button>
      )}
      {sorts.length > 0 && (
        <button type="button" className="menu-item danger" onClick={() => set([])}>
          <Icon name="trash" size={15} /> Clear sorts
        </button>
      )}
    </Popover>
  );
}

// ---- property visibility ------------------------------------------------------------------

function PropsMenu({
  ws,
  type,
  view,
  anchor,
  onClose,
}: {
  ws: Workspace;
  type: ObjectType;
  view: ViewStore;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const hidden = view.settings.hiddenProps;
  const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);
  const toggle = (id: string) =>
    view.update({ hiddenProps: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] });
  return (
    <Popover anchor={anchor} onClose={onClose} minWidth={260} placement="bottom-end">
      <div className="menu-label">Shown in this view</div>
      {!type.props.length && <p className="pp-note">The {type.name} type has no properties yet.</p>}
      {type.props.map((p) => {
        const isHidden = hidden.includes(p.id);
        return (
          <button key={p.id} type="button" className={`menu-item ${isHidden ? "db-hidden-prop" : ""}`} onClick={() => toggle(p.id)}>
            <Icon name={KIND_INFO[p.kind].icon} size={15} className="muted" />
            <span className="ellipsis">{p.name}</span>
            <span className="spacer" />
            <Icon name={isHidden ? "eyeOff" : "eye"} size={15} className={isHidden ? "faint" : "pp-accent"} />
          </button>
        );
      })}
      {type.props.length > 0 && (
        <div className="db-menu-row">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => view.update({ hiddenProps: [] })}>
            Show all
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => view.update({ hiddenProps: type.props.map((p) => p.id) })}>
            Hide all
          </button>
        </div>
      )}
      <div className="menu-sep" />
      <button type="button" className="menu-item" onClick={(e) => setAddAnchor(e.currentTarget)}>
        <Icon name="plus" size={15} className="muted" /> New property
      </button>
      {addAnchor && <AddPropertyMenu ws={ws} typeId={type.id} anchor={addAnchor} placement="right-start" onClose={() => setAddAnchor(null)} />}
    </Popover>
  );
}

// ---- source ----------------------------------------------------------------------------

function SourceMenu({
  ws,
  type,
  view,
  anchor,
  onClose,
  allowScope,
}: {
  ws: Workspace;
  type: ObjectType;
  view: ViewStore;
  anchor: HTMLElement;
  onClose: () => void;
  allowScope: boolean;
}) {
  const [typeAnchor, setTypeAnchor] = useState<HTMLElement | null>(null);
  const scope = view.settings.scope;
  return (
    <Popover anchor={anchor} onClose={onClose} minWidth={300} placement="bottom-end" className="db-source-pop">
      <div className="menu-label">Source type</div>
      <button type="button" className="menu-item" onClick={(e) => setTypeAnchor(e.currentTarget)}>
        <span className="pp-row-icon">{type.icon}</span>
        <span className="ellipsis">{type.name}</span>
        <span className="spacer" />
        <span className="faint small">Change</span>
        <Icon name="chevronRight" size={14} className="faint" />
      </button>
      {allowScope && (
        <>
          <div className="menu-label">Show</div>
          <ScopeOption
            on={scope === "type"}
            title={`Every ${type.name} in the workspace`}
            hint="Like an Anytype set: objects appear here wherever they live."
            onClick={() => view.update({ scope: "type" })}
          />
          <ScopeOption
            on={scope === "children"}
            title="Only pages inside this database"
            hint="Like a Notion database: rows are this page's sub-pages."
            onClick={() => view.update({ scope: "children" })}
          />
        </>
      )}
      <div className="menu-sep" />
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onClose();
          navigate({ name: "view", wsId: ws.id, view: "types" });
        }}
      >
        <Icon name="type" size={15} className="muted" /> Manage types & properties
      </button>
      {typeAnchor && (
        <TypePicker
          ws={ws}
          anchor={typeAnchor}
          value={type.id}
          placement="right-start"
          onPick={(id) => view.update({ typeId: id, groupBy: null, dateProp: null, filters: [], sort: [], hiddenProps: [] })}
          onClose={() => setTypeAnchor(null)}
        />
      )}
    </Popover>
  );
}

function ScopeOption({ on, title, hint, onClick }: { on: boolean; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" className="menu-item db-scope-item" onClick={onClick} role="radio" aria-checked={on}>
      <span className={`db-radio ${on ? "on" : ""}`} />
      <span className="db-scope-text">
        <span>{title}</span>
        <span className="faint small">{hint}</span>
      </span>
    </button>
  );
}

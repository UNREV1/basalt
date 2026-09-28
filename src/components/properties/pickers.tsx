// Popover pickers: select/multi-select options, dates, pages and object types.

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  DEFAULT_TYPE_ID,
  SELECT_COLORS,
  createPage,
  displayTitle,
  type PropDef,
} from "../../../shared/model.ts";
import { usePages, useTypes } from "../../lib/hooks.ts";
import { getSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon } from "./icons.tsx";
import { Popover, type Anchor, type Placement } from "./Popover.tsx";
import {
  COLOR_LABELS,
  addDays,
  addOption,
  createType,
  deleteOption,
  firstDayOfWeek,
  matchScore,
  monthGrid,
  multiIds,
  optionById,
  pageIconFor,
  parseDateKey,
  pickColor,
  plural,
  toDateKey,
  typeCounts,
  updateOption,
  weekdayLabels,
} from "./propUtils.ts";
import { EmojiPicker, OptionTag } from "./widgets.tsx";

/** Arrow-key navigation over a flat list of actions. */
function useListNav(count: number) {
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const clamp = (i: number) => (count ? (i + count) % count : 0);
  const onKeyDown = (e: KeyboardEvent, activate: (i: number) => void) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = clamp(hi + (e.key === "ArrowDown" ? 1 : -1));
      setHi(next);
      listRef.current?.querySelector(`[data-nav="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing && count) {
      e.preventDefault();
      activate(Math.min(hi, count - 1));
    }
  };
  return { hi: Math.min(hi, Math.max(0, count - 1)), setHi, onKeyDown, listRef };
}

// ---- select / multi-select ------------------------------------------------------

export function SelectMenu({
  ws,
  typeId,
  def,
  value,
  anchor,
  onChange,
  onClose,
  placement,
}: {
  ws: Workspace;
  typeId: string;
  def: PropDef;
  value: unknown;
  anchor: Anchor;
  onChange: (v: string | string[] | null) => void;
  onClose: () => void;
  placement?: Placement;
}) {
  const multi = def.kind === "multi";
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{ id: string; el: HTMLElement } | null>(null);
  const options = def.options ?? [];
  const selected = multi ? multiIds(value) : typeof value === "string" && value ? [value] : [];
  const query = q.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.name.toLowerCase().includes(query)) : options;
  const exact = options.some((o) => o.name.trim().toLowerCase() === query);
  const canCreate = !!query && !exact;
  const count = filtered.length + (canCreate ? 1 : 0);
  const nav = useListNav(count);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (id: string) => {
    if (multi) {
      onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
      setQ("");
      inputRef.current?.focus();
    } else {
      onChange(id);
      onClose();
    }
  };
  const create = () => {
    const opt = addOption(ws.doc, typeId, def.id, q);
    if (!opt) return;
    setQ("");
    if (multi) {
      onChange([...selected.filter((x) => x !== opt.id), opt.id]);
      inputRef.current?.focus();
    } else {
      onChange(opt.id);
      onClose();
    }
  };
  const activate = (i: number) => (i < filtered.length ? pick(filtered[i].id) : create());

  return (
    <Popover anchor={anchor} onClose={onClose} className="pp-select-pop" minWidth={260} placement={placement}>
      <div className="pp-select-input" onClick={() => inputRef.current?.focus()}>
        {selected.map((id) => {
          const o = optionById(def, id);
          return o ? (
            <OptionTag
              key={id}
              option={o}
              onRemove={() => onChange(multi ? selected.filter((x) => x !== id) : null)}
            />
          ) : null;
        })}
        <input
          ref={inputRef}
          autoFocus
          value={q}
          placeholder={selected.length ? "" : "Search or create…"}
          onChange={(e) => {
            setQ(e.target.value);
            nav.setHi(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !q && selected.length) {
              e.preventDefault();
              onChange(multi ? selected.slice(0, -1) : null);
              return;
            }
            nav.onKeyDown(e, activate);
          }}
        />
      </div>
      <div className="menu-label">{options.length ? "Select an option or create one" : "Type to create an option"}</div>
      <div className="pp-option-list" ref={nav.listRef}>
        {filtered.map((o, i) => (
          <div
            key={o.id}
            data-nav={i}
            role="option"
            aria-selected={selected.includes(o.id)}
            className={`menu-item pp-option-row ${nav.hi === i ? "selected" : ""}`}
            onMouseEnter={() => nav.setHi(i)}
            onClick={() => pick(o.id)}
          >
            <OptionTag option={o} />
            <span className="spacer" />
            {selected.includes(o.id) && <Icon name="check" size={14} className="pp-accent" />}
            <button
              type="button"
              className="icon-btn pp-option-more"
              aria-label={`Edit ${o.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setEditing({ id: o.id, el: e.currentTarget });
              }}
            >
              <Icon name="more" size={14} />
            </button>
          </div>
        ))}
        {canCreate && (
          <div
            data-nav={filtered.length}
            className={`menu-item ${nav.hi === filtered.length ? "selected" : ""}`}
            onMouseEnter={() => nav.setHi(filtered.length)}
            onClick={create}
          >
            <span className="muted">Create</span>
            <OptionTag option={{ name: q.trim(), color: pickColor(options) }} />
          </div>
        )}
      </div>
      {editing && (
        <OptionEditMenu
          ws={ws}
          typeId={typeId}
          def={def}
          optionId={editing.id}
          anchor={editing.el}
          onClose={() => setEditing(null)}
        />
      )}
    </Popover>
  );
}

/** Rename / recolor / delete one select option (changes the type, so every object). */
export function OptionEditMenu({
  ws,
  typeId,
  def,
  optionId,
  anchor,
  onClose,
}: {
  ws: Workspace;
  typeId: string;
  def: PropDef;
  optionId: string;
  anchor: Anchor;
  onClose: () => void;
}) {
  const option = optionById(def, optionId);
  const [name, setName] = useState(option?.name ?? "");
  const [confirm, setConfirm] = useState(false);
  if (!option) return null;
  const commit = () => {
    const n = name.trim();
    if (n && n !== option.name) updateOption(ws.doc, typeId, def.id, optionId, { name: n });
  };
  return (
    <Popover anchor={anchor} onClose={() => (commit(), onClose())} placement="right-start" minWidth={220}>
      <div className="pp-menu-pad">
        <input
          className="input pp-full"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              onClose();
            }
          }}
        />
      </div>
      <button
        type="button"
        className="menu-item danger"
        onClick={() => {
          if (!confirm) return setConfirm(true);
          deleteOption(ws.doc, typeId, def.id, optionId);
          onClose();
        }}
      >
        <Icon name="trash" size={15} />
        {confirm ? "Click again to delete everywhere" : "Delete option"}
      </button>
      <div className="menu-sep" />
      <div className="menu-label">Color</div>
      {SELECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="menu-item"
          onClick={() => updateOption(ws.doc, typeId, def.id, optionId, { color: c })}
        >
          <span className={`pp-swatch tag-${c}`} />
          {COLOR_LABELS[c] ?? c}
          <span className="spacer" />
          {option.color === c && <Icon name="check" size={14} />}
        </button>
      ))}
    </Popover>
  );
}

export function ColorMenu({
  anchor,
  value,
  onPick,
  onClose,
}: {
  anchor: Anchor;
  value: string;
  onPick: (c: string) => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose} minWidth={180}>
      <div className="menu-label">Color</div>
      {SELECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="menu-item"
          onClick={() => {
            onPick(c);
            onClose();
          }}
        >
          <span className={`pp-swatch tag-${c}`} />
          {COLOR_LABELS[c] ?? c}
          <span className="spacer" />
          {value === c && <Icon name="check" size={14} />}
        </button>
      ))}
    </Popover>
  );
}

// ---- date ------------------------------------------------------------------------

export function MiniCalendar({ value, onPick }: { value: string | null; onPick: (key: string) => void }) {
  const selected = parseDateKey(value);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const weekStart = useMemo(firstDayOfWeek, []);
  const days = monthGrid(month, weekStart);
  const todayKey = toDateKey(new Date());
  return (
    <div className="pp-mini-cal">
      <div className="pp-mini-cal-head">
        <span className="pp-mini-cal-title">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <Icon name="chevronLeft" size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
      <div className="pp-mini-cal-grid">
        {weekdayLabels(weekStart, "narrow").map((w, i) => (
          <span key={i} className="pp-mini-cal-wd">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const key = toDateKey(d);
          const out = d.getMonth() !== month.getMonth();
          return (
            <button
              key={key}
              type="button"
              className={`pp-mini-cal-day ${out ? "out" : ""} ${key === todayKey ? "today" : ""} ${key === value ? "sel" : ""}`}
              onClick={() => onPick(key)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateMenu({
  value,
  anchor,
  onChange,
  onClose,
}: {
  value: unknown;
  anchor: Anchor;
  onChange: (v: string | null) => void;
  onClose: () => void;
}) {
  const key = typeof value === "string" && parseDateKey(value) ? value : null;
  const today = new Date();
  const quick: [string, Date][] = [
    ["Today", today],
    ["Tomorrow", addDays(today, 1)],
    ["Next week", addDays(today, 7)],
  ];
  return (
    <Popover anchor={anchor} onClose={onClose} className="pp-date-pop" minWidth={260}>
      <div className="pp-menu-pad">
        <input
          type="date"
          className="input pp-full"
          value={key ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </div>
      <div className="pp-date-quick">
        {quick.map(([label, d]) => (
          <button
            key={label}
            type="button"
            className={`btn btn-sm ${key === toDateKey(d) ? "btn-primary" : ""}`}
            onClick={() => {
              onChange(toDateKey(d));
              onClose();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <MiniCalendar
        key={key ?? "none"}
        value={key}
        onPick={(k) => {
          onChange(k);
          onClose();
        }}
      />
      {key && (
        <>
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            <Icon name="x" size={15} /> Clear date
          </button>
        </>
      )}
    </Popover>
  );
}

// ---- pages -----------------------------------------------------------------------

export function PagePicker({
  ws,
  anchor,
  value,
  onPick,
  onClose,
  excludeIds = [],
  allowCreate = true,
  placement,
}: {
  ws: Workspace;
  anchor: Anchor;
  value?: string | null;
  onPick: (id: string | null) => void;
  onClose: () => void;
  excludeIds?: string[];
  allowCreate?: boolean;
  placement?: Placement;
}) {
  const pages = usePages(ws);
  const types = useTypes(ws);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const results = useMemo(() => {
    const skip = new Set(excludeIds);
    return pages
      .filter((p) => !skip.has(p.id))
      .map((p) => ({ p, s: matchScore(displayTitle(p), q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.p.updatedAt - a.p.updatedAt)
      .slice(0, 50)
      .map((x) => x.p);
  }, [pages, q, excludeIds]);
  const canCreate = allowCreate && !!q.trim() && !results.some((p) => p.title.trim().toLowerCase() === q.trim().toLowerCase());
  const nav = useListNav(results.length + (canCreate ? 1 : 0));
  const create = () => {
    const id = createPage(ws.doc, { title: q.trim(), createdBy: getSettings().identity.name });
    onPick(id);
    onClose();
  };
  const activate = (i: number) => {
    if (i < results.length) {
      onPick(results[i].id);
      onClose();
    } else create();
  };
  const current = value ? byId.get(value) : undefined;
  return (
    <Popover anchor={anchor} onClose={onClose} className="pp-page-pop" minWidth={300} placement={placement}>
      <div className="pp-menu-pad">
        <div className="pp-search">
          <Icon name="search" size={14} />
          <input
            autoFocus
            value={q}
            placeholder="Search pages…"
            onChange={(e) => {
              setQ(e.target.value);
              nav.setHi(0);
            }}
            onKeyDown={(e) => nav.onKeyDown(e, activate)}
          />
        </div>
      </div>
      {current && (
        <>
          <div className="menu-label">Linked</div>
          <div className="menu-item pp-linked-row">
            <span className="pp-row-icon">{pageIconFor(current, types.find((t) => t.id === current.typeId))}</span>
            <span className="grow ellipsis">{displayTitle(current)}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => (onPick(null), onClose())}>
              Remove
            </button>
          </div>
          <div className="menu-sep" />
        </>
      )}
      <div className="menu-label">{q ? "Results" : "Recent pages"}</div>
      <div className="pp-option-list" ref={nav.listRef}>
        {results.map((p, i) => {
          const parent = p.parentId ? byId.get(p.parentId) : undefined;
          return (
            <div
              key={p.id}
              data-nav={i}
              className={`menu-item ${nav.hi === i ? "selected" : ""}`}
              onMouseEnter={() => nav.setHi(i)}
              onClick={() => activate(i)}
            >
              <span className="pp-row-icon">{pageIconFor(p, types.find((t) => t.id === p.typeId))}</span>
              <span className="grow ellipsis">{displayTitle(p)}</span>
              {parent && <span className="faint small ellipsis pp-parent">{displayTitle(parent)}</span>}
              {p.id === value && <Icon name="check" size={14} className="pp-accent" />}
            </div>
          );
        })}
        {!results.length && !canCreate && <div className="pp-empty-note">No pages found</div>}
        {canCreate && (
          <div
            data-nav={results.length}
            className={`menu-item ${nav.hi === results.length ? "selected" : ""}`}
            onMouseEnter={() => nav.setHi(results.length)}
            onClick={create}
          >
            <Icon name="plus" size={15} />
            <span className="ellipsis">
              New page “<strong>{q.trim()}</strong>”
            </span>
          </div>
        )}
      </div>
    </Popover>
  );
}

// ---- types -----------------------------------------------------------------------

export function TypePicker({
  ws,
  anchor,
  value,
  onPick,
  onClose,
  allowCreate = true,
  placement,
}: {
  ws: Workspace;
  anchor: Anchor;
  value?: string | null;
  onPick: (typeId: string) => void;
  onClose: () => void;
  allowCreate?: boolean;
  placement?: Placement;
}) {
  const types = useTypes(ws);
  const pages = usePages(ws);
  const counts = useMemo(() => typeCounts(pages), [pages]);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📦");
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const filtered = types
    .map((t) => ({ t, s: matchScore(t.name, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => (q ? b.s - a.s : 0))
    .map((x) => x.t);
  const nav = useListNav(filtered.length + (allowCreate ? 1 : 0));
  const startCreate = () => {
    setName(q.trim());
    setCreating(true);
  };
  const activate = (i: number) => {
    if (i < filtered.length) {
      onPick(filtered[i].id);
      onClose();
    } else startCreate();
  };
  const create = () => {
    if (!name.trim()) return;
    const id = createType(ws.doc, { name, icon });
    onPick(id);
    onClose();
  };

  if (creating) {
    return (
      <Popover anchor={anchor} onClose={onClose} className="pp-type-pop" minWidth={300} placement={placement}>
        <div className="menu-label">New type</div>
        <div className="pp-menu-pad row">
          <button
            type="button"
            className="pp-icon-btn-lg"
            aria-label="Choose icon"
            onClick={(e) => setEmojiAnchor(e.currentTarget)}
          >
            {icon}
          </button>
          <input
            className="input grow"
            autoFocus
            placeholder="Type name, e.g. Project"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
        </div>
        <p className="pp-note">Types give objects a shared set of properties. You can add properties after creating it.</p>
        <div className="pp-menu-pad row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreating(false)}>
            Back
          </button>
          <button type="button" className="btn btn-sm btn-primary" disabled={!name.trim()} onClick={create}>
            Create type
          </button>
        </div>
        {emojiAnchor && <EmojiPicker anchor={emojiAnchor} onClose={() => setEmojiAnchor(null)} onPick={setIcon} />}
      </Popover>
    );
  }

  return (
    <Popover anchor={anchor} onClose={onClose} className="pp-type-pop" minWidth={280} placement={placement}>
      <div className="pp-menu-pad">
        <div className="pp-search">
          <Icon name="search" size={14} />
          <input
            autoFocus
            value={q}
            placeholder="Search types…"
            onChange={(e) => {
              setQ(e.target.value);
              nav.setHi(0);
            }}
            onKeyDown={(e) => nav.onKeyDown(e, activate)}
          />
        </div>
      </div>
      <div className="pp-option-list" ref={nav.listRef}>
        {filtered.map((t, i) => (
          <div
            key={t.id}
            data-nav={i}
            className={`menu-item ${nav.hi === i ? "selected" : ""}`}
            onMouseEnter={() => nav.setHi(i)}
            onClick={() => activate(i)}
          >
            <span className="pp-row-icon">{t.icon}</span>
            <span className="grow ellipsis">{t.name}</span>
            <span className="faint small">
              {t.id === DEFAULT_TYPE_ID ? "default" : plural(counts.get(t.id) ?? 0, "object")}
            </span>
            {t.id === (value ?? DEFAULT_TYPE_ID) && <Icon name="check" size={14} className="pp-accent" />}
          </div>
        ))}
        {!filtered.length && <div className="pp-empty-note">No matching types</div>}
      </div>
      {allowCreate && (
        <>
          <div className="menu-sep" />
          <div
            data-nav={filtered.length}
            className={`menu-item ${nav.hi === filtered.length ? "selected" : ""}`}
            onMouseEnter={() => nav.setHi(filtered.length)}
            onClick={startCreate}
          >
            <Icon name="plus" size={15} />
            {q.trim() ? (
              <span className="ellipsis">
                New type “<strong>{q.trim()}</strong>”…
              </span>
            ) : (
              "New type…"
            )}
          </div>
        </>
      )}
    </Popover>
  );
}

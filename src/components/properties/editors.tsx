// Per-kind property value display + inline editing, used by the properties panel,
// database cells, cards and the types manager.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { setProp, type PropDef } from "../../../shared/model.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon } from "./icons.tsx";
import { DateMenu, PagePicker, SelectMenu } from "./pickers.tsx";
import { PROPS_ORIGIN, formatDate, formatNumber, hrefFor, isEmptyValue, multiIds, optionById, prettyUrl } from "./propUtils.ts";
import { CheckboxBox, OptionTag, PageChip } from "./widgets.tsx";

export type EditorVariant = "panel" | "cell" | "card";

/** Read-only rendering of a property value. Returns null for empty values. */
export function PropValueView({
  ws,
  def,
  value,
  showUnchecked = false,
}: {
  ws: Workspace;
  def: PropDef;
  value: unknown;
  /** Render an empty checkbox for `false` (tables) instead of nothing (cards). */
  showUnchecked?: boolean;
}): ReactNode {
  if (def.kind === "checkbox") {
    if (!value && !showUnchecked) return null;
    return <CheckboxBox checked={!!value} />;
  }
  if (isEmptyValue(value) && !(def.kind === "number" && value === 0)) return null;
  switch (def.kind) {
    case "text":
      return <span className="pp-v-text">{String(value)}</span>;
    case "number":
      return <span className="pp-v-number">{formatNumber(value)}</span>;
    case "select": {
      const o = optionById(def, value);
      return o ? <OptionTag option={o} /> : null;
    }
    case "multi": {
      const opts = multiIds(value)
        .map((id) => optionById(def, id))
        .filter((o): o is NonNullable<typeof o> => !!o);
      if (!opts.length) return null;
      return (
        <span className="pp-v-tags">
          {opts.map((o) => (
            <OptionTag key={o.id} option={o} />
          ))}
        </span>
      );
    }
    case "date":
      return (
        <span className="pp-v-date" title={String(value)}>
          {formatDate(value)}
        </span>
      );
    case "url": {
      const s = String(value);
      return (
        <a
          className="pp-v-url"
          href={hrefFor(s)}
          target="_blank"
          rel="noreferrer noopener"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          title={s}
        >
          {prettyUrl(s)}
        </a>
      );
    }
    case "page":
      return typeof value === "string" ? <PageChip ws={ws} id={value} /> : null;
  }
}

/**
 * Click-to-edit value. Text-like kinds edit inline; select/multi/date/relation
 * open a popover anchored to the value; checkbox toggles.
 */
export function PropValueEditor({
  ws,
  pageId,
  typeId,
  def,
  value,
  variant = "panel",
  placeholder = "Empty",
  readOnly = false,
}: {
  ws: Workspace;
  pageId: string;
  typeId: string;
  def: PropDef;
  value: unknown;
  variant?: EditorVariant;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [popover, setPopover] = useState(false);
  const write = (v: unknown) => writeProp(ws, pageId, def.id, v);

  const activate = () => {
    if (readOnly) return;
    switch (def.kind) {
      case "checkbox":
        write(!value);
        return;
      case "text":
      case "number":
      case "url":
        setEditing(true);
        return;
      default:
        setPopover(true);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    } else if ((e.key === "Backspace" || e.key === "Delete") && !readOnly && def.kind !== "checkbox") {
      e.preventDefault();
      write(null);
    }
  };

  let body: ReactNode;
  if (editing) {
    body = (
      <InlineValueInput
        def={def}
        value={value}
        onCommit={(v) => write(v)}
        onDone={() => {
          setEditing(false);
          requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
        }}
      />
    );
  } else if (def.kind === "checkbox") {
    body = <CheckboxBox checked={!!value} onToggle={readOnly ? undefined : () => write(!value)} label={def.name} />;
  } else if (def.kind === "page" && typeof value === "string" && value) {
    body = <PageChip ws={ws} id={value} onRemove={readOnly || variant === "cell" ? undefined : () => write(null)} />;
  } else {
    const view = <PropValueView ws={ws} def={def} value={value} />;
    body = view ?? (variant === "card" ? null : <span className="pp-placeholder">{readOnly ? "" : placeholder}</span>);
  }

  const showUrlEdit = def.kind === "url" && !editing && !readOnly && !isEmptyValue(value);

  return (
    <div
      ref={ref}
      className={`pp-value pp-value-${variant} pp-kind-${def.kind} ${editing ? "editing" : ""} ${popover ? "open" : ""} ${readOnly ? "ro" : ""}`}
      role={readOnly ? undefined : "button"}
      tabIndex={readOnly ? undefined : editing ? -1 : 0}
      aria-label={`${def.name}`}
      onClick={(e) => {
        if (editing) return;
        e.stopPropagation();
        activate();
      }}
      onKeyDown={onKeyDown}
    >
      {body}
      {showUrlEdit && (
        <button
          type="button"
          className="icon-btn pp-url-edit"
          aria-label="Edit link"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Icon name="pencil" size={13} />
        </button>
      )}
      {popover && ref.current && (def.kind === "select" || def.kind === "multi") && (
        <SelectMenu
          ws={ws}
          typeId={typeId}
          def={def}
          value={value}
          anchor={ref.current}
          onChange={(v) => write(v)}
          onClose={() => setPopover(false)}
        />
      )}
      {popover && ref.current && def.kind === "date" && (
        <DateMenu value={value} anchor={ref.current} onChange={(v) => write(v)} onClose={() => setPopover(false)} />
      )}
      {popover && ref.current && def.kind === "page" && (
        <PagePicker
          ws={ws}
          anchor={ref.current}
          value={typeof value === "string" ? value : null}
          excludeIds={[pageId]}
          onPick={(id) => write(id)}
          onClose={() => setPopover(false)}
        />
      )}
    </div>
  );
}

function InlineValueInput({
  def,
  value,
  onCommit,
  onDone,
}: {
  def: PropDef;
  value: unknown;
  onCommit: (v: unknown) => void;
  onDone: () => void;
}) {
  const initial = def.kind === "number" ? (typeof value === "number" ? String(value) : "") : String(value ?? "");
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const done = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const parse = (s: string): { ok: boolean; v: unknown } => {
    const t = s.trim();
    if (def.kind === "number") {
      if (!t) return { ok: true, v: null };
      const n = Number(t.replace(/[, _]/g, ""));
      return Number.isFinite(n) ? { ok: true, v: n } : { ok: false, v: null };
    }
    return { ok: true, v: def.kind === "url" ? t : s };
  };
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) {
      const r = parse(draft);
      if (r.ok && draft !== initial) onCommit(r.v);
    }
    onDone();
  };
  return (
    <input
      ref={inputRef}
      className={`pp-inline-input ${invalid ? "invalid" : ""}`}
      value={draft}
      inputMode={def.kind === "number" ? "decimal" : def.kind === "url" ? "url" : undefined}
      placeholder={def.kind === "url" ? "https://…" : def.kind === "number" ? "0" : ""}
      onChange={(e) => {
        setDraft(e.target.value);
        setInvalid(!parse(e.target.value).ok);
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
    />
  );
}

/** Write helper for callers outside a PropValueEditor (e.g. board drops). */
export function writeProp(ws: Workspace, pageId: string, propId: string, value: unknown) {
  ws.doc.transact(() => setProp(ws.doc, pageId, propId, value), PROPS_ORIGIN);
}

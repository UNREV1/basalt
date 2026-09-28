// Small presentational building blocks shared by property editors and database layouts.

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { displayTitle } from "../../../shared/model.ts";
import { useApp, usePage } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon } from "./icons.tsx";
import { Popover, type Anchor } from "./Popover.tsx";
import { EMOJIS, pageIconFor } from "./propUtils.ts";
import "./properties.css";

export function OptionTag({
  option,
  onRemove,
  className = "",
}: {
  option: { name: string; color: string };
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span className={`pp-tag tag-${option.color} ${className}`} title={option.name}>
      <span className="pp-tag-label">{option.name || " "}</span>
      {onRemove && (
        <button
          type="button"
          className="pp-tag-x"
          aria-label={`Remove ${option.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Icon name="x" size={11} strokeWidth={2.4} />
        </button>
      )}
    </span>
  );
}

export function CheckboxBox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle?: () => void;
  label?: string;
}) {
  const box = (
    <span className={`pp-check ${checked ? "on" : ""}`}>
      {checked && <Icon name="check" size={12} strokeWidth={3} />}
    </span>
  );
  if (!onToggle) return box;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className="pp-check-btn"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {box}
    </button>
  );
}

/** Linked page pill; live title/icon, click opens the page. */
export function PageChip({ ws, id, onRemove }: { ws: Workspace; id: string; onRemove?: () => void }) {
  const { meta } = usePage(ws, id);
  const { openPage } = useApp();
  if (!meta || meta.deletedAt) {
    return (
      <span className="pp-page-chip missing">
        <span className="pp-page-chip-title">{meta ? "In trash" : "Missing page"}</span>
        {onRemove && (
          <button type="button" className="pp-tag-x" aria-label="Remove link" onClick={(e) => (e.stopPropagation(), onRemove())}>
            <Icon name="x" size={11} strokeWidth={2.4} />
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="pp-page-chip">
      <a
        href="#"
        className="pp-page-chip-link"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openPage(id);
        }}
      >
        <span className="pp-page-chip-icon">{pageIconFor(meta)}</span>
        <span className="pp-page-chip-title">{displayTitle(meta)}</span>
      </a>
      {onRemove && (
        <button type="button" className="pp-tag-x" aria-label="Remove link" onClick={(e) => (e.stopPropagation(), onRemove())}>
          <Icon name="x" size={11} strokeWidth={2.4} />
        </button>
      )}
    </span>
  );
}

/**
 * Text input that keeps a local draft while focused so remote edits never move
 * the caret; commits on Enter/blur (or on every keystroke with `live`).
 * Only user edits are committed, so a remote change that arrives while the
 * input is focused is never overwritten by a stale draft.
 */
export function DraftInput({
  value,
  onCommit,
  live = false,
  selectOnFocus = false,
  onDone,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  live?: boolean;
  selectOnFocus?: boolean;
  onDone?: (reason: "enter" | "escape" | "blur") => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(value);
  const st = useRef({ focused: false, dirty: false, initial: value, draft: value, reason: null as "enter" | "escape" | null });
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  useEffect(() => {
    if (!st.current.focused) {
      st.current.draft = value;
      setDraft(value);
    }
  }, [value]);
  // Unmounting while focused (e.g. the popover closed on an outside press) still saves the edit.
  useEffect(
    () => () => {
      const s = st.current;
      if (s.focused && s.dirty && !live) commitRef.current(s.draft);
    },
    [live],
  );
  const flush = () => {
    const s = st.current;
    if (s.dirty && !live) commitRef.current(s.draft);
    s.dirty = false;
  };
  return (
    <input
      {...rest}
      value={draft}
      onFocus={(e) => {
        Object.assign(st.current, { focused: true, dirty: false, initial: value, draft: value, reason: null });
        if (draft !== value) setDraft(value);
        if (selectOnFocus) e.currentTarget.select();
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const v = e.target.value;
        st.current.draft = v;
        st.current.dirty = true;
        setDraft(v);
        if (live) onCommit(v);
      }}
      onBlur={(e) => {
        flush();
        st.current.focused = false;
        rest.onBlur?.(e);
        onDone?.(st.current.reason ?? "blur");
      }}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        if (e.defaultPrevented) return;
        const s = st.current;
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          flush();
          s.reason = "enter";
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          s.dirty = false;
          if (live && s.draft !== s.initial) onCommit(s.initial);
          s.draft = s.initial;
          setDraft(s.initial);
          s.reason = "escape";
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function EmojiPicker({
  anchor,
  onClose,
  onPick,
  onRemove,
}: {
  anchor: Anchor;
  onClose: () => void;
  onPick: (emoji: string) => void;
  onRemove?: () => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <Popover anchor={anchor} onClose={onClose} className="pp-emoji-pop">
      <div className="pp-emoji-head">
        <input
          className="input pp-emoji-input"
          placeholder="Type or paste an emoji"
          value={custom}
          autoFocus
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              onPick(firstGrapheme(custom.trim()));
              onClose();
            }
          }}
        />
        {onRemove && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            Remove
          </button>
        )}
      </div>
      <div className="pp-emoji-grid">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className="pp-emoji"
            onClick={() => {
              onPick(e);
              onClose();
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </Popover>
  );
}

function firstGrapheme(s: string): string {
  if (typeof Intl.Segmenter === "function") {
    for (const part of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)) return part.segment;
  }
  return Array.from(s)[0] ?? s;
}

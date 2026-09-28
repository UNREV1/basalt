// Small UI primitives for the paint studio: Krita-style value sliders,
// anchored popovers, switches and segmented controls.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface KSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Exponential mapping for wide ranges such as brush size. */
  exp?: boolean;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  /** Called when a drag or keyboard change ends. */
  onCommit?: () => void;
  title?: string;
  className?: string;
  disabled?: boolean;
  /** Custom track background (e.g. alpha gradient). */
  track?: string;
}

function toT(v: number, min: number, max: number, exp?: boolean) {
  if (exp && min > 0) return Math.log(v / min) / Math.log(max / min);
  return (v - min) / (max - min);
}

function fromT(t: number, min: number, max: number, exp?: boolean) {
  const c = Math.min(1, Math.max(0, t));
  if (exp && min > 0) return min * Math.pow(max / min, c);
  return min + c * (max - min);
}

function snap(v: number, step: number | undefined, min: number, max: number) {
  let out = v;
  if (step) out = Math.round(out / step) * step;
  out = Math.min(max, Math.max(min, out));
  return Math.round(out * 1000) / 1000;
}

/**
 * A bar slider in the style of Krita's docker sliders: the label and value sit
 * inside the bar, click/drag anywhere to set, double-click to type a value.
 */
export function KSlider(props: KSliderProps) {
  const { label, value, min, max, step, exp, format, onChange, onCommit, title, className, disabled, track } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const dragging = useRef(false);
  const t = Math.min(1, Math.max(0, toT(value, min, max, exp)));
  const shown = format ? format(value) : String(Math.round(value * 100) / 100);

  const setFromX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const v = snap(fromT((clientX - r.left) / r.width, min, max, exp), step, min, max);
    if (v !== value) onChange(v);
  };

  if (editing) {
    return (
      <input
        className={`pv-ks-input ${className ?? ""}`}
        autoFocus
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (Number.isFinite(n)) {
            onChange(snap(n, undefined, min, max));
            onCommit?.();
          }
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
          e.stopPropagation();
        }}
      />
    );
  }

  return (
    <div
      ref={ref}
      className={`pv-ks ${disabled ? "disabled" : ""} ${className ?? ""}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={shown}
      title={title ?? `${label} — drag to adjust, double-click to type`}
      style={track ? { background: track } : undefined}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = true;
        setFromX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) setFromX(e.clientX);
      }}
      onPointerUp={() => {
        if (!dragging.current) return;
        dragging.current = false;
        onCommit?.();
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onDoubleClick={() => {
        if (disabled) return;
        setDraft(String(Math.round(value * 100) / 100));
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        const dir = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        const k = e.shiftKey ? 10 : 1;
        const next = exp
          ? fromT(t + dir * 0.01 * k, min, max, exp)
          : value + dir * (step ?? (max - min) / 100) * k;
        onChange(snap(next, step, min, max));
        onCommit?.();
      }}
    >
      <div className="pv-ks-fill" style={{ width: `${t * 100}%` }} />
      <span className="pv-ks-label">{label}</span>
      <span className="pv-ks-value">{shown}</span>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="pv-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="pv-switch-track" aria-hidden="true">
        <span className="pv-switch-thumb" />
      </span>
      <span className="pv-switch-label">{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="pv-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? "active" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A popover anchored to an element, flipped/clamped to stay on screen. */
export function Popover({
  anchor,
  onClose,
  children,
  className,
  align = "start",
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = align === "end" ? a.right - w : align === "center" ? a.left + a.width / 2 - w / 2 : a.left;
      left = Math.max(8, Math.min(vw - w - 8, left));
      let top = a.bottom + 6;
      if (top + h > vh - 8) top = Math.max(8, a.top - h - 6);
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [anchor, align]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      className={`pv-pop ${className ?? ""}`}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      role="dialog"
    >
      {children}
    </div>
  );
}

/** Button + popover pair that manages its own open state. */
export function PopButton({
  button,
  children,
  className,
  title,
  align,
  popClassName,
  active,
}: {
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  title?: string;
  align?: "start" | "end" | "center";
  popClassName?: string;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${className ?? "pv-btn"} ${open || active ? "active" : ""}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {button}
      </button>
      {open && (
        <Popover anchor={ref.current} onClose={close} align={align} className={popClassName}>
          {children(close)}
        </Popover>
      )}
    </>
  );
}

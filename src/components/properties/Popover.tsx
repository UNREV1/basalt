// Anchored popover used by every property editor and database menu.
// Popovers stack (a menu can open a sub-menu); an outside press closes every
// popover above the one that contains the press, Escape closes the topmost.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./properties.css";

export type Anchor = HTMLElement | DOMRect | { x: number; y: number };
export type Placement = "bottom-start" | "bottom-end" | "right-start" | "top-start";

interface StackEntry {
  el: HTMLElement | null;
  anchorEl: HTMLElement | null;
  close: () => void;
}

const stack: StackEntry[] = [];

function onPointerDown(e: PointerEvent) {
  const target = e.target as Node | null;
  if (!target) return;
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (entry.el?.contains(target) || entry.anchorEl?.contains(target)) break;
    entry.close();
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" || !stack.length) return;
  e.preventDefault();
  e.stopPropagation();
  stack[stack.length - 1].close();
}

function register(entry: StackEntry) {
  if (!stack.length) {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
  }
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i !== -1) stack.splice(i, 1);
    if (!stack.length) {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    }
  };
}

/** True while any popover is open (lets views ignore global shortcuts). */
export function popoverOpen(): boolean {
  return stack.length > 0;
}

function anchorRect(anchor: Anchor): DOMRect {
  if (anchor instanceof HTMLElement) return anchor.getBoundingClientRect();
  if (anchor instanceof DOMRect) return anchor;
  return new DOMRect(anchor.x, anchor.y, 0, 0);
}

export function Popover({
  anchor,
  onClose,
  children,
  placement = "bottom-start",
  className = "",
  style,
  offset = 4,
  minWidth,
  matchAnchorWidth = false,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  placement?: Placement;
  className?: string;
  style?: CSSProperties;
  offset?: number;
  minWidth?: number;
  matchAnchorWidth?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number; width?: number } | null>(null);
  const lastRect = useRef<DOMRect | null>(null);

  useEffect(() => {
    const entry: StackEntry = {
      el: ref.current,
      anchorEl: anchor instanceof HTMLElement ? anchor : null,
      close: () => closeRef.current(),
    };
    return register(entry);
    // The anchor identity is fixed for the lifetime of one popover instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      let r: DOMRect;
      if (anchor instanceof HTMLElement && !anchor.isConnected && lastRect.current) r = lastRect.current;
      else r = anchorRect(anchor);
      lastRect.current = r;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const m = 8;
      const width = matchAnchorWidth ? Math.max(r.width, minWidth ?? 0) : undefined;
      if (width) el.style.width = `${Math.min(width, vw - 2 * m)}px`;
      const w = Math.min(el.offsetWidth, vw - 2 * m);
      const h = el.scrollHeight;
      let left: number;
      let top: number;
      let maxHeight = vh - 2 * m;
      if (placement === "right-start") {
        left = r.right + offset;
        if (left + w > vw - m) left = r.left - offset - w;
        top = r.top - 4;
      } else {
        left = placement === "bottom-end" ? r.right - w : r.left;
        const below = vh - m - (r.bottom + offset);
        const above = r.top - offset - m;
        const goUp = placement === "top-start" ? h <= above || above >= below : h > below && above > below;
        if (goUp) {
          maxHeight = above;
          top = r.top - offset - Math.min(h, above);
        } else {
          maxHeight = below;
          top = r.bottom + offset;
        }
      }
      maxHeight = Math.max(120, maxHeight);
      top = Math.max(m, Math.min(top, vh - m - Math.min(h, maxHeight)));
      left = Math.max(m, Math.min(left, vw - m - w));
      setPos((p) =>
        p && p.left === left && p.top === top && p.maxHeight === maxHeight && p.width === width
          ? p
          : { left, top, maxHeight, width },
      );
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, placement, offset, matchAnchorWidth, minWidth]);

  return createPortal(
    <div
      ref={ref}
      className={`menu pp-pop ${className}`}
      role="dialog"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        maxHeight: pos?.maxHeight,
        width: pos?.width,
        minWidth,
        // Not visibility:hidden: autofocused inputs must be focusable before the first measurement.
        opacity: pos ? undefined : 0,
        pointerEvents: pos ? undefined : "none",
        ...style,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Small hook for "button opens popover" patterns. */
export function usePopover<T extends Anchor = HTMLElement>() {
  const [anchor, setAnchor] = useState<T | null>(null);
  return {
    anchor,
    open: (a: T) => setAnchor(a),
    toggle: (a: T) => setAnchor((cur) => (cur ? null : a)),
    close: () => setAnchor(null),
  };
}

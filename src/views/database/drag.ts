// Pointer-events card dragging shared by the board and calendar layouts.
// Mouse/pen drags start after a few pixels of movement; touch drags start after
// a short long-press so normal swipes still scroll the page.

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

export interface DragState {
  id: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** Drop target key under the pointer (value of the target attribute), or null. */
  over: string | null;
  /** Where the drag started (value of the target attribute of the source). */
  from: string | null;
}

const preventTouchScroll = (e: TouchEvent) => e.preventDefault();

export function useCardDrag({
  targetAttr,
  onDrop,
  scrollContainer,
}: {
  /** data-* attribute (without "data-") marking drop targets, e.g. "col". */
  targetAttr: string;
  onDrop: (id: string, target: string, from: string | null) => void;
  /** Element to auto-scroll horizontally near its edges while dragging. */
  scrollContainer?: () => HTMLElement | null;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const resolve = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const target = el?.closest<HTMLElement>(`[data-${targetAttr}]`);
    return target ? (target.dataset[camel(targetAttr)] ?? null) : null;
  };

  const bind = (id: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0 || cleanupRef.current) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, button, a, [data-no-drag], .pp-value")) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const pointerId = e.pointerId;
      const touch = e.pointerType === "touch";
      const start = { x: e.clientX, y: e.clientY };
      const from = el.closest<HTMLElement>(`[data-${targetAttr}]`)?.dataset[camel(targetAttr)] ?? null;
      let active = false;
      let over: string | null = null;
      let last = start;
      let raf = 0;
      let timer = 0;

      const autoScroll = () => {
        raf = requestAnimationFrame(autoScroll);
        const sc = scrollContainer?.();
        if (sc) {
          const r = sc.getBoundingClientRect();
          const edge = 56;
          if (last.x < r.left + edge) sc.scrollLeft -= Math.ceil((r.left + edge - last.x) / 4);
          else if (last.x > r.right - edge) sc.scrollLeft += Math.ceil((last.x - (r.right - edge)) / 4);
        }
        const vs = verticalScroller(el);
        if (vs) {
          const r = vs === document.scrollingElement ? new DOMRect(0, 0, innerWidth, innerHeight) : vs.getBoundingClientRect();
          const edge = 48;
          if (last.y < r.top + edge) vs.scrollTop -= Math.ceil((r.top + edge - last.y) / 4);
          else if (last.y > r.bottom - edge) vs.scrollTop += Math.ceil((last.y - (r.bottom - edge)) / 4);
        }
        const nextOver = resolve(last.x, last.y);
        if (nextOver !== over) {
          over = nextOver;
          setDrag((s) => (s ? { ...s, over } : s));
        }
      };

      const begin = () => {
        active = true;
        try {
          el.setPointerCapture(pointerId);
        } catch {
          // Pointer already released.
        }
        document.addEventListener("touchmove", preventTouchScroll, { passive: false });
        document.body.classList.add("db-dragging");
        if (touch) navigator.vibrate?.(8);
        over = resolve(last.x, last.y);
        setDrag({
          id,
          x: last.x,
          y: last.y,
          offsetX: start.x - rect.left,
          offsetY: start.y - rect.top,
          width: rect.width,
          height: rect.height,
          over,
          from,
        });
        raf = requestAnimationFrame(autoScroll);
      };

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        last = { x: ev.clientX, y: ev.clientY };
        if (!active) {
          const d = Math.hypot(last.x - start.x, last.y - start.y);
          if (touch) {
            if (d > 10) finish(false);
          } else if (d > 4) begin();
          if (!active) return;
        }
        over = resolve(last.x, last.y);
        setDrag((s) => (s ? { ...s, x: last.x, y: last.y, over } : s));
      };

      const finish = (drop: boolean) => {
        window.clearTimeout(timer);
        cancelAnimationFrame(raf);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        document.removeEventListener("touchmove", preventTouchScroll);
        document.body.classList.remove("db-dragging");
        cleanupRef.current = null;
        if (!active) return;
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        setDrag(null);
        if (drop && over !== null) dropRef.current(id, over, from);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        last = { x: ev.clientX, y: ev.clientY };
        if (active) over = resolve(last.x, last.y);
        finish(true);
      };
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) finish(false);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      cleanupRef.current = () => finish(false);
      if (touch) timer = window.setTimeout(begin, 260);
    },
    onClickCapture: (e: ReactMouseEvent) => {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
        suppressClick.current = false;
      }
    },
    onContextMenu: (e: ReactMouseEvent) => {
      // Long-press on touch would otherwise open the context menu mid-drag.
      if (cleanupRef.current) e.preventDefault();
    },
  });

  return { drag, bind };
}

function camel(attr: string): string {
  return attr.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function verticalScroller(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

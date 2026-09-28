// Pointer-driven vertical reordering (works with mouse, pen and touch because the
// grip handle uses pointer capture and `touch-action: none`).

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

interface DragState {
  from: number;
  to: number;
  dy: number;
  size: number;
}

export function useReorder<T extends HTMLElement = HTMLDivElement>(onMove: (from: number, to: number) => void) {
  const containerRef = useRef<T>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [drag, setDrag] = useState<DragState | null>(null);

  const handleProps = (index: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const items = Array.from(containerRef.current?.querySelectorAll<HTMLElement>(":scope > [data-reorder]") ?? []);
      const rects = items.map((el) => el.getBoundingClientRect());
      const me = rects[index];
      if (!me) return;
      const gap = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 0;
      const size = me.height + gap;
      const startY = e.clientY;
      let to = index;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const dy = ev.clientY - startY;
        const center = me.top + me.height / 2 + dy;
        to = rects.filter((r, i) => i !== index && r.top + r.height / 2 < center).length;
        setDrag({ from: index, to, dy, size });
      };
      const up = () => {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
        setDrag(null);
        if (to !== index) moveRef.current(index, to);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
      setDrag({ from: index, to: index, dy: 0, size });
    },
  });

  const itemStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const { from, to, dy, size } = drag;
    if (index === from)
      return {
        transform: `translateY(${dy}px)`,
        zIndex: 2,
        position: "relative",
        boxShadow: "var(--shadow)",
        background: "var(--bg)",
        transition: "none",
      };
    if (from < to && index > from && index <= to) return { transform: `translateY(${-size}px)` };
    if (from > to && index >= to && index < from) return { transform: `translateY(${size}px)` };
    return undefined;
  };

  return { containerRef, handleProps, itemStyle, dragging: drag !== null };
}

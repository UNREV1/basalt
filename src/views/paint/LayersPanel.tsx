// Layers docker: live thumbnails, visibility / lock / alpha lock, rename,
// drag-to-reorder (pointer based so it works with touch), blend mode and
// opacity for the active layer, and layer actions.

import { useRef, useState } from "react";
import { Icon } from "./icons.tsx";
import { BLEND_MODES, type LayerData, type PaintMeta } from "./types.ts";
import { KSlider } from "./widgets.tsx";

export interface LayerOps {
  select(id: string): void;
  add(): void;
  remove(id: string): void;
  duplicate(id: string): void;
  mergeDown(id: string): void;
  clear(id: string): void;
  move(id: string, toIndex: number): void;
  update(id: string, patch: Partial<LayerData>): void;
}

const BLEND_LABELS: Record<string, string> = {
  normal: "Normal",
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  darken: "Darken",
  lighten: "Lighten",
  "color-dodge": "Color Dodge",
  "color-burn": "Color Burn",
  "hard-light": "Hard Light",
  "soft-light": "Soft Light",
  difference: "Difference",
  exclusion: "Exclusion",
  hue: "Hue",
  saturation: "Saturation",
  color: "Color",
  luminosity: "Luminosity",
};

export function LayersPanel({
  layers,
  activeId,
  ops,
  meta,
  contentId,
  counts,
  canvas = false,
  thumbBox,
}: {
  /** Bottom → top (array order). */
  layers: LayerData[];
  activeId: string | null;
  ops: LayerOps;
  meta: PaintMeta;
  contentId: (layerId: string) => string;
  counts: Record<string, number>;
  /** On a canvas page: layers can sit over or under the whiteboard shapes. */
  canvas?: boolean;
  /** Canvas page: the thumbnail viewBox (the painted area). */
  thumbBox?: string;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; y: number; startY: number; target: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ id: string; startY: number; pointerId: number } | null>(null);
  const topDown = [...layers].reverse();
  const active = layers.find((l) => l.id === activeId) ?? null;
  const activeIndex = active ? layers.indexOf(active) : -1;

  const rowHeight = 48;
  const targetFor = (clientY: number): number => {
    const r = listRef.current!.getBoundingClientRect();
    const slot = Math.round((clientY - r.top + listRef.current!.scrollTop) / rowHeight - 0.5);
    const clamped = Math.max(0, Math.min(topDown.length - 1, slot));
    return layers.length - 1 - clamped;
  };

  return (
    <div className="pv-layers">
      <div className="pv-layer-props">
        <select
          className="select pv-blend"
          value={active?.blend ?? "normal"}
          disabled={!active}
          aria-label="Blend mode"
          title="Layer blend mode"
          onChange={(e) => active && ops.update(active.id, { blend: e.target.value })}
        >
          {BLEND_MODES.map((b) => (
            <option key={b} value={b}>
              {BLEND_LABELS[b]}
            </option>
          ))}
        </select>
        <KSlider
          label="Opacity"
          value={Math.round((active?.opacity ?? 1) * 100)}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
          disabled={!active}
          onChange={(v) => active && ops.update(active.id, { opacity: v / 100 })}
          className="pv-grow"
        />
      </div>
      <div
        ref={listRef}
        className={`pv-layer-list ${drag ? "dragging" : ""}`}
        role="listbox"
        aria-label="Layers"
        onPointerMove={(e) => {
          const p = pending.current;
          if (p && !drag && Math.abs(e.clientY - p.startY) > 5) {
            // Capture only once a drag starts, so clicks and double-clicks still reach rows.
            listRef.current?.setPointerCapture(e.pointerId);
            setDrag({ id: p.id, y: e.clientY, startY: p.startY, target: targetFor(e.clientY) });
          } else if (drag) {
            setDrag({ ...drag, y: e.clientY, target: targetFor(e.clientY) });
          }
        }}
        onPointerLeave={() => {
          if (!drag) pending.current = null;
        }}
        onPointerUp={() => {
          if (drag) ops.move(drag.id, drag.target);
          pending.current = null;
          setDrag(null);
        }}
        onPointerCancel={() => {
          pending.current = null;
          setDrag(null);
        }}
      >
        {topDown.map((l) => {
          const idx = layers.indexOf(l);
          const isDrag = drag?.id === l.id;
          let shift = 0;
          if (drag && !isDrag) {
            const from = layers.findIndex((x) => x.id === drag.id);
            if (from > idx && drag.target <= idx) shift = rowHeight;
            if (from < idx && drag.target >= idx) shift = -rowHeight;
          }
          return (
            <div
              key={l.id}
              role="option"
              aria-selected={l.id === activeId}
              className={`pv-layer ${l.id === activeId ? "active" : ""} ${!l.visible ? "hidden-layer" : ""} ${isDrag ? "lifted" : ""}`}
              style={
                isDrag
                  ? { transform: `translateY(${drag!.y - drag!.startY}px)` }
                  : shift
                    ? { transform: `translateY(${-shift}px)` }
                    : undefined
              }
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button, input")) return;
                ops.select(l.id);
                if (e.button !== 0) return;
                pending.current = { id: l.id, startY: e.clientY, pointerId: e.pointerId };
              }}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                setRenaming(l.id);
              }}
            >
              <button
                type="button"
                className={`pv-layer-icon ${l.visible ? "" : "off"}`}
                title={l.visible ? "Hide layer" : "Show layer"}
                aria-label={l.visible ? "Hide layer" : "Show layer"}
                onClick={() => ops.update(l.id, { visible: !l.visible })}
              >
                <Icon name={l.visible ? "eye" : "eyeOff"} size={16} />
              </button>
              <div className="pv-thumb" aria-hidden="true">
                <svg viewBox={thumbBox ?? `0 0 ${meta.width} ${meta.height}`} preserveAspectRatio="xMidYMid meet">
                  {/* Thicken strokes a little so fine line work still reads at thumbnail size. */}
                  <filter id={`${contentId(l.id)}-thumb`}>
                    <feMorphology operator="dilate" radius={Math.max(meta.width, meta.height) / 60} />
                  </filter>
                  <use href={`#${contentId(l.id)}`} filter={`url(#${contentId(l.id)}-thumb)`} />
                </svg>
              </div>
              <div className="pv-layer-name">
                {renaming === l.id ? (
                  <input
                    className="pv-rename"
                    autoFocus
                    defaultValue={l.name}
                    aria-label="Layer name"
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== l.name) ops.update(l.id, { name });
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <>
                    <span className="ellipsis">{l.name}</span>
                    <span className="pv-layer-meta">
                      {l.blend !== "normal" && <span>{BLEND_LABELS[l.blend] ?? l.blend}</span>}
                      {l.opacity < 1 && <span>{Math.round(l.opacity * 100)}%</span>}
                      {!(l.blend !== "normal" || l.opacity < 1) && (
                        <span>{(counts[l.id] ?? 0) === 1 ? "1 stroke" : `${counts[l.id] ?? 0} strokes`}</span>
                      )}
                      {l.locked && <span>Locked</span>}
                    </span>
                  </>
                )}
              </div>
              {canvas && (
                <button
                  type="button"
                  className={`pv-layer-icon ${l.over ? "on" : "dim"}`}
                  title={l.over ? "Painted over shapes and text (click to put it under)" : "Painted under shapes and text (click to put it over)"}
                  aria-pressed={l.over}
                  onClick={() => ops.update(l.id, { over: !l.over })}
                >
                  <Icon name={l.over ? "overShapes" : "underShapes"} size={15} />
                </button>
              )}
              <button
                type="button"
                className={`pv-layer-icon ${l.alphaLock ? "on" : "dim"}`}
                title={l.alphaLock ? "Alpha lock on: paint only over existing pixels" : "Alpha lock"}
                aria-pressed={l.alphaLock}
                onClick={() => ops.update(l.id, { alphaLock: !l.alphaLock })}
              >
                <Icon name="alpha" size={15} />
              </button>
              <button
                type="button"
                className={`pv-layer-icon ${l.locked ? "on" : "dim"}`}
                title={l.locked ? "Unlock layer" : "Lock layer"}
                aria-pressed={l.locked}
                onClick={() => ops.update(l.id, { locked: !l.locked })}
              >
                <Icon name={l.locked ? "lock" : "unlock"} size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="pv-layer-actions">
        <button type="button" className="pv-btn" title="New layer (Insert)" onClick={ops.add}>
          <Icon name="plus" />
        </button>
        <button type="button" className="pv-btn" title="Duplicate layer (Ctrl+J)" disabled={!active} onClick={() => active && ops.duplicate(active.id)}>
          <Icon name="copy" />
        </button>
        <button
          type="button"
          className="pv-btn"
          title="Merge down (Ctrl+E)"
          disabled={!active || activeIndex <= 0}
          onClick={() => active && ops.mergeDown(active.id)}
        >
          <Icon name="merge" />
        </button>
        <button type="button" className="pv-btn" title="Clear layer" disabled={!active} onClick={() => active && ops.clear(active.id)}>
          <Icon name="clear" />
        </button>
        <span className="pv-grow" />
        <button
          type="button"
          className="pv-btn pv-danger"
          title="Delete layer"
          disabled={!active || layers.length <= 1}
          onClick={() => active && ops.remove(active.id)}
        >
          <Icon name="trash" />
        </button>
      </div>
    </div>
  );
}

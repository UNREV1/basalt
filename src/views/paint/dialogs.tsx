// Canvas settings and keyboard shortcut reference.

import { useState } from "react";
import { Icon } from "./icons.tsx";
import type { PaintMeta } from "./types.ts";

const SIZE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "HD 1920 × 1080", w: 1920, h: 1080 },
  { label: "4K 3840 × 2160", w: 3840, h: 2160 },
  { label: "Square 2048", w: 2048, h: 2048 },
  { label: "Instagram 1080", w: 1080, h: 1080 },
  { label: "Portrait 1080 × 1350", w: 1080, h: 1350 },
  { label: "Phone 1170 × 2532", w: 1170, h: 2532 },
  { label: "A4 @150dpi", w: 1240, h: 1754 },
  { label: "A4 @300dpi", w: 2480, h: 3508 },
  { label: "Comic page", w: 1988, h: 3056 },
  { label: "Icon 512", w: 512, h: 512 },
];

export function CanvasDialog({
  meta,
  onApply,
  onClose,
}: {
  meta: PaintMeta;
  onApply: (m: PaintMeta) => void;
  onClose: () => void;
}) {
  const [w, setW] = useState(String(meta.width));
  const [h, setH] = useState(String(meta.height));
  const transparent0 = meta.background === "transparent";
  const [transparent, setTransparent] = useState(transparent0);
  const [color, setColor] = useState(transparent0 ? "#ffffff" : meta.background);
  const wn = Math.round(Number(w));
  const hn = Math.round(Number(h));
  const valid = wn >= 16 && hn >= 16 && wn <= 12000 && hn <= 12000;

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="modal pv-modal" role="dialog" aria-label="Canvas settings">
        <div className="modal-header">
          <Icon name="canvas" />
          Canvas
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="pv-field-label">Size</div>
          <div className="pv-size-presets">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className={`pv-chip ${wn === p.w && hn === p.h ? "active" : ""}`}
                onClick={() => {
                  setW(String(p.w));
                  setH(String(p.h));
                }}
              >
                <span className="pv-chip-shape" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
                {p.label}
              </button>
            ))}
          </div>
          <div className="row pv-size-inputs">
            <label className="col pv-grow">
              <span className="small muted">Width (px)</span>
              <input className="input" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value.replace(/[^0-9]/g, ""))} />
            </label>
            <button
              type="button"
              className="icon-btn pv-swap-dims"
              title="Swap width and height"
              onClick={() => {
                setW(h);
                setH(w);
              }}
            >
              <Icon name="swap" size={16} />
            </button>
            <label className="col pv-grow">
              <span className="small muted">Height (px)</span>
              <input className="input" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/[^0-9]/g, ""))} />
            </label>
          </div>
          <div className="small muted">Resizing keeps the artwork anchored to the top-left corner.</div>
          <div className="pv-field-label">Background</div>
          <div className="row wrap">
            <label className={`pv-chip ${!transparent ? "active" : ""}`}>
              <input type="radio" name="pv-bg" checked={!transparent} onChange={() => setTransparent(false)} />
              <span className="pv-chip-color" style={{ background: color }} />
              Color
              <input type="color" className="pv-color-input" value={color} onChange={(e) => {
                setColor(e.target.value);
                setTransparent(false);
              }} aria-label="Background color" />
            </label>
            <label className={`pv-chip ${transparent ? "active" : ""}`}>
              <input type="radio" name="pv-bg" checked={transparent} onChange={() => setTransparent(true)} />
              <span className="pv-chip-color pv-checker-swatch" />
              Transparent
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => onApply({ width: wn, height: hn, background: transparent ? "transparent" : color })}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ["Brush", ["B"]],
  ["Toggle eraser", ["E"]],
  ["Shapes (line → rect → ellipse)", ["U"]],
  ["Lasso fill", ["L"]],
  ["Eyedropper", ["I"]],
  ["Temporary eyedropper", ["Alt (hold)"]],
  ["Move / select", ["V"]],
  ["Pan tool", ["H"]],
  ["Pan", ["Space + drag"]],
  ["Rotate canvas", ["Shift + Space + drag"]],
  ["Zoom", ["Ctrl + wheel", "Ctrl + Space + drag"]],
  ["Rotate 15°", ["4", "6"]],
  ["Reset rotation", ["R", "5"]],
  ["Mirror view", ["M"]],
  ["Fit to screen", ["0", "Ctrl + 0"]],
  ["Actual pixels", ["1"]],
  ["Brush size", ["[", "]"]],
  ["Brush opacity", ["Shift + [", "Shift + ]"]],
  ["Swap colors", ["X"]],
  ["Default colors", ["D"]],
  ["Undo / redo", ["Ctrl + Z", "Ctrl + Shift + Z"]],
  ["New layer", ["Insert", "Ctrl + Shift + N"]],
  ["Duplicate layer", ["Ctrl + J"]],
  ["Merge down", ["Ctrl + E"]],
  ["Select all on layer", ["Ctrl + A"]],
  ["Duplicate selection", ["Ctrl + D"]],
  ["Copy / cut / paste", ["Ctrl + C", "X", "V"]],
  ["Delete selection", ["Delete"]],
  ["Nudge selection", ["Arrows", "Shift + Arrows"]],
  ["Hide panels", ["Tab"]],
  ["Two-finger tap", ["Undo"]],
  ["Three-finger tap", ["Redo"]],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || e.key === "?") onClose();
      }}
    >
      <div className="modal pv-modal pv-shortcuts" role="dialog" aria-label="Keyboard shortcuts" tabIndex={-1} ref={(el) => el?.focus()}>
        <div className="modal-header">
          <Icon name="help" />
          Shortcuts
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="pv-shortcut-grid">
            {SHORTCUTS.map(([label, keys]) => (
              <div key={label} className="pv-shortcut">
                <span>{label}</span>
                <span className="pv-keys">
                  {keys.map((k) => (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <div className="small muted">
            With a pen, touches only pan, zoom and rotate (palm rejection). The pen’s eraser end erases automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

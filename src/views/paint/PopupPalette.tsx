// Krita-style popup palette: right-click the canvas for a ring of brush
// presets around recent colors, right where the cursor is.

import { useEffect, useRef } from "react";
import { PRESETS } from "./brushes.ts";
import { BrushPreview } from "./BrushPanel.tsx";
import { Icon } from "./icons.tsx";
import type { BrushSettings } from "./types.ts";

const RING = 104;
const INNER = 56;

export function PopupPalette({
  x,
  y,
  activeId,
  settings,
  fg,
  recent,
  onPreset,
  onColor,
  onUndo,
  onRedo,
  onClose,
}: {
  x: number;
  y: number;
  activeId: string;
  settings: Record<string, BrushSettings>;
  fg: string;
  recent: string[];
  onPreset: (id: string) => void;
  onColor: (hex: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Defer so the opening right-click doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", down, true), 0);
    document.addEventListener("keydown", key, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  const colors = recent.slice(0, 12);
  return (
    <div
      ref={ref}
      className="pv-ppal"
      style={{ left: x, top: y }}
      role="dialog"
      aria-label="Popup palette"
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="pv-ppal-disc" />
      {PRESETS.map((p, i) => {
        const a = (-90 + (i * 360) / PRESETS.length) * (Math.PI / 180);
        return (
          <button
            key={p.id}
            type="button"
            className={`pv-ppal-preset ${p.id === activeId ? "active" : ""}`}
            style={{ left: Math.cos(a) * RING, top: Math.sin(a) * RING }}
            title={p.name}
            aria-label={p.name}
            onClick={() => {
              onPreset(p.id);
              onClose();
            }}
          >
            <BrushPreview preset={p} settings={settings[p.id]} color={fg} width={40} height={22} maxSize={7} />
          </button>
        );
      })}
      {colors.map((c, i) => {
        const a = (-90 + (i * 360) / Math.max(colors.length, 6)) * (Math.PI / 180);
        return (
          <button
            key={c}
            type="button"
            className="pv-ppal-color"
            style={{ left: Math.cos(a) * INNER, top: Math.sin(a) * INNER, background: c }}
            title={c}
            aria-label={`Color ${c}`}
            onClick={() => {
              onColor(c);
              onClose();
            }}
          />
        );
      })}
      <div className="pv-ppal-center" style={{ background: fg }} />
      <button type="button" className="pv-ppal-mini pv-ppal-undo" title="Undo" aria-label="Undo" onClick={onUndo}>
        <Icon name="undo" size={14} />
      </button>
      <button type="button" className="pv-ppal-mini pv-ppal-redo" title="Redo" aria-label="Redo" onClick={onRedo}>
        <Icon name="redo" size={14} />
      </button>
    </div>
  );
}

// HSV color selector: hue ring around a saturation/value square, alpha bar,
// hex entry, foreground/background swatches, recent colors and a palette.

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PALETTE, hexToHsva, hsvaToHex, hsvToRgb, rgbToHex } from "./color.ts";
import { Icon } from "./icons.tsx";
import type { HSVA } from "./types.ts";
import { KSlider } from "./widgets.tsx";

export function HsvRing({ value, onChange, size = 208 }: { value: HSVA; onChange: (v: HSVA) => void; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mode = useRef<"hue" | "sv" | null>(null);
  const ring = Math.max(14, Math.round(size * 0.08));
  const inner = size / 2 - ring - 3;
  const side = Math.floor(inner * Math.SQRT2 - 8);
  const hueColor = rgbToHex(hsvToRgb(value.h, 1, 1));

  const update = (clientX: number, clientY: number, start: boolean) => {
    const r = ref.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    if (start) {
      const d = Math.hypot(dx, dy);
      mode.current = d >= inner ? "hue" : "sv";
    }
    if (mode.current === "hue") {
      let h = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (h < 0) h += 360;
      onChange({ ...value, h });
    } else if (mode.current === "sv") {
      const s = Math.min(1, Math.max(0, (dx + side / 2) / side));
      const v = Math.min(1, Math.max(0, 1 - (dy + side / 2) / side));
      onChange({ ...value, s, v });
    }
  };

  const knobA = (value.h * Math.PI) / 180;
  const knobR = size / 2 - ring / 2;
  return (
    <div
      ref={ref}
      className="pv-hsv"
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY, true);
      }}
      onPointerMove={(e) => {
        if (mode.current) update(e.clientX, e.clientY, false);
      }}
      onPointerUp={() => {
        mode.current = null;
      }}
      role="group"
      aria-label="Hue ring and saturation/value square"
    >
      <div
        className="pv-hsv-ring"
        style={{
          WebkitMaskImage: `radial-gradient(circle, transparent ${size / 2 - ring - 0.5}px, #000 ${size / 2 - ring + 0.5}px)`,
          maskImage: `radial-gradient(circle, transparent ${size / 2 - ring - 0.5}px, #000 ${size / 2 - ring + 0.5}px)`,
        }}
      />
      <div
        className="pv-hsv-knob pv-hsv-hueknob"
        style={{
          left: size / 2 + Math.sin(knobA) * knobR,
          top: size / 2 - Math.cos(knobA) * knobR,
          width: ring - 2,
          height: ring - 2,
          background: hueColor,
        }}
      />
      <div className="pv-hsv-sv" style={{ width: side, height: side, background: hueColor }}>
        <div className="pv-hsv-white" />
        <div className="pv-hsv-black" />
        <div
          className="pv-hsv-knob"
          style={{ left: `${value.s * 100}%`, top: `${(1 - value.v) * 100}%`, background: hsvaToHex(value) }}
        />
      </div>
    </div>
  );
}

export interface ColorPanelProps {
  fg: HSVA;
  bg: string;
  recent: string[];
  onFg: (c: HSVA) => void;
  onBg: (hex: string) => void;
  onSwap: () => void;
  onReset: () => void;
  onCommit: (hex: string) => void;
  compact?: boolean;
}

export function ColorPanel({ fg, bg, recent, onFg, onBg, onSwap, onReset, onCommit, compact }: ColorPanelProps) {
  const hex = hsvaToHex(fg);
  const [draft, setDraft] = useState(hex);
  const bgInput = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(hex), [hex]);

  const applyHex = (text: string) => {
    const c = hexToHsva(text.startsWith("#") ? text : `#${text}`, fg.h);
    if (c) {
      onFg({ ...c, a: text.replace("#", "").length === 8 ? c.a : fg.a });
      onCommit(hsvaToHex(c));
    } else setDraft(hex);
  };

  const pickSwatch = (h: string) => {
    const c = hexToHsva(h, fg.h);
    if (c) {
      onFg({ ...c, a: fg.a });
      onCommit(h);
    }
  };

  return (
    <div className="pv-color">
      <div className="pv-color-top">
        <HsvRing value={fg} onChange={onFg} size={compact ? 188 : 208} />
      </div>
      <div className="pv-color-row">
        <div className="pv-fgbg" aria-label="Foreground and background colors">
          <button
            type="button"
            className="pv-fgbg-bg"
            style={{ background: bg }}
            title="Background color — click to edit"
            onClick={() => bgInput.current?.click()}
          />
          <div className="pv-fgbg-fg" style={{ background: hex }} title="Foreground color">
            <span style={{ opacity: 1 - fg.a }} className="pv-fgbg-alpha" />
          </div>
          <input
            ref={bgInput}
            type="color"
            className="pv-hidden-input"
            value={bg}
            onChange={(e) => onBg(e.target.value)}
            tabIndex={-1}
            aria-hidden="true"
          />
          <button type="button" className="pv-fgbg-swap" title="Swap colors (X)" onClick={onSwap}>
            <Icon name="swap" size={13} />
          </button>
          <button type="button" className="pv-fgbg-reset" title="Reset to black / white (D)" onClick={onReset}>
            <span />
            <span />
          </button>
        </div>
        <div className="pv-color-fields">
          <label className="pv-hex">
            <span>#</span>
            <input
              value={draft.replace("#", "")}
              spellCheck={false}
              maxLength={8}
              aria-label="Hex color"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => applyHex(draft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyHex((e.target as HTMLInputElement).value);
                e.stopPropagation();
              }}
            />
          </label>
          <KSlider
            label="Alpha"
            value={Math.round(fg.a * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            track={`linear-gradient(90deg, transparent, ${hex}), repeating-conic-gradient(#d9d9d9 0 25%, #fff 0 50%) 0 0 / 10px 10px`}
            className="pv-ks-alpha"
            onChange={(v) => onFg({ ...fg, a: v / 100 })}
          />
        </div>
      </div>
      {recent.length > 0 && (
        <div className="pv-swatches-block">
          <div className="pv-mini-label">Recent</div>
          <div className="pv-swatches">
            {recent.map((c) => (
              <button key={c} type="button" className="pv-swatch" style={{ background: c }} title={c} onClick={() => pickSwatch(c)} />
            ))}
          </div>
        </div>
      )}
      <div className="pv-swatches-block">
        <div className="pv-mini-label">Palette</div>
        <div className="pv-swatches pv-palette">
          {DEFAULT_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`pv-swatch ${c === hex ? "active" : ""}`}
              style={{ background: c }}
              title={c}
              onClick={() => pickSwatch(c)}
              onContextMenu={(e) => {
                e.preventDefault();
                onBg(c);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

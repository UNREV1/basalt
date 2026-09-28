// Brush presets (with live stroke previews) and the brush settings editor.

import { useEffect, useRef } from "react";
import { PRESETS, presetById, previewPoints, strokeGeometry, strokeOptions, type BrushPreset } from "./brushes.ts";
import { luminance } from "./color.ts";
import { buildStrokeElement } from "./svg.ts";
import type { BrushSettings, Stroke } from "./types.ts";
import { KSlider, Switch } from "./widgets.tsx";

let previewSeq = 0;

export function BrushPreview({
  preset,
  settings,
  color,
  width = 96,
  height = 40,
  maxSize = 14,
}: {
  preset: BrushPreset;
  settings: BrushSettings;
  color: string;
  width?: number;
  height?: number;
  maxSize?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const prefix = useRef(`bp${++previewSeq}-`);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const erase = preset.kind === "erase";
    // Very light colors vanish on the paper tile; fall back to graphite.
    const ink = erase ? "#1f1f1f" : luminance(color) > 0.8 ? "#3a3a3a" : color;
    const size = Math.min(maxSize, settings.size) * (preset.effect === "airbrush" || preset.effect === "soft" ? 1.4 : 1);
    const s: Stroke = {
      id: "preview",
      layerId: "",
      z: 0,
      kind: "brush",
      brush: preset.id,
      color: ink,
      size,
      opacity: erase ? settings.opacity : Math.max(0.25, settings.opacity),
      points: previewPoints(width, height),
      options: { ...strokeOptions(preset, settings), seed: 7, taperStart: Math.min(settings.taperStart, 20), taperEnd: Math.min(settings.taperEnd, 30) },
      blend: preset.blend,
    };
    const el = buildStrokeElement(s, strokeGeometry(s, true), prefix.current);
    svg.replaceChildren(el);
  }, [preset, settings, color, width, height, maxSize]);
  return <svg ref={ref} className="pv-preview" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" />;
}

export function PresetGrid({
  brushId,
  eraserId,
  tool,
  settings,
  color,
  onPick,
}: {
  brushId: string;
  eraserId: string;
  tool: string;
  settings: Record<string, BrushSettings>;
  color: string;
  onPick: (id: string) => void;
}) {
  const activeId = tool === "eraser" ? eraserId : brushId;
  return (
    <div className="pv-presets" role="listbox" aria-label="Brush presets">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={p.id === activeId}
          className={`pv-preset ${p.id === activeId ? "active" : ""}`}
          title={p.hint}
          onClick={() => onPick(p.id)}
        >
          <span className="pv-preset-paper">
            <BrushPreview preset={p} settings={settings[p.id]} color={color} />
          </span>
          <span className="pv-preset-name">{p.name}</span>
        </button>
      ))}
    </div>
  );
}

export function BrushSettingsEditor({
  presetId,
  settings,
  onChange,
  onReset,
}: {
  presetId: string;
  settings: BrushSettings;
  onChange: (patch: Partial<BrushSettings>) => void;
  onReset: () => void;
}) {
  const preset = presetById(presetId);
  const s = settings;
  return (
    <div className="pv-brush-settings">
      <KSlider label="Size" value={s.size} min={0.5} max={500} exp format={(v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} px`} onChange={(v) => onChange({ size: v })} />
      <KSlider label="Opacity" value={Math.round(s.opacity * 100)} min={1} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => onChange({ opacity: v / 100 })} />
      <KSlider
        label="Stabilizer"
        value={s.stabilizer}
        min={0}
        max={200}
        step={1}
        format={(v) => (v ? `${v} px` : "Off")}
        title="Lazy-string stabilizer: the brush trails the cursor by this distance"
        onChange={(v) => onChange({ stabilizer: v })}
      />
      <KSlider label="Streamline" value={s.streamline} min={0} max={0.95} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => onChange({ streamline: v })} />
      <KSlider label="Smoothing" value={s.smoothing} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => onChange({ smoothing: v })} />
      <KSlider
        label="Thinning"
        value={s.thinning}
        min={-0.9}
        max={0.95}
        step={0.01}
        format={(v) => v.toFixed(2)}
        disabled={!s.pressureSize}
        title="How strongly pressure changes the width"
        onChange={(v) => onChange({ thinning: v })}
      />
      <KSlider label="Taper start" value={s.taperStart} min={0} max={300} step={1} format={(v) => (v ? `${v} px` : "None")} onChange={(v) => onChange({ taperStart: v })} />
      <KSlider label="Taper end" value={s.taperEnd} min={0} max={300} step={1} format={(v) => (v ? `${v} px` : "None")} onChange={(v) => onChange({ taperEnd: v })} />
      <KSlider
        label="Pressure curve"
        value={s.pressureCurve}
        min={0.3}
        max={3}
        step={0.05}
        format={(v) => (v < 0.95 ? `Soft ${v.toFixed(2)}` : v > 1.05 ? `Hard ${v.toFixed(2)}` : "Linear")}
        title="Below 1 makes light pressure count more; above 1 needs a firmer hand"
        onChange={(v) => onChange({ pressureCurve: v })}
      />
      {preset.engine === "nib" && (
        <>
          <KSlider label="Nib angle" value={s.nibAngle} min={0} max={180} step={1} format={(v) => `${v}°`} onChange={(v) => onChange({ nibAngle: v })} />
          <KSlider label="Nib thickness" value={Math.round(s.nibRatio * 100)} min={2} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => onChange({ nibRatio: v / 100 })} />
        </>
      )}
      <div className="pv-switches">
        <Switch checked={s.pressureSize} onChange={(v) => onChange({ pressureSize: v })} label="Pressure → size" />
        <Switch checked={s.pressureOpacity} onChange={(v) => onChange({ pressureOpacity: v })} label="Pressure → opacity" />
        <Switch checked={s.tilt} onChange={(v) => onChange({ tilt: v })} label="Tilt → width" />
      </div>
      <button type="button" className="btn btn-sm btn-ghost pv-reset" onClick={onReset}>
        Reset “{preset.name}” to defaults
      </button>
    </div>
  );
}

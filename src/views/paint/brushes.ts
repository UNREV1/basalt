// Brush presets and the stroke → outline geometry engine (pure apart from the
// guarded localStorage helpers). Everything a peer needs to render a stroke is
// stored on the stroke itself, so presets can evolve without changing old art.

import { getStroke, getStrokePoints } from "perfect-freehand";
import { boxOfFlat, convexHull, emptyBox, growBox, isEmptyBox, padBox, polygonPath, round2, type Box } from "./geometry.ts";
import type { BlendMode, BrushEffect, BrushEngine, BrushSettings, Stroke, StrokeOptions } from "./types.ts";

export interface BrushPreset {
  id: string;
  name: string;
  kind: "brush" | "erase";
  engine: BrushEngine;
  effect: BrushEffect;
  blend?: BlendMode;
  hint: string;
  defaults: BrushSettings;
}

const BASE: BrushSettings = {
  size: 8,
  opacity: 1,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.45,
  taperStart: 0,
  taperEnd: 0,
  pressureSize: true,
  pressureOpacity: false,
  pressureCurve: 1,
  stabilizer: 0,
  nibAngle: 45,
  nibRatio: 0.12,
  tilt: false,
};

export const PRESETS: BrushPreset[] = [
  {
    id: "ink",
    name: "Ink Pen",
    kind: "brush",
    engine: "freehand",
    effect: "none",
    hint: "Crisp line work that swells with pressure",
    defaults: { ...BASE, size: 6, thinning: 0.7, smoothing: 0.55, streamline: 0.5, taperStart: 10, taperEnd: 22 },
  },
  {
    id: "pencil",
    name: "Pencil",
    kind: "brush",
    engine: "freehand",
    effect: "pencil",
    hint: "Grainy graphite; tilt the pen to shade",
    defaults: { ...BASE, size: 3.5, opacity: 0.9, thinning: 0.35, smoothing: 0.4, streamline: 0.3, taperEnd: 6, tilt: true },
  },
  {
    id: "marker",
    name: "Marker",
    kind: "brush",
    engine: "freehand",
    effect: "none",
    blend: "multiply",
    hint: "Flat alcohol marker that darkens where it overlaps",
    defaults: { ...BASE, size: 16, opacity: 0.8, thinning: 0, pressureSize: false, smoothing: 0.6, streamline: 0.5 },
  },
  {
    id: "airbrush",
    name: "Airbrush",
    kind: "brush",
    engine: "freehand",
    effect: "airbrush",
    hint: "Soft spray that builds up; pressure controls flow",
    defaults: { ...BASE, size: 64, opacity: 0.3, thinning: 0.25, smoothing: 0.7, streamline: 0.6, pressureOpacity: true },
  },
  {
    id: "calligraphy",
    name: "Calligraphy",
    kind: "brush",
    engine: "nib",
    effect: "none",
    hint: "Angled flat nib: width follows stroke direction",
    defaults: { ...BASE, size: 22, thinning: 0.35, smoothing: 0.5, streamline: 0.5, nibAngle: 45, nibRatio: 0.1 },
  },
  {
    id: "watercolor",
    name: "Watercolor",
    kind: "brush",
    engine: "freehand",
    effect: "watercolor",
    blend: "multiply",
    hint: "Wet, bleeding edges that glaze in layers",
    defaults: { ...BASE, size: 42, opacity: 0.4, thinning: 0.3, smoothing: 0.8, streamline: 0.55, taperEnd: 20 },
  },
  {
    id: "highlighter",
    name: "Highlighter",
    kind: "brush",
    engine: "nib",
    effect: "none",
    blend: "multiply",
    hint: "Translucent chisel tip",
    defaults: { ...BASE, size: 26, opacity: 0.45, thinning: 0, pressureSize: false, streamline: 0.6, nibAngle: 75, nibRatio: 0.32 },
  },
  {
    id: "pixel",
    name: "Hard Round",
    kind: "brush",
    engine: "freehand",
    effect: "pixel",
    hint: "Aliased hard edge for pixel-style work",
    defaults: { ...BASE, size: 4, thinning: 0, pressureSize: false, smoothing: 0, streamline: 0 },
  },
  {
    id: "eraser",
    name: "Eraser",
    kind: "erase",
    engine: "freehand",
    effect: "none",
    hint: "Hard vector eraser",
    defaults: { ...BASE, size: 28, thinning: 0.3, smoothing: 0.5, streamline: 0.4 },
  },
  {
    id: "soft-eraser",
    name: "Soft Eraser",
    kind: "erase",
    engine: "freehand",
    effect: "soft",
    hint: "Feathered eraser; pressure controls strength",
    defaults: { ...BASE, size: 60, opacity: 0.7, thinning: 0.2, smoothing: 0.6, streamline: 0.5, pressureOpacity: true },
  },
];

export const BRUSH_PRESETS = PRESETS.filter((p) => p.kind === "brush");
export const ERASER_PRESETS = PRESETS.filter((p) => p.kind === "erase");

export function presetById(id: string): BrushPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

// ---- per-preset settings (remembered per device) -------------------------------------

const STORE_KEY = "basalt:paint:brushes";

export function loadBrushSettings(): Record<string, BrushSettings> {
  const out: Record<string, BrushSettings> = {};
  let saved: Record<string, Partial<BrushSettings>> = {};
  try {
    saved = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? "{}") ?? {};
  } catch {
    saved = {};
  }
  for (const p of PRESETS) out[p.id] = { ...p.defaults, ...(saved[p.id] ?? {}) };
  return out;
}

export function saveBrushSettings(all: Record<string, BrushSettings>) {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // Storage full or blocked: settings simply won't persist.
  }
}

/** Snapshot the options a stroke needs to render identically everywhere. */
export function strokeOptions(preset: BrushPreset, s: BrushSettings): StrokeOptions {
  const o: StrokeOptions = {
    engine: preset.engine,
    effect: preset.effect,
    thinning: s.thinning,
    smoothing: s.smoothing,
    streamline: s.streamline,
    taperStart: s.taperStart,
    taperEnd: s.taperEnd,
    pressureSize: s.pressureSize,
    pressureOpacity: s.pressureOpacity,
    pressureCurve: s.pressureCurve,
  };
  if (preset.engine === "nib") {
    o.nibAngle = s.nibAngle;
    o.nibRatio = s.nibRatio;
  }
  if (preset.effect === "pencil" || preset.effect === "watercolor") o.seed = Math.floor(Math.random() * 1000);
  return o;
}

// ---- geometry -------------------------------------------------------------------------

export interface StrokeGeom {
  /** Main outline path (filled). Empty for images. */
  d: string;
  /** Shape fill path (under the outline). */
  fillD?: string;
  /** Untransformed bounds including effect spill. */
  box: Box;
  /** Extra padding for filter regions and pressure masks. */
  pad: number;
}

/** Effect spill (blur radius, displacement) in document pixels. */
export function effectPad(effect: BrushEffect | undefined, size: number): number {
  switch (effect) {
    case "airbrush":
      return size * 0.3 * 3;
    case "soft":
      return size * 0.22 * 3;
    case "watercolor":
      return size * 0.35 + size * 0.08 * 3;
    case "pencil":
      return 3;
    default:
      return 1;
  }
}

function curvePressure(p: number, curve: number | undefined): number {
  const c = curve && curve > 0 ? curve : 1;
  return Math.min(1, Math.max(0, p)) ** c;
}

function toTriples(s: Stroke): number[][] {
  const pts: number[][] = [];
  const p = s.points;
  const c = s.options.pressureCurve;
  for (let i = 0; i + 2 < p.length; i += 3) pts.push([p[i], p[i + 1], curvePressure(p[i + 2], c)]);
  return pts;
}

const avg = (a: number, b: number) => (a + b) / 2;

/** perfect-freehand outline → smooth closed SVG path. */
export function outlineToPath(points: number[][]): string {
  const len = points.length;
  if (len < 4) {
    if (len === 0) return "";
    let d = `M${round2(points[0][0])} ${round2(points[0][1])}`;
    for (let i = 1; i < len; i++) d += `L${round2(points[i][0])} ${round2(points[i][1])}`;
    return d + "Z";
  }
  let a = points[0];
  let b = points[1];
  const c = points[2];
  let d = `M${round2(a[0])} ${round2(a[1])}Q${round2(b[0])} ${round2(b[1])} ${round2(avg(b[0], c[0]))} ${round2(avg(b[1], c[1]))}T`;
  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    d += `${round2(avg(a[0], b[0]))} ${round2(avg(a[1], b[1]))} `;
  }
  return d + "Z";
}

function widthFactor(o: StrokeOptions, pressure: number): number {
  if (o.pressureSize === false) return 1;
  const t = o.thinning ?? 0.5;
  return Math.max(0.05, 1 - t * (1 - 2 * pressure));
}

function freehandOutline(s: Stroke, last: boolean): { d: string; box: Box } {
  const o = s.options;
  const outline = getStroke(toTriples(s), {
    size: s.size,
    thinning: o.pressureSize === false ? 0 : (o.thinning ?? 0.5),
    smoothing: o.smoothing ?? 0.5,
    streamline: o.streamline ?? 0.5,
    simulatePressure: false,
    start: { taper: o.taperStart ?? 0, cap: true },
    end: { taper: o.taperEnd ?? 0, cap: true },
    last,
  });
  const box = emptyBox();
  for (const [x, y] of outline) growBox(box, x, y);
  return { d: outlineToPath(outline), box };
}

/**
 * Calligraphy / chisel nib: sweep a thin rotated rectangle along the smoothed
 * path. Each consecutive pair of nib positions contributes its convex hull;
 * all hulls share one orientation so the nonzero fill rule unions them.
 */
function nibOutline(s: Stroke, last: boolean): { d: string; box: Box } {
  const o = s.options;
  const sp = getStrokePoints(toTriples(s), { size: s.size, streamline: o.streamline ?? 0.5, last });
  const box = emptyBox();
  if (!sp.length) return { d: "", box };
  const angle = ((o.nibAngle ?? 45) * Math.PI) / 180;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const ratio = o.nibRatio ?? 0.12;
  const total = sp[sp.length - 1].runningLength;
  const ease = (t: number) => t * (2 - t);
  const corners = (i: number): [number, number][] => {
    const p = sp[i];
    let k = widthFactor(o, p.pressure);
    const ts = o.taperStart ?? 0;
    const te = o.taperEnd ?? 0;
    if (ts > 0) k *= Math.max(0.08, ease(Math.min(1, p.runningLength / ts)));
    if (te > 0 && last) k *= Math.max(0.08, ease(Math.min(1, (total - p.runningLength) / te)));
    const L = (s.size * k) / 2;
    const T = Math.max(0.35, s.size * k * ratio) / 2;
    const [x, y] = p.point;
    return [
      [x + ux * L - uy * T, y + uy * L + ux * T],
      [x + ux * L + uy * T, y + uy * L - ux * T],
      [x - ux * L + uy * T, y - uy * L - ux * T],
      [x - ux * L - uy * T, y - uy * L + ux * T],
    ];
  };
  const parts: string[] = [];
  const emit = (hull: [number, number][]) => {
    let d = "";
    for (let i = 0; i < hull.length; i++) {
      const [x, y] = hull[i];
      growBox(box, x, y);
      d += `${i ? "L" : "M"}${round2(x)} ${round2(y)}`;
    }
    parts.push(d + "Z");
  };
  let prev = corners(0);
  if (sp.length === 1) emit(convexHull(prev));
  let lastPt = sp[0].point;
  for (let i = 1; i < sp.length; i++) {
    const pt = sp[i].point;
    // Merge sub-pixel steps to keep the path compact.
    if (i < sp.length - 1 && Math.hypot(pt[0] - lastPt[0], pt[1] - lastPt[1]) < 0.75) continue;
    const cur = corners(i);
    emit(convexHull(prev.concat(cur)));
    prev = cur;
    lastPt = pt;
  }
  return { d: parts.join(""), box };
}

export function strokeGeometry(s: Stroke, last = true): StrokeGeom {
  const o = s.options ?? {};
  if (s.kind === "image") {
    const x = s.x ?? 0;
    const y = s.y ?? 0;
    return { d: "", box: { x0: x, y0: y, x1: x + (s.w ?? 0), y1: y + (s.h ?? 0) }, pad: 0 };
  }
  if (s.kind === "fill") {
    const box = boxOfFlat(s.points, 3);
    return { d: polygonPath(s.points, 3, true), box, pad: 1 };
  }
  const pad = effectPad(o.effect, s.size);
  let d = "";
  let box = emptyBox();
  if (s.kind !== "shape" || o.outline !== false) {
    const r = o.engine === "nib" ? nibOutline(s, last) : freehandOutline(s, last);
    d = r.d;
    box = r.box;
  }
  let fillD: string | undefined;
  if (s.kind === "shape" && o.fill && o.closed) {
    fillD = polygonPath(s.points, 3, false);
    const fb = boxOfFlat(s.points, 3);
    growBox(box, fb.x0, fb.y0);
    growBox(box, fb.x1, fb.y1);
  }
  if (isEmptyBox(box)) {
    const pb = boxOfFlat(s.points, 3);
    box = isEmptyBox(pb) ? { x0: 0, y0: 0, x1: 0, y1: 0 } : padBox(pb, s.size / 2);
  }
  return { d, fillD, box: padBox(box, pad), pad };
}

/**
 * Centerline runs grouped by opacity level, used to build a luminance mask
 * that makes opacity follow pen pressure along a single filled outline.
 */
export function pressureRuns(s: Stroke, levels = 14): { level: number; d: string }[] {
  const o = s.options;
  const sp = getStrokePoints(toTriples(s), { size: s.size, streamline: o.streamline ?? 0.5, last: true });
  if (!sp.length) return [];
  const lvl = (p: number) => Math.round((0.12 + 0.88 * p) * levels) / levels;
  const runs: { level: number; d: string }[] = [];
  let cur = { level: lvl(sp[0].pressure), d: `M${round2(sp[0].point[0])} ${round2(sp[0].point[1])}` };
  let n = 0;
  for (let i = 1; i < sp.length; i++) {
    const [x, y] = sp[i].point;
    const l = lvl(sp[i].pressure);
    cur.d += `L${round2(x)} ${round2(y)}`;
    n++;
    if (l !== cur.level) {
      runs.push(cur);
      cur = { level: l, d: `M${round2(x)} ${round2(y)}` };
      n = 0;
    }
  }
  if (n > 0 || runs.length === 0) {
    if (n === 0) cur.d += `L${round2(sp[0].point[0] + 0.01)} ${round2(sp[0].point[1])}`;
    runs.push(cur);
  }
  return runs;
}

/** Cheap content key so unchanged geometry is never recomputed. */
export function geomKey(s: Stroke): string {
  let h = 2166136261;
  const p = s.points ?? [];
  for (let i = 0; i < p.length; i++) {
    h ^= Math.round(p[i] * 100);
    h = Math.imul(h, 16777619);
  }
  return `${s.kind}|${s.brush}|${s.size}|${p.length}|${h >>> 0}|${JSON.stringify(s.options ?? {})}|${s.src?.length ?? 0}|${s.x},${s.y},${s.w},${s.h}`;
}

/** A sample S-curve with a pressure swell, for preset previews. */
export function previewPoints(w: number, h: number): number[] {
  const out: number[] = [];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = w * 0.08 + t * w * 0.84;
    const y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.22;
    const p = Math.sin(t * Math.PI) * 0.85 + 0.1;
    out.push(round2(x), round2(y), round2(p));
  }
  return out;
}

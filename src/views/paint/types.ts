// Shared data shapes for the paint studio. Strokes and layers are plain JSON
// inside the page's Y containers (see shared/model.ts createPage "paint").

export type StrokeKind = "brush" | "erase" | "fill" | "shape" | "image";
export type BrushEngine = "freehand" | "nib";
export type BrushEffect = "none" | "pencil" | "airbrush" | "watercolor" | "pixel" | "soft";
export type ShapeKind = "line" | "rect" | "ellipse";
export type ShapeFill = "none" | "fg" | "bg";

/** Affine matrix [a, b, c, d, e, f] as in SVG `matrix(a b c d e f)`. */
export type Mat = [number, number, number, number, number, number];

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export interface StrokeOptions {
  engine?: BrushEngine;
  effect?: BrushEffect;
  thinning?: number;
  smoothing?: number;
  streamline?: number;
  /** Taper lengths in document pixels. */
  taperStart?: number;
  taperEnd?: number;
  pressureSize?: boolean;
  pressureOpacity?: boolean;
  /** Exponent applied to recorded pressure (1 = linear, <1 soft, >1 hard). */
  pressureCurve?: number;
  /** Nib engine: angle in degrees and thickness/width ratio. */
  nibAngle?: number;
  nibRatio?: number;
  /** Shape strokes. */
  shape?: ShapeKind;
  closed?: boolean;
  fill?: string | null;
  outline?: boolean;
  /** Seed for noise-based effects so every client renders the same grain. */
  seed?: number;
}

export interface Stroke {
  id: string;
  layerId: string;
  /** Order within the layer (higher = on top). */
  z: number;
  kind: StrokeKind;
  /** Brush preset id the stroke was made with. */
  brush: string;
  color: string;
  size: number;
  opacity: number;
  /** Flat [x, y, pressure, ...] in document pixels, rounded to 2 decimals. */
  points: number[];
  options: StrokeOptions;
  /** Per-stroke CSS mix-blend-mode (e.g. marker = multiply). */
  blend?: string;
  transform?: number[];
  author?: string;
  /** Image strokes. */
  src?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Erase strokes only affect strokes with z >= floor (set when layers are merged). */
  floor?: number;
  /** Painted with alpha lock on: clipped to the layer content below it. */
  clip?: boolean;
}

export interface LayerData {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: string;
  locked: boolean;
  alphaLock: boolean;
  /** On a canvas: paint this layer over the whiteboard shapes instead of under them. */
  over: boolean;
}

export interface PaintMeta {
  width: number;
  height: number;
  /** CSS color or "transparent". */
  background: string;
}

export const DEFAULT_META: PaintMeta = { width: 1920, height: 1080, background: "#ffffff" };

export type ToolId = "brush" | "eraser" | "line" | "rect" | "ellipse" | "lasso" | "eyedropper" | "move" | "pan";

export type SymmetryMode = "none" | "x" | "y" | "xy" | "radial" | "snowflake";
export interface Symmetry {
  mode: SymmetryMode;
  /** Number of copies for radial / snowflake. */
  count: number;
}

export interface BrushSettings {
  size: number;
  opacity: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  taperStart: number;
  taperEnd: number;
  pressureSize: boolean;
  pressureOpacity: boolean;
  pressureCurve: number;
  /** Krita-style lazy-string stabilizer distance in screen pixels (0 = off). */
  stabilizer: number;
  nibAngle: number;
  nibRatio: number;
  /** Pen tilt widens the stroke (pencil shading). */
  tilt: boolean;
}

export interface ViewState {
  /** Screen translation in CSS pixels relative to the viewport. */
  tx: number;
  ty: number;
  scale: number;
  /** Degrees. */
  rotation: number;
  mirror: boolean;
}

export interface HSVA {
  h: number;
  s: number;
  v: number;
  a: number;
}

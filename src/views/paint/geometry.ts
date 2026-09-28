// Pure geometry helpers: affine matrices, bounding boxes, polygons, shape
// sampling, symmetry copies and the lazy-string stabilizer (unit-tested).

import type { Mat, Symmetry } from "./types.ts";

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** m ∘ n: apply n first, then m. */
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return IDENTITY;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];

export const scaleAt = (sx: number, sy: number, cx: number, cy: number): Mat => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];

export function rotateAt(rad: number, cx: number, cy: number): Mat {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

export function toMat(t: number[] | undefined | null): Mat {
  return Array.isArray(t) && t.length === 6 && t.every((n) => typeof n === "number" && Number.isFinite(n)) ? (t.slice() as Mat) : IDENTITY;
}

export function isIdentity(m: Mat): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0;
}

/** Round for storage: linear part to 5 decimals, translation to 2. */
export function roundMat(m: Mat): number[] {
  const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
  return [r5(m[0]), r5(m[1]), r5(m[2]), r5(m[3]), round2(m[4]), round2(m[5])];
}

export function matString(m: Mat): string {
  return `matrix(${m.map((n) => +n.toFixed(5)).join(" ")})`;
}

// ---- bounding boxes ------------------------------------------------------------

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const emptyBox = (): Box => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });

export const isEmptyBox = (b: Box) => !(b.x1 >= b.x0 && b.y1 >= b.y0);

export function growBox(b: Box, x: number, y: number) {
  if (x < b.x0) b.x0 = x;
  if (y < b.y0) b.y0 = y;
  if (x > b.x1) b.x1 = x;
  if (y > b.y1) b.y1 = y;
}

export function padBox(b: Box, pad: number): Box {
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
}

export function boxOfFlat(points: ArrayLike<number>, stride: number): Box {
  const b = emptyBox();
  for (let i = 0; i + 1 < points.length; i += stride) growBox(b, points[i], points[i + 1]);
  return b;
}

export function transformBox(b: Box, m: Mat): Box {
  if (isEmptyBox(b)) return b;
  const out = emptyBox();
  for (const [x, y] of [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x1, b.y1],
    [b.x0, b.y1],
  ]) {
    const [tx, ty] = apply(m, x, y);
    growBox(out, tx, ty);
  }
  return out;
}

export function unionBox(a: Box, b: Box): Box {
  if (isEmptyBox(a)) return { ...b };
  if (isEmptyBox(b)) return { ...a };
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export function boxContains(b: Box, x: number, y: number, tol = 0): boolean {
  return x >= b.x0 - tol && x <= b.x1 + tol && y >= b.y0 - tol && y <= b.y1 + tol;
}

export function boxIntersects(a: Box, b: Box): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

// ---- polygons ------------------------------------------------------------------

/** Even-odd point-in-polygon for a flat [x, y, ...] polygon. */
export function pointInPolygon(x: number, y: number, poly: ArrayLike<number>): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Signed area (positive = counter-clockwise in a y-up system). */
export function polygonArea(poly: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return a / 2;
}

/** Andrew's monotone chain; returns hull with consistent orientation. */
export function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

const f2 = (n: number) => String(round2(n));

/** Closed polygon path, optionally smoothed with quadratic curves through midpoints. */
export function polygonPath(points: ArrayLike<number>, stride: number, smooth: boolean): string {
  const n = Math.floor(points.length / stride);
  if (n < 2) return "";
  const x = (i: number) => points[((i + n) % n) * stride];
  const y = (i: number) => points[((i + n) % n) * stride + 1];
  if (!smooth || n < 4) {
    let d = `M${f2(x(0))} ${f2(y(0))}`;
    for (let i = 1; i < n; i++) d += `L${f2(x(i))} ${f2(y(i))}`;
    return d + "Z";
  }
  let d = `M${f2((x(0) + x(1)) / 2)} ${f2((y(0) + y(1)) / 2)}`;
  for (let i = 1; i <= n; i++) {
    d += `Q${f2(x(i))} ${f2(y(i))} ${f2((x(i) + x(i + 1)) / 2)} ${f2((y(i) + y(i + 1)) / 2)}`;
  }
  return d + "Z";
}

// ---- shape sampling (flat [x, y, pressure]) ----------------------------------------

const SHAPE_PRESSURE = 0.5;

export function linePoints(x0: number, y0: number, x1: number, y1: number, spacing = 3): number[] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / spacing));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(round2(x0 + (x1 - x0) * t), round2(y0 + (y1 - y0) * t), SHAPE_PRESSURE);
  }
  return out;
}

export function rectPoints(x0: number, y0: number, x1: number, y1: number, spacing = 3): number[] {
  const corners: [number, number][] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  const out: number[] = [];
  for (let c = 0; c < 4; c++) {
    const seg = linePoints(corners[c][0], corners[c][1], corners[c + 1][0], corners[c + 1][1], spacing);
    out.push(...(c === 0 ? seg : seg.slice(3)));
  }
  // Overlap the start slightly so round caps merge into a seamless corner.
  out.push(...linePoints(x0, y0, x0 + Math.sign(x1 - x0 || 1) * Math.min(spacing, Math.abs(x1 - x0)), y0, spacing).slice(3));
  return out;
}

export function ellipsePoints(cx: number, cy: number, rx: number, ry: number, spacing = 3): number[] {
  const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const n = Math.min(720, Math.max(24, Math.ceil(perim / spacing)));
  const out: number[] = [];
  for (let i = 0; i <= n + 1; i++) {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push(round2(cx + Math.cos(t) * rx), round2(cy + Math.sin(t) * ry), SHAPE_PRESSURE);
  }
  return out;
}

/** Snap a line end to 15° increments around the start. */
export function snapAngle(x0: number, y0: number, x1: number, y1: number, stepDeg = 15): [number, number] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const step = (stepDeg * Math.PI) / 180;
  const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / step) * step;
  return [x0 + Math.cos(a) * len, y0 + Math.sin(a) * len];
}

// ---- symmetry -------------------------------------------------------------------

export interface SymCopy {
  m: Mat;
  /** Degrees of rotation, used to rotate nib angles. */
  rot: number;
  mirrorX: boolean;
  mirrorY: boolean;
}

export function symmetryCopies(sym: Symmetry, cx: number, cy: number): SymCopy[] {
  const id: SymCopy = { m: IDENTITY, rot: 0, mirrorX: false, mirrorY: false };
  const mx: Mat = [-1, 0, 0, 1, 2 * cx, 0];
  const my: Mat = [1, 0, 0, -1, 0, 2 * cy];
  const n = Math.max(2, Math.min(32, Math.round(sym.count) || 2));
  switch (sym.mode) {
    case "x":
      return [id, { m: mx, rot: 0, mirrorX: true, mirrorY: false }];
    case "y":
      return [id, { m: my, rot: 0, mirrorX: false, mirrorY: true }];
    case "xy":
      return [
        id,
        { m: mx, rot: 0, mirrorX: true, mirrorY: false },
        { m: my, rot: 0, mirrorX: false, mirrorY: true },
        { m: mul(mx, my), rot: 0, mirrorX: true, mirrorY: true },
      ];
    case "radial":
    case "snowflake": {
      const out: SymCopy[] = [];
      for (let k = 0; k < n; k++) {
        const deg = (360 / n) * k;
        const r = rotateAt((deg * Math.PI) / 180, cx, cy);
        out.push({ m: r, rot: deg, mirrorX: false, mirrorY: false });
        if (sym.mode === "snowflake") out.push({ m: mul(r, mx), rot: deg, mirrorX: true, mirrorY: false });
      }
      return out;
    }
    default:
      return [id];
  }
}

export function mapNibAngle(copy: SymCopy, deg: number): number {
  let t = deg;
  if (copy.mirrorX) t = 180 - t;
  if (copy.mirrorY) t = -t;
  t += copy.rot;
  return ((t % 360) + 360) % 360;
}

/** Transform flat [x, y, p] points by a matrix, rounding to 2 decimals. */
export function transformPoints(points: ArrayLike<number>, m: Mat): number[] {
  const out = new Array<number>(points.length);
  for (let i = 0; i + 2 < points.length; i += 3) {
    const [x, y] = apply(m, points[i], points[i + 1]);
    out[i] = round2(x);
    out[i + 1] = round2(y);
    out[i + 2] = points[i + 2];
  }
  return out;
}

// ---- input filtering ------------------------------------------------------------

/**
 * Krita's "lazy string" stabilizer: the brush trails the pointer on a string
 * of fixed length and only moves when the string is taut.
 */
export class LazyString {
  x = 0;
  y = 0;
  reset(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  /** Returns true when the brush moved. */
  update(px: number, py: number, radius: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy);
    if (radius <= 0) {
      this.x = px;
      this.y = py;
      return d > 0;
    }
    if (d <= radius) return false;
    const k = (d - radius) / d;
    this.x += dx * k;
    this.y += dy * k;
    return true;
  }
}

/** Drop points closer than minDist to the previous kept point (flat stride 3). */
export function decimate(points: ArrayLike<number>, minDist: number): number[] {
  const out: number[] = [];
  let lx = NaN;
  let ly = NaN;
  const n = points.length;
  for (let i = 0; i + 2 < n; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const last = i + 3 >= n;
    if (out.length === 0 || last || Math.hypot(x - lx, y - ly) >= minDist) {
      out.push(round2(x), round2(y), round2(points[i + 2]));
      lx = x;
      ly = y;
    }
  }
  return out;
}

/** Map pointer speed (screen px / ms) to a simulated pen pressure. */
export function speedToPressure(speed: number): number {
  return 0.28 + 0.52 * Math.exp(-speed / 0.9);
}

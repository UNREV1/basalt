// Color conversions for the HSV picker (pure; unit-tested).

import type { HSVA } from "./types.ts";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Parse #rgb, #rrggbb or #rrggbbaa. Returns null for anything else. */
export function parseHex(input: string): { rgb: RGB; a: number } | null {
  let s = input.trim().replace(/^#/, "");
  if (!/^[0-9a-f]+$/i.test(s)) return null;
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join("");
  if (s.length !== 6 && s.length !== 8) return null;
  const n = (i: number) => parseInt(s.slice(i, i + 2), 16);
  return { rgb: { r: n(0), g: n(2), b: n(4) }, a: s.length === 8 ? n(6) / 255 : 1 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHsv({ r, g, b }: RGB): { h: number; s: number; v: number } {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvaToHex(c: HSVA): string {
  return rgbToHex(hsvToRgb(c.h, c.s, c.v));
}

/** Convert a hex color to HSVA, keeping `prevHue` when the color is achromatic. */
export function hexToHsva(hex: string, prevHue = 0): HSVA | null {
  const p = parseHex(hex);
  if (!p) return null;
  const { h, s, v } = rgbToHsv(p.rgb);
  return { h: s === 0 || v === 0 ? prevHue : h, s, v, a: p.a };
}

export function rgbaString(hex: string, alpha: number): string {
  const p = parseHex(hex);
  if (!p) return hex;
  return `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, ${clamp01(alpha)})`;
}

/** Relative luminance (WCAG) for choosing readable overlay colors. */
export function luminance(hex: string): number {
  const p = parseHex(hex);
  if (!p) return 0;
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(p.rgb.r) + 0.7152 * f(p.rgb.g) + 0.0722 * f(p.rgb.b);
}

export const DEFAULT_PALETTE = [
  "#000000", "#3b3b3b", "#7a7a7a", "#b8b8b8", "#e6e6e6", "#ffffff",
  "#7f1d1d", "#dc2626", "#f97316", "#f59e0b", "#facc15", "#fde68a",
  "#14532d", "#16a34a", "#4ade80", "#0d9488", "#22d3ee", "#a5f3fc",
  "#1e3a8a", "#2563eb", "#60a5fa", "#6d28d9", "#a855f7", "#f0abfc",
  "#831843", "#db2777", "#f472b6", "#78350f", "#b45309", "#e7c9a9",
];

// Curated palettes for per-page customization. Pages store ids from these
// lists (or #rrggbb), so the look can be refined here without migrating data.

import type { CSSProperties } from "react";
import type { PageCover, PageStyle } from "../../../shared/model.ts";
import { FONT_STACKS, HEX_COLOR, accentTokens, mix } from "../../lib/appearance.ts";

export interface Swatch {
  id: string;
  name: string;
  css: string;
}

/** Soft, low-saturation gradients that sit well above both light and dark pages. */
export const COVER_GRADIENTS: Swatch[] = [
  { id: "dawn", name: "Dawn", css: "linear-gradient(135deg, #f6d5c1 0%, #ebbfcf 50%, #c9b8e4 100%)" },
  { id: "sea", name: "Sea", css: "linear-gradient(135deg, #b4dfe5 0%, #92b8dc 55%, #7d8fcf 100%)" },
  { id: "meadow", name: "Meadow", css: "linear-gradient(135deg, #e0edc9 0%, #aed3b1 50%, #7fb2a4 100%)" },
  { id: "sand", name: "Sand", css: "linear-gradient(135deg, #f5ead8 0%, #e6d2ae 55%, #d2b68e 100%)" },
  { id: "lilac", name: "Lilac", css: "linear-gradient(135deg, #f1e8f8 0%, #dbcaf0 50%, #b9a6e3 100%)" },
  { id: "mist", name: "Mist", css: "linear-gradient(135deg, #eef1f5 0%, #d3dbe6 55%, #b7c3d3 100%)" },
  { id: "peach", name: "Peach", css: "linear-gradient(135deg, #fde6d4 0%, #f8c7ae 50%, #eba491 100%)" },
  {
    id: "aurora",
    name: "Aurora",
    css: "radial-gradient(120% 160% at 0% 0%, #7fd1b9 0%, transparent 55%), radial-gradient(120% 160% at 100% 100%, #7b8fce 0%, transparent 60%), #2c3e57",
  },
  {
    id: "dusk",
    name: "Dusk",
    css: "linear-gradient(135deg, #2b3a67 0%, #5a4e8c 50%, #b06a9a 100%)",
  },
  {
    id: "ember",
    name: "Ember",
    css: "radial-gradient(120% 150% at 100% 0%, #e6a066 0%, transparent 55%), linear-gradient(135deg, #3a1f2b 0%, #8a3b3b 100%)",
  },
  { id: "forest", name: "Forest", css: "linear-gradient(135deg, #1f3b34 0%, #2f6152 50%, #6f9f7a 100%)" },
  { id: "graphite", name: "Graphite", css: "linear-gradient(135deg, #34383f 0%, #555c67 55%, #858c97 100%)" },
];

export const COVER_COLORS: Swatch[] = [
  { id: "stone", name: "Stone", css: "#dcd8d0" },
  { id: "sand", name: "Sand", css: "#eadcc2" },
  { id: "clay", name: "Clay", css: "#dbbba7" },
  { id: "rose", name: "Rose", css: "#e8c4ca" },
  { id: "lilac", name: "Lilac", css: "#d2c7e8" },
  { id: "sky", name: "Sky", css: "#bfd5ec" },
  { id: "sage", name: "Sage", css: "#c5d9c6" },
  { id: "olive", name: "Olive", css: "#9fa981" },
  { id: "slate", name: "Slate", css: "#5c6674" },
  { id: "ink", name: "Ink", css: "#2c323e" },
];

export function coverBackground(cover: PageCover): string | null {
  if (cover.type === "gradient") return COVER_GRADIENTS.find((g) => g.id === cover.value)?.css ?? COVER_GRADIENTS[0].css;
  if (cover.type === "color") {
    if (HEX_COLOR.test(cover.value)) return cover.value;
    return COVER_COLORS.find((c) => c.id === cover.value)?.css ?? COVER_COLORS[0].css;
  }
  return null;
}

export interface PageAccent {
  id: string;
  name: string;
  light: string;
  dark: string;
}

/** Page accents, each tuned separately for light and dark themes. */
export const PAGE_ACCENTS: PageAccent[] = [
  { id: "blue", name: "Blue", light: "#2f73d9", dark: "#5c9cf2" },
  { id: "teal", name: "Teal", light: "#0f8a80", dark: "#2fbfae" },
  { id: "green", name: "Green", light: "#3a8a4d", dark: "#62be76" },
  { id: "amber", name: "Amber", light: "#b7760b", dark: "#e3a53d" },
  { id: "orange", name: "Orange", light: "#d05a17", dark: "#f08b4c" },
  { id: "red", name: "Red", light: "#cf3f48", dark: "#f0717a" },
  { id: "pink", name: "Pink", light: "#bf3d80", dark: "#e472ad" },
  { id: "purple", name: "Purple", light: "#7a50c8", dark: "#a888ee" },
  { id: "graphite", name: "Graphite", light: "#4f5864", dark: "#a9b2bd" },
];

export interface PageTint {
  id: string;
  name: string;
  /** Hue mixed into the theme's own backgrounds, so tints follow any theme preset. */
  hue: string;
}

export const PAGE_TINTS: PageTint[] = [
  { id: "sand", name: "Sand", hue: "#c89b5a" },
  { id: "peach", name: "Peach", hue: "#e08a62" },
  { id: "rose", name: "Rose", hue: "#d0708f" },
  { id: "lavender", name: "Lavender", hue: "#8c7bd6" },
  { id: "sky", name: "Sky", hue: "#4f95d6" },
  { id: "mint", name: "Mint", hue: "#3fae9a" },
  { id: "sage", name: "Sage", hue: "#6f9e72" },
  { id: "slate", name: "Slate", hue: "#6e7c8e" },
];

export function accentColor(accent: string | undefined, dark: boolean): string | null {
  if (!accent) return null;
  if (HEX_COLOR.test(accent)) return accent;
  const a = PAGE_ACCENTS.find((p) => p.id === accent);
  return a ? (dark ? a.dark : a.light) : null;
}

/** Preview color of a tint swatch (the tint mixed over a neutral page). */
export function tintPreview(tint: PageTint, dark: boolean): string {
  return dark ? mix("#1c1c1c", tint.hue, 0.22) : mix("#ffffff", tint.hue, 0.2);
}

/**
 * CSS variables + data attributes for a page's scope element. Tints are
 * computed with color-mix against the inherited theme tokens (see
 * .page-scope rules in customize.css), accents are resolved per mode here.
 */
export function pageScopeProps(style: PageStyle, dark: boolean): { style: CSSProperties; data: Record<string, string | undefined> } {
  const vars: Record<string, string> = {};
  const accent = accentColor(style.accent, dark);
  if (accent) Object.assign(vars, accentTokens(accent, dark));
  const tint = PAGE_TINTS.find((t) => t.id === style.tint);
  if (tint) {
    vars["--tint"] = tint.hue;
    vars["--tint-amount"] = dark ? "9%" : "7%";
  }
  if (style.font && style.font !== "sans") vars["--page-font"] = FONT_STACKS[style.font];
  return {
    style: vars as CSSProperties,
    data: {
      "data-font": style.font && style.font !== "sans" ? style.font : undefined,
      "data-small": style.smallText ? "" : undefined,
      "data-spacing": style.lineSpacing && style.lineSpacing !== "normal" ? style.lineSpacing : undefined,
      "data-width": style.width,
      "data-accent": accent ? "" : undefined,
      "data-tint": tint ? tint.id : undefined,
      "data-hide-toc": style.hideToc ? "" : undefined,
      "data-locked": style.locked ? "" : undefined,
    },
  };
}

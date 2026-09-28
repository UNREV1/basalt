// Per-device appearance (Obsidian-style): theme presets, accent, fonts, size,
// density, sidebar width, motion and a custom CSS snippet.
//
// Everything is compiled into one <style id="basalt-appearance"> of CSS
// variables on <html>. The compiled CSS is cached in localStorage so the
// inline bootstrap in index.html can apply it before first paint.

import { syncTitleBar } from "./desktop.ts";
import type { Appearance, Settings, UiFont } from "./settings.ts";
import { setLiquidGlass } from "./liquidGlass.ts";

export const APPEARANCE_CACHE_KEY = "basalt:appearance";
const STYLE_ID = "basalt-appearance";
const CUSTOM_ID = "basalt-custom-css";

// ---- color helpers ----------------------------------------------------------------

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear blend of two #rrggbb colors; t=0 → a, t=1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}

export function alpha(color: string, a: number): string {
  const [r, g, b] = rgb(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function luminance(color: string): number {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `bg`. */
export function readableText(bg: string): string {
  return contrast(bg, "#ffffff") >= contrast(bg, "#18181b") ? "#ffffff" : "#18181b";
}

/** Accent token set derived from one base color, tuned per mode. */
export function accentTokens(base: string, dark: boolean): Record<string, string> {
  if (!dark) {
    // Very light picks get darkened so they stay visible on white.
    const a = luminance(base) > 0.5 ? mix(base, "#000000", 0.25) : base;
    return {
      "--accent": a,
      "--accent-hover": mix(a, "#000000", 0.12),
      "--accent-soft": alpha(a, 0.13),
      "--accent-text": readableText(a),
    };
  }
  const a = luminance(base) < 0.2 ? mix(base, "#ffffff", 0.22) : base;
  return {
    "--accent": a,
    "--accent-hover": mix(a, "#ffffff", 0.14),
    "--accent-soft": alpha(a, 0.2),
    "--accent-text": readableText(a),
  };
}

// ---- fonts, presets ---------------------------------------------------------------

/** System font stacks only — nothing is downloaded. */
export const FONT_STACKS: Record<UiFont, string> = {
  sans: `"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  serif: `ui-serif, "New York", "Iowan Old Style", "Apple Garamond", Baskerville, "Times New Roman", "Droid Serif", Times, "Source Serif Pro", serif`,
  mono: `ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace`,
  rounded: `ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, source-sans-pro, sans-serif`,
  // The device's own UI font: Segoe UI on Windows, San Francisco on iPhone and iPad.
  system: `"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif`,
};

export const FONT_LABELS: Record<UiFont, string> = { sans: "Sans", serif: "Serif", mono: "Mono", rounded: "Rounded", system: "System" };

type Tokens = Record<string, string>;

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  light?: Tokens;
  dark?: Tokens;
}

function tokens(t: {
  bg: string;
  soft: string;
  sunken: string;
  hover: string;
  active: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  strong: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentText?: string;
  dark: boolean;
}): Tokens {
  const shadowBase = t.dark ? "0, 0, 0" : "15, 15, 15";
  return {
    "--bg": t.bg,
    "--bg-soft": t.soft,
    "--bg-sunken": t.sunken,
    "--bg-hover": t.hover,
    "--bg-active": t.active,
    "--text": t.text,
    "--text-muted": t.muted,
    "--text-faint": t.faint,
    "--border": t.border,
    "--border-strong": t.strong,
    "--accent": t.accent,
    "--accent-hover": t.accentHover,
    "--accent-soft": t.accentSoft,
    "--accent-text": t.accentText ?? "#ffffff",
    "--shadow": t.dark
      ? `0 4px 16px rgba(${shadowBase}, 0.4), 0 1px 3px rgba(${shadowBase}, 0.3)`
      : `0 4px 16px rgba(${shadowBase}, 0.1), 0 1px 3px rgba(${shadowBase}, 0.06)`,
    "--shadow-lg": t.dark ? `0 16px 48px rgba(${shadowBase}, 0.55)` : `0 16px 48px rgba(${shadowBase}, 0.18)`,
    "color-scheme": t.dark ? "dark" : "light",
  };
}

/** Material tokens for Liquid Glass surfaces (see src/glass.css). */
function glassTokens(t: {
  fill: string;
  strong: string;
  sheet: string;
  lens: string;
  field: string;
  fieldEdge: string;
  edge: string;
  edgeSoft: string;
  hi: string;
  shade: string;
  shadow: string;
  solid: string;
  chrome: string;
  blur: string;
}): Tokens {
  return {
    "--glass-fill": t.fill,
    "--glass-fill-strong": t.strong,
    "--glass-sheet": t.sheet,
    "--glass-lens": t.lens,
    "--glass-field": t.field,
    "--glass-field-edge": t.fieldEdge,
    "--glass-edge": t.edge,
    "--glass-edge-soft": t.edgeSoft,
    "--glass-hi": t.hi,
    "--glass-shade": t.shade,
    "--glass-shadow": t.shadow,
    "--glass-solid": t.solid,
    "--glass-blur": t.blur,
    "--chrome": t.chrome,
  };
}

const GLASS_LIGHT: Tokens = {
  ...tokens({
    bg: "rgba(255, 255, 255, 0.66)", soft: "rgba(255, 255, 255, 0.42)", sunken: "rgba(118, 118, 140, 0.12)",
    hover: "rgba(30, 30, 60, 0.06)", active: "rgba(30, 30, 60, 0.1)",
    text: "#1d1d1f", muted: "#5b5b63", faint: "#8a8a93", border: "rgba(60, 60, 90, 0.12)", strong: "rgba(60, 60, 90, 0.2)",
    accent: "#007aff", accentHover: "#0066d6", accentSoft: "rgba(0, 122, 255, 0.14)", dark: false,
  }),
  ...glassTokens({
    fill: "rgba(255, 255, 255, 0.5)", strong: "rgba(255, 255, 255, 0.72)", sheet: "rgba(255, 255, 255, 0.76)",
    lens: "rgba(255, 255, 255, 0.78)", field: "rgba(255, 255, 255, 0.56)", fieldEdge: "rgba(60, 60, 90, 0.14)",
    edge: "rgba(255, 255, 255, 0.75)", edgeSoft: "rgba(255, 255, 255, 0.3)", hi: "rgba(255, 255, 255, 0.55)",
    shade: "rgba(20, 30, 70, 0.1)", shadow: "0 12px 40px rgba(20, 30, 70, 0.14), 0 2px 8px rgba(20, 30, 70, 0.06)",
    solid: "rgba(250, 250, 252, 0.94)", chrome: "#f2f2f7", blur: "blur(28px) saturate(180%)",
  }),
};

const GLASS_DARK: Tokens = {
  ...tokens({
    bg: "rgba(44, 44, 52, 0.6)", soft: "rgba(44, 44, 52, 0.36)", sunken: "rgba(0, 0, 0, 0.22)",
    hover: "rgba(255, 255, 255, 0.07)", active: "rgba(255, 255, 255, 0.12)",
    text: "#f5f5f7", muted: "#a1a1aa", faint: "#6e6e78", border: "rgba(255, 255, 255, 0.1)", strong: "rgba(255, 255, 255, 0.18)",
    accent: "#0a84ff", accentHover: "#3a9bff", accentSoft: "rgba(10, 132, 255, 0.24)", dark: true,
  }),
  ...glassTokens({
    fill: "rgba(42, 42, 50, 0.46)", strong: "rgba(34, 34, 40, 0.72)", sheet: "rgba(24, 24, 30, 0.68)",
    lens: "rgba(255, 255, 255, 0.13)", field: "rgba(0, 0, 0, 0.24)", fieldEdge: "rgba(255, 255, 255, 0.1)",
    edge: "rgba(255, 255, 255, 0.2)", edgeSoft: "rgba(255, 255, 255, 0.07)", hi: "rgba(255, 255, 255, 0.09)",
    shade: "rgba(0, 0, 0, 0.3)", shadow: "0 14px 44px rgba(0, 0, 0, 0.45), 0 2px 10px rgba(0, 0, 0, 0.3)",
    solid: "rgba(30, 30, 36, 0.95)", chrome: "#1c1c1e", blur: "blur(30px) saturate(170%)",
  }),
};

/** Same shapes and highlights, but opaque surfaces and no blur. */
const GLASS_SOLID_LIGHT: Tokens = {
  "--bg": "#ffffff", "--bg-soft": "#f2f2f7", "--bg-sunken": "#e9e9ef",
  "--glass-fill": "#f7f7fa", "--glass-fill-strong": "#ffffff", "--glass-sheet": "#fbfbfd", "--glass-lens": "#ffffff",
  "--glass-field": "#ffffff", "--glass-solid": "#fbfbfd", "--glass-blur": "none",
};
const GLASS_SOLID_DARK: Tokens = {
  "--bg": "#1c1c1e", "--bg-soft": "#232326", "--bg-sunken": "#111113",
  "--glass-fill": "#2a2a2e", "--glass-fill-strong": "#232326", "--glass-sheet": "#1a1a1d", "--glass-lens": "#3a3a3f",
  "--glass-field": "#141416", "--glass-solid": "#1c1c1e", "--glass-blur": "none",
};

/** Clearer materials while refraction is on (Chromium), so the lens shows. */
const GLASS_LENS_LIGHT: Tokens = {
  "--glass-fill": "rgba(255, 255, 255, 0.3)",
  "--glass-fill-strong": "rgba(255, 255, 255, 0.5)",
  "--glass-lens": "rgba(255, 255, 255, 0.6)",
};
const GLASS_LENS_DARK: Tokens = {
  "--glass-fill": "rgba(40, 40, 48, 0.3)",
  "--glass-fill-strong": "rgba(30, 30, 36, 0.52)",
  "--glass-lens": "rgba(255, 255, 255, 0.12)",
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
}

function glassIsSolid(a: Appearance): boolean {
  return a.reduceTransparency || prefersReducedTransparency();
}

export interface Wallpaper {
  id: string;
  name: string;
  light: string;
  dark: string;
}

const blobs = (stops: [string, string, string, string], base: string) =>
  [
    `radial-gradient(at 12% 16%, ${stops[0]} 0, transparent 46%)`,
    `radial-gradient(at 88% 10%, ${stops[1]} 0, transparent 44%)`,
    `radial-gradient(at 82% 88%, ${stops[2]} 0, transparent 48%)`,
    `radial-gradient(at 16% 92%, ${stops[3]} 0, transparent 46%)`,
    base,
  ].join(",");

/** Backdrops the glass floats over (light, dark). The first is the default. */
export const WALLPAPERS: Wallpaper[] = [
  {
    // Quiet enough to work on all day; the colorful ones are opt-in.
    id: "calm",
    name: "Calm",
    light: "linear-gradient(180deg, #f6f6f8, #eeeef1)",
    dark: "linear-gradient(180deg, #17171a, #101012)",
  },
  {
    id: "aurora",
    name: "Aurora",
    light: blobs(["#a5b4fc", "#f9a8d4", "#67e8f9", "#c4b5fd"], "linear-gradient(135deg, #eef2ff, #fdf2f8 50%, #ecfeff)"),
    dark: blobs(["#3730a3", "#9d174d", "#0e7490", "#5b21b6"], "linear-gradient(135deg, #0b1020, #140b1f 50%, #06161c)"),
  },
  {
    id: "sunrise",
    name: "Sunrise",
    light: blobs(["#fdba74", "#f9a8d4", "#fde68a", "#fca5a5"], "linear-gradient(135deg, #fff7ed, #fdf2f8 55%, #fefce8)"),
    dark: blobs(["#9a3412", "#9d174d", "#854d0e", "#7f1d1d"], "linear-gradient(135deg, #1c0f0a, #1f0b16 55%, #1a1405)"),
  },
  {
    id: "ocean",
    name: "Ocean",
    light: blobs(["#93c5fd", "#5eead4", "#7dd3fc", "#a5b4fc"], "linear-gradient(135deg, #eff6ff, #f0fdfa 50%, #eef2ff)"),
    dark: blobs(["#1e3a8a", "#115e59", "#075985", "#312e81"], "linear-gradient(135deg, #070d1f, #041714 50%, #0a0c24)"),
  },
  {
    id: "meadow",
    name: "Meadow",
    light: blobs(["#86efac", "#bef264", "#5eead4", "#fde68a"], "linear-gradient(135deg, #f0fdf4, #f7fee7 50%, #f0fdfa)"),
    dark: blobs(["#166534", "#3f6212", "#115e59", "#713f12"], "linear-gradient(135deg, #04140a, #0d1505 50%, #03140f)"),
  },
  {
    id: "graphite",
    name: "Graphite",
    light: blobs(["#d4d4d8", "#e4e4e7", "#cbd5e1", "#e2e8f0"], "linear-gradient(135deg, #f4f4f5, #fafafa 50%, #f1f5f9)"),
    dark: blobs(["#3f3f46", "#27272a", "#334155", "#1e293b"], "linear-gradient(135deg, #09090b, #111113 50%, #0b1120)"),
  },
];

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "glass",
    name: "Liquid Glass",
    description: "Translucent, luminous glass over a calm backdrop",
    light: GLASS_LIGHT,
    dark: GLASS_DARK,
  },
  {
    id: "default",
    name: "Basalt",
    description: "Calm neutral grays",
    light: tokens({
      bg: "#ffffff", soft: "#f7f7f5", sunken: "#f1f1ef", hover: "rgba(55, 53, 47, 0.07)", active: "rgba(55, 53, 47, 0.12)",
      text: "#2b2a27", muted: "#787774", faint: "#a5a4a0", border: "#e6e5e2", strong: "#d3d2ce",
      accent: "#5b5bd6", accentHover: "#4f4fc4", accentSoft: "rgba(91, 91, 214, 0.12)", dark: false,
    }),
    dark: tokens({
      bg: "#191919", soft: "#202020", sunken: "#151515", hover: "rgba(255, 255, 255, 0.06)", active: "rgba(255, 255, 255, 0.1)",
      text: "#e9e9e7", muted: "#9b9a97", faint: "#6b6a67", border: "#2e2e2e", strong: "#3d3d3d",
      accent: "#7c7cf0", accentHover: "#8f8ff5", accentSoft: "rgba(124, 124, 240, 0.18)", dark: true,
    }),
  },
  {
    id: "fluent",
    name: "Windows 11",
    description: "Layered surfaces and Windows blue, like the apps that come with Windows",
    light: tokens({
      bg: "#fbfbfb", soft: "#f3f3f3", sunken: "#ebebeb", hover: "rgba(0, 0, 0, 0.045)", active: "rgba(0, 0, 0, 0.08)",
      text: "#1b1b1b", muted: "#5d5d5d", faint: "#8a8a8a", border: "#e5e5e5", strong: "#d1d1d1",
      accent: "#005fb8", accentHover: "#1a6fc2", accentSoft: "rgba(0, 95, 184, 0.1)", dark: false,
    }),
    dark: tokens({
      bg: "#272727", soft: "#202020", sunken: "#1c1c1c", hover: "rgba(255, 255, 255, 0.06)", active: "rgba(255, 255, 255, 0.1)",
      text: "#ffffff", muted: "#c5c5c5", faint: "#8b8b8b", border: "#333333", strong: "#454545",
      accent: "#60cdff", accentHover: "#7dd7ff", accentSoft: "rgba(96, 205, 255, 0.16)", accentText: "#000000", dark: true,
    }),
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Dark graphite with a violet accent, dense like a code editor",
    dark: tokens({
      bg: "#1e1e1e", soft: "#262626", sunken: "#1a1a1a", hover: "rgba(255, 255, 255, 0.06)", active: "rgba(255, 255, 255, 0.1)",
      text: "#dcddde", muted: "#999999", faint: "#666666", border: "#303030", strong: "#3f3f3f",
      accent: "#8a70f5", accentHover: "#9d87f7", accentSoft: "rgba(138, 112, 245, 0.2)", dark: true,
    }),
  },
  {
    id: "paper",
    name: "Paper",
    description: "Warm sepia, easy on the eyes",
    light: tokens({
      bg: "#fbf7ef", soft: "#f4eee2", sunken: "#ede5d6", hover: "rgba(94, 72, 40, 0.07)", active: "rgba(94, 72, 40, 0.12)",
      text: "#3b3228", muted: "#7a6d5f", faint: "#a89c8c", border: "#e8dfcf", strong: "#d8ccb6",
      accent: "#b0623a", accentHover: "#99522f", accentSoft: "rgba(176, 98, 58, 0.13)", dark: false,
    }),
    dark: tokens({
      bg: "#1f1b16", soft: "#26211b", sunken: "#1a1612", hover: "rgba(255, 240, 220, 0.06)", active: "rgba(255, 240, 220, 0.1)",
      text: "#ece3d4", muted: "#a89c8b", faint: "#756b5e", border: "#342d25", strong: "#453c32",
      accent: "#d9895f", accentHover: "#e39c76", accentSoft: "rgba(217, 137, 95, 0.18)", accentText: "#1f1b16", dark: true,
    }),
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic, north-bluish",
    light: tokens({
      bg: "#eceff4", soft: "#e5e9f0", sunken: "#dde2ea", hover: "rgba(46, 52, 64, 0.06)", active: "rgba(46, 52, 64, 0.1)",
      text: "#2e3440", muted: "#4c566a", faint: "#7b8394", border: "#d8dee9", strong: "#c2cad8",
      accent: "#5e81ac", accentHover: "#50739d", accentSoft: "rgba(94, 129, 172, 0.15)", dark: false,
    }),
    dark: tokens({
      bg: "#2e3440", soft: "#333a47", sunken: "#292e39", hover: "rgba(236, 239, 244, 0.06)", active: "rgba(236, 239, 244, 0.1)",
      text: "#eceff4", muted: "#a7b1c2", faint: "#6f798c", border: "#3b4252", strong: "#4c566a",
      accent: "#88c0d0", accentHover: "#9fcddb", accentSoft: "rgba(136, 192, 208, 0.18)", accentText: "#2e3440", dark: true,
    }),
  },
  {
    id: "solarized",
    name: "Solarized",
    description: "Ethan Schoonover’s classic",
    light: tokens({
      bg: "#fdf6e3", soft: "#f5eedb", sunken: "#eee8d5", hover: "rgba(88, 110, 117, 0.08)", active: "rgba(88, 110, 117, 0.14)",
      text: "#44585f", muted: "#6c7f85", faint: "#93a1a1", border: "#e9e1ca", strong: "#d9cfb4",
      accent: "#268bd2", accentHover: "#1f77b5", accentSoft: "rgba(38, 139, 210, 0.13)", dark: false,
    }),
    dark: tokens({
      bg: "#002b36", soft: "#04313d", sunken: "#00232c", hover: "rgba(147, 161, 161, 0.08)", active: "rgba(147, 161, 161, 0.14)",
      text: "#c5d0d0", muted: "#8a9b9d", faint: "#5b737a", border: "#0b3c48", strong: "#1a4d59",
      accent: "#4aa3e0", accentHover: "#62b0e5", accentSoft: "rgba(38, 139, 210, 0.22)", accentText: "#002b36", dark: true,
    }),
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "True black for OLED screens",
    dark: tokens({
      bg: "#000000", soft: "#0b0b0c", sunken: "#000000", hover: "rgba(255, 255, 255, 0.07)", active: "rgba(255, 255, 255, 0.12)",
      text: "#e6e6e6", muted: "#8e8e93", faint: "#5a5a5e", border: "#1c1c1e", strong: "#2c2c2e",
      accent: "#8b8bf5", accentHover: "#a1a1f8", accentSoft: "rgba(139, 139, 245, 0.2)", accentText: "#000000", dark: true,
    }),
  },
  {
    id: "contrast",
    name: "High contrast",
    description: "Maximum legibility",
    light: tokens({
      bg: "#ffffff", soft: "#f2f2f2", sunken: "#e8e8e8", hover: "rgba(0, 0, 0, 0.08)", active: "rgba(0, 0, 0, 0.15)",
      text: "#000000", muted: "#2e2e2e", faint: "#565656", border: "#8a8a8a", strong: "#4a4a4a",
      accent: "#0037c1", accentHover: "#002a94", accentSoft: "rgba(0, 55, 193, 0.14)", dark: false,
    }),
    dark: tokens({
      bg: "#000000", soft: "#0e0e0e", sunken: "#000000", hover: "rgba(255, 255, 255, 0.12)", active: "rgba(255, 255, 255, 0.2)",
      text: "#ffffff", muted: "#dadada", faint: "#a8a8a8", border: "#7a7a7a", strong: "#b8b8b8",
      accent: "#8ab4ff", accentHover: "#abc9ff", accentSoft: "rgba(138, 180, 255, 0.24)", accentText: "#000000", dark: true,
    }),
  },
];

export function getPreset(id: string): ThemePreset {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

/** "light"/"dark" when a preset only exists in one mode, else null. */
export function presetOnly(id: string): "light" | "dark" | null {
  const p = getPreset(id);
  if (p.light && p.dark) return null;
  return p.dark ? "dark" : "light";
}

export function resolveDark(theme: Settings["theme"], presetId: string): boolean {
  const only = presetOnly(presetId);
  if (only) return only === "dark";
  return theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}

/** Preset swatches offered for the device accent (the preset's own accent is the default). */
export const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: "Indigo", color: "#5b5bd6" },
  { name: "Blue", color: "#2f7de1" },
  { name: "Cyan", color: "#0894b3" },
  { name: "Teal", color: "#12a594" },
  { name: "Green", color: "#30a46c" },
  { name: "Amber", color: "#d98c00" },
  { name: "Orange", color: "#f06c1d" },
  { name: "Red", color: "#e5484d" },
  { name: "Pink", color: "#d6409f" },
  { name: "Purple", color: "#8e4ec6" },
  { name: "Graphite", color: "#5f6874" },
];

/** Sidebar navigation entries that can be hidden per device. */
export const SIDEBAR_NAV: { id: string; label: string; icon: string }[] = [
  { id: "assistant", label: "Assistant", icon: "sparkle" },
  { id: "skills", label: "Skill tree", icon: "tree" },
  { id: "learn", label: "Flashcards", icon: "cards" },
  // Under "More":
  { id: "graph", label: "Graph", icon: "graph" },
  { id: "types", label: "Types", icon: "types" },
  { id: "memory", label: "Claude memory", icon: "brain" },
];

/** Favorites in the user's saved order; new favorites go to the end. */
export function orderFavorites(ids: string[], order: string[]): string[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return ids
    .map((id, i) => ({ id, r: rank.get(id) ?? order.length + i }))
    .sort((x, y) => x.r - y.r)
    .map((x) => x.id);
}

export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;
export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 18;

// ---- compile ------------------------------------------------------------------------

function block(selector: string, vars: Tokens): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return body ? `${selector}{${body}}` : "";
}

const LIGHT = "html:root";
const DARK = `html:root[data-theme="dark"]`;

/**
 * CSS for an Appearance. `html:root` outranks the `:root` / `[data-theme]`
 * defaults in styles.css regardless of stylesheet order.
 */
/** OS-level "reduce transparency" (Safari/Chromium support varies). */
export function prefersReducedTransparency(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-transparency: reduce)").matches;
}

function cssUrl(dataUrl: string): string {
  return `url("${dataUrl.replace(/["\\\n]/g, "")}")`;
}

export function appearanceCss(a: Appearance): { css: string; only: "light" | "dark" | null; glass: boolean } {
  const preset = getPreset(a.preset);
  const only = presetOnly(preset.id);
  const glass = preset.id === "glass";
  const out: string[] = [];
  if (preset.id !== "default") {
    const light = preset.light ?? preset.dark!;
    const dark = preset.dark ?? preset.light!;
    out.push(block(LIGHT, light), block(DARK, dark));
  }
  if (glass) {
    if (glassIsSolid(a)) {
      out.push(block(LIGHT, GLASS_SOLID_LIGHT), block(DARK, GLASS_SOLID_DARK));
    } else {
      const blur = { "--glass-blur": `blur(${Math.round((clamp01(a.frost) * 40) / 100)}px) saturate(180%)` };
      out.push(block(LIGHT, blur), block(DARK, blur));
      // With real refraction (see liquidGlass.ts) clearer glass shows the lensing.
      if (a.refraction > 0) out.push(block(`${LIGHT}[data-lens]`, GLASS_LENS_LIGHT), block(`${DARK}[data-lens]`, GLASS_LENS_DARK));
    }
    const wp = WALLPAPERS.find((w) => w.id === a.wallpaper) ?? WALLPAPERS[0];
    if (a.wallpaper === "image" && a.wallpaperImage.startsWith("data:image/")) {
      const img = `${cssUrl(a.wallpaperImage)} center / cover no-repeat`;
      out.push(block(LIGHT, { "--wallpaper": img }), block(DARK, { "--wallpaper": `linear-gradient(rgba(0,0,0,.28), rgba(0,0,0,.28)), ${img}` }));
    } else {
      out.push(block(LIGHT, { "--wallpaper": wp.light }), block(DARK, { "--wallpaper": wp.dark }));
    }
  }
  if (HEX_COLOR.test(a.accent)) {
    out.push(block(LIGHT, accentTokens(a.accent, only === "dark")), block(DARK, accentTokens(a.accent, only !== "light")));
  }
  const vars: Tokens = {};
  if (a.uiFont !== "sans" && FONT_STACKS[a.uiFont]) vars["--font"] = FONT_STACKS[a.uiFont];
  const size = Math.round(Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, a.fontSize || 14)));
  if (size !== 14) vars["--font-size"] = `${size}px`;
  if (a.density === "compact") {
    vars["--row-h"] = "26px";
    vars["--density-gap"] = "0.7";
  }
  const w = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, a.sidebarWidth || 260)));
  if (w !== 260) vars["--sidebar-w"] = `${w}px`;
  out.push(block(LIGHT, vars));
  if (a.reduceMotion) {
    out.push(
      "*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}",
    );
  }
  return { css: out.filter(Boolean).join("\n"), only, glass };
}

function ensureStyle(id: string): HTMLStyleElement {
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

let headObserver: MutationObserver | null = null;

/** Keep the user's snippet last in <head> so it wins over lazily loaded view CSS. */
function keepCustomCssLast() {
  if (headObserver) return;
  headObserver = new MutationObserver(() => {
    const el = document.getElementById(CUSTOM_ID);
    if (el && el.parentNode === document.head && document.head.lastElementChild !== el) document.head.appendChild(el);
  });
  headObserver.observe(document.head, { childList: true });
}

/** Apply settings to the document and refresh the first-paint cache. */
export function applyAppearance(settings: Settings) {
  const a = settings.appearance;
  const { css, only, glass } = appearanceCss(a);
  const el = ensureStyle(STYLE_ID);
  if (el.textContent !== css) el.textContent = css;
  const root = document.documentElement;
  root.dataset.theme = resolveDark(settings.theme, a.preset) ? "dark" : "light";
  root.dataset.density = a.density;
  if (glass) root.dataset.glass = "";
  else delete root.dataset.glass;
  root.dataset.corners = a.corners;
  setLiquidGlass(
    glass && !glassIsSolid(a) && a.refraction > 0
      ? { refraction: clamp01(a.refraction), frost: clamp01(a.frost), dark: root.dataset.theme === "dark" }
      : null,
  );

  const custom = a.customCssEnabled ? a.customCss : "";
  const existing = document.getElementById(CUSTOM_ID);
  if (custom.trim()) {
    const style = ensureStyle(CUSTOM_ID);
    if (style.textContent !== custom) style.textContent = custom;
    if (document.head.lastElementChild !== style) document.head.appendChild(style);
    keepCustomCssLast();
  } else existing?.remove();

  try {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify({ css, only, glass, density: a.density, corners: a.corners }));
  } catch {
    // Storage full or blocked: the app still applies it at startup, just after first paint.
  }

  syncTitleBar();

  // Browser chrome (PWA title bar, mobile status bar) follows the page background.
  const style = getComputedStyle(root);
  const bg = (style.getPropertyValue("--chrome") || style.getPropertyValue("--bg")).trim();
  if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
}

// Color palettes: one small, matching set of colors for the whole app. A
// palette colors the six abilities (and everything in them: the skill map,
// courses, the character sheet), the spare colors for abilities you add, and
// buttons and links, in light and dark mode.
//
// Workspaces store the classic color an ability stands for (AREA_PALETTE in
// skills.ts: the Vivid palette), and each device shows it in its own palette,
// so switching palettes recolors everything without changing any notes.

export interface ColorPair {
  light: string;
  dark: string;
}

export interface Palette {
  id: string;
  name: string;
  description: string;
  /** One per color slot, in SLOT_NAMES order. */
  colors: ColorPair[];
  /** Buttons, links and selection; none keeps the theme's own accent. */
  accent?: ColorPair;
}

/** The color slots, in the order the abilities and the color pickers use them. */
export const SLOT_NAMES = ["Red", "Blue", "Bronze", "Pink", "Gold", "Violet", "Orange", "Aqua", "Green"];

const pairs = (list: [string, string][]): ColorPair[] => list.map(([light, dark]) => ({ light, dark }));

/**
 * Every palette's colors share one lightness and saturation (worked out in
 * OKLCH), so no ability shouts over another; the light steps stay readable on
 * white and the dark steps on near-black.
 */
export const PALETTES: Palette[] = [
  {
    id: "simple",
    name: "Simple",
    description: "Calm, muted colors that sit together quietly. The default.",
    colors: pairs([
      ["#b4685e", "#e39287"],
      ["#517dae", "#7ba8dc"],
      ["#9f7754", "#cba17d"],
      ["#af6f8e", "#dd9ab9"],
      ["#a8873e", "#d5b36a"],
      ["#766aa5", "#9f94d2"],
      ["#b7734f", "#e69e79"],
      ["#3f9086", "#6cbcb1"],
      ["#618d62", "#8bb98c"],
    ]),
    accent: { light: "#4273b0", dark: "#6b9ede" },
  },
  {
    id: "soft",
    name: "Soft",
    description: "Light pastels, gentle on the eyes.",
    colors: pairs([
      ["#c2827c", "#eaa7a1"],
      ["#6e93b9", "#93b8e0"],
      ["#af8e6e", "#d6b393"],
      ["#c287a2", "#eaacc8"],
      ["#baa269", "#dac288"],
      ["#9287b6", "#b7acdd"],
      ["#c48d6e", "#ecb293"],
      ["#6ca5a0", "#91cbc6"],
      ["#7ba082", "#a0c6a7"],
    ]),
    accent: { light: "#6b7db6", dark: "#95a8e4" },
  },
  {
    id: "earth",
    name: "Earth",
    description: "Terracotta, sage, ochre and slate.",
    colors: pairs([
      ["#aa5b43", "#d9856b"],
      ["#4b6d8a", "#7fa3c2"],
      ["#926b49", "#be9571"],
      ["#ac7579", "#da9fa3"],
      ["#b18c45", "#d1ab64"],
      ["#7a5476", "#b189ad"],
      ["#b76935", "#e69461"],
      ["#5d8c77", "#87b7a1"],
      ["#677e49", "#90a872"],
    ]),
    accent: { light: "#a3563b", dark: "#d28063" },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Sea blues and greens, with coral and sand.",
    colors: pairs([
      ["#c67164", "#f69c8d"],
      ["#39659b", "#73a1dc"],
      ["#9e805e", "#caab88"],
      ["#4b90ab", "#7dc3de"],
      ["#ac9566", "#d3bb8a"],
      ["#7972a7", "#a39cd4"],
      ["#b77d56", "#e5a880"],
      ["#499688", "#75c2b3"],
      ["#578f6b", "#82ba95"],
    ]),
    accent: { light: "#167c8f", dark: "#4da6bb" },
  },
  {
    id: "mono",
    name: "Mono",
    description: "One color: graphite everywhere, and ink-dark buttons.",
    colors: pairs(SLOT_NAMES.map(() => ["#6a727d", "#a6afbb"])),
    accent: { light: "#2e333b", dark: "#d8dfe8" },
  },
  {
    id: "vivid",
    name: "Vivid",
    description: "Bright, saturated colors, with the theme's own accent.",
    colors: pairs([
      ["#e34948", "#e66767"],
      ["#2a78d6", "#3987e5"],
      ["#a0652a", "#b0743a"],
      ["#e87ba4", "#d55181"],
      ["#eda100", "#c98500"],
      ["#4a3aa7", "#9085e9"],
      ["#eb6834", "#d95926"],
      ["#1baf7a", "#1a9aa8"],
      ["#008300", "#008300"],
    ]),
  },
];

export const DEFAULT_PALETTE = "simple";

/** The classic colors: what workspaces store (see AREA_PALETTE). */
export const CLASSIC = PALETTES.find((p) => p.id === "vivid")!;

export function getPalette(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === DEFAULT_PALETTE)!;
}

let active = getPalette(DEFAULT_PALETTE);

/** This device's palette (set from its appearance settings). */
export function activePalette(): Palette {
  return active;
}

export function setActivePalette(id: string | undefined) {
  active = getPalette(id);
}

/**
 * A stored color in a palette and mode: a classic color becomes the palette's
 * color for its slot; any other color stays as it is.
 */
export function paletteColor(hex: string, dark: boolean, palette: Palette = active): string {
  const lower = hex.toLowerCase();
  const slot = CLASSIC.colors.findIndex((c) => c.light === lower);
  if (slot < 0) return hex;
  const c = palette.colors[slot];
  return dark ? c.dark : c.light;
}

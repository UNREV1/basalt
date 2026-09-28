// Designs: complete looks picked from a gallery (Settings → Appearance).
// Each one sets the theme, backdrop, font, density and corners together;
// anything you then change by hand is kept until you pick another design.

import type { Appearance, Settings } from "./settings.ts";

export interface Design {
  id: string;
  name: string;
  tagline: string;
  /** Only for designs that need one mode (single-mode themes force it anyway). */
  theme?: Settings["theme"];
  appearance: Partial<Appearance>;
}

/** Everything a design decides, so switching designs never leaves bits of the last one. */
const BASE: Partial<Appearance> = {
  accent: "",
  uiFont: "sans",
  density: "comfortable",
  corners: "subtle",
  reduceTransparency: false,
};

const design = (id: string, name: string, tagline: string, appearance: Partial<Appearance>, theme?: Settings["theme"]): Design => ({
  id,
  name,
  tagline,
  theme,
  appearance: { ...BASE, ...appearance },
});

export const DESIGNS: Design[] = [
  design("calm", "Calm", "Quiet glass over soft gray. The default.", {
    preset: "glass",
    wallpaper: "calm",
    refraction: 60,
    frost: 40,
  }),
  design("windows", "Windows 11", "Layered surfaces, Segoe UI and Windows blue. At home on your PC.", {
    preset: "fluent",
    uiFont: "system",
  }),
  design("clean", "Clean", "White pages and a gray sidebar. Nothing between you and your words.", {
    preset: "default",
  }),
  design("graphite", "Graphite", "Dark and dense with a violet accent, like a code editor.", {
    preset: "graphite",
    density: "compact",
  }),
  design("glass", "Liquid Glass", "Colorful glass that bends the light, like iPadOS.", {
    preset: "glass",
    wallpaper: "aurora",
    refraction: 70,
    frost: 30,
    corners: "round",
    uiFont: "system",
  }),
  design("journal", "Journal", "Warm paper and serif type, made for long writing.", {
    preset: "paper",
    uiFont: "serif",
  }),
  design("nord", "Nord", "Cool arctic blues, gentle on the eyes all day.", {
    preset: "nord",
    uiFont: "rounded",
  }),
  design("midnight", "Midnight", "True black. Saves battery on iPhone OLED screens.", {
    preset: "midnight",
    uiFont: "system",
  }),
  design("contrast", "High contrast", "Maximum legibility, strong borders.", {
    preset: "contrast",
  }),
];

/** Whether the current settings are exactly this design (nothing changed by hand). */
export function designMatches(d: Design, s: Settings): boolean {
  if (d.theme && d.theme !== s.theme) return false;
  const a = s.appearance as unknown as Record<string, unknown>;
  return Object.entries(d.appearance).every(([k, v]) => a[k] === v);
}

/** The design the settings came from, even if tuned since (same theme preset and backdrop). */
export function closestDesign(s: Settings): Design | undefined {
  return (
    DESIGNS.find((d) => designMatches(d, s)) ??
    DESIGNS.find(
      (d) => d.appearance.preset === s.appearance.preset && (d.appearance.preset !== "glass" || d.appearance.wallpaper === s.appearance.wallpaper),
    )
  );
}

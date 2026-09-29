import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSIC, DEFAULT_PALETTE, PALETTES, SLOT_NAMES, activePalette, getPalette, paletteColor, setActivePalette } from "../shared/palette.ts";
import { AREA_PALETTE, DEFAULT_AREAS, themedColor } from "../shared/skills.ts";

const lum = (hex: string) =>
  [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("palettes: a color for every slot, in both modes, readable on light and dark", () => {
  assert.equal(DEFAULT_PALETTE, "simple");
  assert.equal(new Set(PALETTES.map((p) => p.id)).size, PALETTES.length);
  for (const p of PALETTES) {
    assert.equal(p.colors.length, SLOT_NAMES.length, p.id);
    for (const c of [...p.colors, ...(p.accent ? [p.accent] : [])]) {
      assert.match(c.light, /^#[0-9a-f]{6}$/, p.id);
      assert.match(c.dark, /^#[0-9a-f]{6}$/, p.id);
      if (p.id === "vivid") continue; // the classic colors, as they always were
      assert.ok(contrast(c.light, "#ffffff") >= 2.4, `${p.id} ${c.light} shows on white`);
      assert.ok(contrast(c.dark, "#1c1c1e") >= 4.5, `${p.id} ${c.dark} shows on dark`);
    }
    // The six abilities tell apart, except in the one-color palette.
    const six = new Set(DEFAULT_AREAS.map((a) => paletteColor(a.color, false, p)));
    assert.equal(six.size, p.id === "mono" ? 1 : 6, p.id);
  }
  // Workspaces keep storing the classic colors.
  assert.deepEqual(
    AREA_PALETTE.map((c) => c.light),
    CLASSIC.colors.map((c) => c.light),
  );
});

test("palettes: stored colors show in this device's palette; other colors stay as they are", () => {
  const str = DEFAULT_AREAS.find((a) => a.id === "str")!.color;
  try {
    setActivePalette("earth");
    assert.equal(activePalette().id, "earth");
    assert.equal(themedColor(str, false), getPalette("earth").colors[0].light);
    assert.equal(themedColor(str.toUpperCase(), true), getPalette("earth").colors[0].dark);
    assert.equal(themedColor("#123456", true), "#123456");
    setActivePalette("vivid");
    assert.equal(themedColor(str, false), str);
    // An unknown palette falls back to the default.
    setActivePalette("nope");
    assert.equal(activePalette().id, DEFAULT_PALETTE);
    // Any palette can be asked directly (the picker's previews).
    assert.equal(themedColor(str, false, getPalette("ocean")), getPalette("ocean").colors[0].light);
  } finally {
    setActivePalette(DEFAULT_PALETTE);
  }
});

// Pure-logic tests for the paint studio: color math, geometry, symmetry,
// the erase/alpha-lock render tree, brush geometry and layer operations.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { hexToHsva, hsvToRgb, parseHex, rgbToHex, rgbToHsv } from "../src/views/paint/color.ts";
import {
  IDENTITY,
  LazyString,
  apply,
  convexHull,
  decimate,
  invert,
  mapNibAngle,
  mul,
  pointInPolygon,
  polygonArea,
  rectPoints,
  rotateAt,
  symmetryCopies,
  transformBox,
} from "../src/views/paint/geometry.ts";
import { buildTree, compareStrokes, flattenTree, type TreeStroke } from "../src/views/paint/tree.ts";
import { PRESETS, geomKey, presetById, pressureRuns, strokeGeometry, strokeOptions } from "../src/views/paint/brushes.ts";
import {
  duplicateLayer,
  ensureInitialized,
  deleteLayer,
  mergeDown,
  moveLayer,
  readLayers,
  readMeta,
  strokesOf,
  strokesOfLayer,
  addLayer,
} from "../src/views/paint/doc.ts";
import type { Stroke } from "../src/views/paint/types.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("hex parsing and HSV round trips", () => {
  assert.deepEqual(parseHex("#abc")?.rgb, { r: 0xaa, g: 0xbb, b: 0xcc });
  assert.equal(parseHex("#11223380")?.a, 0x80 / 255);
  assert.equal(parseHex("nope"), null);
  for (const hex of ["#000000", "#ffffff", "#e5484d", "#12a594", "#6e56cf"]) {
    const { h, s, v } = rgbToHsv(parseHex(hex)!.rgb);
    assert.equal(rgbToHex(hsvToRgb(h, s, v)), hex);
  }
  // Achromatic colors keep the previous hue so the picker doesn't jump.
  assert.equal(hexToHsva("#808080", 123)!.h, 123);
});

test("affine matrices", () => {
  const m = mul(rotateAt(0.7, 10, 20), [2, 0, 0, 3, 5, -4]);
  const back = mul(invert(m), m);
  back.forEach((v, i) => close(v, IDENTITY[i]));
  const [x, y] = apply(rotateAt(Math.PI / 2, 10, 10), 10, 10);
  close(x, 10);
  close(y, 10);
  const b = transformBox({ x0: 0, y0: 0, x1: 10, y1: 20 }, rotateAt(Math.PI / 2, 0, 0));
  close(b.x0, -20);
  close(b.x1, 0);
});

test("symmetry copies and nib angles", () => {
  const sym = (mode: any, count = 6) => symmetryCopies({ mode, count }, 100, 50);
  assert.equal(sym("none").length, 1);
  assert.equal(sym("x").length, 2);
  assert.equal(sym("xy").length, 4);
  assert.equal(sym("radial", 8).length, 8);
  assert.equal(sym("snowflake", 5).length, 10);
  const [, mx] = sym("x");
  const [px, py] = apply(mx.m, 30, 7);
  close(px, 170);
  close(py, 7);
  assert.equal(mapNibAngle(mx, 30), 150);
  // Every radial copy maps the center onto itself.
  for (const c of sym("radial", 7)) {
    const [cx, cy] = apply(c.m, 100, 50);
    close(cx, 100);
    close(cy, 50);
  }
});

test("lazy-string stabilizer trails the pointer", () => {
  const s = new LazyString();
  s.reset(0, 0);
  assert.equal(s.update(5, 0, 10), false);
  assert.equal(s.update(25, 0, 10), true);
  close(s.x, 15);
  assert.equal(s.update(3, 4, 0), true);
  close(s.x, 3);
});

test("polygons, hulls and decimation", () => {
  const square = [0, 0, 10, 0, 10, 10, 0, 10];
  assert.ok(pointInPolygon(5, 5, square));
  assert.ok(!pointInPolygon(15, 5, square));
  // Hulls from different point sets share one orientation (nonzero union).
  const a = convexHull([
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [2, 2],
  ]);
  const b = convexHull([
    [10, 10],
    [12, 14],
    [8, 13],
  ]);
  assert.equal(a.length, 4);
  assert.equal(Math.sign(polygonArea(a)), Math.sign(polygonArea(b)));
  const pts = [0, 0, 0.5, 0.1, 0, 0.5, 0.2, 0, 0.5, 5, 0, 0.5, 5.1, 0, 0.9];
  const d = decimate(pts, 1);
  assert.deepEqual(d.slice(0, 3), [0, 0, 0.5]);
  assert.deepEqual(d.slice(-3), [5.1, 0, 0.9]);
  const r = rectPoints(0, 0, 30, 20);
  assert.deepEqual(r.slice(0, 2), [0, 0]);
});

const ts = (id: string, z: number, kind: TreeStroke["kind"] = "brush", extra: Partial<TreeStroke> = {}): TreeStroke => ({
  id,
  z,
  kind,
  ...extra,
});

test("erase strokes only erase what was painted before them", () => {
  const tree = buildTree([ts("a", 1), ts("b", 2), ts("e1", 3, "erase"), ts("e2", 4, "erase"), ts("c", 5)]);
  assert.equal(tree.length, 2);
  const [masked, after] = tree;
  assert.equal(masked.t, "erase");
  if (masked.t !== "erase") return;
  assert.deepEqual(masked.erase, ["e1", "e2"]);
  assert.deepEqual(flattenTree(masked.children), ["a", "b"]);
  assert.deepEqual(after, { t: "stroke", id: "c", minZ: 5 });
});

test("floored erase strokes (merged layers) leave lower content alone", () => {
  const tree = buildTree([ts("low", 1), ts("up1", 10), ts("e", 11, "erase", { floor: 10 }), ts("up2", 12)]);
  assert.equal(tree[0].t, "stroke");
  assert.equal(tree[1].t, "erase");
  if (tree[1].t === "erase") assert.deepEqual(flattenTree(tree[1].children), ["up1"]);
  assert.equal(tree[2].t, "stroke");
});

test("alpha-locked strokes are clipped to prior content", () => {
  const tree = buildTree([ts("a", 1), ts("b", 2, "brush", { clip: true }), ts("c", 3, "brush", { clip: true }), ts("d", 4)]);
  assert.deepEqual(
    tree.map((n) => n.t),
    ["src", "clip", "stroke"],
  );
  if (tree[1].t === "clip") assert.deepEqual(flattenTree(tree[1].children), ["b", "c"]);
  assert.ok(compareStrokes({ z: 1, id: "b" }, { z: 1, id: "a" }) > 0);
});

function stroke(partial: Partial<Stroke>): Stroke {
  const preset = presetById(partial.brush ?? "ink");
  return {
    id: "s",
    layerId: "L",
    z: 1,
    kind: "brush",
    brush: preset.id,
    color: "#000000",
    size: 10,
    opacity: 1,
    points: [10, 10, 0.3, 40, 20, 0.6, 80, 60, 0.9, 120, 70, 0.5],
    options: strokeOptions(preset, preset.defaults),
    ...partial,
  };
}

test("every preset produces geometry that covers its points", () => {
  for (const p of PRESETS) {
    const s = stroke({ brush: p.id, kind: p.kind === "erase" ? "erase" : "brush" });
    const g = strokeGeometry(s);
    assert.ok(g.d.length > 20, `${p.id} has a path`);
    assert.ok(g.box.x0 <= 10 && g.box.x1 >= 120 && g.box.y0 <= 10 && g.box.y1 >= 70, `${p.id} box`);
  }
  const nib = strokeGeometry(stroke({ brush: "calligraphy" }));
  assert.ok((nib.d.match(/M/g) ?? []).length > 1, "nib sweep is a union of hulls");
  assert.ok(pressureRuns(stroke({ brush: "airbrush" })).length >= 1);
  const shape = strokeGeometry(stroke({ kind: "shape", points: rectPoints(0, 0, 50, 40), options: { closed: true, fill: "#ff0000", shape: "rect" } }));
  assert.ok(shape.fillD && shape.fillD.startsWith("M0 0"));
  const img = strokeGeometry(stroke({ kind: "image", x: 5, y: 6, w: 10, h: 20, points: [] }));
  assert.deepEqual(img.box, { x0: 5, y0: 6, x1: 15, y1: 26 });
});

test("geometry keys change only when geometry changes", () => {
  const a = stroke({});
  assert.equal(geomKey(a), geomKey({ ...a, transform: [1, 0, 0, 1, 5, 5], color: "#ff0000" }));
  assert.notEqual(geomKey(a), geomKey({ ...a, points: [...a.points.slice(0, -1), 0.7] }));
  assert.notEqual(geomKey(a), geomKey({ ...a, size: 11 }));
});

function paintPage() {
  const doc = new Y.Doc();
  const page = new Y.Map<any>();
  doc.getMap("pages").set("p", page);
  page.set("layers", new Y.Array());
  page.set("strokes", new Y.Map());
  page.set("paintMeta", new Y.Map());
  return { doc, page };
}

test("initialization is idempotent", () => {
  const { doc, page } = paintPage();
  ensureInitialized(doc, page);
  ensureInitialized(doc, page);
  const layers = readLayers(page.get("layers"));
  assert.deepEqual(
    layers.map((l) => l.name),
    ["Background", "Layer 1"],
  );
  assert.deepEqual(readMeta(page.get("paintMeta")), { width: 1920, height: 1080, background: "#ffffff" });
});

test("layer operations: duplicate, move, merge down, delete", () => {
  const { doc, page } = paintPage();
  ensureInitialized(doc, page);
  const origin = {};
  const [bg, l1] = readLayers(page.get("layers"));
  const strokes = strokesOf(page);
  strokes.set("a", stroke({ id: "a", layerId: bg.id, z: 5 }));
  strokes.set("b", stroke({ id: "b", layerId: l1.id, z: 1, opacity: 0.8 }));
  strokes.set("e", stroke({ id: "e", layerId: l1.id, z: 2, kind: "erase" }));
  page.get("layers").get(1).set("opacity", 0.5);
  page.get("layers").get(1).set("blend", "multiply");

  const dup = duplicateLayer(doc, page, origin, l1.id)!;
  assert.equal(strokesOfLayer(page, dup).length, 2);
  moveLayer(doc, page, origin, dup, 0);
  assert.equal(readLayers(page.get("layers"))[0].id, dup);
  moveLayer(doc, page, origin, dup, 2);

  const lower = mergeDown(doc, page, origin, l1.id);
  assert.equal(lower, bg.id);
  const merged = strokesOfLayer(page, bg.id);
  assert.deepEqual(
    merged.map((s) => s.id),
    ["a", "b", "e"],
  );
  const b = merged[1];
  const e = merged[2];
  assert.equal(b.opacity, 0.4);
  assert.equal(b.blend, "multiply");
  assert.ok(b.z > 5);
  assert.equal(e.floor, b.z, "merged erase keeps erasing only the merged strokes");

  const id = addLayer(doc, page, origin, 0, "Extra");
  assert.ok(deleteLayer(doc, page, origin, id));
  assert.ok(deleteLayer(doc, page, origin, dup));
  assert.equal(strokesOfLayer(page, dup).length, 0);
  assert.ok(!deleteLayer(doc, page, origin, bg.id), "the last layer can't be deleted");
});

test("canvas pages get paint containers lazily: one layer, no paper", async () => {
  const { ensureCanvasPaint, hasPaint, hasPaper, readLayers, layersOf } = await import("../src/views/paint/doc.ts");
  const doc = new Y.Doc();
  const page = doc.getMap("page");
  assert.equal(hasPaint(page), false);
  ensureCanvasPaint(doc, page);
  assert.equal(hasPaint(page), true);
  assert.equal(hasPaper(page), false);
  const layers = readLayers(layersOf(page));
  assert.equal(layers.length, 1);
  assert.equal(layers[0].over, false);
  ensureCanvasPaint(doc, page);
  assert.equal(readLayers(layersOf(page)).length, 1, "idempotent");
});

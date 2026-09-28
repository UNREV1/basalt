// Reading and writing the paint page's Y containers. Every mutation takes the
// caller's transaction origin so Y.UndoManager only tracks local actions.

import * as Y from "yjs";
import { randomId } from "../../../shared/crypto.ts";
import { DEFAULT_META, type LayerData, type PaintMeta, type Stroke } from "./types.ts";

/** Origin for automatic setup writes (never undoable). */
export const INIT_ORIGIN = "paint:init";

export const layersOf = (page: Y.Map<any>) => page.get("layers") as Y.Array<Y.Map<any>>;
export const strokesOf = (page: Y.Map<any>) => page.get("strokes") as Y.Map<Stroke>;
export const metaOf = (page: Y.Map<any>) => page.get("paintMeta") as Y.Map<any>;

export function readLayer(m: Y.Map<any>): LayerData {
  const opacity = m.get("opacity");
  return {
    id: String(m.get("id") ?? ""),
    name: String(m.get("name") ?? "Layer"),
    visible: m.get("visible") !== false,
    opacity: typeof opacity === "number" && Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1,
    blend: String(m.get("blend") ?? "normal"),
    locked: !!m.get("locked"),
    alphaLock: !!m.get("alphaLock"),
    over: !!m.get("over"),
  };
}

export function readLayers(arr: Y.Array<Y.Map<any>>): LayerData[] {
  const out: LayerData[] = [];
  const seen = new Set<string>();
  arr.forEach((m) => {
    if (!(m instanceof Y.Map)) return;
    const l = readLayer(m);
    if (!l.id || seen.has(l.id)) return;
    seen.add(l.id);
    out.push(l);
  });
  return out;
}

export function readMeta(map: Y.Map<any> | undefined): PaintMeta {
  const w = map?.get("width");
  const h = map?.get("height");
  const bg = map?.get("background");
  return {
    width: typeof w === "number" && w > 0 ? w : DEFAULT_META.width,
    height: typeof h === "number" && h > 0 ? h : DEFAULT_META.height,
    background: typeof bg === "string" && bg ? bg : DEFAULT_META.background,
  };
}

function layerMap(data: Partial<LayerData> & { id: string; name: string }): Y.Map<any> {
  const m = new Y.Map<any>();
  m.set("id", data.id);
  m.set("name", data.name);
  m.set("visible", data.visible ?? true);
  m.set("opacity", data.opacity ?? 1);
  m.set("blend", data.blend ?? "normal");
  m.set("locked", data.locked ?? false);
  m.set("alphaLock", data.alphaLock ?? false);
  if (data.over) m.set("over", true);
  return m;
}

/** Create the default layers / canvas settings when a paint page is first opened. */
export function ensureInitialized(doc: Y.Doc, page: Y.Map<any>) {
  doc.transact(() => {
    if (!page.get("layers")) page.set("layers", new Y.Array());
    if (!page.get("strokes")) page.set("strokes", new Y.Map());
    if (!page.get("paintMeta")) page.set("paintMeta", new Y.Map());
    const layers = layersOf(page);
    if (layers.length === 0) {
      layers.push([layerMap({ id: randomId(), name: "Background" }), layerMap({ id: randomId(), name: "Layer 1" })]);
    }
    const meta = metaOf(page);
    if (!meta.has("width")) meta.set("width", DEFAULT_META.width);
    if (!meta.has("height")) meta.set("height", DEFAULT_META.height);
    if (!meta.has("background")) meta.set("background", DEFAULT_META.background);
  }, INIT_ORIGIN);
}

/** A canvas page has paint layers once someone paints on it. */
export function hasPaint(page: Y.Map<any>): boolean {
  return page.get("layers") instanceof Y.Array && page.get("strokes") instanceof Y.Map;
}

/**
 * Paint containers for a canvas (whiteboard) page: no paper, one layer.
 * Legacy paint pages keep their paper (paintMeta) and layers as they are.
 */
export function ensureCanvasPaint(doc: Y.Doc, page: Y.Map<any>) {
  doc.transact(() => {
    if (!(page.get("layers") instanceof Y.Array)) page.set("layers", new Y.Array());
    if (!(page.get("strokes") instanceof Y.Map)) page.set("strokes", new Y.Map());
    const layers = layersOf(page);
    if (layers.length === 0) layers.push([layerMap({ id: randomId(), name: "Layer 1" })]);
  }, INIT_ORIGIN);
}

/** Legacy paint pages have a fixed-size paper; canvases are infinite. */
export function hasPaper(page: Y.Map<any>): boolean {
  const m = page.get("paintMeta");
  return m instanceof Y.Map && m.has("width");
}

export function nextLayerName(layers: LayerData[]): string {
  let n = layers.length;
  const names = new Set(layers.map((l) => l.name));
  while (names.has(`Layer ${n}`)) n++;
  return `Layer ${n}`;
}

function indexOfLayer(arr: Y.Array<Y.Map<any>>, id: string): number {
  let idx = -1;
  arr.forEach((m, i) => {
    if (idx === -1 && m instanceof Y.Map && m.get("id") === id) idx = i;
  });
  return idx;
}

export function strokesOfLayer(page: Y.Map<any>, layerId: string): Stroke[] {
  const out: Stroke[] = [];
  strokesOf(page).forEach((s) => {
    if (s && s.layerId === layerId) out.push(s);
  });
  return out.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
}

export function addLayer(doc: Y.Doc, page: Y.Map<any>, origin: unknown, index: number, name: string): string {
  const id = randomId();
  doc.transact(() => {
    const arr = layersOf(page);
    arr.insert(Math.max(0, Math.min(arr.length, index)), [layerMap({ id, name })]);
  }, origin);
  return id;
}

export function updateLayer(doc: Y.Doc, page: Y.Map<any>, origin: unknown, id: string, patch: Partial<LayerData>) {
  const arr = layersOf(page);
  const idx = indexOfLayer(arr, id);
  if (idx === -1) return;
  const m = arr.get(idx);
  doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) if (k !== "id" && m.get(k) !== v) m.set(k, v);
  }, origin);
}

export function deleteLayer(doc: Y.Doc, page: Y.Map<any>, origin: unknown, id: string): boolean {
  const arr = layersOf(page);
  const idx = indexOfLayer(arr, id);
  if (idx === -1 || arr.length <= 1) return false;
  doc.transact(() => {
    const strokes = strokesOf(page);
    for (const s of strokesOfLayer(page, id)) strokes.delete(s.id);
    arr.delete(idx, 1);
  }, origin);
  return true;
}

export function clearLayer(doc: Y.Doc, page: Y.Map<any>, origin: unknown, id: string) {
  const list = strokesOfLayer(page, id);
  if (!list.length) return;
  doc.transact(() => {
    const strokes = strokesOf(page);
    for (const s of list) strokes.delete(s.id);
  }, origin);
}

export function duplicateLayer(doc: Y.Doc, page: Y.Map<any>, origin: unknown, id: string): string | null {
  const arr = layersOf(page);
  const idx = indexOfLayer(arr, id);
  if (idx === -1) return null;
  const src = readLayer(arr.get(idx));
  const newId = randomId();
  doc.transact(() => {
    arr.insert(idx + 1, [layerMap({ ...src, id: newId, name: `${src.name} copy` })]);
    const strokes = strokesOf(page);
    for (const s of strokesOfLayer(page, id)) {
      const copy: Stroke = { ...s, id: randomId(), layerId: newId };
      strokes.set(copy.id, copy);
    }
  }, origin);
  return newId;
}

/** Move a layer so it ends up at `toIndex` (array order, bottom = 0). */
export function moveLayer(doc: Y.Doc, page: Y.Map<any>, origin: unknown, id: string, toIndex: number) {
  const arr = layersOf(page);
  const from = indexOfLayer(arr, id);
  if (from === -1) return;
  const to = Math.max(0, Math.min(arr.length - 1, toIndex));
  if (to === from) return;
  const data = readLayer(arr.get(from));
  doc.transact(() => {
    arr.delete(from, 1);
    arr.insert(to, [layerMap(data)]);
  }, origin);
}

/**
 * Merge a layer into the one below. The upper layer's opacity and blend mode
 * are baked into its strokes, which are re-stacked above the lower layer's
 * content; its erase strokes get a `floor` so they keep erasing only what was
 * on the upper layer.
 */
export function mergeDown(doc: Y.Doc, page: Y.Map<any>, origin: unknown, id: string): string | null {
  const arr = layersOf(page);
  const idx = indexOfLayer(arr, id);
  if (idx <= 0) return null;
  const upper = readLayer(arr.get(idx));
  const lower = readLayer(arr.get(idx - 1));
  const moving = strokesOfLayer(page, upper.id);
  const lowerStrokes = strokesOfLayer(page, lower.id);
  const lowerMax = lowerStrokes.length ? lowerStrokes[lowerStrokes.length - 1].z : 0;
  const base = Math.floor(Math.max(Date.now(), lowerMax + 1));
  const newZ = moving.map((_, i) => base + i);
  const remapFloor = (floor: number | undefined): number => {
    if (typeof floor !== "number") return base;
    const i = moving.findIndex((s) => s.z >= floor);
    return i === -1 ? base + moving.length : newZ[i];
  };
  doc.transact(() => {
    const strokes = strokesOf(page);
    moving.forEach((s, i) => {
      const next: Stroke = { ...s, layerId: lower.id, z: newZ[i] };
      if (s.kind === "erase") next.floor = remapFloor(s.floor);
      else {
        next.opacity = Math.round(s.opacity * upper.opacity * 1000) / 1000;
        if (upper.blend !== "normal" && (!s.blend || s.blend === "normal")) next.blend = upper.blend;
      }
      strokes.set(s.id, next);
    });
    arr.delete(idx, 1);
  }, origin);
  return lower.id;
}

export function addStrokes(doc: Y.Doc, page: Y.Map<any>, origin: unknown, list: Stroke[]) {
  if (!list.length) return;
  doc.transact(() => {
    const strokes = strokesOf(page);
    for (const s of list) strokes.set(s.id, s);
  }, origin);
}

export function deleteStrokes(doc: Y.Doc, page: Y.Map<any>, origin: unknown, ids: Iterable<string>) {
  doc.transact(() => {
    const strokes = strokesOf(page);
    for (const id of ids) strokes.delete(id);
  }, origin);
}

export function setMeta(doc: Y.Doc, page: Y.Map<any>, origin: unknown, patch: Partial<PaintMeta>) {
  doc.transact(() => {
    const meta = metaOf(page);
    for (const [k, v] of Object.entries(patch)) if (meta.get(k) !== v) meta.set(k, v);
  }, origin);
}

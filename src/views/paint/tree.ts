// Builds the per-layer render tree that gives vector erasing and alpha lock
// raster-like semantics (pure; unit-tested):
//  - An erase stroke only removes what was painted *before* it: it wraps the
//    preceding content in a group masked by the erase path, so strokes painted
//    afterwards stay intact. Consecutive erase strokes share one mask.
//  - Erase strokes with a `floor` (from merged layers) only wrap content whose
//    z is >= floor.
//  - Alpha-locked strokes (`clip`) are masked by the alpha of everything
//    painted before them in the layer.

import type { StrokeKind } from "./types.ts";

export interface TreeStroke {
  id: string;
  z: number;
  kind: StrokeKind;
  floor?: number;
  clip?: boolean;
}

export type TreeNode =
  | { t: "stroke"; id: string; minZ: number }
  | { t: "erase"; key: string; erase: string[]; floor: number; children: TreeNode[]; minZ: number }
  | { t: "src"; key: string; children: TreeNode[]; minZ: number }
  | { t: "clip"; key: string; src: string; children: TreeNode[]; minZ: number };

export function compareStrokes(a: { z: number; id: string }, b: { z: number; id: string }): number {
  return a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function buildTree(sorted: readonly TreeStroke[]): TreeNode[] {
  const items: TreeNode[] = [];
  for (const s of sorted) {
    const last = items[items.length - 1];
    if (s.kind === "erase") {
      const floor = typeof s.floor === "number" ? s.floor : -Infinity;
      if (last && last.t === "erase" && last.floor === floor) {
        last.erase.push(s.id);
        continue;
      }
      let i = items.findIndex((n) => n.minZ >= floor);
      if (i === -1) i = items.length;
      const children = items.splice(i);
      items.push({ t: "erase", key: s.id, erase: [s.id], floor, children, minZ: children.length ? children[0].minZ : s.z });
      continue;
    }
    const leaf: TreeNode = { t: "stroke", id: s.id, minZ: s.z };
    if (s.clip) {
      if (last && last.t === "clip") {
        last.children.push(leaf);
        continue;
      }
      const prior = items.splice(0);
      const src: TreeNode = { t: "src", key: s.id, children: prior, minZ: prior.length ? prior[0].minZ : s.z };
      items.push(src, { t: "clip", key: s.id, src: s.id, children: [leaf], minZ: s.z });
      continue;
    }
    items.push(leaf);
  }
  return items;
}

/** Stroke ids in render order (erase strokes included where their mask sits). */
export function flattenTree(nodes: readonly TreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.t === "stroke") out.push(n.id);
    else if (n.t === "erase") {
      flattenTree(n.children, out);
      out.push(...n.erase);
    } else flattenTree(n.children, out);
  }
  return out;
}

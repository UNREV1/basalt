// Layered DAG layout for the skill tree. Roots sit on the "ground" and the
// tree grows upward: layer = longest prerequisite chain below a skill.
// Connected groups of skills are placed side by side, grouped by life area.
// Everything is ordered by creation time so adding a skill appends to the end
// of its row and leaves earlier skills where they were.

import type { Skill } from "../../../shared/skills.ts";

export const NODE_R = 30;
export const LAYER_GAP = 176;
export const NODE_GAP = 124;
const COMPONENT_GAP = 36;
const AREA_GAP = 110;
/** Distance from a row's roots down to its ground line. */
export const GROUND_Y = 100;
/** Vertical space a row needs beyond its layers: ground, labels, gap. */
const ROW_EXTRA = 262;

export interface Point {
  x: number;
  y: number;
}

export interface AreaBand {
  areaId: string;
  /** Other areas whose root skills grow from this stretch of ground. */
  alsoAreas: string[];
  x0: number;
  x1: number;
  /** y of the band's center line. */
  y: number;
}

export interface TreeLayout {
  /** Final positions (manual overrides applied). */
  pos: Map<string, Point>;
  /** Automatic positions (ignoring overrides). */
  auto: Map<string, Point>;
  bands: AreaBand[];
}

type LayoutSkill = Pick<Skill, "id" | "parents" | "category" | "createdAt" | "pos">;

/** Place a row at desired x positions keeping NODE_GAP between neighbours. */
function placeRow(desired: number[]): number[] {
  const n = desired.length;
  if (!n) return [];
  const left = new Array<number>(n);
  const right = new Array<number>(n);
  for (let i = 0; i < n; i++) left[i] = i === 0 ? desired[0] : Math.max(desired[i], left[i - 1] + NODE_GAP);
  for (let i = n - 1; i >= 0; i--) right[i] = i === n - 1 ? desired[n - 1] : Math.min(desired[i], right[i + 1] - NODE_GAP);
  // Both passes satisfy the spacing constraints, so their average does too.
  return left.map((l, i) => (l + right[i]) / 2);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** `aspect` is the width/height ratio the forest should roughly fill. */
export function layoutTree(skills: LayoutSkill[], areaOrder: string[], aspect = 1.6): TreeLayout {
  const sorted = [...skills].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const ids = new Set(sorted.map((s) => s.id));
  const rank = new Map(sorted.map((s, i) => [s.id, i]));
  const parents = new Map(sorted.map((s) => [s.id, s.parents.filter((p) => ids.has(p) && p !== s.id)]));
  const children = new Map<string, string[]>(sorted.map((s) => [s.id, []]));
  for (const s of sorted) for (const p of parents.get(s.id)!) children.get(p)!.push(s.id);

  const layer = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (id: string): number => {
    const known = layer.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // defensive: cycles are prevented on write
    visiting.add(id);
    const ps = parents.get(id)!;
    const v = ps.length ? 1 + Math.max(...ps.map(layerOf)) : 0;
    visiting.delete(id);
    layer.set(id, v);
    return v;
  };
  for (const s of sorted) layerOf(s.id);

  // Connected components (union-find).
  const up = new Map(sorted.map((s) => [s.id, s.id]));
  const find = (x: string): string => {
    let r = x;
    while (up.get(r) !== r) r = up.get(r)!;
    let c = x;
    while (up.get(c) !== r) {
      const n = up.get(c)!;
      up.set(c, r);
      c = n;
    }
    return r;
  };
  for (const s of sorted) for (const p of parents.get(s.id)!) up.set(find(s.id), find(p));
  const comps = new Map<string, string[]>();
  for (const s of sorted) {
    const r = find(s.id);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r)!.push(s.id);
  }
  const byId = new Map(sorted.map((s) => [s.id, s]));
  const areaIndex = (a: string) => {
    const i = areaOrder.indexOf(a);
    return i === -1 ? areaOrder.length : i;
  };

  interface Comp {
    area: string;
    first: number;
    nodes: string[];
    x: Map<string, number>;
    width: number;
    depth: number;
    left: number;
    rootAreas: string[];
  }
  const compList: Comp[] = [];
  for (const nodes of comps.values()) {
    // A group belongs to the area of its earliest root.
    const rootIds = nodes.filter((id) => !parents.get(id)!.length);
    const firstRoot = rootIds[0] ?? nodes[0];
    compList.push({
      area: byId.get(firstRoot)!.category,
      rootAreas: [...new Set(rootIds.map((id) => byId.get(id)!.category))],
      first: rank.get(nodes[0])!,
      nodes,
      x: new Map(),
      width: 0,
      depth: Math.max(...nodes.map((id) => layer.get(id)!)),
      left: 0,
    });
  }
  compList.sort((a, b) => areaIndex(a.area) - areaIndex(b.area) || a.first - b.first);

  for (const comp of compList) {
    const rows: string[][] = [];
    for (const id of comp.nodes) (rows[layer.get(id)!] ??= []).push(id);
    const x = comp.x;
    const byRank = (a: string, b: string) => rank.get(a)! - rank.get(b)!;
    rows[0].sort(byRank).forEach((id, i) => x.set(id, i * NODE_GAP));
    const down = (reorder: boolean) => {
      for (let l = 1; l < rows.length; l++) {
        const row = rows[l] ?? [];
        const want = new Map(row.map((id) => [id, mean(parents.get(id)!.map((p) => x.get(p) ?? 0))]));
        if (reorder) row.sort((a, b) => want.get(a)! - want.get(b)! || byRank(a, b));
        placeRow(row.map((id) => want.get(id)!)).forEach((v, i) => x.set(row[i], v));
      }
    };
    const upPass = (reorder: boolean) => {
      for (let l = rows.length - 2; l >= 0; l--) {
        const row = rows[l] ?? [];
        const want = new Map(
          row.map((id) => {
            const cs = children.get(id)!.filter((c) => layer.get(c) === l + 1);
            return [id, cs.length ? mean(cs.map((c) => x.get(c)!)) : x.get(id)!];
          }),
        );
        if (reorder) row.sort((a, b) => want.get(a)! - want.get(b)! || x.get(a)! - x.get(b)! || byRank(a, b));
        placeRow(row.map((id) => want.get(id)!)).forEach((v, i) => x.set(row[i], v));
      }
    };
    // A few barycenter sweeps to untangle crossings, then settle positions.
    down(true);
    upPass(true);
    down(true);
    upPass(false);
    down(false);
    let min = Infinity;
    let max = -Infinity;
    for (const v of x.values()) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    for (const [id, v] of x) x.set(id, v - min);
    comp.width = max - min;
  }

  // Wrap groups into rows ("terraces") so wide forests keep a screen-like
  // aspect ratio. Rows are left-aligned so earlier groups stay put.
  const gapBefore = (i: number) =>
    i === 0 ? 0 : NODE_GAP + (compList[i - 1].area === compList[i].area ? COMPONENT_GAP : AREA_GAP);
  let total = 0;
  compList.forEach((c, i) => (total += gapBefore(i) + c.width));
  const deepest = Math.max(0, ...compList.map((c) => c.depth));
  const rowHeight = deepest * LAYER_GAP + ROW_EXTRA;
  const rowsWanted = Math.max(1, Math.round(Math.sqrt(total / (rowHeight * Math.max(0.3, aspect)))));
  const widest = Math.max(0, ...compList.map((c) => c.width));
  const maxRow = Math.max(widest, (total / rowsWanted) * 1.08, NODE_GAP * 4);

  const auto = new Map<string, Point>();
  const bands: AreaBand[] = [];
  const rows: Comp[][] = [];
  let cursor = 0;
  compList.forEach((comp, i) => {
    const gap = gapBefore(i);
    if (!rows.length || (cursor > 0 && cursor + gap + comp.width > maxRow)) {
      rows.push([]);
      cursor = 0;
    } else cursor += gap;
    comp.left = cursor;
    rows[rows.length - 1].push(comp);
    cursor += comp.width;
  });
  let base = 0;
  rows.forEach((row, r) => {
    const depth = Math.max(...row.map((c) => c.depth));
    if (r > 0) base += depth * LAYER_GAP + ROW_EXTRA;
    let band: AreaBand | null = null;
    for (const comp of row) {
      for (const id of comp.nodes) auto.set(id, { x: comp.left + comp.x.get(id)!, y: base - layer.get(id)! * LAYER_GAP });
      if (band && band.areaId === comp.area) band.x1 = comp.left + comp.width;
      else {
        band = { areaId: comp.area, alsoAreas: [], x0: comp.left, x1: comp.left + comp.width, y: base + GROUND_Y };
        bands.push(band);
      }
      for (const a of comp.rootAreas) if (a !== band.areaId && !band.alsoAreas.includes(a)) band.alsoAreas.push(a);
    }
  });
  for (const b of bands) {
    b.x0 -= NODE_GAP / 2 - 4;
    b.x1 += NODE_GAP / 2 - 4;
  }

  const pos = new Map<string, Point>();
  for (const s of sorted) pos.set(s.id, s.pos ? { x: s.pos.x, y: s.pos.y } : auto.get(s.id)!);
  return { pos, auto, bands };
}

/** Bounding box of positions (and ground bands), padded for node rings and labels. */
export function layoutBounds(points: Iterable<Point>, bands: AreaBand[] = []) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  if (!Number.isFinite(x0)) return null;
  return {
    x0: x0 - 70,
    x1: x1 + 70,
    y0: y0 - 60,
    y1: Math.max(y1 + 70, ...bands.map((b) => b.y + 30)),
  };
}

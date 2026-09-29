// The skill map: a canvas + d3-force map of every skill, laid out like an RPG
// skill tree that branches out in a circle from you in the middle (abilities
// first, then each skill's path outward), as a top-down tree (a column per
// ability), or clustered around the six abilities.
// Kept outside React: the simulation moves nodes every tick and pointer
// interaction redraws at frame rate.
//
// Encoding: node size = level, color = ability, ring = progress to the next
// level, gold ring = goal reached, dashed = locked. A topic (a skill made of
// parts, like Arithmetic) has a double rim and its ring shows how many of its
// parts are learnt; its parts hang below it and lead on to the next topic. Arrows run from a
// prerequisite to what it unlocks (solid once met). Soft colored roads trace
// the learning paths Claude mapped. Hovering or selecting a skill lights up
// its whole path: everything it needs and everything it leads to.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export type GraphLayout = "radial" | "tree" | "clusters";

export interface SGNode {
  id: string;
  kind: "skill" | "ability" | "course";
  label: string;
  icon: string;
  color: string;
  /** Ability (area) id; for an ability node, its own id. */
  ability: string;
  level: number;
  /** 0..1 toward the next level. */
  progress: number;
  locked: boolean;
  goal: boolean;
  depth: number;
  branch?: string;
  /** Ability nodes: "STR 12 (+1)". Courses: "3/6 lessons". */
  sub?: string;
  /** A topic: how many of its innermost parts are learnt. */
  learnt?: { done: number; total: number };
  /** Learnt (a finished course, or every part of a topic). */
  done?: boolean;
  /** Claude is writing or planning something for it right now. */
  busy?: boolean;
  /** Colors of collaborators looking at it. */
  peers?: string[];
  /** Line icon (24×24 SVG path data) drawn instead of the emoji. */
  glyph?: string;
}

export interface SGLink {
  source: string;
  target: string;
  /** prereq: needed first; part: a topic → one of its parts; course: skill → its course. */
  kind: "prereq" | "part" | "course";
  /** Prerequisite reached its required level (a part: its topic is unlocked). */
  met: boolean;
  /** Shapes the layout and the highlighted path, but isn't drawn. */
  hidden?: boolean;
}

interface Node extends SimulationNodeDatum, SGNode {
  r: number;
}

interface Link extends SimulationLinkDatum<Node> {
  kind: SGLink["kind"];
  met: boolean;
  hidden?: boolean;
}

export interface GraphOptions {
  layout: GraphLayout;
  labels: boolean;
  courses: boolean;
  dark: boolean;
  /** Search / filter matches (others fade); null = everything. */
  matches: Set<string> | null;
  selectedId: string | null;
  /** You, in the middle of the radial map. */
  center: { initials: string; color: string; title: string; sub: string } | null;
}

export interface GraphTheme {
  text: string;
  muted: string;
  bg: string;
  accent: string;
  edge: string;
  gold: string;
  font: string;
}

interface Pt {
  x: number;
  y: number;
}

interface Camera {
  k: number;
  x: number;
  y: number;
}

const MIN_K = 0.12;
const MAX_K = 5;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Opacity of nodes outside the highlighted path or search. */
const FADED = 0.26;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const radius = (n: SGNode) =>
  n.kind === "ability"
    ? 30
    : n.kind === "course"
      ? 9
      : n.learnt
        ? 18 + Math.min(14, Math.sqrt(n.learnt.total) * 3)
        : 12 + Math.min(16, Math.sqrt(Math.max(1, n.level)) * 3.2);
/** Optional node fields, cleared before each update so a removed one doesn't linger. */
const OPTIONAL: (keyof SGNode)[] = ["branch", "sub", "learnt", "done", "busy", "peers", "glyph"];
const paths = new Map<string, Path2D>();
const path2d = (d: string) => {
  let p = paths.get(d);
  if (!p) paths.set(d, (p = new Path2D(d)));
  return p;
};

/** Each learning path gets its own color, stable across sessions. */
const PATH_COLORS = ["#0a84ff", "#bf5af2", "#ff9f0a", "#30d158", "#ff375f", "#64d2ff", "#ffd60a"];
function pathColor(name: string): string {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PATH_COLORS[h % PATH_COLORS.length];
}

function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class SkillGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sim: Simulation<Node, Link>;
  private nodes: Node[] = [];
  private links: Link[] = [];
  private byId = new Map<string, Node>();
  private parents = new Map<string, string[]>();
  private children = new Map<string, string[]>();
  /** Part → the topic it belongs to. */
  private partOf = new Map<string, string>();
  /** Skill → the skills it needs (prerequisite links only). */
  private needs = new Map<string, string[]>();
  /** Radial layout: each node's branch (skill → the skill or ability it grows from). */
  private branchOf = new Map<string, string>();
  /** Radial layout: how many steps out from its ability each skill sits. */
  private ringOf = new Map<string, number>();
  /** The pointer is over you, in the middle of the radial map. */
  private hoverCenter = false;
  private abilityOrder: string[] = [];
  private structure = "";
  private opts: GraphOptions = {
    layout: "radial",
    labels: true,
    courses: true,
    dark: false,
    matches: null,
    selectedId: null,
    center: null,
  };
  private theme: GraphTheme = {
    text: "#111",
    muted: "#777",
    bg: "#fff",
    accent: "#0a84ff",
    edge: "#bbb",
    gold: "#eda100",
    font: "system-ui",
  };
  private t: Camera = { k: 1, x: 0, y: 0 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private hover: Node | null = null;
  private drag: { node: Node; start: Pt; moved: boolean } | null = null;
  private pan: { start: Pt; t: Camera; moved: boolean } | null = null;
  private pointers = new Map<number, Pt>();
  private pinch: { dist: number; mid: Pt; k: number } | null = null;
  private autoFit = true;
  private effects = new Map<string, number>();
  private frame = 0;
  private anim: { from: Camera; to: Camera; start: number } | null = null;
  private inset = { top: 0, right: 0, bottom: 0, left: 0 };
  private reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private press: { id: string; timer: number } | null = null;
  /** The skill focused from the keyboard (the list for screen readers and keys). */
  private focusId: string | null = null;
  private cb: {
    /** A click or tap (null: on empty space). */
    onSelect: (id: string | null) => void;
    /** Right-click, or press and hold on a touch screen. */
    onDetails: (id: string) => void;
    onHover: (id: string | null, at: Pt | null) => void;
  };

  constructor(canvas: HTMLCanvasElement, cb: SkillGraph["cb"]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.cb = cb;
    this.sim = forceSimulation<Node, Link>([])
      .alphaDecay(0.03)
      .on("tick", () => this.request());
    this.sim.stop();
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("pointerleave", this.onLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContext);
  }

  destroy() {
    this.sim.stop();
    cancelAnimationFrame(this.frame);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("pointerleave", this.onLeave);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.onContext);
    if (this.press) clearTimeout(this.press.timer);
  }

  // ---- data & options ----------------------------------------------------------------------

  setData(nodes: SGNode[], links: SGLink[], abilityOrder: string[]) {
    this.abilityOrder = abilityOrder;
    const key = `${nodes.map((n) => n.id).join(",")}|${links.map((l) => `${l.source}>${l.target}`).join(",")}`;
    const old = this.byId;
    this.nodes = nodes.map((n) => {
      const prev = old.get(n.id);
      const node = (prev ?? ({} as Node)) as Node;
      for (const k of OPTIONAL) delete node[k];
      Object.assign(node, n, { r: radius(n) });
      if (!prev) {
        // New nodes start near their ability, or near a parent.
        const seed = this.seedPoint(n);
        node.x = seed.x + (Math.random() - 0.5) * 40;
        node.y = seed.y + (Math.random() - 0.5) * 40;
      }
      return node;
    });
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.links = links
      .filter((l) => this.byId.has(l.source) && this.byId.has(l.target))
      .map(
        (l) =>
          ({
            source: l.source,
            target: l.target,
            kind: l.kind,
            met: l.met,
            hidden: l.hidden,
          }) as unknown as Link,
      );
    this.parents = new Map();
    this.children = new Map();
    this.partOf = new Map(links.filter((l) => l.kind === "part").map((l) => [l.target, l.source]));
    this.needs = new Map();
    for (const l of links) if (l.kind === "prereq") this.needs.set(l.target, [...(this.needs.get(l.target) ?? []), l.source]);
    for (const l of links) {
      if (l.kind === "course") continue;
      this.children.set(l.source, [...(this.children.get(l.source) ?? []), l.target]);
      this.parents.set(l.target, [...(this.parents.get(l.target) ?? []), l.source]);
    }
    const changed = key !== this.structure;
    this.structure = key;
    this.applyForces(changed ? 0.9 : 0.05);
  }

  private isPart(n: SGNode): boolean {
    return this.partOf.has(n.id);
  }

  setOptions(opts: Partial<GraphOptions>) {
    const layoutChanged = opts.layout !== undefined && opts.layout !== this.opts.layout;
    const coursesChanged = opts.courses !== undefined && opts.courses !== this.opts.courses;
    this.opts = { ...this.opts, ...opts };
    if (layoutChanged || coursesChanged) {
      for (const n of this.nodes) if (n.kind !== "ability") ((n.fx = null), (n.fy = null));
      this.autoFit = true;
      this.applyForces(1);
    }
    this.request();
  }

  setTheme(theme: GraphTheme) {
    this.theme = theme;
    this.request();
  }

  setInsets(inset: SkillGraph["inset"]) {
    this.inset = inset;
  }

  /** Level-up pulses. */
  pulse(ids: string[]) {
    const now = performance.now();
    for (const id of ids) this.effects.set(id, now);
    this.request();
  }

  resize(w: number, h: number) {
    this.dpr = window.devicePixelRatio || 1;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.autoFit) this.fit(undefined, false);
    this.request();
  }

  // ---- layout -------------------------------------------------------------------------------------

  /** Where the structured layouts (radial, tree) want each hub and skill; clusters leave it empty. */
  private slots = new Map<string, Pt>();
  /** Tier guides: horizontal lines (tree) or circles (radial). */
  private guides: { at: number; label: string }[] = [];

  private hubPoint(ability: string): Pt {
    const slot = this.slots.get(ability);
    if (slot) return slot;
    const n = Math.max(1, this.abilityOrder.length);
    const i = Math.max(0, this.abilityOrder.indexOf(ability));
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const R = 300 + n * 12;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R };
  }

  private seedPoint(n: SGNode): Pt {
    return this.slots.get(n.id) ?? this.hubPoint(n.ability);
  }

  /**
   * Flow: a column per ability, a row band per tier (prerequisite depth), wrapping
   * wide tiers onto extra rows. Rings: your character in the middle, abilities
   * around it, each owning a wedge; tiers are rings further out. Within a tier,
   * skills sit near what they need, so arrows stay short and rarely cross.
   */
  /** A topic's parts in learning order (the order Claude planned them, prerequisites first). */
  private partsOf(topicId: string, visible: Map<string, Node>): Node[] {
    const out: Node[] = [];
    for (const [part, topic] of this.partOf) if (topic === topicId && visible.has(part)) out.push(visible.get(part)!);
    return out.sort((a, b) => a.depth - b.depth);
  }

  private computeSlots(visible: Node[]) {
    this.slots = new Map();
    this.guides = [];
    const layout = this.opts.layout;
    if (layout === "clusters") return;
    this.branchOf = new Map();
    const hubs = this.abilityOrder.filter((a) => visible.some((n) => n.kind === "ability" && n.id === a));
    if (!hubs.length) return;
    const byId = new Map(visible.map((n) => [n.id, n]));
    if (layout === "radial") return this.radialSlots(visible, byId, hubs);

    // Subjects: skills made of parts that aren't parts themselves (Mathematics).
    // Each gets a block: a lane per topic, the topic on top, its parts below.
    const subjects = visible.filter((n) => n.kind === "skill" && !this.partOf.has(n.id) && this.partsOf(n.id, byId).length > 0);
    const inBlock = new Map<string, number>(); // node → level under its subject (subject 0, topic 1, part 2…)
    const walk = (id: string, level: number) => {
      inBlock.set(id, level);
      for (const p of this.partsOf(id, byId)) if (!inBlock.has(p.id)) walk(p.id, level + 1);
    };
    for (const s of subjects) walk(s.id, 0);
    const depthOf = (n: Node) => n.depth;

    const tiers = new Map<string, Node[][]>(hubs.map((a) => [a, []]));
    for (const n of visible) {
      if (n.kind !== "skill" || (layout === "tree" && inBlock.has(n.id))) continue;
      const rows = tiers.get(n.ability);
      if (rows) (rows[depthOf(n)] ??= []).push(n);
    }
    // Order each tier by where its prerequisites sit (0..1 across their ability),
    // tier by tier so every parent is ranked before its children.
    const maxDepth = Math.max(0, ...[...tiers.values()].map((rows) => rows.length - 1));
    const rank = new Map<string, number>();
    const key = (n: Node) => {
      const ps = (this.parents.get(n.id) ?? []).map((id) => rank.get(id)).filter((v): v is number => v !== undefined);
      return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0.5;
    };
    for (let d = 0; d <= maxDepth; d++) {
      for (const rows of tiers.values()) {
        const row = rows[d];
        if (!row) continue;
        row.sort((a, b) => key(a) - key(b) || b.level - a.level || a.label.localeCompare(b.label));
        row.forEach((n, i) => rank.set(n.id, row.length > 1 ? i / (row.length - 1) : 0.5));
      }
    }
    const CELL = 74;

    if (layout === "tree") {
      const PER_ROW = 4;
      const ROW_H = 78;
      const LANE = 196;
      const PART_H = 70;
      // The lanes of each subject: its topics, each with everything inside it, in order.
      const lanesOf = (subject: Node): Node[][] => {
        const direct = this.partsOf(subject.id, byId);
        const flat = (t: Node): Node[] => this.partsOf(t.id, byId).flatMap((p) => [p, ...flat(p)]);
        if (direct.every((t) => !this.partsOf(t.id, byId).length)) {
          // Parts without topics: stacked, five to a lane.
          const out: Node[][] = [];
          for (let i = 0; i < direct.length; i += 5) out.push(direct.slice(i, i + 5));
          return out;
        }
        return direct.map((t) => [t, ...flat(t)]);
      };
      type Column = { kind: "ability"; id: string; width: number } | { kind: "subject"; node: Node; lanes: Node[][]; width: number };
      const columns: Column[] = [];
      for (const a of hubs) {
        columns.push({ kind: "ability", id: a, width: Math.max(1, Math.min(PER_ROW, ...(tiers.get(a) ?? []).map((r) => r?.length ?? 0))) * CELL });
        for (const s of subjects.filter((x) => x.ability === a)) {
          const lanes = lanesOf(s);
          columns.push({ kind: "subject", node: s, lanes, width: Math.max(1, lanes.length) * LANE });
        }
      }
      const GAP = 56;
      const total = columns.reduce((a, c) => a + c.width, 0) + GAP * (columns.length - 1);
      let x = -total / 2;
      const center = new Map<Column, number>();
      for (const c of columns) {
        center.set(c, x + c.width / 2);
        x += c.width + GAP;
      }
      let y = 0;
      for (let d = 0; d <= maxDepth; d++) {
        const sub = Math.max(1, ...hubs.map((a) => Math.ceil((tiers.get(a)?.[d]?.length ?? 0) / PER_ROW)));
        // Tier lines only where tiers are the whole story (subject blocks have lanes).
        if (!subjects.length) this.guides.push({ at: y - ROW_H / 2, label: `Tier ${d + 1}` });
        for (const c of columns) {
          if (c.kind !== "ability") continue;
          const row = tiers.get(c.id)?.[d] ?? [];
          const lines = Math.max(1, Math.ceil(row.length / PER_ROW));
          const per = Math.ceil(row.length / lines);
          row.forEach((n, i) => {
            const line = Math.floor(i / per);
            const inLine = Math.min(per, row.length - line * per);
            const j = i - line * per;
            this.slots.set(n.id, { x: center.get(c)! + (j - (inLine - 1) / 2) * CELL, y: y + line * ROW_H });
          });
        }
        y += sub * ROW_H + 40;
      }
      for (const c of columns) {
        if (c.kind === "ability") this.slots.set(c.id, { x: center.get(c)!, y: -120 });
        else {
          // The subject at the top, then its lanes: topic, then its parts one under another.
          const cx = center.get(c)!;
          this.slots.set(c.node.id, { x: cx, y: 0 });
          c.lanes.forEach((lane, li) => {
            const lx = cx - c.width / 2 + LANE * (li + 0.5);
            lane.forEach((n, j) => this.slots.set(n.id, { x: lx, y: ROW_H * 1.4 + j * PART_H + (j > 0 ? 18 : 0) }));
          });
        }
      }
      return;
    }
  }

  /**
   * Radial: you in the middle, the abilities around you, and every skill
   * growing out of what it builds on: a part out of its topic, a skill out of
   * the prerequisite in its own ability it needs most, else out of its
   * ability. Each branch gets a slice of the circle as wide as the number of
   * skills at its tips, and every step along a path is a ring further out.
   */
  private radialSlots(visible: Node[], byId: Map<string, Node>, hubs: string[]) {
    const skills = visible.filter((n) => n.kind === "skill");
    const from = new Map<string, string>();
    for (const n of skills) {
      const topic = this.partOf.get(n.id);
      if (topic && byId.has(topic)) {
        from.set(n.id, topic);
        continue;
      }
      const needs = (this.needs.get(n.id) ?? []).map((id) => byId.get(id)).filter((p): p is Node => p?.kind === "skill" && p.ability === n.ability);
      const pick = needs.sort((a, b) => b.depth - a.depth)[0];
      from.set(n.id, pick?.id ?? n.ability);
    }
    // Grow the branches from the abilities outward; anything caught in a loop hangs off its ability.
    const kids = new Map<string, Node[]>();
    for (const n of skills) kids.set(from.get(n.id)!, [...(kids.get(from.get(n.id)!) ?? []), n]);
    for (const list of kids.values()) list.sort((a, b) => a.depth - b.depth);
    const placed = new Set<string>();
    const grow = (id: string) => {
      for (const c of kids.get(id) ?? []) {
        if (placed.has(c.id)) continue;
        placed.add(c.id);
        this.branchOf.set(c.id, id);
        grow(c.id);
      }
    };
    hubs.forEach(grow);
    for (const n of skills) {
      if (placed.has(n.id)) continue;
      placed.add(n.id);
      this.branchOf.set(n.id, n.ability);
      kids.set(n.ability, [...(kids.get(n.ability) ?? []), n]);
      grow(n.id);
    }
    const children = (id: string) => (kids.get(id) ?? []).filter((c) => this.branchOf.get(c.id) === id);
    const tips = new Map<string, number>();
    const countTips = (id: string): number => {
      if (tips.has(id)) return tips.get(id)!;
      tips.set(id, 1);
      const cs = children(id);
      const t = cs.length ? cs.reduce((a, c) => a + countTips(c.id), 0) : 1;
      tips.set(id, t);
      return t;
    };
    const ring = new Map<string, number>();
    const measure = (id: string, d: number) => {
      ring.set(id, d);
      for (const c of children(id)) measure(c.id, d + 1);
    };
    hubs.forEach((h) => measure(h, 0));
    this.ringOf = ring;
    const total = hubs.reduce((a, h) => a + countTips(h), 0);
    const deepest = Math.max(1, ...ring.values());
    // Rings far enough apart, and the outer one long enough for every tip.
    const HUB_R = 150;
    const CELL = 68;
    const step = Math.max(105, ((total * CELL) / (Math.PI * 2) - HUB_R) / deepest);
    const radius = (d: number) => HUB_R + d * step;
    const place = (id: string, a0: number, a1: number) => {
      const ang = (a0 + a1) / 2;
      const r = radius(ring.get(id) ?? 0);
      this.slots.set(id, { x: Math.cos(ang) * r, y: Math.sin(ang) * r });
      const cs = children(id);
      const sum = cs.reduce((a, c) => a + countTips(c.id), 0) || 1;
      let a = a0;
      for (const c of cs) {
        const w = ((a1 - a0) * countTips(c.id)) / sum;
        place(c.id, a, a + w);
        a += w;
      }
    };
    let a = -Math.PI / 2 - (Math.PI * countTips(hubs[0])) / total;
    for (const h of hubs) {
      const w = (Math.PI * 2 * countTips(h)) / total;
      place(h, a, a + w);
      a += w;
    }
    for (let d = 1; d <= deepest; d++) this.guides.push({ at: radius(d) - step / 2, label: "" });
  }

  /** Whether a skill is inside a topic, at any depth. */
  private isUnder(id: string, topicId: string): boolean {
    for (let t = this.partOf.get(id), n = 0; t && n < 64; t = this.partOf.get(t), n++) if (t === topicId) return true;
    return false;
  }

  private applyForces(heat: number) {
    const layout = this.opts.layout;
    const visible = this.nodes.filter((n) => this.opts.courses || n.kind !== "course");
    const visibleIds = new Set(visible.map((n) => n.id));
    const links = this.links.filter(
      (l) => visibleIds.has(String((l.source as Node).id ?? l.source)) && visibleIds.has(String((l.target as Node).id ?? l.target)),
    );
    this.computeSlots(visible);
    const structured = layout !== "clusters";
    // Ability hubs are anchors: fixed where the layout puts them.
    for (const n of visible) {
      if (n.kind !== "ability") continue;
      const p = this.hubPoint(n.id);
      n.fx = p.x;
      n.fy = p.y;
      n.x = p.x;
      n.y = p.y;
    }
    const target = (n: Node): Pt => {
      if (n.kind === "course") return { x: n.x ?? 0, y: n.y ?? 0 };
      const slot = this.slots.get(n.id);
      if (slot) return slot;
      // Clusters: around the hub, pulled a little toward the middle.
      const hub = this.hubPoint(n.ability);
      return { x: hub.x * 0.72, y: hub.y * 0.72 };
    };
    // Like Obsidian's graph: skills push each other apart and links pull like springs, so
    // dragging one tugs its neighbours along. The layout's slots only guide the shape
    // (strongly in the tree, gently in the radial map, not at all in clusters).
    const radial = layout === "radial";
    const pull = radial ? 0.16 : structured ? 0.35 : 0.09;
    // Radial: each skill also hangs on a spring from the one it branches out of.
    const springs = radial
      ? [...this.branchOf]
          .filter(([id, from]) => visibleIds.has(id) && visibleIds.has(from))
          .map(([id, from]) => ({ source: from, target: id, kind: "part", met: true, hidden: true }) as unknown as Link)
      : [];
    this.sim
      .nodes(visible)
      .force(
        "link",
        forceLink<Node, Link>([...links, ...springs])
          .id((d) => d.id)
          .distance((l) => (l.kind === "course" ? 34 : radial ? 95 : 78))
          .strength((l) => (l.kind === "course" ? 0.9 : radial ? (springs.includes(l) ? 0.35 : 0.08) : structured ? 0.05 : 0.35)),
      )
      .force(
        "charge",
        forceManyBody<Node>()
          .strength((d) => (d.kind === "course" ? -30 : d.kind === "ability" ? (structured ? -160 : -500) : radial ? -170 : structured ? -60 : -210))
          .distanceMax(radial ? 380 : structured ? 180 : 600),
      )
      .force(
        "x",
        forceX<Node>((d) => target(d).x).strength((d) => (d.kind === "skill" ? pull : 0)),
      )
      .force(
        "y",
        forceY<Node>((d) => target(d).y).strength((d) => (d.kind === "skill" ? pull : 0)),
      )
      .force("collide", forceCollide<Node>((d) => d.r + (d.kind === "course" ? 4 : radial ? 9 : structured ? 6 : 14)).iterations(2));
    this.sim.alpha(Math.max(this.sim.alpha(), heat));
    if (this.reduced) {
      this.sim.stop();
      for (let i = 0; i < 260; i++) this.sim.tick();
      if (this.autoFit) this.fit(undefined, false);
      this.request();
    } else this.sim.restart();
  }

  // ---- camera --------------------------------------------------------------------------------------

  private toWorld(p: Pt): Pt {
    return { x: (p.x - this.t.x) / this.t.k, y: (p.y - this.t.y) / this.t.k };
  }

  private toScreen(p: Pt): Pt {
    return { x: p.x * this.t.k + this.t.x, y: p.y * this.t.k + this.t.y };
  }

  private animateTo(to: Camera, animate = true) {
    // A deliberate camera move leaves the pointer over something else.
    if (animate && this.hover) {
      this.hover = null;
      this.cb.onHover(null, null);
    }
    if (!animate || this.reduced) {
      this.t = to;
      this.anim = null;
    } else this.anim = { from: { ...this.t }, to, start: performance.now() };
    this.request();
  }

  fit(ids?: string[], animate = true) {
    const nodes = (ids?.length ? ids.map((id) => this.byId.get(id)).filter((n): n is Node => !!n) : this.nodes).filter(
      (n) => n.x !== undefined && (this.opts.courses || n.kind !== "course"),
    );
    if (!nodes.length || !this.w) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of nodes) {
      x0 = Math.min(x0, n.x! - n.r - 30);
      y0 = Math.min(y0, n.y! - n.r - 30);
      x1 = Math.max(x1, n.x! + n.r + 30);
      y1 = Math.max(y1, n.y! + n.r + 46);
    }
    if (!ids?.length && this.opts.layout === "tree" && this.guides.length) {
      for (const p of this.slots.values()) x0 = Math.min(x0, p.x - 80);
    }
    if (!ids?.length) this.autoFit = true;
    const aw = this.w - this.inset.left - this.inset.right;
    const ah = this.h - this.inset.top - this.inset.bottom;
    const k = clamp(Math.min(aw / (x1 - x0), ah / (y1 - y0)), MIN_K, ids?.length === 1 ? 1.4 : 1.6);
    const to = {
      k,
      x: this.inset.left + aw / 2 - ((x0 + x1) / 2) * k,
      y: this.inset.top + ah / 2 - ((y0 + y1) / 2) * k,
    };
    this.animateTo(to, animate);
  }

  centerOn(id: string) {
    const n = this.byId.get(id);
    if (!n || n.x === undefined) return;
    const aw = this.w - this.inset.left - this.inset.right;
    const ah = this.h - this.inset.top - this.inset.bottom;
    const k = Math.max(this.t.k, 0.9);
    this.autoFit = false;
    this.animateTo({
      k,
      x: this.inset.left + aw / 2 - n.x * k,
      y: this.inset.top + ah / 2 - n.y! * k,
    });
  }

  reveal(id: string) {
    const n = this.byId.get(id);
    if (!n || n.x === undefined) return;
    const s = this.toScreen({ x: n.x, y: n.y! });
    const pad = 60;
    if (s.x < this.inset.left + pad || s.x > this.w - this.inset.right - pad || s.y < this.inset.top + pad || s.y > this.h - this.inset.bottom - pad) {
      this.centerOn(id);
    }
  }

  /** Keyboard focus on a skill: ring it and bring it into view. */
  focus(id: string | null) {
    this.focusId = id;
    if (id) this.reveal(id);
    this.request();
  }

  panBy(dx: number, dy: number) {
    this.autoFit = false;
    this.t = { ...this.t, x: this.t.x + dx, y: this.t.y + dy };
    this.request();
  }

  zoomBy(f: number, at?: Pt) {
    const c = at ?? { x: this.w / 2, y: this.h / 2 };
    const k = clamp(this.t.k * f, MIN_K, MAX_K);
    const w = this.toWorld(c);
    this.autoFit = false;
    this.t = { k, x: c.x - w.x * k, y: c.y - w.y * k };
    this.request();
  }

  // ---- paths --------------------------------------------------------------------------------------

  /** Everything a skill needs (ancestors) and leads to (descendants), plus its courses. */
  pathOf(id: string): Set<string> {
    const out = new Set<string>([id]);
    const walk = (start: string, next: Map<string, string[]>) => {
      const stack = [start];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const n of next.get(cur) ?? []) {
          if (out.has(n)) continue;
          out.add(n);
          stack.push(n);
        }
      }
    };
    walk(id, this.parents);
    walk(id, this.children);
    for (const l of this.links) {
      const s = (l.source as Node).id;
      const t = (l.target as Node).id;
      if (l.kind === "course" && out.has(s)) out.add(t);
    }
    const n = this.byId.get(id);
    if (n?.kind === "ability") for (const m of this.nodes) if (m.ability === id) out.add(m.id);
    return out;
  }

  // ---- drawing -------------------------------------------------------------------------------------

  private request() {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.draw());
  }

  private draw() {
    this.frame = 0;
    const now = performance.now();
    if (this.anim) {
      const p = clamp((now - this.anim.start) / 320, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const { from, to } = this.anim;
      this.t = {
        k: from.k + (to.k - from.k) * e,
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
      };
      if (p >= 1) this.anim = null;
    } else if (this.autoFit && this.sim.alpha() > 0.02) this.fit(undefined, false);

    const { ctx, theme, t } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    const focus = this.hover?.id ?? this.focusId ?? this.opts.selectedId;
    const path = focus && this.byId.has(focus) ? this.pathOf(focus) : null;
    const dim = (id: string) => (path ? !path.has(id) : this.opts.matches ? !this.opts.matches.has(id) : false);
    const showCourse = (n: Node) => this.opts.courses || n.kind !== "course";

    // Tier guides: bands (tree) or circles (rings), one per prerequisite depth.
    if (this.guides.length) {
      let gx0 = Infinity;
      let gx1 = -Infinity;
      for (const p of this.slots.values()) ((gx0 = Math.min(gx0, p.x)), (gx1 = Math.max(gx1, p.x)));
      ctx.save();
      ctx.strokeStyle = theme.muted;
      ctx.fillStyle = theme.muted;
      ctx.lineWidth = 1 / t.k;
      ctx.setLineDash([3 / t.k, 6 / t.k]);
      ctx.font = `700 ${11 / Math.max(t.k, 0.6)}px ${theme.font}`;
      for (const g of this.guides) {
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        if (this.opts.layout === "tree") {
          ctx.moveTo(gx0 - 70, g.at);
          ctx.lineTo(gx1 + 70, g.at);
        } else ctx.arc(0, 0, g.at, 0, Math.PI * 2);
        ctx.stroke();
        if (this.opts.layout === "tree") {
          ctx.globalAlpha = 0.6;
          ctx.textAlign = "left";
          ctx.fillText(g.label.toUpperCase(), gx0 - 70, g.at + 14 / Math.max(t.k, 0.6));
        }
      }
      ctx.restore();
    }

    // Learning paths Claude mapped: a soft road along each path's prerequisites,
    // labelled at its first step (see the label pass).
    const roads: {
      name: string;
      color: string;
      start: Node;
      faded: boolean;
    }[] = [];
    const branches = new Map<string, Node[]>();
    for (const n of this.nodes) if (n.kind === "skill" && n.branch && n.x !== undefined) branches.set(n.branch, [...(branches.get(n.branch) ?? []), n]);
    for (const [name, members] of branches) {
      const color = pathColor(name);
      const ids = new Set(members.map((m) => m.id));
      const faded = path ? !members.some((m) => path.has(m.id)) : this.opts.matches ? !members.some((m) => this.opts.matches!.has(m.id)) : false;
      const start = members.reduce((a, b) => (b.depth < a.depth ? b : a), members[0]);
      roads.push({ name, color, start, faded });
      // The radial map's branches are the paths already.
      if (this.opts.layout === "radial") continue;
      // One path, stroked once, so overlapping stretches don't darken.
      ctx.beginPath();
      for (const m of members) {
        ctx.moveTo(m.x!, m.y!);
        ctx.lineTo(m.x! + 0.01, m.y!);
      }
      for (const l of this.links) {
        const a = l.source as Node;
        const b = l.target as Node;
        if (l.kind !== "prereq" || !ids.has(a.id) || !ids.has(b.id)) continue;
        const dx = b.x! - a.x!;
        const dy = b.y! - a.y!;
        ctx.moveTo(a.x!, a.y!);
        ctx.quadraticCurveTo((a.x! + b.x!) / 2 - dy * 0.08, (a.y! + b.y!) / 2 + dx * 0.08, b.x!, b.y!);
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 44;
      ctx.strokeStyle = alpha(color, faded ? 0.04 : this.opts.dark ? 0.16 : 0.12);
      ctx.stroke();
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
    }

    // Radial: branches out from you to each ability, and from every skill to the one it
    // grows out of, thick near the middle and finer toward the tips.
    if (this.opts.layout === "radial") {
      const polar = (p: Pt) => ({ a: Math.atan2(p.y, p.x), r: Math.hypot(p.x, p.y) });
      const branch = (from: Pt, to: Node, width: number) => {
        const lit = path?.has(to.id) ?? false;
        const faded = dim(to.id);
        const a = polar(from);
        const b = polar({ x: to.x!, y: to.y! });
        const rm = (a.r + b.r) / 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        if (a.r < 1) ctx.lineTo(to.x!, to.y!);
        else ctx.bezierCurveTo(Math.cos(a.a) * rm, Math.sin(a.a) * rm, Math.cos(b.a) * rm, Math.sin(b.a) * rm, to.x!, to.y!);
        ctx.strokeStyle = alpha(to.color, faded ? 0.07 : lit ? 0.9 : to.locked ? 0.28 : 0.5);
        ctx.lineWidth = lit ? width + 1 : width;
        ctx.lineCap = "round";
        if (to.locked) ctx.setLineDash([6, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = "butt";
      };
      for (const h of this.nodes) if (h.kind === "ability" && h.x !== undefined) branch({ x: 0, y: 0 }, h, 7);
      for (const [id, from] of this.branchOf) {
        const to = this.byId.get(id);
        const f = this.byId.get(from);
        if (!to || !f || to.x === undefined || f.x === undefined) continue;
        branch({ x: f.x, y: f.y! }, to, Math.max(1.6, 5.5 - (this.ringOf.get(id) ?? 1) * 0.9));
      }
    }

    // Hub spokes: faint lines from each skill to its ability (just the first
    // tier in the tree, where deeper skills hang off their prerequisites).
    if (this.opts.layout !== "radial") {
      for (const n of this.nodes) {
        if (n.kind !== "skill" || n.x === undefined || (this.opts.layout !== "clusters" && n.depth > 0) || this.isPart(n)) continue;
        const hub = this.byId.get(n.ability);
        if (!hub || hub.x === undefined) continue;
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y!);
        ctx.lineTo(n.x, n.y!);
        ctx.strokeStyle = alpha(n.color, dim(n.id) ? 0.03 : 0.1);
        ctx.lineWidth = 1 / t.k;
        ctx.stroke();
      }
    }

    // Links.
    for (const l of this.links) {
      const s = l.source as Node;
      const d = l.target as Node;
      if (l.hidden || s.x === undefined || d.x === undefined || !showCourse(s) || !showCourse(d)) continue;
      // Radial: a link along a branch is the branch itself.
      if (this.opts.layout === "radial" && l.kind !== "course" && this.branchOf.get(d.id) === s.id) continue;
      const faded = dim(s.id) || dim(d.id);
      const arrow = l.kind !== "course";
      const lit = path && path.has(s.id) && path.has(d.id);
      const dx = d.x - s.x;
      const dy = d.y! - s.y!;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const x1 = s.x + ux * s.r;
      const y1 = s.y! + uy * s.r;
      const x2 = d.x - ux * (d.r + (arrow ? 4 : 0));
      const y2 = d.y! - uy * (d.r + (arrow ? 4 : 0));
      // A gentle curve so crossing edges read apart.
      const mx = (x1 + x2) / 2 - uy * len * 0.08;
      const my = (y1 + y2) / 2 + ux * len * 0.08;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
      const base = l.kind === "course" ? theme.edge : l.met ? d.color : theme.edge;
      ctx.strokeStyle = faded ? alpha(theme.edge.startsWith("#") ? theme.edge : "#888888", 0.12) : lit ? d.color : base;
      // Radial: links across branches (not along one) are quieter, the branches carry the shape.
      const across = this.opts.layout === "radial" && l.kind === "prereq";
      ctx.globalAlpha = faded ? 0.35 : l.kind === "course" ? 0.55 : l.kind === "part" ? 0.6 : across && !lit ? 0.45 : 0.85;
      ctx.lineWidth = (lit ? 2.6 : l.kind === "prereq" ? 1.6 : 1.1) / Math.sqrt(t.k);
      if (!l.met && arrow) ctx.setLineDash([5 / t.k, 4 / t.k]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (arrow) {
        // Arrowhead along the curve's end tangent.
        const tx = x2 - mx;
        const ty = y2 - my;
        const tl = Math.hypot(tx, ty) || 1;
        const ax = tx / tl;
        const ay = ty / tl;
        const size = (l.kind === "part" ? 5.5 : 7) / Math.sqrt(t.k);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ax * size - ay * size * 0.55, y2 - ay * size + ax * size * 0.55);
        ctx.lineTo(x2 - ax * size + ay * size * 0.55, y2 - ay * size - ax * size * 0.55);
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle as string;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Nodes.
    for (const n of this.nodes) {
      if (n.x === undefined || !showCourse(n)) continue;
      const faded = dim(n.id);
      ctx.globalAlpha = faded ? FADED : 1;
      const x = n.x;
      const y = n.y!;
      if (n.kind === "ability") {
        ctx.beginPath();
        ctx.arc(x, y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = alpha(n.color, 0.14);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = n.color;
        ctx.stroke();
        ctx.fillStyle = n.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `800 13px ${theme.font}`;
        ctx.fillText(n.label, x, y - 6);
        ctx.font = `600 11px ${theme.font}`;
        ctx.fillStyle = theme.text;
        ctx.fillText(n.sub ?? "", x, y + 9);
        ctx.textBaseline = "alphabetic";
      } else if (n.kind === "course") {
        const s = n.r;
        ctx.beginPath();
        ctx.roundRect(x - s, y - s, s * 2, s * 2, 3);
        ctx.fillStyle = theme.bg;
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.rect(x - s + 2, y + s - 2 - (s * 2 - 4) * n.progress, s * 2 - 4, (s * 2 - 4) * n.progress);
        ctx.fillStyle = alpha(n.color, 0.5);
        ctx.fill();
      } else {
        // Skill: filled disc (hollow when locked), progress ring, goal ring. Open ones
        // you haven't learnt yet glow, like an available skill in an RPG.
        if (!n.locked && !n.done) {
          ctx.beginPath();
          ctx.arc(x, y, n.r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(n.color, 0.22);
          ctx.lineWidth = 8;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.locked ? theme.bg : alpha(n.color, 0.9);
        ctx.fill();
        if (n.locked) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = alpha(n.color, 0.7);
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (n.learnt) {
          // A topic: a second rim inside, like a medal.
          ctx.beginPath();
          ctx.arc(x, y, n.r - 4, 0, Math.PI * 2);
          ctx.strokeStyle = n.locked ? alpha(n.color, 0.5) : alpha(theme.bg.startsWith("#") ? theme.bg : "#ffffff", 0.7);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          // Its track, so an empty ring still reads as "0 of N".
          ctx.beginPath();
          ctx.arc(x, y, n.r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(n.color, 0.18);
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, n.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * n.progress);
        ctx.strokeStyle = n.color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
        if (n.goal) {
          ctx.beginPath();
          ctx.arc(x, y, n.r + 8.5, 0, Math.PI * 2);
          ctx.strokeStyle = theme.gold;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (this.opts.selectedId === n.id || this.hover === n || this.focusId === n.id) {
          ctx.beginPath();
          ctx.arc(x, y, n.r + (n.goal ? 13 : 9), 0, Math.PI * 2);
          ctx.strokeStyle = this.opts.selectedId === n.id || this.focusId === n.id ? theme.accent : alpha(n.color, 0.6);
          ctx.lineWidth = 2.5;
          if (this.focusId === n.id && this.opts.selectedId !== n.id) ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Emoji and level badge, when big enough to read.
        if (n.r * t.k >= 9) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = (faded ? FADED : 1) * (n.locked ? 0.6 : 1);
          if (n.glyph) {
            // The skill's line icon, white on its disc (its color when locked).
            const g = n.r * 1.05;
            ctx.save();
            ctx.translate(x - g / 2, y - g / 2);
            ctx.scale(g / 24, g / 24);
            ctx.lineWidth = 2.1;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.strokeStyle = n.locked ? n.color : "#ffffff";
            ctx.stroke(path2d(n.glyph));
            ctx.restore();
          } else {
            ctx.font = `${Math.round(n.r * 1.05)}px ${EMOJI_FONT}`;
            ctx.fillStyle = theme.text;
            ctx.fillText(n.icon, x, y + 1);
          }
          ctx.globalAlpha = faded ? FADED : 1;
          const bx = x + n.r * 0.78;
          const by = y + n.r * 0.78;
          // Badge: the level, "3/5" learnt for a topic, a check once learnt, a lock.
          const text = n.locked ? "🔒" : n.done ? "✓" : n.learnt ? `${n.learnt.done}/${n.learnt.total}` : String(n.level);
          ctx.font = `700 9px ${theme.font}`;
          const bw = Math.max(15, ctx.measureText(text).width + 8);
          ctx.beginPath();
          ctx.roundRect(bx - bw / 2, by - 7.5, bw, 15, 7.5);
          ctx.fillStyle = n.done ? n.color : theme.bg;
          ctx.fill();
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.fillStyle = n.done ? "#fff" : theme.text;
          ctx.fillText(text, bx, by + 0.5);
          ctx.textBaseline = "alphabetic";
        }
        // Claude is working on it: a turning arc.
        if (n.busy) {
          const a0 = (now / 600) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(x, y, n.r + 10, a0, a0 + Math.PI * 1.2);
          ctx.strokeStyle = theme.accent;
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.stroke();
          ctx.lineCap = "butt";
        }
        // Collaborators looking at it: their colors along the rim.
        n.peers?.forEach((c, i) => {
          const a = -Math.PI / 4 - i * 0.5;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * (n.r + 5), y + Math.sin(a) * (n.r + 5), 4.5, 0, Math.PI * 2);
          ctx.fillStyle = c;
          ctx.fill();
          ctx.strokeStyle = theme.bg;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }
      // Level-up pulse.
      const fx = this.effects.get(n.id);
      if (fx !== undefined) {
        const p = (now - fx) / 1400;
        if (p >= 1) this.effects.delete(n.id);
        else {
          ctx.beginPath();
          ctx.arc(x, y, n.r + 6 + p * 40, 0, Math.PI * 2);
          ctx.strokeStyle = alpha(n.color, 1 - p);
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    // You, in the middle of the radial map.
    const me = this.opts.layout === "radial" ? this.opts.center : null;
    if (me) {
      const R = 38;
      ctx.beginPath();
      ctx.arc(0, 0, R + 9, 0, Math.PI * 2);
      ctx.fillStyle = alpha(me.color, this.hoverCenter ? 0.22 : 0.12);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = me.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.bg.startsWith("#") ? theme.bg : "#ffffff";
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 22px ${theme.font}`;
      ctx.fillText(me.initials, 0, 1);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    if (me) {
      // Your level and class under you, in screen space like the other labels.
      const c = this.toScreen({ x: 0, y: 0 });
      const below = c.y + 47 * t.k + 16;
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.bg;
      ctx.font = `800 14px ${theme.font}`;
      ctx.strokeText(me.title, c.x, below);
      ctx.fillStyle = theme.text;
      ctx.fillText(me.title, c.x, below);
      ctx.font = `600 11.5px ${theme.font}`;
      ctx.strokeText(me.sub, c.x, below + 15);
      ctx.fillStyle = theme.muted;
      ctx.fillText(me.sub, c.x, below + 15);
    }

    // Labels in screen space, crisp at any zoom. Most important first; a label
    // that would overlap one already placed (or another node) tries above its
    // node, then gives way, so zooming in reveals more of them.
    type Box = { x0: number; y0: number; x1: number; y1: number };
    const overlaps = (b: Box, o: Box) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0;
    const placed: Box[] = [];
    const discs = new Map<string, Box>();
    for (const n of this.nodes) {
      if (n.x === undefined || !showCourse(n)) continue;
      const s = this.toScreen({ x: n.x, y: n.y! });
      const r = n.r * t.k;
      const b = { x0: s.x - r, y0: s.y - r, x1: s.x + r, y1: s.y + r };
      discs.set(n.id, b);
      if (n.kind === "ability") placed.push(b);
    }
    const candidates = this.nodes
      .filter((n) => n.x !== undefined && n.kind !== "ability" && showCourse(n))
      .map((n) => {
        const important = this.hover === n || this.opts.selectedId === n.id || (path?.has(n.id) ?? false) || (this.opts.matches?.has(n.id) ?? false);
        // Only the skill you're on always gets its label; the rest of its path gives way when crowded.
        const forced = this.hover === n || this.opts.selectedId === n.id || this.focusId === n.id;
        const rank =
          this.hover === n
            ? 1e6
            : this.opts.selectedId === n.id
              ? 1e5
              : (important ? 1e4 : 0) + (n.kind === "course" ? 0 : 100 + n.level * 4 + (n.goal ? 20 : 0) + (n.learnt ? 400 : 0));
        return { n, important, forced, rank };
      })
      .filter(({ n, important }) => important || (this.opts.labels && !dim(n.id) && t.k >= (n.kind === "course" ? 1.1 : 0.45)))
      .sort((a, b) => b.rank - a.rank);
    ctx.textAlign = "center";
    for (const road of roads) {
      const n = road.start;
      const s = this.toScreen({ x: n.x!, y: n.y! });
      ctx.font = `800 11px ${theme.font}`;
      const label = (road.name.length > 32 ? `${road.name.slice(0, 31)}…` : road.name).toUpperCase();
      const w = ctx.measureText(label).width;
      const gap = (n.r + (n.goal ? 10 : 7)) * t.k;
      const box = (base: number): Box => ({
        x0: s.x - w / 2 - 3,
        y0: base - 11,
        x1: s.x + w / 2 + 3,
        y1: base + 4,
      });
      // Above its first step, else below it, wherever it covers no other skill.
      const spots = [s.y - gap - 7, s.y + gap + 13];
      const y = spots.find((b) => !placed.some((o) => overlaps(box(b), o)) && ![...discs].some(([id, o]) => id !== n.id && overlaps(box(b), o))) ?? spots[0];
      placed.push(box(y));
      ctx.globalAlpha = road.faded ? 0.35 : 1;
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.bg;
      ctx.strokeText(label, s.x, y);
      ctx.fillStyle = road.color;
      ctx.fillText(label, s.x, y);
      ctx.globalAlpha = 1;
    }
    for (const { n, forced } of candidates) {
      const s = this.toScreen({ x: n.x!, y: n.y! });
      ctx.font = `${n.kind === "course" ? 500 : n.learnt ? 750 : 600} ${n.kind === "course" ? 11 : n.learnt ? 14 : 12.5}px ${theme.font}`;
      const label = n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label;
      const w = ctx.measureText(label).width;
      const gap = (n.r + (n.goal ? 10 : 7)) * t.k;
      const spots = [s.y + gap + 13, s.y - gap - 5];
      const box = (base: number): Box => ({
        x0: s.x - w / 2 - 3,
        y0: base - 11,
        x1: s.x + w / 2 + 3,
        y1: base + 4,
      });
      const clearOfLabels = (b: Box) => !placed.some((o) => overlaps(b, o));
      const clearOfNodes = (b: Box) => ![...discs].some(([id, o]) => id !== n.id && overlaps(b, o));
      let at = spots.find((y) => clearOfLabels(box(y)) && clearOfNodes(box(y)));
      if (at === undefined && forced) at = spots.find((y) => clearOfLabels(box(y))) ?? spots[0];
      if (at === undefined) continue;
      placed.push(box(at));
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.bg;
      ctx.strokeText(label, s.x, at);
      ctx.fillStyle = n.kind === "course" ? theme.muted : theme.text;
      ctx.fillText(label, s.x, at);
    }

    if (this.anim || this.effects.size || (!this.reduced && this.nodes.some((n) => n.busy))) this.request();
  }

  // ---- pointer ------------------------------------------------------------------------------------

  private pointAt(e: PointerEvent | WheelEvent | MouseEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private nodeAt(p: Pt): Node | null {
    const w = this.toWorld(p);
    let best: Node | null = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      if (n.x === undefined || (!this.opts.courses && n.kind === "course")) continue;
      const d = Math.hypot(n.x - w.x, n.y! - w.y);
      if (d <= n.r + 6 / this.t.k && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private onDown = (e: PointerEvent) => {
    // Right-click opens details (contextmenu), it doesn't start a lesson.
    if (e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pointAt(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        k: this.t.k,
      };
      this.drag = null;
      this.pan = null;
      return;
    }
    const n = this.nodeAt(p);
    if (n && n.kind !== "ability") {
      this.drag = { node: n, start: p, moved: false };
      // Press and hold (touch, pen) shows details instead of starting a lesson.
      if (e.pointerType !== "mouse") {
        const id = n.id;
        this.press = {
          id,
          timer: window.setTimeout(() => {
            if (this.drag?.node.id !== id || this.drag.moved) return;
            this.drag = null;
            this.held = performance.now();
            this.cb.onDetails(id);
          }, 550),
        };
      }
    } else this.pan = { start: p, t: { ...this.t }, moved: false };
    this.anim = null;
  };

  /** When a press-and-hold last opened details (a contextmenu right after it is the same gesture). */
  private held = 0;

  private onContext = (e: MouseEvent) => {
    e.preventDefault();
    if (performance.now() - this.held < 1000) return;
    const n = this.nodeAt(this.pointAt(e));
    if (n && n.kind !== "ability") this.cb.onDetails(n.id);
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointAt(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const k = clamp(this.pinch.k * (dist / (this.pinch.dist || 1)), MIN_K, MAX_K);
      const w = this.toWorld(this.pinch.mid);
      this.t = {
        k,
        x: this.pinch.mid.x - w.x * k,
        y: this.pinch.mid.y - w.y * k,
      };
      this.autoFit = false;
      this.request();
      return;
    }
    if (this.drag) {
      if (!this.drag.moved && Math.hypot(p.x - this.drag.start.x, p.y - this.drag.start.y) > 4) {
        this.drag.moved = true;
        if (this.press) clearTimeout(this.press.timer);
        this.autoFit = false;
        this.sim.alphaTarget(0.25).restart();
      }
      if (this.drag.moved) {
        const w = this.toWorld(p);
        this.drag.node.fx = w.x;
        this.drag.node.fy = w.y;
      }
      return;
    }
    if (this.pan) {
      const dx = p.x - this.pan.start.x;
      const dy = p.y - this.pan.start.y;
      if (!this.pan.moved && Math.hypot(dx, dy) > 4) this.pan.moved = true;
      if (this.pan.moved) {
        this.autoFit = false;
        this.t = { ...this.pan.t, x: this.pan.t.x + dx, y: this.pan.t.y + dy };
        this.request();
      }
      return;
    }
    const n = this.nodeAt(p);
    const onMe = !n && this.onCenter(p);
    if (onMe !== this.hoverCenter) {
      this.hoverCenter = onMe;
      this.request();
    }
    if (n !== this.hover) {
      this.hover = n;
      this.canvas.style.cursor = n || onMe ? "pointer" : "grab";
      this.cb.onHover(n?.id ?? (onMe ? "@you" : null), n || onMe ? p : null);
      this.request();
    } else if (n) this.cb.onHover(n.id, p);
    else if (onMe) {
      this.canvas.style.cursor = "pointer";
      this.cb.onHover("@you", p);
    } else this.cb.onHover(null, null);
  };

  /** Whether a screen point is on you, in the middle of the radial map. */
  private onCenter(p: Pt): boolean {
    if (this.opts.layout !== "radial" || !this.opts.center) return false;
    const w = this.toWorld(p);
    return Math.hypot(w.x, w.y) <= 42;
  }

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.press) {
      clearTimeout(this.press.timer);
      this.press = null;
    }
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    if (this.drag) {
      const { node, moved } = this.drag;
      this.drag = null;
      if (moved) {
        this.sim.alphaTarget(0);
        node.fx = null;
        node.fy = null;
      } else this.cb.onSelect(node.id);
      return;
    }
    if (this.pan) {
      const { moved } = this.pan;
      this.pan = null;
      if (!moved) {
        const p = this.pointAt(e);
        const n = this.nodeAt(p);
        this.cb.onSelect(n?.kind === "ability" ? n.id : !n && this.onCenter(p) ? "@you" : null);
      }
    }
  };

  private onLeave = () => {
    if (this.hover) {
      this.hover = null;
      this.cb.onHover(null, null);
      this.request();
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
    this.zoomBy(f, this.pointAt(e));
  };
}

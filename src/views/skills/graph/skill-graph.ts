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
// its whole path: everything it needs and everything it leads to, strongest
// next to it and fading the farther along the path it goes.

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
  /** In the built-in tree but not started yet. */
  planned?: boolean;
  /** Its level in the built-in tree: area › field › topic › step, then advanced and expert (the top of a field). */
  tier?: "general" | "field" | "sub" | "detail" | "advanced" | "expert";
}

export interface SGLink {
  source: string;
  target: string;
  /** prereq: needed first; part: a topic → one of its parts; course: skill → its course; related: linked, not needed. */
  kind: "prereq" | "part" | "course" | "related";
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

const radius = (n: SGNode) => {
  if (n.kind === "ability") return 30;
  if (n.kind === "course") return 9;
  const grow = (max: number, per: number) => (n.planned ? 0 : Math.min(max, Math.sqrt(Math.max(1, n.level)) * per));
  // The built-in tree: general topics biggest, then sub-topics and advanced skills, then the details between them.
  if (n.tier === "general") return 24 + grow(8, 1.5);
  if (n.tier === "field") return 19 + grow(8, 1.4);
  if (n.tier === "expert") return 17 + grow(6, 1.2);
  if (n.tier === "sub" || n.tier === "advanced") return 14 + grow(6, 1.2);
  if (n.tier === "detail") return 8 + grow(6, 1.2);
  return n.learnt ? 18 + Math.min(14, Math.sqrt(n.learnt.total) * 3) : 12 + Math.min(16, Math.sqrt(Math.max(1, n.level)) * 3.2);
};
/** Optional node fields, cleared before each update so a removed one doesn't linger. */
const OPTIONAL: (keyof SGNode)[] = ["branch", "sub", "learnt", "done", "busy", "peers", "glyph", "planned", "tier"];
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

/** A color with an opacity, as CSS (cached: the map asks for the same few thousands of times a frame). */
const alphas = new Map<string, string>();
function alpha(hex: string, a: number): string {
  const q = Math.round(a * 100) / 100;
  const key = hex + q;
  let out = alphas.get(key);
  if (out === undefined) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    const n = m ? parseInt(m[1], 16) : 0;
    out = m ? `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${q})` : hex;
    if (alphas.size > 5000) alphas.clear();
    alphas.set(key, out);
  }
  return out;
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
  /** Label widths by font and text (measuring text is slow; the same labels come back every frame). */
  private widths = new Map<string, number>();
  /** The last path worked out (see pathOf), kept until the map changes. */
  private pathCache: { id: string; hops: Map<string, number> } | null = null;
  /** Part → the topic it belongs to. */
  private partOf = new Map<string, string>();
  /** Skill → the skills it needs (prerequisite links only). */
  private needs = new Map<string, string[]>();
  /** Radial layout: each node's branch (skill → the skill or ability it grows from). */
  private branchOf = new Map<string, string>();
  /** Radial layout: how many steps out from its ability each skill sits. */
  private ringOf = new Map<string, number>();
  /** Radial layout: the branches as drawn (from → to), and the same as "from>to" keys. */
  private branchEdges: [string, string][] = [];
  private edgeSet = new Set<string>();
  /** Links that run along a drawn branch (the branch is drawn instead), worked out with the layout. */
  private alongBranch = new WeakSet<Link>();
  /** Nodes that just arrived: they start at their place instead of flying in. */
  private fresh = new Set<string>();
  /** Clusters: each group's circle and name (areas, and the fields in them), drawn behind the skills. */
  private groups: { x: number; y: number; r: number; label: string; color: string; level: number }[] = [];
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
        // New nodes start near their ability, or near a parent (or at their place, once it's known).
        const seed = this.seedPoint(n);
        node.x = seed.x + (Math.random() - 0.5) * 40;
        node.y = seed.y + (Math.random() - 0.5) * 40;
        this.fresh.add(n.id);
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
    this.pathCache = null;
    this.partOf = new Map(links.filter((l) => l.kind === "part").map((l) => [l.target, l.source]));
    this.needs = new Map();
    for (const l of links) if (l.kind === "prereq") this.needs.set(l.target, [...(this.needs.get(l.target) ?? []), l.source]);
    for (const l of links) {
      if (l.kind === "course" || l.kind === "related") continue;
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
    this.branchEdges = [];
    this.edgeSet = new Set();
    this.groups = [];
    this.branchOf = new Map();
    const layout = this.opts.layout;
    const hubs = this.abilityOrder.filter((a) => visible.some((n) => n.kind === "ability" && n.id === a));
    if (!hubs.length) return;
    const byId = new Map(visible.map((n) => [n.id, n]));
    if (layout === "radial") return this.radialSlots(visible, byId, hubs);
    if (layout === "tree") return this.treeSlots(visible, byId, hubs);
    return this.clusterSlots(visible, byId, hubs);
  }

  /** What a skill is directly part of, if that's on the map. */
  private containerOf(id: string, byId: Map<string, Node>): string | undefined {
    const c = this.partOf.get(id);
    return c && byId.get(c)?.kind === "skill" ? c : undefined;
  }

  /**
   * Tree: an outline read left to right, from the general to the detailed: each
   * ability, its areas, their fields, and every topic on a row of its own, with
   * the steps you learn in it strung after it in order. It scrolls down like a
   * table of contents.
   */
  private treeSlots(visible: Node[], byId: Map<string, Node>, hubs: string[]) {
    const skills = visible.filter((n) => n.kind === "skill");
    const kids = new Map<string, Node[]>();
    const top = new Map<string, Node[]>();
    for (const n of skills) {
      const c = this.containerOf(n.id, byId);
      if (c) kids.set(c, [...(kids.get(c) ?? []), n]);
      else top.set(n.ability, [...(top.get(n.ability) ?? []), n]);
    }
    const hasKids = (id: string) => (kids.get(id)?.length ?? 0) > 0;
    // A topic's steps are the parts with nothing inside them; they string out after it.
    const isStep = (n: Node) => !!this.containerOf(n.id, byId) && !hasKids(n.id) && n.tier !== "advanced" && n.tier !== "expert" && n.tier !== "sub" && n.tier !== "field";
    const COL = 290;
    const ROW = 34;
    const BEAD = 26;
    const FIRST_BEAD = 230;
    let row = 0;
    const put = (n: Node, depth: number): number => {
      const inside = kids.get(n.id) ?? [];
      const steps = inside.filter(isStep);
      const rest = inside.filter((c) => !isStep(c));
      const x = depth * COL;
      if (!rest.length) {
        // A row of its own, its steps after it like beads on a string.
        const y = row++ * ROW;
        this.slots.set(n.id, { x, y });
        steps.forEach((st, i) => {
          this.slots.set(st.id, { x: x + FIRST_BEAD + i * BEAD, y });
          const prev = i ? steps[i - 1].id : n.id;
          this.branchEdges.push([prev, st.id]);
          this.edgeSet.add(`${prev}>${st.id}`);
        });
        return y;
      }
      // Its parts below it, each on its own rows; it sits level with the first of them.
      const ys = rest.map((c) => {
        this.branchEdges.push([n.id, c.id]);
        this.edgeSet.add(`${n.id}>${c.id}`);
        return put(c, depth + 1);
      });
      const y = ys[0];
      this.slots.set(n.id, { x, y });
      if (steps.length) {
        // (A topic with parts of both kinds: its loose steps get a row of their own.)
        const sy = row++ * ROW;
        steps.forEach((st, i) => {
          this.slots.set(st.id, { x: x + COL + i * BEAD, y: sy });
          this.branchEdges.push([i ? steps[i - 1].id : n.id, st.id]);
          this.edgeSet.add(`${i ? steps[i - 1].id : n.id}>${st.id}`);
        });
      }
      return y;
    };
    for (const h of hubs) {
      const list = top.get(h) ?? [];
      const start = row;
      const ys = list.map((n) => {
        this.branchEdges.push([h, n.id]);
        this.edgeSet.add(`${h}>${n.id}`);
        return put(n, 1);
      });
      this.slots.set(h, { x: 0, y: ys[0] ?? start * ROW });
      if (!list.length) row++;
      row += 1.5;
    }
    this.branchOf = new Map(this.branchEdges.map(([f, t]) => [t, f]));
  }

  /**
   * Clusters: like skills together. Each field gets a space of its own inside its
   * area's, each area inside its ability's, sized to how much is in it and kept
   * apart from the rest; the skills spread out inside their field's space.
   */
  private clusterSlots(visible: Node[], byId: Map<string, Node>, hubs: string[]) {
    const skills = visible.filter((n) => n.kind === "skill");
    // Each skill's field and area: the containers above it (for your own skills, their topmost topic).
    const chain = (n: Node): Node[] => {
      const out: Node[] = [];
      for (let c = this.containerOf(n.id, byId), i = 0; c && i < 16; c = this.containerOf(c, byId), i++) out.unshift(byId.get(c)!);
      return out;
    };
    type Group = { id: string; label: string; color: string; members: Node[]; children: Map<string, Group>; r: number; x: number; y: number };
    const group = (id: string, label: string, color: string): Group => ({ id, label, color, members: [], children: new Map(), r: 0, x: 0, y: 0 });
    const root = group("", "", "");
    for (const h of hubs) {
      const hub = byId.get(h)!;
      root.children.set(h, group(h, hub.label, hub.color));
    }
    const topics = new Map<string, Node>();
    for (const n of skills) {
      const up = [...chain(n), n];
      const area = up.find((x) => x.tier === "general") ?? up[0];
      const field = up.find((x) => x.tier === "field") ?? (up.length > 1 ? up[1] : area);
      const ab = root.children.get(n.ability) ?? [...root.children.values()][0];
      if (!ab) continue;
      let ag = ab.children.get(area.id);
      if (!ag) ab.children.set(area.id, (ag = group(area.id, area.label, area.color)));
      // An area's own node heads its circle; a field's sits in the middle of its own.
      if (n === area && n.tier === "general") continue;
      let fg = ag.children.get(field.id);
      if (!fg) ag.children.set(field.id, (fg = group(field.id, field.label, field.color)));
      if (n === field && n.tier) continue;
      // Inside a field, each topic with its steps around it.
      const i = up.indexOf(field);
      const topic = up[i + 1] ?? n;
      let tg = fg.children.get(topic.id);
      if (!tg) fg.children.set(topic.id, (tg = group(topic.id, topic.label, topic.color)));
      if (n === topic) topics.set(topic.id, n);
      else tg.members.push(n);
    }
    // Sizes, from the inside out: a topic by its steps; the rest as rings of what they hold.
    const size = (g: Group): number => {
      if (!g.children.size) return (g.r = 16 + Math.sqrt(g.members.length) * 11);
      const kids = [...g.children.values()];
      const rs = kids.map(size);
      const gap = 18;
      const ring = kids.length === 1 ? 0 : Math.max(Math.max(...rs) * 1.05, rs.reduce((a, r) => a + 2 * r + gap, 0) / (Math.PI * 2));
      return (g.r = ring + Math.max(...rs) + 24);
    };
    size(root);
    const place = (g: Group, x: number, y: number, a0: number) => {
      g.x = x;
      g.y = y;
      const kids = [...g.children.values()];
      if (!kids.length) return;
      const rs = kids.map((k) => k.r);
      const total = rs.reduce((a, r) => a + 2 * r + 18, 0);
      const ring = kids.length === 1 ? 0 : Math.max(Math.max(...rs) * 1.05, total / (Math.PI * 2));
      let a = a0;
      kids.forEach((k, i) => {
        const span = ((2 * rs[i] + 18) / total) * Math.PI * 2;
        const mid = a + span / 2;
        place(k, x + Math.cos(mid) * ring, y + Math.sin(mid) * ring, mid + Math.PI);
        a += span;
      });
    };
    place(root, 0, 0, -Math.PI / 2);
    for (const [h, ag] of root.children) {
      this.slots.set(h, { x: ag.x, y: ag.y });
      for (const area of ag.children.values()) {
        this.groups.push({ x: area.x, y: area.y, r: area.r, label: area.label, color: area.color, level: 1 });
        for (const f of area.children.values()) {
          if (area.children.size > 1 || f.id !== area.id) this.groups.push({ x: f.x, y: f.y, r: f.r, label: f.label, color: f.color, level: 2 });
          // A field's node in the middle of its space; each topic in its own spot, its steps round it in order.
          if (byId.get(f.id)?.tier === "field") this.slots.set(f.id, { x: f.x, y: f.y });
          for (const tg of f.children.values()) {
            if (topics.has(tg.id)) this.slots.set(tg.id, { x: tg.x, y: tg.y });
            tg.members.forEach((n, i) => {
              const ang = -Math.PI / 2 + (i / Math.max(1, tg.members.length)) * Math.PI * 2;
              const rr = tg.r - 10;
              this.slots.set(n.id, { x: tg.x + Math.cos(ang) * rr, y: tg.y + Math.sin(ang) * rr });
            });
          }
        }
        // The area's own node heads its circle.
        if (byId.get(area.id)?.tier === "general") this.slots.set(area.id, { x: area.x, y: area.y - area.r + 28 });
      }
    }
  }

  /**
   * Radial: you in the middle, then rings, evenly spaced and each evenly filled:
   * the abilities, their areas, the fields in each. From each field its paths
   * grow straight out, general to detailed: a topic, the steps you learn there
   * one after another, then the next topic and its steps, up through the
   * advanced skills to the expert ones at the top. The path is the order, and
   * nothing is skipped. Every step along a path is the same distance, and paths
   * are packed so that nodes at the same distance from the middle are the same
   * distance apart (a radial tidy tree).
   */
  private radialSlots(visible: Node[], byId: Map<string, Node>, hubs: string[]) {
    const skills = visible.filter((n) => n.kind === "skill");
    const isSkill = (id: string | undefined): id is string => !!id && byId.get(id)?.kind === "skill";
    const container = (id: string) => {
      const c = this.partOf.get(id);
      return isSkill(c) ? c : undefined;
    };
    const parts = new Map<string, Node[]>();
    for (const n of skills) {
      const c = container(n.id);
      if (c) parts.set(c, [...(parts.get(c) ?? []), n]);
    }
    const hasParts = (id: string) => (parts.get(id)?.length ?? 0) > 0;
    // Steps: the parts you learn along the way (details, and parts with no parts of their own).
    const isStep = (id: string) => {
      const t = byId.get(id)?.tier;
      return !!container(id) && !hasParts(id) && t !== "advanced" && t !== "expert";
    };
    const steps = (id: string) => (parts.get(id) ?? []).filter((p) => isStep(p.id));
    const needsOf = (id: string) => (this.needs.get(id) ?? []).filter(isSkill);
    // The part of `c` that `id` is in (itself, or the topic above it that's directly in `c`).
    const within = (id: string, c: string) => {
      for (let x: string | undefined = id, i = 0; x && i < 64; x = container(x), i++) if (container(x) === c) return x;
      return undefined;
    };
    // What comes after a skill grows out of its last step (you finish them to go on).
    const exitOf = (id: string) => {
      const list = steps(id);
      return list.length ? list[list.length - 1].id : id;
    };

    // 1. The shape: what each skill grows out of, and its level (hops out from the middle
    // along the branches as drawn; the abilities are level 1).
    const from = new Map<string, string>();
    const depth = new Map<string, number>();
    const level = new Map<string, number>();
    const parent = new Map<string, string>();
    const visiting = new Set<string>();
    const levelOf = (id: string): number => {
      const known = level.get(id);
      if (known !== undefined) return known;
      const n = byId.get(id);
      if (!n || n.kind !== "skill") return 1;
      if (visiting.has(id)) return 2;
      visiting.add(id);
      let f: string;
      let dep: number;
      const c = container(id);
      if (c && isStep(id)) {
        levelOf(c);
        const list = steps(c);
        const i = list.indexOf(n);
        // Out of the step before it, else out of its topic.
        f = i > 0 ? list[i - 1].id : c;
        dep = (depth.get(c) ?? 1) + 1;
      } else if (c) {
        // A topic (or advanced skill) inside a field: after the one it follows that ends furthest out.
        levelOf(c);
        let best: string | undefined;
        let bestEnd = -Infinity;
        for (const x of new Set(needsOf(id).map((q) => within(q, c)).filter((q): q is string => !!q && q !== id))) {
          const e = levelOf(exitOf(x));
          if (e > bestEnd) ((bestEnd = e), (best = x));
        }
        f = best ?? c;
        dep = (depth.get(c) ?? 1) + 1;
      } else {
        // A skill of its own: out of what it needs that ends furthest out in its ability, else its
        // ability. (An area always grows out of its ability.)
        let best: string | undefined;
        let bestEnd = -Infinity;
        for (const q of n.tier === "general" ? [] : needsOf(id)) {
          if (byId.get(q)!.ability !== n.ability) continue;
          const e = levelOf(exitOf(q));
          if (e > bestEnd) ((bestEnd = e), (best = q));
        }
        const bc = best ? container(best) : undefined;
        f = best ? (bc && isStep(best) ? bc : best) : n.ability;
        dep = 1;
      }
      const src = isSkill(f) && !isStep(id) ? exitOf(f) : f;
      const lv = (isSkill(src) ? levelOf(src) : 1) + 1;
      visiting.delete(id);
      from.set(id, f);
      depth.set(id, dep);
      level.set(id, lv);
      parent.set(id, src);
      return lv;
    };
    for (const n of skills) levelOf(n.id);
    this.ringOf = depth;
    this.branchOf = from;

    // What grows directly out of each node, in order.
    const ROOT = "\u0000root";
    const kids = new Map<string, string[]>([[ROOT, hubs]]);
    for (const n of skills) {
      const p = parent.get(n.id)!;
      if (p !== n.id) kids.set(p, [...(kids.get(p) ?? []), n.id]);
    }
    const lvOf = (id: string) => (id === ROOT ? 0 : isSkill(id) ? level.get(id)! : 1);

    // Every node at each level, in order round the circle (the tree's own order, so branches never cross).
    const byLevel: string[][] = [];
    const walk = (id: string) => {
      for (const c of kids.get(id) ?? []) {
        (byLevel[lvOf(c)] ??= []).push(c);
        walk(c);
      }
    };
    walk(ROOT);

    // 2. Distances out from the middle: rings an equal step apart (the abilities, their areas,
    // the fields, then where the paths start), then every step along a path the same distance
    // on. The rings are as close in as they can be while every level still has room.
    const TAU = Math.PI * 2;
    const GAP = 14;
    const STEP = 46;
    const width = (id: string) => 2 * (byId.get(id)?.r ?? (id === ROOT ? 0 : 30)) + GAP;
    const room = (lv: number) => (byLevel[lv] ?? []).reduce((sum, id) => sum + width(id), 0);
    let ring = 150;
    for (let lv = 1; lv < byLevel.length; lv++) {
      // (The first rings are shared out evenly; the paths are packed, so they keep some slack.)
      const need = room(lv) * (lv <= 3 ? 1.35 : 1.25);
      ring = Math.max(ring, lv <= 4 ? need / (TAU * lv) : (need / TAU - (lv - 4) * STEP) / 4);
    }
    const radiusAt = (lv: number) => (lv <= 4 ? lv * ring : 4 * ring + (lv - 4) * STEP);

    // 3. Angles, ring by ring from the middle out. The abilities, areas and fields are spread
    // evenly round their rings; along the paths each node sits straight out from the one it
    // grows from (brothers and sisters side by side), moved aside only as far as it must be
    // to keep its gap from its neighbours.
    const angle = new Map<string, number>();
    for (let lv = 1; lv < byLevel.length; lv++) {
      const ids = byLevel[lv] ?? [];
      if (!ids.length) continue;
      const R = radiusAt(lv);
      // Where each would like to be: straight out, siblings either side.
      const want: number[] = [];
      for (let i = 0; i < ids.length; ) {
        const p = lv === 1 ? ROOT : parent.get(ids[i])!;
        let j = i;
        while (j < ids.length && (lv === 1 ? ROOT : parent.get(ids[j])!) === p) j++;
        let span = 0;
        for (let k = i; k < j; k++) span += width(ids[k]) / R;
        let a = (lv === 1 ? -Math.PI / 2 : angle.get(p)!) - (span - width(ids[i]) / R) / 2;
        for (let k = i; k < j; k++) {
          want[k] = a;
          if (k + 1 < j) a += (width(ids[k]) + width(ids[k + 1])) / 2 / R;
        }
        i = j;
      }
      if (lv <= 3) {
        // Evenly round the ring, turned to sit as close as it can to where they'd like to be.
        const gap = TAU / ids.length;
        const turn = ids.reduce((sum, _, i) => sum + (want[i] - want[0] - i * gap), 0) / ids.length;
        ids.forEach((id, i) => angle.set(id, want[0] + turn + i * gap));
        continue;
      }
      // Packed: as close to where they'd like to be as the gaps allow (least squares, in order).
      const sep = ids.map((id, i) => (i ? (width(ids[i - 1]) + width(id)) / 2 / R : 0));
      const offset: number[] = [];
      sep.forEach((g, i) => (offset[i] = (i ? offset[i - 1] : 0) + g));
      // Pool adjacent violators on want - offset, which must not decrease.
      const blocks: { sum: number; n: number }[] = [];
      for (let i = 0; i < ids.length; i++) {
        blocks.push({ sum: want[i] - offset[i], n: 1 });
        while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
          const b = blocks.pop()!;
          blocks[blocks.length - 1].sum += b.sum;
          blocks[blocks.length - 1].n += b.n;
        }
      }
      let i = 0;
      for (const b of blocks) for (let k = 0; k < b.n; k++, i++) angle.set(ids[i], b.sum / b.n + offset[i]);
      // Round the back of the circle the two ends must clear each other too.
      const first = angle.get(ids[0])!;
      const last = angle.get(ids[ids.length - 1])!;
      const limit = TAU - (width(ids[0]) + width(ids[ids.length - 1])) / 2 / R;
      if (last - first > limit) {
        const mid = (first + last) / 2;
        for (const id of ids) angle.set(id, mid + ((angle.get(id)! - mid) * limit) / (last - first));
      }
    }

    const at = (ang: number, r: number): Pt => ({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
    for (const h of hubs) this.slots.set(h, at(angle.get(h)!, radiusAt(1)));
    for (const n of skills) this.slots.set(n.id, at(angle.get(n.id)!, radiusAt(level.get(n.id)!)));

    // The branches as drawn: each skill out of the one it grows from.
    for (const n of skills) {
      const src = parent.get(n.id)!;
      this.branchEdges.push([src, n.id]);
      this.edgeSet.add(`${src}>${n.id}`);
    }
  }

  /** Whether a skill is inside a topic, at any depth. */
  private isUnder(id: string, topicId: string): boolean {
    for (let t = this.partOf.get(id), n = 0; t && n < 64; t = this.partOf.get(t), n++) if (t === topicId) return true;
    return false;
  }

  private applyForces(heat: number) {
    // (Lowered below when the map starts in place.)
    const layout = this.opts.layout;
    const visible = this.nodes.filter((n) => this.opts.courses || n.kind !== "course");
    const visibleIds = new Set(visible.map((n) => n.id));
    const links = this.links.filter(
      (l) => visibleIds.has(String((l.source as Node).id ?? l.source)) && visibleIds.has(String((l.target as Node).id ?? l.target)),
    );
    this.computeSlots(visible);
    this.alongBranch = new WeakSet();
    for (const l of this.links) {
      const a = String((l.source as Node).id ?? l.source);
      const b = String((l.target as Node).id ?? l.target);
      if (this.edgeSet.has(`${a}>${b}`)) this.alongBranch.add(l);
    }
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
    const radial = layout === "radial";
    const tree = layout === "tree";
    // Structured layouts keep their nodes apart themselves (no repulsion), so a course
    // sits in its own spot beside its skill: across the path (radial), or below it (tree).
    if (structured) {
      const count = new Map<string, number>();
      for (const l of links) {
        if (l.kind !== "course") continue;
        const skill = String((l.source as Node).id ?? l.source);
        const p = this.slots.get(skill);
        if (!p) continue;
        const i = count.get(skill) ?? 0;
        count.set(skill, i + 1);
        const off = (this.byId.get(skill)?.r ?? 12) + 16 + i * 22;
        const len = Math.hypot(p.x, p.y) || 1;
        this.slots.set(
          String((l.target as Node).id ?? l.target),
          radial ? { x: p.x - (p.y / len) * off, y: p.y + (p.x / len) * off } : { x: p.x - 10 + i * 22, y: p.y + off },
        );
      }
    }
    const target = (n: Node): Pt => {
      if (n.kind === "course") return this.slots.get(n.id) ?? { x: n.x ?? 0, y: n.y ?? 0 };
      const slot = this.slots.get(n.id);
      if (slot) return slot;
      // Clusters: around the hub, pulled a little toward the middle.
      const hub = this.hubPoint(n.ability);
      return { x: hub.x * 0.72, y: hub.y * 0.72 };
    };
    // Like Obsidian's graph: links pull like springs, so dragging one tugs its neighbours
    // along. The layouts hold their shape differently: the tree firmly (an outline), the
    // radial map firmly (general to detail, ring by ring; both already keep every node
    // clear of the next, so nothing needs pushing apart), clusters loosely (skills push
    // each other apart, each drawn to its field's space, groups kept apart).
    const pull = radial ? 0.55 : tree ? 0.9 : 0.12;
    // Radial: each skill also hangs on a spring from the one it branches out of.
    const springs = radial
      ? this.branchEdges
          .filter(([from, id]) => visibleIds.has(id) && visibleIds.has(from))
          .map(([from, id]) => ({ source: from, target: id, kind: "part", met: true, hidden: true }) as unknown as Link)
      : [];
    const springSet = new Set(springs);
    const gap = (l: Link) => {
      const a = this.slots.get(String((l.source as Node).id ?? l.source));
      const b = this.slots.get(String((l.target as Node).id ?? l.target));
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 95;
    };
    const sameField = (l: Link) => {
      const a = this.byId.get(String((l.source as Node).id ?? l.source));
      const b = this.byId.get(String((l.target as Node).id ?? l.target));
      return !!a && !!b && a.branch === b.branch;
    };
    // New arrivals start where they belong; when that's most of the map, there's little left to settle.
    let placed = 0;
    let movable = 0;
    for (const n of visible) {
      if (n.kind === "ability") continue;
      movable++;
      if (!this.fresh.has(n.id)) continue;
      const slot = this.slots.get(n.id);
      if (!slot) continue;
      const jitter = structured ? 0 : 6;
      n.x = slot.x + (Math.random() - 0.5) * jitter;
      n.y = slot.y + (Math.random() - 0.5) * jitter;
      n.vx = 0;
      n.vy = 0;
      placed++;
    }
    this.fresh.clear();
    // Everything new and already in place (a structured map, freshly opened): nothing to settle.
    const inPlace = structured && movable > 0 && placed === movable;
    // (Clusters always get a little room to spread out.)
    if (structured && placed > visible.length / 2) heat = Math.min(heat, 0.12);
    this.sim
      .nodes(visible)
      .force(
        "link",
        forceLink<Node, Link>([...links, ...springs])
          .id((d) => d.id)
          .distance((l) => (l.kind === "course" ? 34 : radial ? gap(l) : tree ? 40 : l.kind === "part" ? 42 : 70))
          .strength((l) =>
            // (A structured layout holds a course in its own spot, beside its skill.)
            l.kind === "course"
              ? structured
                ? 0
                : 0.9
              : radial
                ? springSet.has(l)
                  ? 0.12
                  : 0
                : tree
                  ? 0
                  : l.kind === "part"
                    ? 0.05
                    : l.kind === "prereq" && sameField(l)
                      ? 0.02
                      : 0,
          ),
      )
      // Pushing apart (the costly part: every node against its neighbours) only for clusters.
      .force(
        "charge",
        structured
          ? null
          : forceManyBody<Node>()
              .strength((d) => (d.kind === "course" ? -30 : -26))
              .distanceMax(90),
      )
      .force(
        "x",
        forceX<Node>((d) => target(d).x).strength((d) => (d.kind === "skill" || (structured && d.kind === "course") ? pull : 0)),
      )
      .force(
        "y",
        forceY<Node>((d) => target(d).y).strength((d) => (d.kind === "skill" || (structured && d.kind === "course") ? pull : 0)),
      )
      .force("collide", structured ? null : forceCollide<Node>((d) => d.r + (d.kind === "course" ? 4 : 3)).iterations(2));
    // The radial map starts in place: stop once it's close enough, instead of creeping for seconds.
    this.sim.alphaMin(structured ? 0.02 : 0.005);
    if (inPlace) {
      // Freshly opened and every node already where it belongs: nothing to animate.
      this.sim.alpha(0).stop();
      if (this.autoFit) this.fit(undefined, false);
      this.request();
      return;
    }
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
    if (!ids?.length) this.autoFit = true;
    const aw = this.w - this.inset.left - this.inset.right;
    const ah = this.h - this.inset.top - this.inset.bottom;
    // The tree is an outline: fit its width (labels included) and start at the top.
    if (!ids?.length && this.opts.layout === "tree") {
      const k = clamp(aw / (x1 - x0 + 260), 0.35, 1.1);
      this.animateTo({ k, x: this.inset.left + 20 - x0 * k, y: this.inset.top + 30 - y0 * k }, animate);
      return;
    }
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

  /**
   * Everything a skill needs (ancestors) and leads to (descendants), plus its
   * courses, each with how many steps away it is (the skill itself: 0). Worked
   * out breadth first, so each is reached its shortest way; kept until the map changes.
   */
  pathOf(id: string): Map<string, number> {
    if (this.pathCache?.id === id) return this.pathCache.hops;
    const out = new Map<string, number>([[id, 0]]);
    let frontier = [id];
    for (let d = 1; frontier.length; d++) {
      const next: string[] = [];
      for (const cur of frontier)
        for (const n of this.parents.get(cur) ?? []) {
          if (out.has(n)) continue;
          out.set(n, d);
          next.push(n);
        }
      frontier = next;
    }
    // What it leads to: all of it along its own path, and just the first step into other paths.
    const home = this.byId.get(id)?.branch;
    frontier = [id];
    for (let d = 1; frontier.length; d++) {
      const next: string[] = [];
      for (const cur of frontier)
        for (const n of this.children.get(cur) ?? []) {
          if (out.has(n) || (home && this.byId.get(n)?.branch !== home && cur !== id)) continue;
          out.set(n, d);
          if (!home || this.byId.get(n)?.branch === home) next.push(n);
        }
      frontier = next;
    }
    for (const l of this.links) {
      const s = (l.source as Node).id;
      const t = (l.target as Node).id;
      if (l.kind === "course" && out.has(s) && !out.has(t)) out.set(t, out.get(s)! + 1);
    }
    const n = this.byId.get(id);
    if (n?.kind === "ability") for (const m of this.nodes) if (m.ability === id && !out.has(m.id)) out.set(m.id, 1);
    this.pathCache = { id, hops: out };
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
    // Along the lit path, lines and arrows fade the farther they are from what you're
    // pointing at: full strength next to it, fainter step by step, never quite gone.
    const near = (id: string) => {
      const h = path?.get(id);
      return h === undefined || h <= 1 ? 1 : 0.16 + 0.84 * Math.pow(0.8, h - 1);
    };
    const nearest = (a: string, b: string) => Math.min(near(a), near(b));
    const showCourse = (n: Node) => this.opts.courses || n.kind !== "course";
    // Only what's on screen (plus a margin, in world units) is drawn.
    const view = { x0: -t.x / t.k, y0: -t.y / t.k, x1: (this.w - t.x) / t.k, y1: (this.h - t.y) / t.k };
    const onScreen = (n: Node, margin = 60) =>
      n.x !== undefined && n.x > view.x0 - margin && n.x < view.x1 + margin && n.y! > view.y0 - margin && n.y! < view.y1 + margin;

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
    // (The built-in tree's paths are its general topics, already labelled.)
    for (const n of this.nodes) if (n.kind === "skill" && n.branch && !n.tier && n.x !== undefined) branches.set(n.branch, [...(branches.get(n.branch) ?? []), n]);
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
      // Batched: one path per look (color, width, dashes), so a thousand branches are a few strokes.
      const batches = new Map<string, { path: Path2D; color: string; width: number; dash: boolean }>();
      const branch = (from: Pt & { id?: string }, to: Node, width: number) => {
        const lit = path?.has(to.id) ?? false;
        const faded = dim(to.id);
        const a = polar(from);
        const b = polar({ x: to.x!, y: to.y! });
        const rm = (a.r + b.r) / 2;
        const strength = lit ? nearest(to.id, from.id ?? to.id) : 0;
        const color = alpha(to.color, faded ? 0.07 : lit ? Math.max(0.9 * strength, to.locked ? 0.2 : 0.3) : to.locked ? (to.planned ? 0.2 : 0.28) : 0.5);
        const w = Math.round((lit ? width + strength * 1.5 : width) * 2) / 2;
        // Dashes only close up (they're costly to draw, and a blur from afar).
        const dash = to.locked && t.k >= 0.6;
        const key = `${color}|${w}|${dash}`;
        let batch = batches.get(key);
        if (!batch) batches.set(key, (batch = { path: new Path2D(), color, width: w, dash }));
        batch.path.moveTo(from.x, from.y);
        if (a.r < 1) batch.path.lineTo(to.x!, to.y!);
        else batch.path.bezierCurveTo(Math.cos(a.a) * rm, Math.sin(a.a) * rm, Math.cos(b.a) * rm, Math.sin(b.a) * rm, to.x!, to.y!);
      };
      for (const h of this.nodes) if (h.kind === "ability" && h.x !== undefined) branch({ x: 0, y: 0 }, h, 7);
      // Zoomed far out, the details read as rows of dots: their little branches come in closer.
      const fine = t.k >= 0.32;
      for (const [from, id] of this.branchEdges) {
        const to = this.byId.get(id);
        const f = this.byId.get(from);
        if (!to || !f || to.x === undefined || f.x === undefined) continue;
        if (!fine && to.tier === "detail" && f.tier === "detail" && !path?.has(id)) continue;
        if (!onScreen(f, 400) && !onScreen(to, 400)) continue;
        branch({ x: f.x, y: f.y!, id: f.id }, to, Math.max(1.5, 5.5 - (this.ringOf.get(id) ?? 1) * 1.1));
      }
      ctx.lineCap = "round";
      for (const b of batches.values()) {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.width;
        ctx.setLineDash(b.dash ? [6, 6] : []);
        ctx.stroke(b.path);
      }
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
    }

    // Tree: elbow connectors, general on the left to detailed on the right; a topic's steps strung after it.
    if (this.opts.layout === "tree") {
      const batches = new Map<string, Path2D>();
      for (const [from, id] of this.branchEdges) {
        const to = this.byId.get(id);
        const f = this.byId.get(from);
        if (!to || !f || to.x === undefined || f.x === undefined) continue;
        if (!onScreen(f, 600) && !onScreen(to, 600)) continue;
        const lit = path?.has(id) ?? false;
        const key = alpha(to.color, dim(id) ? 0.1 : lit ? Math.max(0.9 * nearest(id, from), 0.3) : to.locked ? 0.3 : 0.55);
        let p = batches.get(key);
        if (!p) batches.set(key, (p = new Path2D()));
        p.moveTo(f.x, f.y!);
        if (Math.abs(f.y! - to.y!) < 1) p.lineTo(to.x, to.y!);
        else {
          const mx = f.x + 36;
          p.lineTo(mx - 8, f.y!);
          p.quadraticCurveTo(mx, f.y!, mx, f.y! + Math.sign(to.y! - f.y!) * 8);
          p.lineTo(mx, to.y! - Math.sign(to.y! - f.y!) * 8);
          p.quadraticCurveTo(mx, to.y!, mx + 8, to.y!);
          p.lineTo(to.x, to.y!);
        }
      }
      ctx.lineWidth = 1.6;
      for (const [color, p] of batches) {
        ctx.strokeStyle = color;
        ctx.stroke(p);
      }
    }

    // Clusters: each area's and field's space, behind its skills, so the groups read at a glance.
    if (this.opts.layout === "clusters") {
      for (const g of this.groups) {
        const c = this.toScreen({ x: g.x, y: g.y });
        const r = g.r * t.k;
        if (c.x + r < 0 || c.x - r > this.w || c.y + r < 0 || c.y - r > this.h) continue;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.fillStyle = alpha(g.color, g.level === 1 ? 0.035 : 0.06);
        ctx.fill();
        ctx.strokeStyle = alpha(g.color, g.level === 1 ? 0.28 : 0.2);
        ctx.lineWidth = (g.level === 1 ? 1.6 : 1.1) / t.k;
        if (g.level === 1) ctx.setLineDash([6 / t.k, 5 / t.k]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Links.
    const linkBatches = new Map<string, { color: string; opacity: number; width: number; dashed: boolean; lines: Path2D; heads: Path2D }>();
    for (const l of this.links) {
      const s = l.source as Node;
      const d = l.target as Node;
      if (l.hidden || s.x === undefined || d.x === undefined || !showCourse(s) || !showCourse(d)) continue;
      // A link along a branch is the branch itself.
      if (this.opts.layout !== "clusters" && l.kind !== "course" && this.alongBranch.has(l)) continue;
      if (!onScreen(s, 600) && !onScreen(d, 600)) continue;
      const onPath = (path?.has(d.id) && path?.has(s.id)) ?? false;
      if (t.k < 0.32 && d.tier === "detail" && !onPath) continue;
      // Related (linked, not needed): quiet threads between trees, close enough in.
      if (l.kind === "related") {
        if (t.k < 0.16 && !onPath && focus !== s.id && focus !== d.id) continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y!);
        const mx = (s.x + d.x) / 2 - (d.y! - s.y!) * 0.12;
        const my = (s.y! + d.y!) / 2 + (d.x - s.x) * 0.12;
        ctx.quadraticCurveTo(mx, my, d.x, d.y!);
        ctx.strokeStyle = alpha(d.color, focus === s.id || focus === d.id ? 0.7 : 0.22);
        ctx.lineWidth = 1.2 / Math.sqrt(t.k);
        ctx.setLineDash(t.k >= 0.5 ? [2 / t.k, 4 / t.k] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      // Tree: steps are on their own row already; what a topic needs arcs down the left, topic to topic.
      if (this.opts.layout === "tree" && l.kind === "part") continue;
      if (this.opts.layout === "tree" && l.kind === "prereq") {
        const topicOf = (n: Node) => (n.tier === "detail" && this.partOf.has(n.id) ? (this.byId.get(this.partOf.get(n.id)!) ?? n) : n);
        const a = topicOf(s);
        const b = d;
        if (a === b || a.x === undefined) continue;
        const lit = (path?.has(a.id) && path?.has(b.id)) ?? false;
        const crossing = a.branch !== b.branch;
        // (Arcs into other trees run far down the outline: only for the skill you're on.)
        if (!lit && focus !== a.id && focus !== b.id && (crossing || t.k < 0.45)) continue;
        const bend = Math.min(a.x, b.x!) - 28 - Math.min(120, Math.abs(b.y! - a.y!) * 0.12);
        ctx.beginPath();
        ctx.moveTo(a.x - a.r, a.y!);
        ctx.bezierCurveTo(bend, a.y!, bend, b.y!, b.x! - b.r - 3, b.y!);
        const strength = lit ? nearest(a.id, b.id) : 0;
        ctx.strokeStyle = alpha(b.color, lit ? Math.max(0.85 * strength, 0.25) : crossing ? 0.25 : 0.4);
        ctx.lineWidth = (lit ? 1.2 + strength : 1.2) / Math.sqrt(t.k);
        ctx.stroke();
        continue;
      }
      const faded = dim(s.id) || dim(d.id);
      const arrow = l.kind !== "course";
      const lit = !!path && path.has(s.id) && path.has(d.id);
      const strength = lit ? nearest(s.id, d.id) : 0;
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
      const base = l.kind === "course" ? theme.edge : l.met ? d.color : theme.edge;
      const color = faded ? alpha(theme.edge.startsWith("#") ? theme.edge : "#888888", 0.12) : lit ? d.color : base;
      // Radial: links across branches (not along one) are quieter, the branches carry the shape.
      const across = this.opts.layout === "radial" && l.kind === "prereq";
      // Between trees (math → physics): always there, quiet unless it's on the path you're looking at.
      const between = l.kind === "prereq" && s.tier !== undefined && d.tier !== undefined && s.branch !== d.branch;
      const opacity = faded
        ? between
          ? 0.12
          : 0.35
        : lit
          ? Math.max(0.85 * strength, 0.22)
          : l.kind === "course"
            ? 0.55
            : l.kind === "part"
              ? 0.6
              : between
                ? 0.22
                : across
                  ? 0.45
                  : 0.85;
      const width = (lit ? 1.2 + 1.4 * strength : l.kind === "prereq" ? 1.6 : 1.1) / Math.sqrt(t.k);
      const dashed = !l.met && arrow && t.k >= 0.5;
      // Batched: one stroke (and one fill for the arrowheads) per look.
      const key = `${color}|${Math.round(opacity * 100)}|${Math.round(width * 20)}|${dashed}`;
      let batch = linkBatches.get(key);
      if (!batch) linkBatches.set(key, (batch = { color, opacity, width, dashed, lines: new Path2D(), heads: new Path2D() }));
      batch.lines.moveTo(x1, y1);
      batch.lines.quadraticCurveTo(mx, my, x2, y2);
      if (arrow) {
        // Arrowhead along the curve's end tangent.
        const tx = x2 - mx;
        const ty = y2 - my;
        const tl = Math.hypot(tx, ty) || 1;
        const ax = tx / tl;
        const ay = ty / tl;
        const size = (l.kind === "part" ? 5.5 : 7) / Math.sqrt(t.k);
        batch.heads.moveTo(x2, y2);
        batch.heads.lineTo(x2 - ax * size - ay * size * 0.55, y2 - ay * size + ax * size * 0.55);
        batch.heads.lineTo(x2 - ax * size + ay * size * 0.55, y2 - ay * size - ax * size * 0.55);
        batch.heads.closePath();
      }
    }
    // Faint first, so what's lit is drawn over the rest.
    for (const b of [...linkBatches.values()].sort((x, y) => x.opacity - y.opacity)) {
      ctx.globalAlpha = b.opacity;
      ctx.strokeStyle = b.color;
      ctx.fillStyle = b.color;
      ctx.lineWidth = b.width;
      if (b.dashed) ctx.setLineDash([5 / t.k, 4 / t.k]);
      ctx.stroke(b.lines);
      ctx.setLineDash([]);
      ctx.fill(b.heads);
    }
    ctx.globalAlpha = 1;

    // Nodes.
    const dots = new Map<string, Path2D>();
    for (const n of this.nodes) {
      if (n.x === undefined || !showCourse(n) || !onScreen(n, n.r + 20)) continue;
      const faded = dim(n.id);
      ctx.globalAlpha = faded ? FADED : 1;
      const x = n.x;
      const y = n.y!;
      // Too small to see any detail: just a dot (batched by color, drawn after this loop).
      if (n.kind !== "ability" && n.r * t.k < 2.4 && this.opts.selectedId !== n.id && this.hover !== n) {
        const fill = alpha(n.color, (faded ? FADED : 1) * (n.locked ? 0.3 : n.planned ? 0.55 : 1));
        let dot = dots.get(fill);
        if (!dot) dots.set(fill, (dot = new Path2D()));
        dot.moveTo(x + n.r, y);
        dot.arc(x, y, n.r, 0, Math.PI * 2);
        ctx.globalAlpha = 1;
        continue;
      }
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
        // Planned (not started yet): a light disc; locked: hollow and dashed.
        ctx.fillStyle = n.locked ? theme.bg : n.planned ? alpha(n.color, 0.22) : alpha(n.color, 0.9);
        ctx.fill();
        if (n.locked) {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = alpha(n.color, n.planned ? 0.5 : 0.7);
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (n.planned) {
          ctx.strokeStyle = alpha(n.color, 0.85);
          ctx.lineWidth = 1.8;
          ctx.stroke();
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
            ctx.strokeStyle = n.locked || n.planned ? n.color : "#ffffff";
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
          // Badge: the level, "3/5" learnt for a topic, a check once learnt, a lock (none on a planned detail).
          const text = n.locked ? "🔒" : n.done ? "✓" : n.learnt ? `${n.learnt.done}/${n.learnt.total}` : n.planned ? "" : String(n.level);
          if (text) {
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
          }
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
    for (const [fill, dot] of dots) {
      ctx.fillStyle = fill;
      ctx.fill(dot);
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
    // A grid over the screen, so a label is only tested against what's near it.
    const CELL = 72;
    const cells = (b: Box, f: (key: number) => boolean | void): boolean => {
      const cx0 = Math.floor(b.x0 / CELL);
      const cx1 = Math.floor(b.x1 / CELL);
      const cy0 = Math.floor(b.y0 / CELL);
      const cy1 = Math.floor(b.y1 / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) if (f((cx + 4096) * 8192 + cy + 4096) === true) return true;
      return false;
    };
    const grid = <T,>(boxOf: (v: T) => Box) => {
      const m = new Map<number, T[]>();
      return {
        add: (v: T) =>
          void cells(boxOf(v), (k) => {
            const list = m.get(k);
            if (list) list.push(v);
            else m.set(k, [v]);
          }),
        some: (b: Box, test: (v: T) => boolean) => cells(b, (k) => m.get(k)?.some((v) => overlaps(b, boxOf(v)) && test(v)) ?? false),
      };
    };
    const placed = grid<Box>((b) => b);
    const hitsPlaced = (b: Box, test: (o: Box) => boolean = () => true) => placed.some(b, test);
    const measure = (label: string) => {
      const key = ctx.font + "|" + label;
      let w = this.widths.get(key);
      if (w === undefined) {
        w = ctx.measureText(label).width;
        if (this.widths.size > 20000) this.widths.clear();
        this.widths.set(key, w);
      }
      return w;
    };
    // Slanted labels (a path's steps): their corners, and the box around them for a quick first test.
    type Slant = { pts: Pt[]; box: Box };
    const slanted = grid<Slant>((o) => o.box);
    const corners = (b: Box): Pt[] => [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x1, y: b.y1 },
      { x: b.x0, y: b.y1 },
    ];
    // Two convex shapes overlap unless some edge direction separates them.
    const separated = (a: Pt[], b: Pt[]) => {
      for (const poly of [a, b]) {
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i];
          const q = poly[(i + 1) % poly.length];
          const nx = q.y - p.y;
          const ny = p.x - q.x;
          let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
          for (const v of a) ((aMin = Math.min(aMin, v.x * nx + v.y * ny)), (aMax = Math.max(aMax, v.x * nx + v.y * ny)));
          for (const v of b) ((bMin = Math.min(bMin, v.x * nx + v.y * ny)), (bMax = Math.max(bMax, v.x * nx + v.y * ny)));
          if (aMax < bMin || bMax < aMin) return true;
        }
      }
      return false;
    };
    const hitsSlant = (pts: Pt[], box: Box) => slanted.some(box, (o) => !separated(pts, o.pts));
    type Disc = { id: string; b: Box };
    const discs = grid<Disc>((d) => d.b);
    const hitsNode = (b: Box, except: string) => discs.some(b, (d) => d.id !== except);
    if (me) {
      // Your level and class under you.
      const c = this.toScreen({ x: 0, y: 0 });
      const below = c.y + 47 * t.k + 16;
      placed.add({ x0: c.x - 80, y0: c.y - 47 * t.k, x1: c.x + 80, y1: below + 20 });
    }
    const shown = this.nodes.filter((n) => n.x !== undefined && showCourse(n) && onScreen(n, n.r + 40));
    for (const n of shown) {
      const s = this.toScreen({ x: n.x!, y: n.y! });
      const r = n.r * t.k;
      if (r < 2 && n.kind !== "ability") continue;
      const b = { x0: s.x - r, y0: s.y - r, x1: s.x + r, y1: s.y + r };
      discs.add({ id: n.id, b });
      if (n.kind === "ability") placed.add(b);
    }
    // General to detail as you zoom in: areas first, then fields, then topics, then the steps.
    const layout = this.opts.layout;
    const zoomFor = (n: Node) =>
      n.kind === "course"
        ? 1.1
        : n.tier === "general"
          ? 0.06
          : n.tier === "field"
            ? layout === "tree" ? 0.06 : 0.12
            : n.tier === "sub" || n.tier === "advanced" || n.tier === "expert"
              ? layout === "tree" ? 0.2 : 0.26
              : n.tier === "detail"
                ? layout === "tree" ? 0.85 : 0.62
                : 0.45;
    const tierRank = (n: Node) =>
      n.tier === "general" ? 3000 : n.tier === "field" ? 2800 : n.tier === "expert" ? 2200 : n.tier === "sub" || n.tier === "advanced" ? 2000 : n.tier === "detail" ? 1000 : 1500;
    // Clusters: the areas and fields are named on their circles instead.
    if (layout === "clusters") {
      for (const g of [...this.groups].sort((a, b) => a.level - b.level)) {
        const c = this.toScreen({ x: g.x, y: g.y });
        const r = g.r * t.k;
        if (r < (g.level === 1 ? 26 : 34) || c.x + r < 0 || c.x - r > this.w || c.y + r < 0 || c.y - r > this.h) continue;
        const label = g.level === 1 ? g.label.toUpperCase() : g.label;
        ctx.font = g.level === 1 ? `800 12px ${theme.font}` : `750 13px ${theme.font}`;
        const w = measure(label);
        const y = g.level === 1 ? c.y - r - 7 : c.y - r + 17;
        const box = { x0: c.x - w / 2 - 3, y0: y - 12, x1: c.x + w / 2 + 3, y1: y + 4 };
        if (hitsPlaced(box)) continue;
        placed.add(box);
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = theme.bg;
        ctx.strokeText(label, c.x, y);
        ctx.fillStyle = g.level === 1 ? g.color : theme.text;
        ctx.fillText(label, c.x, y);
      }
    }
    const candidates = shown
      .filter((n) => n.kind !== "ability" && !(layout === "clusters" && (n.tier === "general" || n.tier === "field") && n !== this.hover && this.opts.selectedId !== n.id))
      .map((n) => {
        const important = this.hover === n || this.opts.selectedId === n.id || (path?.has(n.id) ?? false) || (this.opts.matches?.has(n.id) ?? false);
        // Only the skill you're on always gets its label; the rest of its path gives way when crowded.
        const forced = this.hover === n || this.opts.selectedId === n.id || this.focusId === n.id;
        const rank =
          this.hover === n
            ? 1e6
            : this.opts.selectedId === n.id
              ? 1e5
              : (important ? 1e4 : 0) + (n.kind === "course" ? 0 : tierRank(n) + n.level * 4 + (n.goal ? 20 : 0) + (n.learnt ? 400 : 0));
        return { n, important, forced, rank };
      })
      .filter(
        ({ n, important, forced }) =>
          forced ||
          (important && t.k >= zoomFor(n) * (layout === "tree" && n.tier === "detail" ? 1 : 0.5)) ||
          (this.opts.labels && !dim(n.id) && t.k >= zoomFor(n)),
      )
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 400);
    ctx.textAlign = "center";
    for (const road of roads) {
      const n = road.start;
      const s = this.toScreen({ x: n.x!, y: n.y! });
      ctx.font = `800 11px ${theme.font}`;
      const label = (road.name.length > 32 ? `${road.name.slice(0, 31)}…` : road.name).toUpperCase();
      const w = measure(label);
      const gap = (n.r + (n.goal ? 10 : 7)) * t.k;
      const box = (base: number): Box => ({
        x0: s.x - w / 2 - 3,
        y0: base - 11,
        x1: s.x + w / 2 + 3,
        y1: base + 4,
      });
      // Above its first step, else below it, wherever it covers no other skill.
      const spots = [s.y - gap - 7, s.y + gap + 13];
      const y = spots.find((b) => !hitsPlaced(box(b)) && !hitsNode(box(b), n.id)) ?? spots[0];
      placed.add(box(y));
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
      const big = n.tier === "general" || n.tier === "field" || (!n.tier && !!n.learnt);
      ctx.font = `${n.kind === "course" ? 500 : big ? 800 : n.learnt ? 700 : 600} ${n.kind === "course" ? 11 : n.tier === "general" ? 15.5 : big ? 14 : n.learnt ? 13 : 12}px ${theme.font}`;
      const label = n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label;
      const w = measure(label);
      const gap = (n.r + (n.goal ? 10 : 7)) * t.k;
      // Radial: a path's steps sit in a line, so their labels run across the path, slanted at
      // most 60° (still readable), one beside the next like the rungs of a ladder.
      const isStep = n.tier === "detail" || (!n.tier && this.partOf.has(n.id) && !n.learnt);
      // Zoomed out, an area's or field's name runs out along its own path, so they fan round the circle.
      const outward = layout === "radial" && (n.tier === "general" || n.tier === "field") && t.k < 0.45;
      // Tree: a topic's steps are beads on its row, so their names slant up from them.
      const treeStep = layout === "tree" && isStep;
      if (((layout === "radial" && isStep) || outward || treeStep) && n.x! * n.x! + n.y! * n.y! > 1) {
        let phi = treeStep ? -0.7 : Math.atan2(n.y!, n.x!);
        let flip = false;
        if (treeStep) {
          // (fixed slant)
        } else if (outward) {
          if (Math.cos(phi) < 0) ((phi += Math.PI), (flip = true));
        } else {
          phi += Math.PI / 2;
          while (phi > Math.PI / 2) phi -= Math.PI;
          while (phi <= -Math.PI / 2) phi += Math.PI;
          phi = clamp(phi, -Math.PI / 3, Math.PI / 3);
        }
        const off = n.r * t.k + 6;
        const ux = Math.cos(phi);
        const uy = Math.sin(phi);
        const at = (d: number, h: number): Pt => ({ x: s.x + ux * d - uy * h, y: s.y + uy * d + ux * h });
        const d0 = flip ? -off - w - 3 : off - 2;
        const d1 = flip ? -off + 2 : off + w + 3;
        const pts = [at(d0, -8), at(d1, -8), at(d1, 6), at(d0, 6)];
        const box = {
          x0: Math.min(...pts.map((p) => p.x)),
          y0: Math.min(...pts.map((p) => p.y)),
          x1: Math.max(...pts.map((p) => p.x)),
          y1: Math.max(...pts.map((p) => p.y)),
        };
        const blocked = hitsPlaced(box, (o) => !separated(pts, corners(o))) || hitsSlant(pts, box);
        if (blocked && !forced) continue;
        slanted.add({ pts, box });
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(phi);
        ctx.textAlign = flip ? "right" : "left";
        ctx.lineWidth = 4;
        ctx.strokeStyle = theme.bg;
        ctx.strokeText(label, flip ? -off : off, 4);
        ctx.fillStyle = n.planned && n.locked ? theme.muted : theme.text;
        ctx.fillText(label, flip ? -off : off, 4);
        ctx.restore();
        continue;
      }
      // Tree: to the right of it, like an outline (an area's or field's under it: its first part is on its row).
      if (layout === "tree") {
        // (Above an area or field: the outline's free space, since its first part shares its row.)
        // (Right-aligned, ending at its own node, so the next column stays clear.)
        const under = n.tier === "general" || n.tier === "field";
        const x = under ? s.x + n.r * t.k : s.x + n.r * t.k + 7;
        const y = under ? s.y - n.r * t.k - 13 : s.y;
        const x0 = under ? x - w : x;
        const box = { x0: x0 - 2, y0: y - 8 - (under ? 4 : 0), x1: x0 + w + 3, y1: y + 7 };
        if (!forced && (hitsPlaced(box) || hitsSlant(corners(box), box))) continue;
        placed.add(box);
        ctx.textAlign = under ? "right" : "left";
        ctx.lineWidth = 4;
        ctx.strokeStyle = theme.bg;
        ctx.strokeText(label, x, y + 4.5);
        ctx.fillStyle = n.kind === "course" || (n.planned && n.locked) ? theme.muted : theme.text;
        ctx.fillText(label, x, y + 4.5);
        continue;
      }
      // Below, above, then beside.
      type Spot = { x: number; y: number; align: CanvasTextAlign };
      const side = n.r * t.k + 6;
      const spots: Spot[] = [
        { x: s.x, y: s.y + gap + 13, align: "center" },
        { x: s.x, y: s.y - gap - 5, align: "center" },
        { x: s.x + side, y: s.y + 4, align: "left" },
        { x: s.x - side, y: s.y + 4, align: "right" },
      ];
      // Radial: a path runs straight out from the middle, so its steps' labels go either side of it.
      if (this.opts.layout === "radial" && n.x! * n.x! + n.y! * n.y! > 1) {
        const ang = Math.atan2(n.y!, n.x!);
        const across = [
          { x: -Math.sin(ang), y: Math.cos(ang) },
          { x: Math.sin(ang), y: -Math.cos(ang) },
        ];
        const off = n.r * t.k + 7;
        spots.unshift(
          ...across.map(
            (v): Spot =>
              Math.abs(v.x) < 0.4
                ? { x: s.x, y: v.y > 0 ? s.y + off + 11 : s.y - off - 3, align: "center" }
                : { x: s.x + v.x * off, y: s.y + v.y * off + 4, align: v.x > 0 ? "left" : "right" },
          ),
        );
      }
      const box = (p: Spot): Box => {
        const x0 = p.align === "center" ? p.x - w / 2 : p.align === "left" ? p.x : p.x - w;
        return { x0: x0 - 3, y0: p.y - 11, x1: x0 + w + 3, y1: p.y + 4 };
      };
      const clearOfLabels = (b: Box) => !hitsPlaced(b) && !hitsSlant(corners(b), b);
      const clearOfNodes = (b: Box) => !hitsNode(b, n.id);
      let at = spots.find((p) => clearOfLabels(box(p)) && clearOfNodes(box(p)));
      if (at === undefined && forced) at = spots.find((p) => clearOfLabels(box(p))) ?? spots[0];
      if (at === undefined) continue;
      placed.add(box(at));
      ctx.textAlign = at.align;
      ctx.lineWidth = 4;
      ctx.strokeStyle = theme.bg;
      ctx.strokeText(label, at.x, at.y);
      ctx.fillStyle = n.kind === "course" || (n.planned && n.locked) ? theme.muted : theme.text;
      ctx.fillText(label, at.x, at.y);
    }
    ctx.textAlign = "center";

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

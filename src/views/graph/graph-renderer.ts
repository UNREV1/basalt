// Canvas renderer + d3-force simulation for the page graph. Kept outside React:
// the simulation mutates node positions every tick and pointer interaction
// needs to redraw at frame rate without re-rendering components.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { PageKind } from "../../../shared/model.ts";
import type { GraphData, GraphEdge } from "./graph-model.ts";

interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  kind: PageKind;
  degree: number;
  r: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  type: GraphEdge["type"];
}

export interface GraphColors {
  text: string;
  textMuted: string;
  halo: string;
  edge: string;
  accent: string;
  font: string;
  kinds: Record<PageKind, string>;
}

export interface GraphRenderOptions {
  labels: boolean;
  search: string;
  focusId?: string;
}

interface Transform {
  k: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

const MIN_K = 0.08;
const MAX_K = 8;

const radiusFor = (degree: number) => 4 + Math.min(12, Math.sqrt(degree) * 2.4);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const truncate = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export class GraphRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sim: Simulation<SimNode, SimLink>;
  private linkForce: ForceLink<SimNode, SimLink>;
  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private byId = new Map<string, SimNode>();
  private adjacency = new Map<string, Set<string>>();
  private structureKey = "";
  private t: Transform = { k: 1, x: 0, y: 0 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private colors: GraphColors | null = null;
  private opts: GraphRenderOptions = { labels: true, search: "" };
  private matches: Set<string> | null = null;
  private hover: SimNode | null = null;
  private drag: { node: SimNode; start: Point; moved: boolean; pointerId: number } | null = null;
  private pan: { start: Point; t: Transform; moved: boolean } | null = null;
  private pointers = new Map<number, Point>();
  private pinch: { dist: number; mid: Point } | null = null;
  /** Last mouse position over the canvas, to keep hover right while nodes or the camera move. */
  private mouse: Point | null = null;
  /** Keep the camera fitted to the layout until the user takes control. */
  private autoFit = true;
  private frame = 0;
  private anim = 0;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** Screen area covered by floating UI (e.g. the control panel), kept clear when fitting. */
  private inset = { top: 0, right: 0, bottom: 0, left: 0 };
  private onOpen: (id: string) => void;
  private onHoverChange: (id: string | null) => void;

  constructor(canvas: HTMLCanvasElement, cb: { onOpen: (id: string) => void; onHover?: (id: string | null) => void }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.onOpen = cb.onOpen;
    this.onHoverChange = cb.onHover ?? (() => {});
    this.linkForce = forceLink<SimNode, SimLink>([])
      .id((d) => d.id)
      .distance((l) => (l.type === "tree" ? 55 : 75));
    this.sim = forceSimulation<SimNode, SimLink>([])
      .force("link", this.linkForce)
      .force("charge", forceManyBody<SimNode>().strength(-240).distanceMax(700))
      .force("x", forceX<SimNode>(0).strength(0.05))
      .force("y", forceY<SimNode>(0).strength(0.05))
      .force("collide", forceCollide<SimNode>((d) => d.r + 6))
      .alphaDecay(0.028)
      .on("tick", () => this.onTick());
    this.sim.stop();

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("keydown", this.onKeyDown);
  }

  destroy() {
    this.sim.stop();
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.anim);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("pointerleave", this.onPointerLeave);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("keydown", this.onKeyDown);
  }

  // ---- data ----------------------------------------------------------------------

  /** Replace the graph, keeping positions of nodes that already exist. */
  setData(data: GraphData, refit = false) {
    const prev = this.byId;
    const fresh = prev.size === 0;
    const nodes = data.nodes.map((g) => {
      const old = prev.get(g.id);
      const r = radiusFor(g.degree);
      if (old) {
        old.title = g.title;
        old.kind = g.kind;
        old.degree = g.degree;
        old.r = r;
        return old;
      }
      return { id: g.id, title: g.title, kind: g.kind, degree: g.degree, r } as SimNode;
    });
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    // Start new nodes next to an already-placed neighbor so updates don't explode the layout.
    if (!fresh) {
      for (const n of nodes) {
        if (n.x !== undefined) continue;
        const e = data.edges.find((e) => (e.source === n.id && prev.has(e.target)) || (e.target === n.id && prev.has(e.source)));
        const anchor = e ? prev.get(e.source === n.id ? e.target : e.source) : undefined;
        const a = Math.random() * Math.PI * 2;
        n.x = (anchor?.x ?? 0) + Math.cos(a) * 30;
        n.y = (anchor?.y ?? 0) + Math.sin(a) * 30;
      }
    }
    this.nodes = nodes;
    this.links = data.edges.map((e) => ({ source: e.source, target: e.target, type: e.type }));
    this.adjacency = new Map();
    for (const e of data.edges) {
      if (!this.adjacency.has(e.source)) this.adjacency.set(e.source, new Set());
      if (!this.adjacency.has(e.target)) this.adjacency.set(e.target, new Set());
      this.adjacency.get(e.source)!.add(e.target);
      this.adjacency.get(e.target)!.add(e.source);
    }
    if (this.hover && !this.byId.has(this.hover.id)) this.hover = null;

    const key = `${nodes.map((n) => n.id).join(",")}#${data.edges.map((e) => `${e.source}>${e.target}:${e.type}`).join(",")}`;
    const structural = key !== this.structureKey;
    this.structureKey = key;
    this.sim.nodes(nodes);
    this.linkForce.links(this.links);
    this.updateMatches();
    if (refit) this.autoFit = true;

    if (structural) {
      if (fresh || this.reducedMotion) {
        // Pre-settle so the first frame is already a readable layout.
        this.sim.alpha(1);
        this.sim.tick(this.reducedMotion ? 300 : Math.min(120, 40 + nodes.length));
        this.fitNow();
      }
      if (!this.reducedMotion) this.sim.alpha(fresh ? 0.5 : Math.max(this.sim.alpha(), 0.35)).restart();
      else this.fitNow();
    }
    this.requestDraw();
  }

  setOptions(opts: GraphRenderOptions) {
    const searchChanged = opts.search !== this.opts.search;
    this.opts = opts;
    if (searchChanged) this.updateMatches();
    this.requestDraw();
  }

  setColors(colors: GraphColors) {
    this.colors = colors;
    this.requestDraw();
  }

  private updateMatches() {
    const q = this.opts.search.trim().toLowerCase();
    this.matches = q ? new Set(this.nodes.filter((n) => n.title.toLowerCase().includes(q)).map((n) => n.id)) : null;
  }

  get matchIds(): string[] {
    return this.matches ? this.nodes.filter((n) => this.matches!.has(n.id)).map((n) => n.id) : [];
  }

  // ---- camera --------------------------------------------------------------------

  resize(w: number, h: number) {
    const dpr = window.devicePixelRatio || 1;
    if (this.w && this.h) {
      this.t.x += (w - this.w) / 2;
      this.t.y += (h - this.h) / 2;
    } else {
      this.t = { k: 1, x: w / 2, y: h / 2 };
    }
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    if (this.autoFit) this.fitNow();
    this.draw();
  }

  private fitTransform(): Transform {
    if (!this.nodes.length || !this.w) return { k: 1, x: this.w / 2, y: this.h / 2 };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const n of this.nodes) {
      x0 = Math.min(x0, (n.x ?? 0) - n.r);
      y0 = Math.min(y0, (n.y ?? 0) - n.r);
      x1 = Math.max(x1, (n.x ?? 0) + n.r);
      y1 = Math.max(y1, (n.y ?? 0) + n.r);
    }
    const pad = Math.min(56, Math.min(this.w, this.h) * 0.12);
    // Only honor the inset when enough room remains for the graph itself.
    const roomy = this.w - this.inset.left - this.inset.right > this.w * 0.55 && this.h - this.inset.top - this.inset.bottom > this.h * 0.55;
    const inset = roomy ? this.inset : { top: 0, right: 0, bottom: 0, left: 0 };
    const aw = this.w - inset.left - inset.right;
    const ah = this.h - inset.top - inset.bottom;
    const k = clamp(Math.min((aw - pad * 2) / Math.max(1, x1 - x0), (ah - pad * 2) / Math.max(1, y1 - y0)), MIN_K, 1.6);
    return { k, x: inset.left + aw / 2 - ((x0 + x1) / 2) * k, y: inset.top + ah / 2 - ((y0 + y1) / 2) * k };
  }

  setInset(inset: { top?: number; right?: number; bottom?: number; left?: number }) {
    this.inset = { top: 0, right: 0, bottom: 0, left: 0, ...inset };
  }

  private fitNow() {
    this.t = this.fitTransform();
  }

  private animateTo(target: Transform, ms = 350) {
    cancelAnimationFrame(this.anim);
    const from = { ...this.t };
    const t0 = performance.now();
    const step = () => {
      const p = clamp((performance.now() - t0) / ms, 0, 1);
      const e = 1 - (1 - p) ** 3;
      // Interpolate zoom geometrically so it feels uniform.
      this.t = {
        k: from.k * (target.k / from.k) ** e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      this.refreshHover();
      this.draw();
      if (p < 1) this.anim = requestAnimationFrame(step);
    };
    if (this.reducedMotion) {
      this.t = target;
      this.draw();
    } else this.anim = requestAnimationFrame(step);
  }

  fit() {
    this.autoFit = false;
    this.animateTo(this.fitTransform());
  }

  zoomBy(factor: number) {
    this.autoFit = false;
    const k = clamp(this.t.k * factor, MIN_K, MAX_K);
    const cx = this.w / 2;
    const cy = this.h / 2;
    this.animateTo({ k, x: cx - ((cx - this.t.x) / this.t.k) * k, y: cy - ((cy - this.t.y) / this.t.k) * k }, 200);
  }

  /** Center a node (e.g. the first search match) at a readable zoom. */
  focusNode(id: string) {
    const n = this.byId.get(id);
    if (!n) return;
    this.autoFit = false;
    const k = Math.max(this.t.k, 1.4);
    this.animateTo({ k, x: this.w / 2 - (n.x ?? 0) * k, y: this.h / 2 - (n.y ?? 0) * k });
  }

  private zoomAt(p: Point, factor: number) {
    const k = clamp(this.t.k * factor, MIN_K, MAX_K);
    const wx = (p.x - this.t.x) / this.t.k;
    const wy = (p.y - this.t.y) / this.t.k;
    this.t = { k, x: p.x - wx * k, y: p.y - wy * k };
  }

  // ---- interaction ---------------------------------------------------------------

  private local(e: { clientX: number; clientY: number }): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private hit(p: Point): SimNode | null {
    const wx = (p.x - this.t.x) / this.t.k;
    const wy = (p.y - this.t.y) / this.t.k;
    const slop = 6 / this.t.k;
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = Math.hypot((n.x ?? 0) - wx, (n.y ?? 0) - wy);
      if (d < n.r + slop && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private setHover(n: SimNode | null) {
    if (n === this.hover) return;
    this.hover = n;
    this.canvas.style.cursor = n ? "pointer" : "";
    this.onHoverChange(n?.id ?? null);
    this.requestDraw();
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    this.autoFit = false;
    cancelAnimationFrame(this.anim);
    if (this.pointers.size === 2) {
      // Second finger: switch from drag/pan to pinch zoom.
      this.releaseDrag();
      this.pan = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    const n = this.hit(p);
    if (n) {
      this.drag = { node: n, start: p, moved: false, pointerId: e.pointerId };
      n.fx = n.x;
      n.fy = n.y;
      this.setHover(n);
      if (!this.reducedMotion) this.sim.alphaTarget(0.2).restart();
    } else {
      this.pan = { start: p, t: { ...this.t }, moved: false };
      this.canvas.style.cursor = "grabbing";
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.zoomAt(mid, dist / Math.max(1, this.pinch.dist));
      this.t.x += mid.x - this.pinch.mid.x;
      this.t.y += mid.y - this.pinch.mid.y;
      this.pinch = { dist, mid };
      this.requestDraw();
      return;
    }
    if (this.drag && this.drag.pointerId === e.pointerId) {
      const n = this.drag.node;
      if (!this.drag.moved && Math.hypot(p.x - this.drag.start.x, p.y - this.drag.start.y) > 4) this.drag.moved = true;
      if (this.drag.moved) {
        n.fx = (p.x - this.t.x) / this.t.k;
        n.fy = (p.y - this.t.y) / this.t.k;
        if (this.reducedMotion) {
          n.x = n.fx;
          n.y = n.fy;
        }
        this.requestDraw();
      }
      return;
    }
    if (this.pan) {
      if (!this.pan.moved && Math.hypot(p.x - this.pan.start.x, p.y - this.pan.start.y) > 3) this.pan.moved = true;
      this.t = { k: this.pan.t.k, x: this.pan.t.x + p.x - this.pan.start.x, y: this.pan.t.y + p.y - this.pan.start.y };
      this.requestDraw();
      return;
    }
    if (e.pointerType !== "touch") {
      this.mouse = p;
      this.setHover(this.hit(p));
    }
  };

  private refreshHover() {
    if (this.mouse && !this.drag && !this.pan && !this.pinch) this.setHover(this.hit(this.mouse));
  }

  private releaseDrag() {
    if (!this.drag) return;
    const n = this.drag.node;
    n.fx = null;
    n.fy = null;
    this.drag = null;
    this.sim.alphaTarget(0);
  }

  private onPointerUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.drag && this.drag.pointerId === e.pointerId) {
      const { node, moved } = this.drag;
      this.releaseDrag();
      if (!moved && e.type === "pointerup") this.onOpen(node.id);
      if (e.pointerType === "touch") this.setHover(null);
    }
    if (this.pan) {
      this.pan = null;
      this.canvas.style.cursor = this.hover ? "pointer" : "";
    }
    this.requestDraw();
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    this.mouse = null;
    if (!this.drag && !this.pan) this.setHover(null);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.autoFit = false;
    cancelAnimationFrame(this.anim);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1;
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015));
    this.mouse = this.local(e);
    this.zoomAt(this.mouse, factor);
    this.refreshHover();
    this.requestDraw();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const step = 60;
    let handled = true;
    if (e.key === "+" || e.key === "=") this.zoomBy(1.3);
    else if (e.key === "-" || e.key === "_") this.zoomBy(1 / 1.3);
    else if (e.key === "0") this.fit();
    else if (e.key === "ArrowLeft") this.t.x += step;
    else if (e.key === "ArrowRight") this.t.x -= step;
    else if (e.key === "ArrowUp") this.t.y += step;
    else if (e.key === "ArrowDown") this.t.y -= step;
    else handled = false;
    if (handled) {
      e.preventDefault();
      this.autoFit = false;
      this.requestDraw();
    }
  };

  // ---- drawing ---------------------------------------------------------------------

  private onTick() {
    this.refreshHover();
    if (this.autoFit) {
      // Ease the camera toward the fitted view as the layout expands.
      const f = this.fitTransform();
      this.t = {
        k: this.t.k + (f.k - this.t.k) * 0.12,
        x: this.t.x + (f.x - this.t.x) * 0.12,
        y: this.t.y + (f.y - this.t.y) * 0.12,
      };
    }
    this.requestDraw();
  }

  requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw() {
    const c = this.colors;
    if (!c || !this.w) return;
    const ctx = this.ctx;
    const { k, x, y } = this.t;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    const active = this.drag?.node ?? this.hover;
    const near = active ? this.adjacency.get(active.id) : undefined;
    const matches = this.matches;
    const focusId = this.opts.focusId;
    // Search matches always stand out; otherwise hover narrows focus to a neighborhood.
    const isDim = (n: SimNode) =>
      !matches?.has(n.id) && ((active !== null && n !== active && !near?.has(n.id)) || (matches !== null && n !== active));

    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y);
    // Hairline edges regardless of zoom, a little heavier when zoomed in.
    const lw = clamp(k, 0.7, 1.4) / k;

    const strokeEdges = (filter: (l: SimLink) => boolean, color: string, alpha: number, width: number) => {
      for (const dashed of [false, true]) {
        ctx.beginPath();
        let any = false;
        for (const l of this.links) {
          if ((l.type === "tree") !== dashed || !filter(l)) continue;
          const s = l.source as SimNode;
          const t = l.target as SimNode;
          ctx.moveTo(s.x ?? 0, s.y ?? 0);
          ctx.lineTo(t.x ?? 0, t.y ?? 0);
          any = true;
        }
        if (!any) continue;
        ctx.setLineDash(dashed ? [4 / k, 3 / k] : []);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };
    const touches = (l: SimLink) => active !== null && (l.source === active || l.target === active);
    const edgeAlpha = active ? 0.12 : matches ? 0.2 : 0.7;
    strokeEdges((l) => !touches(l), c.edge, edgeAlpha, lw);
    if (active) strokeEdges(touches, c.accent, 0.9, lw * 1.7);

    for (const n of this.nodes) {
      const dim = isDim(n);
      const r = n.r + (n.id === focusId ? 2 : 0);
      ctx.globalAlpha = dim ? 0.2 : 1;
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2);
      ctx.fillStyle = c.kinds[n.kind] ?? c.kinds.doc;
      ctx.fill();
      const ring = n === active || n.id === focusId || (matches?.has(n.id) ?? false);
      if (ring) {
        ctx.lineWidth = 2 / k;
        ctx.strokeStyle = n === active ? c.text : c.accent;
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, r + 3 / k, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Labels in screen space so text stays crisp and a constant size.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    const few = this.nodes.length <= 24;
    const zoomAlpha = this.opts.labels ? (few ? 1 : clamp((k - 0.75) / 0.4, 0, 1)) : 0;
    const labels: { n: SimNode; a: number; prio: number; sx: number; sy: number; text: string }[] = [];
    for (const n of this.nodes) {
      const emphasized = n === active || (near?.has(n.id) ?? false) || (matches?.has(n.id) ?? false) || n.id === focusId;
      let a = emphasized ? 1 : zoomAlpha;
      if (isDim(n)) a = Math.min(a, 0.18);
      if (a < 0.03) continue;
      const sx = (n.x ?? 0) * k + x;
      const sy = (n.y ?? 0) * k + y + (n.r + (n.id === focusId ? 2 : 0)) * k + 4;
      if (sx < -150 || sx > this.w + 150 || sy < -20 || sy > this.h + 20) continue;
      const prio = n === active ? 4 : n.id === focusId ? 3 : emphasized ? 2 : 0;
      labels.push({ n, a, prio, sx, sy, text: truncate(n.title, n === active ? 60 : 32) });
    }
    // Greedy placement: important and well-connected pages first; skip labels that would overlap.
    labels.sort((p, q) => q.prio - p.prio || q.n.degree - p.n.degree);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const l of labels.slice(0, 600)) {
      // The skill map's label styles (see TYPE in skill-graph.ts): 12px, a little bolder for the one you're on.
      ctx.font = `${l.prio === 4 ? 600 : 500} 12px ${c.font}`;
      const half = ctx.measureText(l.text).width / 2 + 2;
      const box = { x0: l.sx - half, y0: l.sy - 1, x1: l.sx + half, y1: l.sy + 15 };
      // Whole labels only: one that would run off the edge waits until it's in view.
      const inView = box.x0 >= 2 && box.x1 <= this.w - 2 && box.y0 >= 2 && box.y1 <= this.h - 2;
      if (l.prio < 4 && (!inView || placed.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1))) continue;
      placed.push(box);
      ctx.globalAlpha = l.a;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = c.halo;
      ctx.strokeText(l.text, l.sx, l.sy);
      ctx.fillStyle = l.prio >= 3 ? c.text : c.textMuted;
      ctx.fillText(l.text, l.sx, l.sy);
    }
    ctx.globalAlpha = 1;
  }
}

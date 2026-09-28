// Imperative SVG renderer.
//
// DOM layout (inside the host element):
//   .pv-world          CSS-transformed document (pan / rotate / mirror are
//                      compositor-only; zoom re-rasterizes once it settles)
//     .pv-checker      transparency checkerboard
//     .pv-stack        isolated group: paper color + one element per layer
//       .pv-layer-el   layer opacity / blend / visibility
//         svg          committed strokes (its own composited layer)
//         svg.pv-live  in-progress strokes (only while drawing)
//   svg.pv-overlay-svg screen-space UI: cursor, selection, guides, peers
//
// Each stroke is a cached DOM group; new strokes on top of a layer are
// appended, edited strokes are swapped in place, and only structural changes
// (erase masks, alpha lock, reordering) rebuild one layer from cached nodes.

import { geomKey, strokeGeometry, type StrokeGeom } from "./brushes.ts";
import { apply, boxContains, invert, matString, mul, toMat, transformBox, type Box } from "./geometry.ts";
import { buildStrokeElement, svgEl } from "./svg.ts";
import { buildTree, compareStrokes, type TreeNode } from "./tree.ts";
import { DEFAULT_META, type LayerData, type Mat, type PaintMeta, type Stroke, type ViewState } from "./types.ts";

interface StrokeEntry {
  s: Stroke;
  key: string;
  geom: StrokeGeom;
  el: SVGGElement;
}

interface LayerEntry {
  data: LayerData;
  el: HTMLDivElement;
  svg: SVGSVGElement;
  inner: SVGGElement;
  content: SVGGElement;
  liveErase: SVGMaskElement;
  /** Live paint strokes, one svg per blend mode so previews blend like the final result. */
  liveSvgs: Map<string, SVGSVGElement>;
  /** Committed stroke ids in z order, as currently rendered. */
  sorted: string[];
  dirty: boolean;
}

export function viewMatrix(v: ViewState): Mat {
  const r = (v.rotation * Math.PI) / 180;
  const c = Math.cos(r) * v.scale;
  const s = Math.sin(r) * v.scale;
  const mx = v.mirror ? -1 : 1;
  return [c * mx, s * mx, -s, c, v.tx, v.ty];
}

const safeKey = (k: string) => k.replace(/[^a-zA-Z0-9_-]/g, "_");

export interface RendererOptions {
  /**
   * Canvas mode: an infinite surface (no paper) drawn in the whiteboard's
   * scene coordinates. Only the part around the view is rasterized.
   */
  infinite?: boolean;
  /** Canvas mode: host for layers painted under the whiteboard shapes. */
  under?: HTMLElement;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mask region in canvas mode: effectively unbounded. */
const BIG: Region = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 };
/** Extra area rasterized around the view in canvas mode (fraction of the view). */
const REGION_MARGIN = 0.3;

/** Idle time after the last zoom step before re-rasterizing at the new scale. */
const ZOOM_SETTLE_MS = 160;

export class PaintRenderer {
  readonly host: HTMLElement;
  readonly overlay: SVGGElement;
  readonly prefix: string;
  meta: PaintMeta = { ...DEFAULT_META };
  /** Bumped whenever committed content changes (for raster caches). */
  version = 0;
  onChange: (() => void) | null = null;

  private strokes = new Map<string, StrokeEntry>();
  private byLayer = new Map<string, Set<string>>();
  private layers = new Map<string, LayerEntry>();
  private order: string[] = [];
  private live = new Map<string, { layerId: string; el: SVGGElement; erase: boolean; clip: boolean; blend: string }>();

  readonly infinite: boolean;
  private world: HTMLDivElement;
  private stack: HTMLDivElement;
  private underWorld: HTMLDivElement | null = null;
  private underStack: HTMLDivElement | null = null;
  private paperColor: HTMLDivElement;
  private checker: HTMLDivElement;
  /** Canvas mode: a legacy painting's paper, drawn as a rectangle at the origin. */
  private paperSvg: SVGSVGElement | null = null;
  private overlaySvg: SVGSVGElement;
  private view: ViewState = { tx: 0, ty: 0, scale: 1, rotation: 0, mirror: false };
  private rasterScale = 1;
  private region: Region = { x: 0, y: 0, w: DEFAULT_META.width, h: DEFAULT_META.height };
  private viewSet = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(host: HTMLElement, prefix: string, opts: RendererOptions = {}) {
    this.host = host;
    this.prefix = prefix;
    this.infinite = !!opts.infinite;
    this.world = document.createElement("div");
    this.world.className = "pv-world";
    this.checker = document.createElement("div");
    this.checker.className = "pv-checker";
    this.stack = document.createElement("div");
    this.stack.className = "pv-stack";
    this.paperColor = document.createElement("div");
    this.paperColor.className = "pv-paper-color";
    this.stack.append(this.paperColor);
    this.world.append(this.checker, this.stack);
    if (this.infinite) {
      this.world.classList.add("pv-world-infinite");
      this.checker.style.display = "none";
      this.paperColor.style.display = "none";
    }
    if (opts.under) {
      this.underWorld = document.createElement("div");
      this.underWorld.className = "pv-world pv-world-infinite";
      this.underStack = document.createElement("div");
      this.underStack.className = "pv-stack";
      this.underWorld.append(this.underStack);
      opts.under.append(this.underWorld);
    }
    this.overlaySvg = svgEl("svg", { class: "pv-overlay-svg" });
    this.overlay = svgEl("g", { class: "pv-overlay" });
    this.overlaySvg.append(this.overlay);
    host.append(this.world, this.overlaySvg);
    this.setMeta(this.meta);
  }

  private get worlds(): HTMLDivElement[] {
    return this.underWorld ? [this.underWorld, this.world] : [this.world];
  }

  /** Where masks may draw: the paper, or (canvas mode) everywhere. */
  private get maskRegion(): Region {
    return this.infinite ? BIG : { x: 0, y: 0, w: this.meta.width, h: this.meta.height };
  }

  // ---- document & view ----------------------------------------------------------------

  /**
   * Canvas mode: show a legacy painting's paper (its size and color) as a
   * rectangle at the scene origin, under everything.
   */
  setPaper(show: boolean) {
    if (!this.infinite) return;
    if (!show) {
      this.paperSvg?.remove();
      this.paperSvg = null;
      return;
    }
    if (!this.paperSvg) {
      this.paperSvg = svgEl("svg", { class: "pv-layer-svg pv-paper-svg", preserveAspectRatio: "none" });
      this.paperSvg.append(svgEl("rect", { x: 0, y: 0 }));
      this.sizeSvg(this.paperSvg);
    }
    const rect = this.paperSvg.firstElementChild as SVGRectElement;
    const { width, height, background } = this.meta;
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", !background || background === "transparent" ? "none" : background);
    const stack = this.underStack ?? this.stack;
    if (stack.firstElementChild !== this.paperSvg) stack.prepend(this.paperSvg);
  }

  setMeta(meta: PaintMeta) {
    const sizeChanged = meta.width !== this.meta.width || meta.height !== this.meta.height;
    this.meta = meta;
    if (this.infinite) {
      if (this.paperSvg) this.setPaper(true);
      return;
    }
    this.region = { x: 0, y: 0, w: meta.width, h: meta.height };
    const transparent = !meta.background || meta.background === "transparent";
    this.paperColor.style.background = transparent ? "transparent" : meta.background;
    this.checker.style.display = transparent ? "" : "none";
    this.applyWorldSize();
    if (sizeChanged) {
      for (const L of this.layers.values()) {
        this.sizeSvg(L.svg);
        for (const s of L.liveSvgs.values()) this.sizeSvg(s);
        for (const n of [L.liveErase, L.liveErase.firstElementChild as SVGElement]) {
          n.setAttribute("width", String(meta.width));
          n.setAttribute("height", String(meta.height));
        }
        L.dirty = true;
      }
      this.flush();
    }
    this.applyView();
  }

  private sizeSvg(svg: SVGSVGElement) {
    const r = this.region;
    svg.setAttribute("viewBox", `${r.x} ${r.y} ${r.w} ${r.h}`);
  }

  private applyWorldSize() {
    for (const w of this.worlds) {
      w.style.width = `${this.region.w * this.rasterScale}px`;
      w.style.height = `${this.region.h * this.rasterScale}px`;
    }
  }

  private applyView() {
    const v = this.view;
    const k = v.scale / this.rasterScale;
    const transform = this.infinite
      ? `translate(${v.tx + this.region.x * v.scale}px, ${v.ty + this.region.y * v.scale}px) scale(${k})`
      : `translate(${v.tx}px, ${v.ty}px) rotate(${v.rotation}deg) scale(${(v.mirror ? -1 : 1) * k}, ${k})`;
    for (const w of this.worlds) w.style.transform = transform;
  }

  /** Canvas mode: the scene area around the view that gets rasterized. */
  private visibleRegion(): Region {
    const v = this.view;
    const w = (this.host.clientWidth || 800) / v.scale;
    const h = (this.host.clientHeight || 600) / v.scale;
    const x = -v.tx / v.scale;
    const y = -v.ty / v.scale;
    return { x: x - w * REGION_MARGIN, y: y - h * REGION_MARGIN, w: w * (1 + 2 * REGION_MARGIN), h: h * (1 + 2 * REGION_MARGIN) };
  }

  /** Canvas mode: re-rasterize around the current view at its zoom. */
  private resettle() {
    this.rasterScale = this.view.scale;
    this.region = this.visibleRegion();
    for (const L of this.layers.values()) {
      this.sizeSvg(L.svg);
      for (const s of L.liveSvgs.values()) this.sizeSvg(s);
    }
    if (this.paperSvg) this.sizeSvg(this.paperSvg);
    this.applyWorldSize();
    this.applyView();
  }

  /** Canvas mode: has the view moved (or zoomed) past what was rasterized? */
  private outsideRegion(): boolean {
    const vis = this.visibleRegion();
    const inner = { x: vis.x + vis.w * 0.23, y: vis.y + vis.h * 0.23, w: vis.w / (1 + 2 * REGION_MARGIN), h: vis.h / (1 + 2 * REGION_MARGIN) };
    const r = this.region;
    return inner.x < r.x || inner.y < r.y || inner.x + inner.w > r.x + r.w || inner.y + inner.h > r.y + r.h;
  }

  /** Re-rasterize at the current zoom now (for discrete zoom changes). */
  settleNow() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    if (this.infinite) {
      this.resettle();
      return;
    }
    if (this.rasterScale === this.view.scale) return;
    this.rasterScale = this.view.scale;
    this.applyWorldSize();
    this.applyView();
  }

  /** Pan / rotate apply immediately; zoom re-rasterizes once it settles. */
  setView(v: ViewState) {
    this.view = v;
    if (this.infinite) {
      // Canvas mode: pans and zooms are compositor-only until they settle, then
      // the area around the new view is rasterized at the new scale.
      if (!this.viewSet) {
        this.viewSet = true;
        this.resettle();
        return;
      }
      if (this.settleTimer) clearTimeout(this.settleTimer);
      if (this.outsideRegion()) this.resettle();
      else this.applyView();
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        if (this.rasterScale !== this.view.scale || this.outsideRegion()) this.resettle();
      }, ZOOM_SETTLE_MS);
      return;
    }
    if (!this.viewSet) {
      // First placement: rasterize at the right scale straight away.
      this.viewSet = true;
      this.rasterScale = v.scale;
      this.applyWorldSize();
    } else if (v.scale !== this.rasterScale) {
      if (this.settleTimer) clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        this.settleTimer = null;
        this.rasterScale = this.view.scale;
        this.applyWorldSize();
        this.applyView();
      }, ZOOM_SETTLE_MS);
    }
    this.applyView();
  }

  // ---- layers -----------------------------------------------------------------------

  contentId(layerId: string) {
    return `${this.prefix}layer-${layerId}`;
  }

  private createLayer(data: LayerData): LayerEntry {
    const { x, y, w: width, h: height } = this.maskRegion;
    const el = document.createElement("div");
    el.className = "pv-layer-el";
    el.dataset.layer = data.id;
    const svg = svgEl("svg", { class: "pv-layer-svg", preserveAspectRatio: "none" });
    this.sizeSvg(svg);
    const inner = svgEl("g");
    const content = svgEl("g", { id: this.contentId(data.id) });
    const liveErase = svgEl("mask", {
      id: `${this.prefix}le-${data.id}`,
      class: "pv-live",
      maskUnits: "userSpaceOnUse",
      x,
      y,
      width,
      height,
    });
    liveErase.append(svgEl("rect", { x, y, width, height, fill: "#fff" }));
    inner.append(content);
    svg.append(liveErase, inner);
    el.append(svg);
    return { data, el, svg, inner, content, liveErase, liveSvgs: new Map(), sorted: [], dirty: true };
  }

  setLayers(list: LayerData[]) {
    const ids = new Set(list.map((l) => l.id));
    for (const [id, L] of this.layers) {
      if (!ids.has(id)) {
        L.el.remove();
        this.layers.delete(id);
      }
    }
    for (const data of list) {
      let L = this.layers.get(data.id);
      if (!L) {
        L = this.createLayer(data);
        this.layers.set(data.id, L);
      }
      L.data = data;
      const o = Math.max(0, Math.min(1, data.opacity));
      L.el.style.opacity = o < 1 ? String(o) : "";
      L.el.style.mixBlendMode = data.blend && data.blend !== "normal" ? data.blend : "";
      L.el.style.display = data.visible ? "" : "none";
    }
    const order = list.map((l) => l.id);
    const home = (L: LayerEntry) => (this.underStack && !L.data.over ? this.underStack : this.stack);
    const misplaced = order.some((id) => {
      const L = this.layers.get(id)!;
      return L.el.parentNode !== home(L);
    });
    if (misplaced || order.join("|") !== this.order.join("|")) {
      for (const id of order) {
        const L = this.layers.get(id)!;
        home(L).append(L.el);
      }
      this.order = order;
    }
    this.flush();
    this.bump();
  }

  layerData(id: string): LayerData | undefined {
    return this.layers.get(id)?.data;
  }

  /** Visible layer ids, topmost first. */
  visibleLayersTopDown(): string[] {
    return [...this.order].reverse().filter((id) => this.layers.get(id)?.data.visible);
  }

  // ---- strokes ----------------------------------------------------------------------

  getStroke(id: string): Stroke | undefined {
    return this.strokes.get(id)?.s;
  }

  /** Committed strokes of a layer in z order (bottom first). */
  layerStrokes(layerId: string): Stroke[] {
    const L = this.layers.get(layerId);
    if (L && !L.dirty) return L.sorted.map((id) => this.strokes.get(id)!.s);
    return [...(this.byLayer.get(layerId) ?? [])].map((id) => this.strokes.get(id)!.s).sort(compareStrokes);
  }

  layerSize(layerId: string): number {
    return this.byLayer.get(layerId)?.size ?? 0;
  }

  maxZ(layerId: string): number {
    let max = 0;
    for (const id of this.byLayer.get(layerId) ?? []) max = Math.max(max, this.strokes.get(id)!.s.z);
    return max;
  }

  /** Apply a batch of changes from the Y map (value undefined = deleted). */
  applyStrokes(changes: Iterable<[string, Stroke | undefined]>) {
    for (const [id, s] of changes) {
      try {
        if (s && this.isValid(s, id)) this.upsert(s);
        else this.remove(id);
      } catch (err) {
        // One malformed stroke (e.g. from an old or buggy client) must not break the canvas.
        console.warn("[paint] skipped stroke", id, err);
        this.remove(id);
      }
    }
    this.flush();
    this.bump();
  }

  private isValid(s: Stroke, key: string): boolean {
    return (
      !!s &&
      typeof s === "object" &&
      s.id === key &&
      typeof s.layerId === "string" &&
      typeof s.z === "number" &&
      (s.points === undefined || (Array.isArray(s.points) && s.points.every((n) => typeof n === "number")))
    );
  }

  private upsert(raw: Stroke) {
    const s: Stroke = { ...raw, points: raw.points ?? [], options: raw.options ?? {}, opacity: raw.opacity ?? 1 };
    const prev = this.strokes.get(s.id);
    const key = geomKey(s);
    const geom = prev && prev.key === key ? prev.geom : strokeGeometry(s, true);
    const el = buildStrokeElement(s, geom, this.prefix);
    const entry: StrokeEntry = { s, key, geom, el };
    this.strokes.set(s.id, entry);
    if (prev) {
      const sameSlot =
        prev.s.layerId === s.layerId &&
        prev.s.z === s.z &&
        prev.s.kind === s.kind &&
        prev.s.floor === s.floor &&
        !!prev.s.clip === !!s.clip;
      if (sameSlot && prev.el.parentNode) {
        prev.el.replaceWith(el);
        return;
      }
      prev.el.remove();
      this.byLayer.get(prev.s.layerId)?.delete(s.id);
      this.markDirty(prev.s.layerId);
    }
    let set = this.byLayer.get(s.layerId);
    if (!set) this.byLayer.set(s.layerId, (set = new Set()));
    set.add(s.id);
    const L = this.layers.get(s.layerId);
    if (!L) return;
    // Fast path: plain paint on top of the layer is simply appended.
    const topId = L.sorted[L.sorted.length - 1];
    const top = topId ? this.strokes.get(topId)?.s : undefined;
    if (!L.dirty && s.kind !== "erase" && !s.clip && (!top || compareStrokes(top, s) < 0)) {
      L.content.append(el);
      L.sorted.push(s.id);
      return;
    }
    L.dirty = true;
  }

  private remove(id: string) {
    const prev = this.strokes.get(id);
    if (!prev) return;
    this.strokes.delete(id);
    prev.el.remove();
    this.byLayer.get(prev.s.layerId)?.delete(id);
    const L = this.layers.get(prev.s.layerId);
    if (!L) return;
    const hasFloors = L.sorted.some((sid) => typeof this.strokes.get(sid)?.s.floor === "number");
    if (prev.s.kind === "erase" || prev.s.clip || hasFloors) L.dirty = true;
    else if (!L.dirty) L.sorted = L.sorted.filter((sid) => sid !== id);
  }

  private markDirty(layerId: string) {
    const L = this.layers.get(layerId);
    if (L) L.dirty = true;
  }

  private flush() {
    for (const [id, L] of this.layers) if (L.dirty) this.rebuildLayer(id, L);
  }

  private rebuildLayer(layerId: string, L: LayerEntry) {
    const list = [...(this.byLayer.get(layerId) ?? [])].map((id) => this.strokes.get(id)!.s).sort(compareStrokes);
    const tree = buildTree(list);
    L.content.replaceChildren();
    this.renderNodes(tree, L.content);
    L.sorted = list.map((s) => s.id);
    L.dirty = false;
  }

  private renderNodes(nodes: TreeNode[], parent: SVGElement) {
    const { x, y, w: width, h: height } = this.maskRegion;
    const region = { maskUnits: "userSpaceOnUse", x, y, width, height };
    for (const n of nodes) {
      if (n.t === "stroke") {
        const e = this.strokes.get(n.id);
        if (e) parent.append(e.el);
      } else if (n.t === "erase") {
        const id = `${this.prefix}m-${n.key}`;
        const mask = svgEl("mask", { id, ...region });
        mask.append(svgEl("rect", { x, y, width, height, fill: "#fff" }));
        for (const eid of n.erase) {
          const e = this.strokes.get(eid);
          if (e) mask.append(e.el);
        }
        const g = svgEl("g", { mask: `url(#${id})` });
        this.renderNodes(n.children, g);
        parent.append(mask, g);
      } else if (n.t === "src") {
        const g = svgEl("g", { id: `${this.prefix}src-${n.key}` });
        this.renderNodes(n.children, g);
        parent.append(g);
      } else {
        const id = `${this.prefix}cm-${n.key}`;
        const mask = svgEl("mask", { id, ...region });
        mask.style.maskType = "alpha";
        mask.append(svgEl("use", { href: `#${this.prefix}src-${n.src}` }));
        const g = svgEl("g", { mask: `url(#${id})` });
        this.renderNodes(n.children, g);
        parent.append(mask, g);
      }
    }
  }

  private bump() {
    this.version++;
    this.onChange?.();
  }

  // ---- live (in-progress) strokes -------------------------------------------------------

  private liveSvg(L: LayerEntry, blend: string): SVGSVGElement {
    let svg = L.liveSvgs.get(blend);
    if (!svg) {
      svg = svgEl("svg", { class: "pv-layer-svg pv-live-svg", preserveAspectRatio: "none" });
      this.sizeSvg(svg);
      if (blend !== "normal") svg.style.mixBlendMode = blend;
      L.liveSvgs.set(blend, svg);
      L.el.append(svg);
    }
    return svg;
  }

  setLive(key: string, s: Stroke | null, last = false) {
    const prev = this.live.get(key);
    if (prev) {
      prev.el.remove();
      this.live.delete(key);
    }
    if (s) {
      const L = this.layers.get(s.layerId);
      if (L) {
        const liveStroke: Stroke = { ...s, id: `lv-${safeKey(key)}` };
        const el = buildStrokeElement(liveStroke, strokeGeometry(liveStroke, last), this.prefix);
        const erase = s.kind === "erase";
        const blend = s.blend && s.blend !== "normal" ? s.blend : "normal";
        if (erase) L.liveErase.append(el);
        else {
          // The live svg applies the blend mode against the layer's content.
          el.querySelectorAll<SVGElement>("path, image, g").forEach((n) => (n.style.mixBlendMode = ""));
          this.liveSvg(L, blend).append(el);
        }
        this.live.set(key, { layerId: s.layerId, el, erase, clip: !!s.clip, blend });
      }
    }
    const touched = new Set<string>();
    if (prev) touched.add(prev.layerId);
    if (s) touched.add(s.layerId);
    for (const id of touched) this.syncLive(id);
  }

  private syncLive(layerId: string) {
    const L = this.layers.get(layerId);
    if (!L) return;
    let erase = false;
    const clipBlends = new Set<string>();
    const used = new Set<string>();
    for (const v of this.live.values()) {
      if (v.layerId !== layerId) continue;
      if (v.erase) erase = true;
      else {
        used.add(v.blend);
        if (v.clip) clipBlends.add(v.blend);
      }
    }
    if (erase) L.inner.setAttribute("mask", `url(#${L.liveErase.id})`);
    else L.inner.removeAttribute("mask");
    for (const [blend, svg] of L.liveSvgs) {
      if (!used.has(blend)) {
        svg.remove();
        L.liveSvgs.delete(blend);
        continue;
      }
      // Alpha lock preview: clip the live strokes to the layer's existing pixels.
      let clip = svg.querySelector<SVGMaskElement>(":scope > mask");
      if (clipBlends.has(blend)) {
        if (!clip) {
          const r = this.maskRegion;
          clip = svgEl("mask", {
            id: `${this.prefix}lc-${layerId}-${blend}`,
            maskUnits: "userSpaceOnUse",
            x: r.x,
            y: r.y,
            width: r.w,
            height: r.h,
          });
          clip.style.maskType = "alpha";
          clip.append(svgEl("use", { href: `#${this.contentId(layerId)}` }));
          svg.prepend(clip);
        }
        for (const g of svg.querySelectorAll<SVGGElement>(":scope > g")) g.setAttribute("mask", `url(#${clip.id})`);
      } else if (clip) {
        clip.remove();
        for (const g of svg.querySelectorAll<SVGGElement>(":scope > g")) g.removeAttribute("mask");
      }
    }
  }

  clearLive(prefix: string) {
    for (const key of [...this.live.keys()]) if (key.startsWith(prefix)) this.setLive(key, null);
  }

  // ---- queries --------------------------------------------------------------------------

  /** Bounds in document space, including the stroke's transform. */
  worldBox(id: string, extra?: Mat): Box | null {
    const e = this.strokes.get(id);
    if (!e) return null;
    const m = toMat(e.s.transform);
    return transformBox(e.geom.box, extra ? mul(extra, m) : m);
  }

  localBox(id: string): Box | null {
    return this.strokes.get(id)?.geom.box ?? null;
  }

  /** Topmost paint stroke on a layer under a document point. */
  hitTest(layerId: string, x: number, y: number, tol: number): string | null {
    const list = this.layerStrokes(layerId);
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.kind === "erase") continue;
      const e = this.strokes.get(s.id)!;
      const [lx, ly] = apply(invert(toMat(s.transform)), x, y);
      if (!boxContains(e.geom.box, lx, ly, tol)) continue;
      if (s.kind === "image") return s.id;
      const paths = e.el.querySelectorAll("path");
      const probes: [number, number][] = [
        [lx, ly],
        [lx + tol, ly],
        [lx - tol, ly],
        [lx, ly + tol],
        [lx, ly - tol],
      ];
      for (const p of paths) {
        if (p.closest("mask")) continue;
        for (const [px, py] of probes) {
          try {
            if (p.isPointInFill(new DOMPoint(px, py))) return s.id;
          } catch {
            return s.id;
          }
        }
      }
    }
    return null;
  }

  /** Temporarily show strokes with an extra transform (during move/scale/rotate). */
  previewTransform(ids: Iterable<string>, m: Mat | null) {
    for (const id of ids) {
      const e = this.strokes.get(id);
      if (!e) continue;
      const base = toMat(e.s.transform);
      if (m) e.el.setAttribute("transform", matString(mul(m, base)));
      else if (e.s.transform) e.el.setAttribute("transform", matString(base));
      else e.el.removeAttribute("transform");
    }
  }

  // ---- export ---------------------------------------------------------------------------

  /** Bounds of everything painted (canvas mode export), padded a little. */
  contentBox(): Box {
    let box: Box | null = this.paperSvg ? { x0: 0, y0: 0, x1: this.meta.width, y1: this.meta.height } : null;
    for (const [id, e] of this.strokes) {
      if (e.s.kind === "erase" || !this.layers.get(e.s.layerId)?.data.visible) continue;
      const b = this.worldBox(id);
      if (!b) continue;
      box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
    }
    if (!box) return { x0: 0, y0: 0, x1: 1, y1: 1 };
    const pad = 16;
    return { x0: Math.floor(box.x0 - pad), y0: Math.floor(box.y0 - pad), x1: Math.ceil(box.x1 + pad), y1: Math.ceil(box.y1 + pad) };
  }

  /** Size of what exportSvg() produces. */
  exportSize(): { width: number; height: number } {
    if (!this.infinite) return { width: this.meta.width, height: this.meta.height };
    const b = this.contentBox();
    return { width: b.x1 - b.x0, height: b.y1 - b.y0 };
  }

  /** Standalone SVG markup of the committed artwork (visible layers only). */
  exportSvg(opts: { background?: boolean } = {}): string {
    const { background } = this.meta;
    const box = this.infinite ? this.contentBox() : { x0: 0, y0: 0, x1: this.meta.width, y1: this.meta.height };
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const root = svgEl("svg", { width, height, viewBox: `${box.x0} ${box.y0} ${width} ${height}` });
    const group = svgEl("g");
    group.style.isolation = "isolate";
    const transparent = !background || background === "transparent";
    if (this.infinite) {
      if (opts.background !== false && this.paperSvg && !transparent)
        group.append(svgEl("rect", { width: this.meta.width, height: this.meta.height, fill: background }));
    } else if (opts.background !== false && !transparent) group.append(svgEl("rect", { width, height, fill: background }));
    for (const id of this.order) {
      const L = this.layers.get(id);
      if (!L || !L.data.visible) continue;
      const g = svgEl("g", { "data-layer": L.data.name });
      g.style.isolation = "isolate";
      if (L.data.opacity < 1) g.setAttribute("opacity", String(L.data.opacity));
      if (L.data.blend && L.data.blend !== "normal") g.style.mixBlendMode = L.data.blend;
      const clone = L.content.cloneNode(true) as SVGGElement;
      clone.removeAttribute("id");
      g.append(clone);
      group.append(g);
    }
    root.append(group);
    return new XMLSerializer().serializeToString(root);
  }

  destroy() {
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.underWorld?.remove();
    this.world.remove();
    this.overlaySvg.remove();
    this.strokes.clear();
    this.layers.clear();
    this.live.clear();
  }
}


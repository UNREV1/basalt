// The canvas controller: view transform, pointer / touch / pen input, tools,
// live strokes, selection transforms, the screen-space overlay and presence.
// It is imperative on purpose: strokes are drawn at pointer rate without
// touching React.

import * as Y from "yjs";
import { randomId } from "../../../shared/crypto.ts";
import type { Workspace, PresenceState } from "../../lib/workspace.ts";
import { strokeOptions, type BrushPreset } from "./brushes.ts";
import { addLayer, addStrokes, deleteStrokes, strokesOf } from "./doc.ts";
import { prepareImage, rasterizeSvg } from "./exporter.ts";
import {
  IDENTITY,
  LazyString,
  apply,
  boxContains,
  decimate,
  ellipsePoints,
  emptyBox,
  growBox,
  invert,
  isEmptyBox,
  isIdentity,
  linePoints,
  mapNibAngle,
  mul,
  pointInPolygon,
  rectPoints,
  rotateAt,
  round2,
  roundMat,
  scaleAt,
  snapAngle,
  speedToPressure,
  symmetryCopies,
  toMat,
  transformBox,
  transformPoints,
  translate,
  unionBox,
  type Box,
  type SymCopy,
} from "./geometry.ts";
import { PaintRenderer, viewMatrix } from "./renderer.ts";
import { svgEl } from "./svg.ts";
import type { BrushSettings, Mat, ShapeFill, ShapeKind, Stroke, Symmetry, ToolId, ViewState } from "./types.ts";

export interface EngineState {
  tool: ToolId;
  brush: BrushPreset;
  brushSettings: BrushSettings;
  eraser: BrushPreset;
  eraserSettings: BrushSettings;
  fg: string;
  fgAlpha: number;
  bg: string;
  symmetry: Symmetry;
  activeLayerId: string | null;
  shapeFill: ShapeFill;
  shapeOutline: boolean;
  userName: string;
}

export interface EngineHost {
  ws: Workspace;
  pageId: string;
  page: Y.Map<any>;
  origin: object;
  getState(): EngineState;
  /** Close the current undo group so the next write is its own step. */
  undoStop(): void;
  undo(): void;
  redo(): void;
  onView(v: ViewState): void;
  onSelection(count: number): void;
  onPick(hex: string, alpha: number, target: "fg" | "bg", final: boolean): void;
  onNotice(msg: string): void;
  onPen(): void;
  onColorUsed(hex: string): void;
  onActiveLayer(id: string): void;
  onTool(tool: ToolId): void;
  /** Right-click on the canvas: open the popup palette at stage coordinates. */
  onPalette(x: number, y: number): void;
  /**
   * Canvas mode: the whiteboard owns the camera. The engine asks it to move
   * (pan / zoom gestures) and follows it via applyExternalView(); the surface
   * is infinite and has no rotation or mirroring.
   */
  camera?: { request(v: ViewState): void };
}

export interface EngineOptions {
  /** Canvas mode: host for layers painted under the whiteboard shapes. */
  under?: HTMLElement;
}

type Pt = { x: number; y: number };

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot" | "move";

interface LiveStroke {
  base: Stroke;
  copies: SymCopy[];
  lazy: LazyString;
  stabilizer: number;
  pointerType: string;
  lastT: number;
  lastScreen: Pt;
  sim: number;
  predicted: number[];
  pointer: Pt;
  tilt: boolean;
  startedAt: number;
}

type Action =
  | { kind: "stroke"; pointerId: number; pointerType: string; live: LiveStroke }
  | {
      kind: "shape";
      pointerId: number;
      pointerType: string;
      shape: ShapeKind;
      start: Pt;
      end: Pt;
      shift: boolean;
      alt: boolean;
      base: Stroke;
      copies: SymCopy[];
    }
  | { kind: "lasso"; pointerId: number; pointerType: string; purpose: "fill" | "select"; pts: number[]; additive: boolean; base?: Stroke; copies: SymCopy[] }
  | { kind: "pick"; pointerId: number; pointerType: string; target: "fg" | "bg"; at: Pt }
  | { kind: "transform"; pointerId: number; pointerType: string; handle: Handle; start: Pt; box: Box; m: Mat; ids: string[]; shift: boolean; alt: boolean }
  | { kind: "pan"; pointerId: number; pointerType: string; start: Pt; view0: ViewState }
  | { kind: "rotate"; pointerId: number; pointerType: string; start: Pt; view0: ViewState }
  | { kind: "zoom"; pointerId: number; pointerType: string; start: Pt; view0: ViewState }
  | {
      kind: "gesture";
      ids: [number, number];
      pointerType: "touch";
      p0: [Pt, Pt];
      view0: ViewState;
      startedAt: number;
      moved: number;
      maxTouches: number;
    };

interface PeerLive {
  keys: string[];
  ids: string[];
  until: number;
}

const MIN_SCALE = 0.03;
const MAX_SCALE = 32;
// Excalidraw's zoom range, for canvas mode.
const CANVAS_MIN_SCALE = 0.1;
const CANVAS_MAX_SCALE = 30;
const HANDLE_R = 7;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Remove undefined values so the stored JSON stays tidy. */
function clean<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out as T;
}

function isPaintTool(t: ToolId) {
  return t === "brush" || t === "eraser" || t === "line" || t === "rect" || t === "ellipse" || t === "lasso";
}

export class PaintEngine {
  readonly renderer: PaintRenderer;
  view: ViewState = { tx: 0, ty: 0, scale: 1, rotation: 0, mirror: false };
  keys = { space: false, shift: false, ctrl: false };
  selection = new Set<string>();

  private host: EngineHost;
  private root: HTMLElement;
  private size = { w: 0, h: 0 };
  private fitted = false;
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private ignored = new Set<number>();
  private action: Action | null = null;
  private penSeen = false;
  private hover: (Pt & { type: string }) | null = null;
  private raf = 0;
  private liveDirty = false;
  private overlayDirty = true;
  private lastPresence = 0;
  private lastEraseLive = 0;
  private eraseTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPresence: { base: Stroke; points: number[] } | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPointerPresence = 0;
  private peerLive = new Map<number, PeerLive>();
  private peerCursors: { id: number; name: string; color: string; x: number; y: number; tool?: string }[] = [];
  /** Symmetry center of the stroke in progress (shared with peers). */
  private liveCenter: Pt = { x: 0, y: 0 };
  private pick: { version: number; ctx: CanvasRenderingContext2D } | null = null;
  private pickLoading = false;
  private pickColor: string | null = null;
  private selBoxCache: Box | null = null;
  private clipboard: Stroke[] = [];
  private ro: ResizeObserver;
  private ov: Record<"guides" | "sel" | "lasso" | "string" | "cursor" | "pick" | "peers", SVGGElement>;
  private destroyed = false;

  constructor(root: HTMLElement, canvas: HTMLElement, host: EngineHost, opts: EngineOptions = {}) {
    this.root = root;
    this.host = host;
    this.renderer = new PaintRenderer(canvas, `p${randomId(5)}-`, { infinite: !!host.camera, under: opts.under });
    this.renderer.onChange = () => {
      this.selBoxCache = null;
      this.pruneSelection();
      this.overlayDirty = true;
      this.schedule();
    };
    const mk = (cls: string) => svgEl("g", { class: cls });
    this.ov = {
      guides: mk("pv-guides"),
      lasso: mk("pv-lasso"),
      sel: mk("pv-sel"),
      string: mk("pv-string"),
      pick: mk("pv-pick"),
      peers: mk("pv-peers"),
      cursor: mk("pv-cursor"),
    };
    this.renderer.overlay.append(this.ov.guides, this.ov.lasso, this.ov.sel, this.ov.string, this.ov.peers, this.ov.pick, this.ov.cursor);

    root.addEventListener("pointerdown", this.onDown);
    root.addEventListener("pointermove", this.onMove);
    root.addEventListener("pointerup", this.onUp);
    root.addEventListener("pointercancel", this.onCancel);
    root.addEventListener("pointerleave", this.onLeave);
    root.addEventListener("wheel", this.onWheel, { passive: false });
    root.addEventListener("contextmenu", this.onContext);
    root.addEventListener("gesturestart", this.onSafariGesture as EventListener);
    root.addEventListener("gesturechange", this.onSafariGesture as EventListener);
    root.addEventListener("dragover", this.onDragOver);
    root.addEventListener("drop", this.onDrop);
    host.ws.awareness.on("change", this.onAwareness);
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(root);
    this.onResize();
    this.onAwareness();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    if (this.eraseTimer) clearTimeout(this.eraseTimer);
    this.ro.disconnect();
    const r = this.root;
    r.removeEventListener("pointerdown", this.onDown);
    r.removeEventListener("pointermove", this.onMove);
    r.removeEventListener("pointerup", this.onUp);
    r.removeEventListener("pointercancel", this.onCancel);
    r.removeEventListener("pointerleave", this.onLeave);
    r.removeEventListener("wheel", this.onWheel);
    r.removeEventListener("contextmenu", this.onContext);
    r.removeEventListener("gesturestart", this.onSafariGesture as EventListener);
    r.removeEventListener("gesturechange", this.onSafariGesture as EventListener);
    r.removeEventListener("dragover", this.onDragOver);
    r.removeEventListener("drop", this.onDrop);
    this.host.ws.awareness.off("change", this.onAwareness);
    this.host.ws.setPresence({ paint: undefined, pointer: undefined });
    this.renderer.destroy();
  }

  // ---- view -----------------------------------------------------------------------------

  /** Canvas mode (the whiteboard owns the camera). */
  get embedded(): boolean {
    return !!this.host.camera;
  }

  private onResize() {
    const rect = this.root.getBoundingClientRect();
    const prev = this.size;
    this.size = { w: rect.width, h: rect.height };
    if (!rect.width || !rect.height) return;
    if (this.embedded) {
      this.renderer.settleNow();
      this.overlayDirty = true;
      this.schedule();
      return;
    }
    if (!this.fitted) {
      this.fitted = true;
      this.fit();
      return;
    }
    // Keep the document point at the viewport center fixed.
    if (prev.w && prev.h) {
      const c = this.toDoc(prev.w / 2, prev.h / 2);
      this.setViewKeeping({ ...this.view }, c, { x: rect.width / 2, y: rect.height / 2 });
    }
  }

  toDoc(sx: number, sy: number): Pt {
    const [x, y] = apply(invert(viewMatrix(this.view)), sx, sy);
    return { x, y };
  }

  toScreen(x: number, y: number): Pt {
    const [sx, sy] = apply(viewMatrix(this.view), x, y);
    return { x: sx, y: sy };
  }

  private setViewKeeping(v: ViewState, doc: Pt, screen: Pt) {
    const m = viewMatrix({ ...v, tx: 0, ty: 0 });
    const [px, py] = apply(m, doc.x, doc.y);
    this.setView({ ...v, tx: screen.x - px, ty: screen.y - py });
  }

  setView(v: ViewState, external = false) {
    if (this.embedded) {
      this.view = { tx: v.tx, ty: v.ty, scale: Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, v.scale)), rotation: 0, mirror: false };
    } else {
      this.view = { ...v, scale: clampScale(v.scale), rotation: ((((v.rotation + 180) % 360) + 360) % 360) - 180 };
    }
    this.renderer.setView(this.view);
    this.overlayDirty = true;
    this.schedule();
    this.host.onView(this.view);
    if (this.embedded && !external) this.host.camera!.request(this.view);
  }

  /** Canvas mode: the whiteboard's camera moved. */
  applyExternalView(v: ViewState) {
    const cur = this.view;
    if (cur.tx === v.tx && cur.ty === v.ty && cur.scale === v.scale) return;
    this.setView(v, true);
  }

  /** Where symmetry mirrors around: the paper's center, or (canvas) the view's. */
  symmetryCenter(): Pt {
    if (this.embedded) return this.toDoc(this.size.w / 2, this.size.h / 2);
    return { x: this.renderer.meta.width / 2, y: this.renderer.meta.height / 2 };
  }

  fit() {
    if (this.embedded) return;
    const { width: W, height: H } = this.renderer.meta;
    const { w, h } = this.size;
    if (!w || !h) return;
    const pad = w < 640 ? 16 : 40;
    const r = (this.view.rotation * Math.PI) / 180;
    const bw = Math.abs(W * Math.cos(r)) + Math.abs(H * Math.sin(r));
    const bh = Math.abs(W * Math.sin(r)) + Math.abs(H * Math.cos(r));
    const scale = clampScale(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh));
    this.setViewKeeping({ ...this.view, scale }, { x: W / 2, y: H / 2 }, { x: w / 2, y: h / 2 });
    this.renderer.settleNow();
  }

  private center(): Pt {
    return { x: this.size.w / 2, y: this.size.h / 2 };
  }

  /** Discrete zoom (keys, menu): re-rasterize right away unless `continuous`. */
  zoomTo(scale: number, at: Pt = this.center(), continuous = false) {
    const doc = this.toDoc(at.x, at.y);
    this.setViewKeeping({ ...this.view, scale: clampScale(scale) }, doc, at);
    if (!continuous) this.renderer.settleNow();
  }

  zoomBy(f: number, at?: Pt, continuous = false) {
    this.zoomTo(this.view.scale * f, at, continuous);
  }

  setRotation(deg: number, at: Pt = this.center()) {
    if (this.embedded) return;
    const doc = this.toDoc(at.x, at.y);
    this.setViewKeeping({ ...this.view, rotation: deg }, doc, at);
  }

  toggleMirror() {
    if (this.embedded) return;
    const c = this.center();
    const doc = this.toDoc(c.x, c.y);
    this.setViewKeeping({ ...this.view, mirror: !this.view.mirror, rotation: -this.view.rotation }, doc, c);
  }

  // ---- frame loop ---------------------------------------------------------------------

  private schedule() {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (this.liveDirty) {
        this.liveDirty = false;
        this.renderLive();
      }
      if (this.overlayDirty) {
        this.overlayDirty = false;
        this.renderOverlay();
      }
    });
  }

  /** Called by the host when tool / brush / symmetry state changes. */
  refresh() {
    this.overlayDirty = true;
    this.updateCursor();
    this.schedule();
    if (this.host.getState().tool === "eyedropper") this.ensurePickCache();
  }

  // ---- input ----------------------------------------------------------------------------

  private screenPt(e: { clientX: number; clientY: number }): Pt {
    const r = this.root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private touches(): [number, { x: number; y: number; type: string }][] {
    return [...this.pointers].filter(([id, p]) => p.type === "touch" && !this.ignored.has(id));
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "pen" && !this.penSeen) {
      this.penSeen = true;
      this.host.onPen();
    }
    const sp = this.screenPt(e);
    this.pointers.set(e.pointerId, { x: sp.x, y: sp.y, type: e.pointerType });
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events may not be capturable.
    }
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();

    if (e.pointerType === "touch") {
      // Palm rejection: while a pen or mouse is busy, touches are ignored.
      if (this.action && this.action.pointerType !== "touch") {
        this.ignored.add(e.pointerId);
        return;
      }
      const touches = this.touches();
      if (touches.length >= 2) {
        if (this.action?.kind === "gesture") {
          this.action.maxTouches = Math.max(this.action.maxTouches, touches.length);
          return;
        }
        this.abortForGesture();
        this.startGesture(touches[0], touches[1]);
        return;
      }
      if (this.penSeen) {
        this.action = { kind: "pan", pointerId: e.pointerId, pointerType: "touch", start: sp, view0: { ...this.view } };
        return;
      }
    } else if (this.action) {
      this.ignored.add(e.pointerId);
      return;
    }

    const navButton = (e.pointerType === "mouse" && e.button === 1) || (e.pointerType === "pen" && e.button === 2);
    if (navButton || this.keys.space) {
      this.startNav(e, sp);
      return;
    }
    if (e.pointerType === "mouse" && e.button === 2) {
      this.host.onPalette(sp.x, sp.y);
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const eraserEnd = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0);
    this.startTool(e, sp, eraserEnd);
  };

  private startNav(e: PointerEvent, sp: Pt) {
    const base = { pointerId: e.pointerId, pointerType: e.pointerType, start: sp, view0: { ...this.view } };
    if (this.keys.space && e.shiftKey) this.action = { kind: "rotate", ...base };
    else if (this.keys.space && (e.ctrlKey || e.metaKey)) this.action = { kind: "zoom", ...base };
    else this.action = { kind: "pan", ...base };
    this.updateCursor();
  }

  private startGesture(a: [number, { x: number; y: number }], b: [number, { x: number; y: number }]) {
    this.action = {
      kind: "gesture",
      ids: [a[0], b[0]],
      pointerType: "touch",
      p0: [
        { x: a[1].x, y: a[1].y },
        { x: b[1].x, y: b[1].y },
      ],
      view0: { ...this.view },
      startedAt: performance.now(),
      moved: 0,
      maxTouches: 2,
    };
  }

  /** A second finger landed: drop a just-started touch stroke, keep a long one. */
  private abortForGesture() {
    const a = this.action;
    if (!a) return;
    if (a.kind === "stroke") {
      if (performance.now() - a.live.startedAt > 400 && a.live.base.points.length > 12) this.commitStroke(a.live);
      else this.discardLive();
    }
    this.action = null;
    this.overlayDirty = true;
    this.schedule();
  }

  private layerIssue(): string | null {
    const st = this.host.getState();
    const L = st.activeLayerId ? this.renderer.layerData(st.activeLayerId) : undefined;
    if (!L) return "Select a layer first";
    if (!L.visible) return `“${L.name}” is hidden — show it to paint`;
    if (L.locked) return `“${L.name}” is locked`;
    return null;
  }

  private startTool(e: PointerEvent, sp: Pt, eraserEnd: boolean) {
    const st = this.host.getState();
    const tool: ToolId = eraserEnd ? "eraser" : st.tool;
    const p = this.toDoc(sp.x, sp.y);
    const base = { pointerId: e.pointerId, pointerType: e.pointerType };
    if (tool === "pan") {
      this.startNav(e, sp);
      return;
    }
    if (tool === "eyedropper") {
      const target = e.shiftKey ? "bg" : "fg";
      this.action = { kind: "pick", ...base, target, at: p };
      this.ensurePickCache();
      this.samplePick(p, target, false);
      return;
    }
    if (tool === "move") {
      this.startSelect(e, sp, p);
      return;
    }
    const issue = this.layerIssue();
    if (issue) {
      this.host.onNotice(issue);
      return;
    }
    const layer = this.renderer.layerData(st.activeLayerId!)!;
    const sc = this.symmetryCenter();
    this.liveCenter = sc;
    const copies = symmetryCopies(st.symmetry, sc.x, sc.y);
    if (tool === "brush" || tool === "eraser") {
      const erase = tool === "eraser";
      const preset = erase ? st.eraser : st.brush;
      const s = erase ? st.eraserSettings : st.brushSettings;
      const stroke: Stroke = clean({
        id: randomId(),
        layerId: layer.id,
        z: 0,
        kind: preset.kind === "erase" ? "erase" : "brush",
        brush: preset.id,
        color: st.fg,
        size: s.size,
        opacity: round2(erase ? s.opacity : s.opacity * st.fgAlpha),
        points: [],
        options: strokeOptions(preset, s),
        blend: preset.blend,
        author: st.userName,
        clip: !erase && layer.alphaLock ? true : undefined,
      });
      const lazy = new LazyString();
      lazy.reset(p.x, p.y);
      const live: LiveStroke = {
        base: stroke,
        copies,
        lazy,
        stabilizer: s.stabilizer,
        pointerType: e.pointerType,
        lastT: e.timeStamp,
        lastScreen: sp,
        sim: 0.62,
        predicted: [],
        pointer: p,
        tilt: s.tilt,
        startedAt: performance.now(),
      };
      stroke.points.push(round2(p.x), round2(p.y), round2(this.pressureOf(e, live, sp, true)));
      this.action = { kind: "stroke", ...base, live };
      this.liveDirty = true;
      this.schedule();
      return;
    }
    if (tool === "line" || tool === "rect" || tool === "ellipse") {
      const s = st.brushSettings;
      const fill = st.shapeFill === "fg" ? st.fg : st.shapeFill === "bg" ? st.bg : null;
      const closed = tool !== "line";
      const options = { ...strokeOptions(st.brush, s), shape: tool, closed, fill, outline: closed ? st.shapeOutline || !fill : true };
      if (closed) {
        options.taperStart = 0;
        options.taperEnd = 0;
      }
      options.streamline = 0;
      const stroke: Stroke = clean({
        id: randomId(),
        layerId: layer.id,
        z: 0,
        kind: "shape",
        brush: st.brush.id,
        color: st.fg,
        size: s.size,
        opacity: round2(s.opacity * st.fgAlpha),
        points: [],
        options,
        blend: st.brush.blend,
        author: st.userName,
        clip: layer.alphaLock ? true : undefined,
      });
      this.action = { kind: "shape", ...base, shape: tool, start: p, end: p, shift: e.shiftKey, alt: e.altKey, base: stroke, copies };
      return;
    }
    if (tool === "lasso") {
      const stroke: Stroke = clean({
        id: randomId(),
        layerId: layer.id,
        z: 0,
        kind: "fill",
        brush: "lasso",
        color: st.fg,
        size: 0,
        opacity: round2(st.brushSettings.opacity * st.fgAlpha),
        points: [],
        options: {},
        author: st.userName,
        clip: layer.alphaLock ? true : undefined,
      });
      this.action = { kind: "lasso", ...base, purpose: "fill", pts: [p.x, p.y], additive: false, base: stroke, copies };
    }
  }

  private pressureOf(e: PointerEvent, live: LiveStroke, sp: Pt, first: boolean): number {
    let p: number;
    const realTouch = e.pointerType === "touch" && e.pressure > 0 && e.pressure !== 0.5 && e.pressure !== 1;
    if (e.pointerType === "pen" || realTouch) {
      p = e.pressure > 0 ? e.pressure : first ? 0.3 : live.sim;
      live.sim = p;
    } else {
      // Mice and plain touch have no pressure: simulate it from speed.
      if (!first) {
        const dt = Math.max(1, e.timeStamp - live.lastT);
        const speed = Math.hypot(sp.x - live.lastScreen.x, sp.y - live.lastScreen.y) / dt;
        live.sim += (speedToPressure(speed) - live.sim) * 0.22;
      }
      p = live.sim;
    }
    live.lastT = e.timeStamp;
    live.lastScreen = sp;
    if (live.tilt && e.pointerType === "pen") {
      // Apple Pencil in Safari may report altitudeAngle (π/2 = upright) instead of tiltX/tiltY.
      const altitude = (e as PointerEvent & { altitudeAngle?: number }).altitudeAngle;
      const tiltDeg =
        e.tiltX || e.tiltY
          ? Math.hypot(e.tiltX || 0, e.tiltY || 0)
          : typeof altitude === "number" && altitude > 0
            ? 90 - (altitude * 180) / Math.PI
            : 0;
      const t = Math.min(1, tiltDeg / 70);
      p = Math.min(1, p * (1 + 0.9 * t));
    }
    return Math.min(1, Math.max(0, p));
  }

  private onMove = (e: PointerEvent) => {
    const sp = this.screenPt(e);
    const tracked = this.pointers.get(e.pointerId);
    if (tracked) {
      tracked.x = sp.x;
      tracked.y = sp.y;
    }
    if (e.pointerType !== "touch") {
      this.hover = { ...sp, type: e.pointerType };
      this.overlayDirty = true;
      this.schedule();
      this.sendPointer(sp);
      if (!this.action) this.updateHoverCursor(sp);
    }
    const a = this.action;
    if (!a || this.ignored.has(e.pointerId)) return;
    if (a.kind === "gesture") {
      if (a.ids.includes(e.pointerId)) this.updateGesture(a);
      return;
    }
    if (a.pointerId !== e.pointerId) return;
    switch (a.kind) {
      case "stroke": {
        const events = e.getCoalescedEvents?.() ?? [];
        for (const ce of events.length ? events : [e]) this.addSample(a.live, ce);
        const predicted = a.live.stabilizer > 0 ? [] : (e.getPredictedEvents?.() ?? []);
        a.live.predicted = [];
        const lastP = a.live.base.points[a.live.base.points.length - 1] ?? 0.5;
        for (const pe of predicted.slice(0, 3)) {
          const ps = this.screenPt(pe);
          const q = this.toDoc(ps.x, ps.y);
          a.live.predicted.push(round2(q.x), round2(q.y), lastP);
        }
        this.liveDirty = true;
        this.overlayDirty = true;
        this.schedule();
        this.sendLivePresence(a.live.base, a.live.base.points);
        break;
      }
      case "shape": {
        a.end = this.toDoc(sp.x, sp.y);
        a.shift = e.shiftKey;
        a.alt = e.altKey;
        this.liveDirty = true;
        this.schedule();
        break;
      }
      case "lasso": {
        const p = this.toDoc(sp.x, sp.y);
        const n = a.pts.length;
        if (Math.hypot(p.x - a.pts[n - 2], p.y - a.pts[n - 1]) * this.view.scale >= 2) {
          a.pts.push(round2(p.x), round2(p.y));
          this.liveDirty = true;
          this.overlayDirty = true;
          this.schedule();
        }
        break;
      }
      case "pick": {
        a.at = this.toDoc(sp.x, sp.y);
        this.samplePick(a.at, a.target, false);
        break;
      }
      case "transform": {
        a.shift = e.shiftKey;
        a.alt = e.altKey;
        a.m = this.transformMatrix(a, this.toDoc(sp.x, sp.y));
        this.renderer.previewTransform(a.ids, a.m);
        this.overlayDirty = true;
        this.schedule();
        break;
      }
      case "pan":
        this.setView({ ...a.view0, tx: a.view0.tx + sp.x - a.start.x, ty: a.view0.ty + sp.y - a.start.y });
        break;
      case "rotate": {
        const c = this.center();
        const a0 = Math.atan2(a.start.y - c.y, a.start.x - c.x);
        const a1 = Math.atan2(sp.y - c.y, sp.x - c.x);
        let deg = a.view0.rotation + ((a1 - a0) * 180) / Math.PI;
        if (e.ctrlKey || e.metaKey) deg = Math.round(deg / 15) * 15;
        const doc = this.docAt(a.view0, c);
        this.setViewKeeping({ ...a.view0, rotation: deg }, doc, c);
        break;
      }
      case "zoom": {
        const f = Math.exp((a.start.y - sp.y) / 150 + (sp.x - a.start.x) / 300);
        const doc = this.docAt(a.view0, a.start);
        this.setViewKeeping({ ...a.view0, scale: clampScale(a.view0.scale * f) }, doc, a.start);
        break;
      }
    }
  };

  private docAt(v: ViewState, sp: Pt): Pt {
    const [x, y] = apply(invert(viewMatrix(v)), sp.x, sp.y);
    return { x, y };
  }

  private addSample(live: LiveStroke, e: PointerEvent) {
    const sp = this.screenPt(e);
    const p = this.toDoc(sp.x, sp.y);
    const pressure = this.pressureOf(e, live, sp, false);
    live.pointer = p;
    const r = live.stabilizer / this.view.scale;
    if (!live.lazy.update(p.x, p.y, r)) {
      // Keep pressure responsive even while the string is slack.
      const pts = live.base.points;
      if (pts.length >= 3) pts[pts.length - 1] = round2(Math.max(pts[pts.length - 1], pressure * 0.5 + pts[pts.length - 1] * 0.5));
      return;
    }
    const pts = live.base.points;
    const n = pts.length;
    if (n >= 3 && Math.hypot(live.lazy.x - pts[n - 3], live.lazy.y - pts[n - 2]) * this.view.scale < 0.35) return;
    pts.push(round2(live.lazy.x), round2(live.lazy.y), round2(pressure));
  }

  private updateGesture(a: Extract<Action, { kind: "gesture" }>) {
    const pa = this.pointers.get(a.ids[0]);
    const pb = this.pointers.get(a.ids[1]);
    if (!pa || !pb) return;
    const [q0, q1] = a.p0;
    const m0 = { x: (q0.x + q1.x) / 2, y: (q0.y + q1.y) / 2 };
    const m1 = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const d0 = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
    const d1 = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const ang0 = Math.atan2(q1.y - q0.y, q1.x - q0.x);
    const ang1 = Math.atan2(pb.y - pa.y, pb.x - pa.x);
    let rot = a.view0.rotation + ((ang1 - ang0) * 180) / Math.PI;
    // Snap back to upright when close, like most painting apps.
    if (Math.abs(((rot % 360) + 540) % 360 - 180) < 4) rot = 0;
    a.moved = Math.max(a.moved, Math.hypot(m1.x - m0.x, m1.y - m0.y), Math.abs(d1 - d0));
    const doc = this.docAt(a.view0, m0);
    this.setViewKeeping({ ...a.view0, scale: clampScale((a.view0.scale * d1) / d0), rotation: rot }, doc, m1);
  }

  private onUp = (e: PointerEvent) => {
    this.finishPointer(e, false);
  };

  private onCancel = (e: PointerEvent) => {
    this.finishPointer(e, true);
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === "touch" || this.action) return;
    this.hover = null;
    this.overlayDirty = true;
    this.schedule();
    this.host.ws.setPresence({ pointer: undefined });
  };

  private finishPointer(e: PointerEvent, cancelled: boolean) {
    this.pointers.delete(e.pointerId);
    if (this.ignored.delete(e.pointerId)) return;
    const a = this.action;
    if (!a) return;
    if (a.kind === "gesture") {
      if (!a.ids.includes(e.pointerId)) return;
      const quick = performance.now() - a.startedAt < 280 && a.moved < 12;
      this.action = null;
      // Any remaining finger is ignored until it lifts.
      for (const [id, p] of this.pointers) if (p.type === "touch") this.ignored.add(id);
      if (quick && !cancelled) {
        if (a.maxTouches >= 3) this.host.redo();
        else this.host.undo();
      }
      return;
    }
    if (a.pointerId !== e.pointerId) return;
    this.action = null;
    switch (a.kind) {
      case "stroke": {
        if (cancelled && a.pointerType === "touch") this.discardLive();
        else {
          if (a.live.stabilizer > 0) {
            const { x, y } = a.live.pointer;
            const pts = a.live.base.points;
            pts.push(round2(x), round2(y), pts[pts.length - 1] ?? 0.5);
          }
          this.commitStroke(a.live);
        }
        break;
      }
      case "shape":
        if (!cancelled) this.commitShape(a);
        this.clearMyLive();
        break;
      case "lasso":
        if (a.purpose === "fill") {
          if (!cancelled) this.commitLassoFill(a);
          this.clearMyLive();
        } else if (!cancelled) this.finishLassoSelect(a);
        break;
      case "pick":
        if (!cancelled) this.samplePick(a.at, a.target, true);
        break;
      case "transform":
        this.commitTransform(a, cancelled);
        break;
      default:
        break;
    }
    this.overlayDirty = true;
    this.updateCursor();
    this.schedule();
  }

  get busy(): boolean {
    return this.action !== null;
  }

  /** Escape: abandon whatever is in progress. */
  cancelAction() {
    const a = this.action;
    if (!a) return false;
    if (a.kind === "stroke" || a.kind === "shape" || a.kind === "lasso") this.discardLive();
    if (a.kind === "transform") this.renderer.previewTransform(a.ids, null);
    this.action = null;
    this.overlayDirty = true;
    this.schedule();
    return true;
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const sp = this.screenPt(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.size.h : 1;
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinches arrive as small ctrl+wheel deltas; mouse wheels as large ones.
      this.zoomBy(Math.pow(Math.abs(dy) < 40 ? 1.012 : 1.0022, -dy), sp, true);
    } else if (e.altKey) {
      this.setRotation(this.view.rotation + dy * 0.1, sp);
    } else {
      this.setView({ ...this.view, tx: this.view.tx - (e.shiftKey ? dy : dx), ty: this.view.ty - (e.shiftKey ? 0 : dy) });
    }
  };

  private safariStart: { view: ViewState } | null = null;
  private onSafariGesture = (e: Event & { scale?: number; rotation?: number; clientX?: number; clientY?: number }) => {
    e.preventDefault();
    if (e.type === "gesturestart") {
      this.safariStart = { view: { ...this.view } };
      return;
    }
    if (!this.safariStart) return;
    const at = this.screenPt({ clientX: e.clientX ?? 0, clientY: e.clientY ?? 0 });
    const v0 = this.safariStart.view;
    const doc = this.docAt(v0, at);
    this.setViewKeeping({ ...v0, scale: clampScale(v0.scale * (e.scale ?? 1)), rotation: v0.rotation + (e.rotation ?? 0) }, doc, at);
  };

  private onContext = (e: Event) => e.preventDefault();

  private onDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  private onDrop = (e: DragEvent) => {
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith("image/"));
    if (!file) return;
    e.preventDefault();
    const sp = this.screenPt(e);
    void this.importImage(file, file.name.replace(/\.[^.]+$/, ""), this.toDoc(sp.x, sp.y));
  };

  // ---- committing strokes -------------------------------------------------------------

  private nextZ(layerId: string, count: number): number[] {
    const z0 = Math.floor(Math.max(Date.now(), this.renderer.maxZ(layerId) + 1));
    return Array.from({ length: count }, (_, i) => z0 + i);
  }

  /** Symmetric copies of a stroke (copy 0 is the stroke itself). */
  private expand(base: Stroke, copies: SymCopy[], points: number[]): Stroke[] {
    return copies.map((c, k) => {
      const opts = { ...base.options };
      if (opts.engine === "nib" && typeof opts.nibAngle === "number") opts.nibAngle = round2(mapNibAngle(c, opts.nibAngle));
      return { ...base, id: k ? `${base.id}${k}` : base.id, points: isIdentity(c.m) ? points : transformPoints(points, c.m), options: opts };
    });
  }

  private commitList(list: Stroke[]) {
    if (!list.length) return;
    const layerId = list[0].layerId;
    if (!this.renderer.layerData(layerId)) return;
    const zs = this.nextZ(layerId, list.length);
    const final = list.map((s, i) => ({ ...s, z: zs[i] }));
    this.host.undoStop();
    addStrokes(this.host.ws.doc, this.host.page, this.host.origin, final);
    this.host.undoStop();
    if (final[0].kind !== "erase") this.host.onColorUsed(final[0].color);
  }

  private commitStroke(live: LiveStroke) {
    const list = this.expand(live.base, live.copies, live.base.points.slice());
    this.commitList(list);
    this.clearMyLive(list.map((s) => s.id));
  }

  private shapePoints(a: Extract<Action, { kind: "shape" }>): number[] {
    let { x: x0, y: y0 } = a.start;
    let { x: x1, y: y1 } = a.end;
    if (a.shape === "line") {
      if (a.shift) [x1, y1] = snapAngle(x0, y0, x1, y1);
      if (a.alt) {
        x0 = 2 * x0 - x1;
        y0 = 2 * y0 - y1;
      }
      return linePoints(x0, y0, x1, y1);
    }
    if (a.shift) {
      const d = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + Math.sign(x1 - x0 || 1) * d;
      y1 = y0 + Math.sign(y1 - y0 || 1) * d;
    }
    if (a.alt) {
      x0 = 2 * x0 - x1;
      y0 = 2 * y0 - y1;
    }
    if (a.shape === "rect") return rectPoints(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1));
    return ellipsePoints((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2);
  }

  private commitShape(a: Extract<Action, { kind: "shape" }>) {
    const len = Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) * this.view.scale;
    if (len < 3) return;
    this.commitList(this.expand(a.base, a.copies, this.shapePoints(a)));
  }

  private lassoFillPoints(a: Extract<Action, { kind: "lasso" }>): number[] {
    const out: number[] = [];
    for (let i = 0; i + 1 < a.pts.length; i += 2) out.push(a.pts[i], a.pts[i + 1], 1);
    return out;
  }

  private commitLassoFill(a: Extract<Action, { kind: "lasso" }>) {
    if (!a.base || a.pts.length < 6) return;
    const b = emptyBox();
    for (let i = 0; i < a.pts.length; i += 2) growBox(b, a.pts[i], a.pts[i + 1]);
    if ((b.x1 - b.x0) * this.view.scale < 3 && (b.y1 - b.y0) * this.view.scale < 3) return;
    this.commitList(this.expand(a.base, a.copies, this.lassoFillPoints(a)));
  }

  private discardLive() {
    this.clearMyLive();
  }

  private clearMyLive(committedIds?: string[]) {
    this.renderer.clearLive("me:");
    this.liveDirty = false;
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.presenceTimer = null;
    this.pendingPresence = null;
    this.host.ws.setPresence({ paint: { pageId: this.host.pageId, stroke: null, committed: committedIds ?? [] } });
  }

  private renderLive() {
    const a = this.action;
    if (!a) return;
    let list: Stroke[] = [];
    if (a.kind === "stroke" && a.live.base.kind === "erase" && this.renderer.layerSize(a.live.base.layerId) > 200) {
      // Live erasing re-masks the whole layer, so on heavy layers refresh it less often.
      const now = performance.now();
      const wait = 70 - (now - this.lastEraseLive);
      if (wait > 0) {
        if (!this.eraseTimer)
          this.eraseTimer = setTimeout(() => {
            this.eraseTimer = null;
            this.liveDirty = true;
            this.schedule();
          }, wait);
        return;
      }
      this.lastEraseLive = now;
    }
    if (a.kind === "stroke") {
      const pts = a.live.predicted.length ? a.live.base.points.concat(a.live.predicted) : a.live.base.points;
      list = this.expand(a.live.base, a.live.copies, pts);
    } else if (a.kind === "shape") {
      const pts = this.shapePoints(a);
      list = this.expand(a.base, a.copies, pts);
      this.sendLivePresence(a.base, pts);
    } else if (a.kind === "lasso" && a.purpose === "fill" && a.base && a.pts.length >= 4) {
      const pts = this.lassoFillPoints(a);
      list = this.expand(a.base, a.copies, pts);
      this.sendLivePresence(a.base, pts);
    }
    list.forEach((s, k) => this.renderer.setLive(`me:${k}`, s, false));
  }

  // ---- presence -------------------------------------------------------------------------

  /** Share the in-progress stroke (throttled; longer strokes are sent less often). */
  private sendLivePresence(base: Stroke, points: number[]) {
    const now = performance.now();
    const n = points.length / 3;
    const interval = n > 600 ? 140 : n > 250 ? 90 : 50;
    this.pendingPresence = { base, points };
    const send = () => {
      this.presenceTimer = null;
      this.lastPresence = performance.now();
      const pending = this.pendingPresence;
      if (!pending || !this.action) return;
      this.host.ws.setPresence({
        paint: {
          pageId: this.host.pageId,
          stroke: { ...pending.base, points: decimate(pending.points, 1.2 / this.view.scale) },
          symmetry: this.host.getState().symmetry,
          center: this.liveCenter,
        },
      });
    };
    if (now - this.lastPresence >= interval) send();
    else if (!this.presenceTimer) this.presenceTimer = setTimeout(send, interval - (now - this.lastPresence));
  }

  private sendPointer(sp: Pt) {
    const now = performance.now();
    if (now - this.lastPointerPresence < 45) return;
    this.lastPointerPresence = now;
    const p = this.toDoc(sp.x, sp.y);
    this.host.ws.setPresence({
      pointer: { pageId: this.host.pageId, x: round2(p.x), y: round2(p.y), tool: this.host.getState().tool },
    });
  }

  private onAwareness = () => {
    const now = performance.now();
    const cursors: typeof this.peerCursors = [];
    const seen = new Set<number>();
    this.host.ws.awareness.getStates().forEach((raw, clientId) => {
      if (clientId === this.host.ws.doc.clientID) return;
      const state = raw as PresenceState | undefined;
      if (!state?.user) return;
      const ptr = state.pointer;
      if (ptr && ptr.pageId === this.host.pageId && Number.isFinite(ptr.x) && Number.isFinite(ptr.y)) {
        cursors.push({ id: clientId, name: state.user.name, color: state.user.color, x: ptr.x, y: ptr.y, tool: ptr.tool });
      }
      const paint = state.paint as
        | { pageId?: string; stroke?: Stroke | null; symmetry?: Symmetry; center?: Pt; committed?: string[] }
        | undefined;
      if (paint?.pageId === this.host.pageId && paint.stroke && Array.isArray(paint.stroke.points)) {
        seen.add(clientId);
        const c =
          paint.center && Number.isFinite(paint.center.x) && Number.isFinite(paint.center.y)
            ? paint.center
            : { x: this.renderer.meta.width / 2, y: this.renderer.meta.height / 2 };
        const copies = symmetryCopies(paint.symmetry ?? { mode: "none", count: 2 }, c.x, c.y);
        const list = this.expand(paint.stroke, copies, paint.stroke.points);
        const prev = this.peerLive.get(clientId);
        const keys = list.map((_, k) => `peer${clientId}:${k}`);
        if (prev) for (const k of prev.keys.slice(keys.length)) this.renderer.setLive(k, null);
        list.forEach((s, k) => this.renderer.setLive(keys[k], s, false));
        this.peerLive.set(clientId, { keys, ids: list.map((s) => s.id), until: Infinity });
      } else {
        const prev = this.peerLive.get(clientId);
        if (prev && prev.until === Infinity) {
          // Keep the live preview until the committed strokes arrive, so it never blinks.
          const ids = paint?.committed?.length ? paint.committed : prev.ids;
          this.peerLive.set(clientId, { ...prev, ids, until: now + 1500 });
          this.sweepPeerLive();
        }
      }
    });
    for (const [id, v] of this.peerLive) {
      if (!seen.has(id) && !this.host.ws.awareness.getStates().has(id)) {
        v.keys.forEach((k) => this.renderer.setLive(k, null));
        this.peerLive.delete(id);
      }
    }
    this.peerCursors = cursors;
    this.overlayDirty = true;
    this.schedule();
  };

  /** Drop finished peer previews once their strokes are committed (or timed out). */
  private sweepPeerLive = () => {
    const now = performance.now();
    let pending = false;
    for (const [id, v] of this.peerLive) {
      if (v.until === Infinity) continue;
      const arrived = v.ids.length > 0 && v.ids.every((sid) => this.renderer.getStroke(sid));
      if (arrived || now > v.until) {
        v.keys.forEach((k) => this.renderer.setLive(k, null));
        this.peerLive.delete(id);
      } else pending = true;
    }
    if (pending && !this.destroyed) setTimeout(this.sweepPeerLive, 60);
  };

  // ---- eyedropper ---------------------------------------------------------------------

  ensurePickCache() {
    // Canvas mode picks the color of the stroke under the pointer instead.
    if (this.embedded) return;
    if (this.pickLoading || (this.pick && this.pick.version === this.renderer.version)) return;
    this.pickLoading = true;
    const version = this.renderer.version;
    const { width, height } = this.renderer.meta;
    rasterizeSvg(this.renderer.exportSvg(), width, height, 1)
      .then((canvas) => {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) this.pick = { version, ctx };
      })
      .catch(() => {})
      .finally(() => {
        this.pickLoading = false;
        if (this.destroyed) return;
        const a = this.action;
        if (a?.kind === "pick") this.samplePick(a.at, a.target, false);
        this.overlayDirty = true;
        this.schedule();
      });
  }

  private sampleAt(p: Pt, fallback = true): { hex: string; alpha: number } | null {
    const { width, height, background } = this.renderer.meta;
    if (!this.embedded && (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height)) return null;
    if (this.pick && !this.embedded) {
      const d = this.pick.ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
      if (d[3] === 0) return null;
      const hex = `#${[d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
      return { hex, alpha: 1 };
    }
    if (!fallback) return null;
    // Raster not ready yet: fall back to the topmost stroke's color.
    for (const id of this.renderer.visibleLayersTopDown()) {
      const hit = this.renderer.hitTest(id, p.x, p.y, 0);
      if (hit) {
        const s = this.renderer.getStroke(hit);
        if (s && s.kind !== "image") return { hex: s.color, alpha: 1 };
      }
    }
    if (this.embedded) return null;
    return background && background !== "transparent" ? { hex: background, alpha: 1 } : null;
  }

  private samplePick(p: Pt, target: "fg" | "bg", final: boolean) {
    const c = this.sampleAt(p);
    this.pickColor = c?.hex ?? null;
    if (c) this.host.onPick(c.hex, c.alpha, target, final);
    this.overlayDirty = true;
    this.schedule();
  }

  // ---- selection & transform ----------------------------------------------------------

  private pruneSelection() {
    const st = this.host.getState();
    let changed = false;
    for (const id of this.selection) {
      const s = this.renderer.getStroke(id);
      if (!s || s.layerId !== st.activeLayerId) {
        this.selection.delete(id);
        changed = true;
      }
    }
    if (changed) this.host.onSelection(this.selection.size);
  }

  setSelection(ids: Iterable<string>) {
    this.selection = new Set(ids);
    this.selBoxCache = null;
    this.overlayDirty = true;
    this.schedule();
    this.host.onSelection(this.selection.size);
  }

  /** Called when the active layer changes: selection is per layer. */
  onLayerChanged() {
    this.pruneSelection();
    this.overlayDirty = true;
    this.schedule();
  }

  selectionBox(): Box | null {
    if (!this.selection.size) return null;
    if (this.selBoxCache) return this.selBoxCache;
    let b = emptyBox();
    for (const id of this.selection) {
      const wb = this.renderer.worldBox(id);
      if (wb) b = unionBox(b, wb);
    }
    this.selBoxCache = isEmptyBox(b) ? null : b;
    return this.selBoxCache;
  }

  private handlePoints(box: Box): { h: Handle; x: number; y: number }[] {
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    return [
      { h: "nw", x: box.x0, y: box.y0 },
      { h: "n", x: cx, y: box.y0 },
      { h: "ne", x: box.x1, y: box.y0 },
      { h: "e", x: box.x1, y: cy },
      { h: "se", x: box.x1, y: box.y1 },
      { h: "s", x: cx, y: box.y1 },
      { h: "sw", x: box.x0, y: box.y1 },
      { h: "w", x: box.x0, y: cy },
    ];
  }

  private rotHandle(box: Box): { base: Pt; knob: Pt } {
    const cx = (box.x0 + box.x1) / 2;
    const top = this.toScreen(cx, box.y0);
    const c = this.toScreen(cx, (box.y0 + box.y1) / 2);
    const dx = top.x - c.x;
    const dy = top.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    return { base: top, knob: { x: top.x + (dx / len) * 26, y: top.y + (dy / len) * 26 } };
  }

  private handleAt(sp: Pt): Handle | null {
    const box = this.selectionBox();
    if (!box) return null;
    const { knob } = this.rotHandle(box);
    const tol = HANDLE_R + 5;
    if (Math.hypot(sp.x - knob.x, sp.y - knob.y) <= tol) return "rot";
    for (const hp of this.handlePoints(box)) {
      const s = this.toScreen(hp.x, hp.y);
      if (Math.hypot(sp.x - s.x, sp.y - s.y) <= tol) return hp.h;
    }
    const p = this.toDoc(sp.x, sp.y);
    if (boxContains(box, p.x, p.y, 2 / this.view.scale)) return "move";
    return null;
  }

  private startSelect(e: PointerEvent, sp: Pt, p: Pt) {
    const st = this.host.getState();
    const layerId = st.activeLayerId;
    const L = layerId ? this.renderer.layerData(layerId) : undefined;
    const base = { pointerId: e.pointerId, pointerType: e.pointerType };
    if (!L || !layerId) {
      this.host.onNotice("Select a layer first");
      return;
    }
    if (!L.visible) {
      this.host.onNotice(`“${L.name}” is hidden — show it to select`);
      return;
    }
    const handle = this.handleAt(sp);
    const hit = handle && handle !== "move" ? null : this.renderer.hitTest(layerId, p.x, p.y, 5 / this.view.scale);
    let grab: Handle | null = handle;
    if (hit && !this.selection.has(hit)) {
      if (e.shiftKey) this.setSelection([...this.selection, hit]);
      else this.setSelection([hit]);
      grab = "move";
    } else if (hit && e.shiftKey) {
      const next = new Set(this.selection);
      next.delete(hit);
      this.setSelection(next);
      return;
    } else if (hit) grab = "move";
    if (grab && this.selection.size) {
      if (L.locked) {
        this.host.onNotice(`“${L.name}” is locked`);
        return;
      }
      const box = this.selectionBox()!;
      this.action = {
        kind: "transform",
        ...base,
        handle: grab,
        start: p,
        box,
        m: IDENTITY,
        ids: [...this.selection],
        shift: e.shiftKey,
        alt: e.altKey,
      };
      return;
    }
    this.action = { kind: "lasso", ...base, purpose: "select", pts: [p.x, p.y], additive: e.shiftKey, copies: [] };
  }

  private transformMatrix(a: Extract<Action, { kind: "transform" }>, p: Pt): Mat {
    const b = a.box;
    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    if (a.handle === "move") {
      let dx = p.x - a.start.x;
      let dy = p.y - a.start.y;
      if (a.shift) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      return translate(dx, dy);
    }
    if (a.handle === "rot") {
      let t = Math.atan2(p.y - cy, p.x - cx) - Math.atan2(a.start.y - cy, a.start.x - cx);
      if (a.shift) t = Math.round(t / (Math.PI / 12)) * (Math.PI / 12);
      return rotateAt(t, cx, cy);
    }
    const h = a.handle;
    const hx = h.includes("w") ? b.x0 : h.includes("e") ? b.x1 : cx;
    const hy = h.includes("n") ? b.y0 : h.includes("s") ? b.y1 : cy;
    const ax = a.alt ? cx : h.includes("w") ? b.x1 : h.includes("e") ? b.x0 : cx;
    const ay = a.alt ? cy : h.includes("n") ? b.y1 : h.includes("s") ? b.y0 : cy;
    const moveX = h.includes("w") || h.includes("e");
    const moveY = h.includes("n") || h.includes("s");
    let sx = moveX && Math.abs(hx - ax) > 1e-6 ? (p.x - ax) / (hx - ax) : 1;
    let sy = moveY && Math.abs(hy - ay) > 1e-6 ? (p.y - ay) / (hy - ay) : 1;
    // Corners scale proportionally unless Shift frees the aspect ratio.
    if (moveX && moveY && !a.shift) {
      const s = Math.abs(sx) > Math.abs(sy) ? sx : sy;
      sx = s;
      sy = s;
    }
    const guard = (v: number) => (Math.abs(v) < 0.01 ? (v < 0 ? -0.01 : 0.01) : v);
    return scaleAt(guard(sx), guard(sy), ax, ay);
  }

  private commitTransform(a: Extract<Action, { kind: "transform" }>, cancelled: boolean) {
    if (cancelled || isIdentity(a.m) || a.m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-6)) {
      this.renderer.previewTransform(a.ids, null);
      return;
    }
    this.applyMatrix(a.ids, a.m);
  }

  private applyMatrix(ids: string[], m: Mat) {
    if (!this.selectionEditable()) return;
    const updates: Stroke[] = [];
    for (const id of ids) {
      const s = this.renderer.getStroke(id);
      if (s) updates.push({ ...s, transform: roundMat(mul(m, toMat(s.transform))) });
    }
    this.host.undoStop();
    addStrokes(this.host.ws.doc, this.host.page, this.host.origin, updates);
    this.host.undoStop();
    this.selBoxCache = null;
  }

  private finishLassoSelect(a: Extract<Action, { kind: "lasso" }>) {
    const st = this.host.getState();
    const layerId = st.activeLayerId;
    if (!layerId) return;
    const poly = a.pts;
    const b = emptyBox();
    for (let i = 0; i < poly.length; i += 2) growBox(b, poly[i], poly[i + 1]);
    if (poly.length < 6 || ((b.x1 - b.x0) * this.view.scale < 4 && (b.y1 - b.y0) * this.view.scale < 4)) {
      if (!a.additive) this.setSelection([]);
      return;
    }
    const picked = new Set(a.additive ? this.selection : []);
    for (const s of this.renderer.layerStrokes(layerId)) {
      const wb = this.renderer.worldBox(s.id);
      if (!wb) continue;
      const m = toMat(s.transform);
      const cx = (wb.x0 + wb.x1) / 2;
      const cy = (wb.y0 + wb.y1) / 2;
      let inside = 0;
      let total = 0;
      if (s.kind === "image") {
        const lb = this.renderer.localBox(s.id)!;
        for (const [x, y] of [
          [lb.x0, lb.y0],
          [lb.x1, lb.y0],
          [lb.x1, lb.y1],
          [lb.x0, lb.y1],
        ]) {
          const [tx, ty] = apply(m, x, y);
          total++;
          if (pointInPolygon(tx, ty, poly)) inside++;
        }
      } else {
        const pts = s.points;
        const step = Math.max(1, Math.floor(pts.length / 3 / 60)) * 3;
        for (let i = 0; i + 1 < pts.length; i += step) {
          const [tx, ty] = apply(m, pts[i], pts[i + 1]);
          total++;
          if (pointInPolygon(tx, ty, poly)) inside++;
        }
      }
      if ((total && inside / total >= 0.5) || (s.kind !== "erase" && pointInPolygon(cx, cy, poly) && inside > 0)) picked.add(s.id);
    }
    this.setSelection(picked);
  }

  selectAll() {
    const id = this.host.getState().activeLayerId;
    if (!id) return;
    this.setSelection(this.renderer.layerStrokes(id).map((s) => s.id));
  }

  /** Selections live on the active layer; editing them needs it unlocked and visible. */
  private selectionEditable(): boolean {
    const issue = this.layerIssue();
    if (issue) this.host.onNotice(issue);
    return !issue;
  }

  deleteSelection() {
    if (!this.selection.size || !this.selectionEditable()) return;
    this.host.undoStop();
    deleteStrokes(this.host.ws.doc, this.host.page, this.host.origin, this.selection);
    this.setSelection([]);
  }

  duplicateSelection(offset = 16) {
    const list = this.selectedStrokes();
    if (!list.length) return;
    this.pasteStrokes(list, offset);
  }

  private selectedStrokes(): Stroke[] {
    const id = this.host.getState().activeLayerId;
    return id ? this.renderer.layerStrokes(id).filter((s) => this.selection.has(s.id)) : [];
  }

  private pasteStrokes(list: Stroke[], offset: number) {
    const layerId = this.host.getState().activeLayerId;
    const issue = this.layerIssue();
    if (!layerId || issue) {
      if (issue) this.host.onNotice(issue);
      return;
    }
    const zs = this.nextZ(layerId, list.length);
    const m = translate(offset, offset);
    const copies = list.map((s, i) => ({ ...s, id: randomId(), layerId, z: zs[i], floor: undefined, transform: roundMat(mul(m, toMat(s.transform))) }));
    this.host.undoStop();
    addStrokes(this.host.ws.doc, this.host.page, this.host.origin, copies.map((c) => clean(c)));
    this.host.undoStop();
    this.setSelection(copies.map((c) => c.id));
  }

  copySelection(cut = false) {
    const list = this.selectedStrokes();
    if (!list.length) return false;
    this.clipboard = list.map((s) => ({ ...s }));
    if (cut) this.deleteSelection();
    return true;
  }

  pasteClipboard(): boolean {
    if (!this.clipboard.length) return false;
    this.pasteStrokes(this.clipboard, 16);
    this.clipboard = this.clipboard.map((s) => ({ ...s, transform: roundMat(mul(translate(16, 16), toMat(s.transform))) }));
    return true;
  }

  flipSelection(axis: "x" | "y") {
    const box = this.selectionBox();
    if (!box) return;
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    this.applyMatrix([...this.selection], axis === "x" ? scaleAt(-1, 1, cx, cy) : scaleAt(1, -1, cx, cy));
  }

  rotateSelection(deg: number) {
    const box = this.selectionBox();
    if (!box) return;
    this.applyMatrix([...this.selection], rotateAt((deg * Math.PI) / 180, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2));
  }

  nudgeSelection(dx: number, dy: number) {
    if (!this.selection.size) return;
    this.applyMatrix([...this.selection], translate(dx, dy));
  }

  // ---- images -----------------------------------------------------------------------------

  async importImage(file: Blob, name = "Reference", at?: Pt) {
    let img: { src: string; width: number; height: number };
    try {
      img = await prepareImage(file);
    } catch (err) {
      this.host.onNotice(err instanceof Error ? err.message : "Could not import image");
      return;
    }
    const W = this.embedded ? this.size.w / this.view.scale : this.renderer.meta.width;
    const H = this.embedded ? this.size.h / this.view.scale : this.renderer.meta.height;
    const k = Math.min(1, (W * 0.8) / img.width, (H * 0.8) / img.height);
    const w = round2(img.width * k);
    const h = round2(img.height * k);
    const c = at ?? this.toDoc(this.size.w / 2, this.size.h / 2);
    const st = this.host.getState();
    const doc = this.host.ws.doc;
    const layers = this.host.page.get("layers") as Y.Array<Y.Map<any>>;
    let index = layers.length;
    layers.forEach((m, i) => {
      if (m.get("id") === st.activeLayerId) index = i + 1;
    });
    const id = randomId();
    let layerId = "";
    this.host.undoStop();
    doc.transact(() => {
      layerId = addLayer(doc, this.host.page, this.host.origin, index, name.slice(0, 40) || "Reference");
      strokesOf(this.host.page).set(
        id,
        clean<Stroke>({
          id,
          layerId,
          z: Date.now(),
          kind: "image",
          brush: "image",
          color: "#000000",
          size: 0,
          opacity: 1,
          points: [],
          options: {},
          author: st.userName,
          src: img.src,
          x: round2(Math.min(Math.max(c.x - w / 2, -w / 2), W - w / 2)),
          y: round2(Math.min(Math.max(c.y - h / 2, -h / 2), H - h / 2)),
          w,
          h,
        }),
      );
    }, this.host.origin);
    this.host.undoStop();
    this.host.onActiveLayer(layerId);
    this.host.onTool("move");
    // Selection is pruned against the active layer, so select after it switched.
    setTimeout(() => this.setSelection([id]), 0);
  }

  // ---- cursor & overlay -----------------------------------------------------------------

  private updateHoverCursor(sp: Pt) {
    const st = this.host.getState();
    if (st.tool === "move" && !this.keys.space) {
      const h = this.handleAt(sp);
      const cursors: Record<Handle, string> = {
        nw: "nwse-resize",
        se: "nwse-resize",
        ne: "nesw-resize",
        sw: "nesw-resize",
        n: "ns-resize",
        s: "ns-resize",
        e: "ew-resize",
        w: "ew-resize",
        rot: "grab",
        move: "move",
      };
      this.root.style.cursor = h ? cursors[h] : "default";
      return;
    }
    this.updateCursor();
  }

  updateCursor() {
    const st = this.host.getState();
    const a = this.action;
    let c = "crosshair";
    if (a && (a.kind === "pan" || a.kind === "gesture")) c = "grabbing";
    else if (a?.kind === "rotate") c = "grabbing";
    else if (a?.kind === "zoom") c = "zoom-in";
    else if (this.keys.space || st.tool === "pan") c = "grab";
    else if (st.tool === "brush" || st.tool === "eraser") c = "none";
    else if (st.tool === "move") c = "default";
    else if (st.tool === "eyedropper") c = "none";
    this.root.style.cursor = c;
  }

  private renderOverlay() {
    const st = this.host.getState();
    const M = viewMatrix(this.view);
    const S = (x: number, y: number) => apply(M, x, y);
    const { width: W, height: H } = this.renderer.meta;
    const a = this.action;
    const tool = st.tool;

    // Symmetry guides (across the paper, or in canvas mode across the view).
    const guides: SVGElement[] = [];
    if (st.symmetry.mode !== "none" && isPaintTool(tool)) {
      const c = a?.kind === "stroke" || a?.kind === "shape" || a?.kind === "lasso" ? this.liveCenter : this.symmetryCenter();
      const cx = c.x;
      const cy = c.y;
      const area = this.embedded
        ? { ...this.toDoc(0, 0), x1: this.toDoc(this.size.w, this.size.h).x, y1: this.toDoc(this.size.w, this.size.h).y }
        : { x: 0, y: 0, x1: W, y1: H };
      const segs: [number, number, number, number][] = [];
      const mode = st.symmetry.mode;
      if (mode === "x" || mode === "xy") segs.push([cx, area.y, cx, area.y1]);
      if (mode === "y" || mode === "xy") segs.push([area.x, cy, area.x1, cy]);
      if (mode === "radial" || mode === "snowflake") {
        const n = Math.max(2, st.symmetry.count);
        const R = Math.hypot(area.x1 - area.x, area.y1 - area.y);
        const count = mode === "snowflake" ? n * 2 : n;
        for (let k = 0; k < count; k++) {
          const t = -Math.PI / 2 + (k * Math.PI * 2) / count;
          segs.push([cx, cy, cx + Math.cos(t) * R, cy + Math.sin(t) * R]);
        }
      }
      for (const [x0, y0, x1, y1] of segs) {
        const [a0, b0] = S(x0, y0);
        const [a1, b1] = S(x1, y1);
        guides.push(svgEl("line", { x1: a0, y1: b0, x2: a1, y2: b1 }));
      }
      const [ccx, ccy] = S(cx, cy);
      guides.push(svgEl("circle", { cx: ccx, cy: ccy, r: 4 }));
    }
    this.ov.guides.replaceChildren(...guides);

    // Lasso outline (fill or select).
    const lasso: SVGElement[] = [];
    if (a?.kind === "lasso" && a.pts.length >= 4) {
      let d = "";
      for (let i = 0; i + 1 < a.pts.length; i += 2) {
        const [x, y] = S(a.pts[i], a.pts[i + 1]);
        d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      lasso.push(svgEl("path", { d: d + "Z", class: "pv-ants-bg" }), svgEl("path", { d: d + "Z", class: "pv-ants" }));
    }
    this.ov.lasso.replaceChildren(...lasso);

    // Selection box + handles.
    const sel: SVGElement[] = [];
    const box = this.selectionBox();
    if (box && (tool === "move" || a?.kind === "transform")) {
      const extra = a?.kind === "transform" ? a.m : IDENTITY;
      for (const id of this.selection) {
        const wb = this.renderer.worldBox(id);
        if (!wb || this.selection.size > 40) break;
        const corners = [
          [wb.x0, wb.y0],
          [wb.x1, wb.y0],
          [wb.x1, wb.y1],
          [wb.x0, wb.y1],
        ].map(([x, y]) => S(...apply(extra, x, y)));
        sel.push(svgEl("polygon", { points: corners.map((c) => c.join(",")).join(" "), class: "pv-sel-item" }));
      }
      const corners = [
        [box.x0, box.y0],
        [box.x1, box.y0],
        [box.x1, box.y1],
        [box.x0, box.y1],
      ].map(([x, y]) => S(...apply(extra, x, y)));
      sel.push(svgEl("polygon", { points: corners.map((c) => c.join(",")).join(" "), class: "pv-sel-box" }));
      const tb = transformBox(box, extra);
      if (!(a?.kind === "transform" && a.handle !== "move")) {
        const ext = a?.kind === "transform" ? tb : box;
        const rh = this.rotHandle(ext);
        sel.push(svgEl("line", { x1: rh.base.x, y1: rh.base.y, x2: rh.knob.x, y2: rh.knob.y, class: "pv-sel-stem" }));
        sel.push(svgEl("circle", { cx: rh.knob.x, cy: rh.knob.y, r: HANDLE_R - 1, class: "pv-handle pv-handle-rot" }));
        for (const hp of this.handlePoints(ext)) {
          const [x, y] = S(hp.x, hp.y);
          sel.push(svgEl("rect", { x: x - 5, y: y - 5, width: 10, height: 10, rx: 2, class: "pv-handle" }));
        }
      }
    }
    this.ov.sel.replaceChildren(...sel);

    // Stabilizer string.
    const str: SVGElement[] = [];
    if (a?.kind === "stroke" && a.live.stabilizer > 0) {
      const [bx, by] = S(a.live.lazy.x, a.live.lazy.y);
      const [px, py] = S(a.live.pointer.x, a.live.pointer.y);
      str.push(svgEl("line", { x1: bx, y1: by, x2: px, y2: py }), svgEl("circle", { cx: px, cy: py, r: 3 }));
    }
    this.ov.string.replaceChildren(...str);

    // Brush outline cursor.
    const cur: SVGElement[] = [];
    const h = this.hover;
    const showBrush = (tool === "brush" || tool === "eraser") && !this.keys.space && (!a || a.kind === "stroke");
    if (h && h.type !== "touch" && showBrush) {
      const settings = tool === "eraser" ? st.eraserSettings : st.brushSettings;
      const r = Math.max(1.5, (settings.size / 2) * this.view.scale);
      cur.push(svgEl("circle", { cx: h.x, cy: h.y, r, class: "pv-cursor-outer" }), svgEl("circle", { cx: h.x, cy: h.y, r, class: tool === "eraser" ? "pv-cursor-inner pv-cursor-erase" : "pv-cursor-inner" }));
      if (r > 6) cur.push(svgEl("circle", { cx: h.x, cy: h.y, r: 1.2, class: "pv-cursor-dot" }));
    }
    this.ov.cursor.replaceChildren(...cur);

    // Eyedropper ring: sampled color on top, current color below.
    const pick: SVGElement[] = [];
    const pickAt = a?.kind === "pick" ? this.toScreen(a.at.x, a.at.y) : tool === "eyedropper" && h && h.type !== "touch" ? h : null;
    if (pickAt) {
      if (!a && h) {
        const c = this.sampleAt(this.toDoc(h.x, h.y), false);
        this.pickColor = c?.hex ?? null;
      }
      const R = 30;
      const r = 20;
      const arc = (top: boolean) =>
        `M${pickAt.x - R} ${pickAt.y}A${R} ${R} 0 0 ${top ? 1 : 0} ${pickAt.x + R} ${pickAt.y}L${pickAt.x + r} ${pickAt.y}A${r} ${r} 0 0 ${top ? 0 : 1} ${pickAt.x - r} ${pickAt.y}Z`;
      pick.push(
        svgEl("path", { d: arc(true), fill: this.pickColor ?? "transparent", class: "pv-pick-arc" }),
        svgEl("path", { d: arc(false), fill: st.fg, class: "pv-pick-arc" }),
        svgEl("circle", { cx: pickAt.x, cy: pickAt.y, r: 2, class: "pv-cursor-dot" }),
      );
    }
    this.ov.pick.replaceChildren(...pick);

    // Peer cursors (in canvas mode the whiteboard shows them).
    const peers: SVGElement[] = [];
    for (const p of this.embedded ? [] : this.peerCursors) {
      const [x, y] = S(p.x, p.y);
      if (x < -40 || y < -40 || x > this.size.w + 40 || y > this.size.h + 40) continue;
      const g = svgEl("g", { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`, class: "pv-peer" });
      g.append(
        svgEl("path", { d: "M0 0L0 15L4.2 11.2L7 17.5L9.6 16.4L6.9 10.3L12.4 10.3Z", fill: p.color, class: "pv-peer-arrow" }),
      );
      const label = svgEl("g", { transform: "translate(12 18)" });
      const text = svgEl("text", { x: 7, y: 13 });
      text.textContent = p.name;
      const width = Math.min(160, p.name.length * 6.6 + 14);
      label.append(svgEl("rect", { width, height: 19, rx: 9.5, fill: p.color }), text);
      g.append(label);
      peers.push(g);
    }
    this.ov.peers.replaceChildren(...peers);
  }
}

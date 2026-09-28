// Liquid Glass refraction: real lensing, not just blur.
//
// Each floating glass surface gets its own SVG filter, used as its
// backdrop-filter. The filter frosts the backdrop, then bends it with a
// displacement map computed for the surface's exact size and corner radius:
// a convex bezel along the edges pulls the content behind it inward (like the
// rim of a glass lens), with slight chromatic aberration and a specular rim
// lit from the top-left. The interior stays undistorted.
//
// SVG filters in backdrop-filter only render in Chromium (Chrome, Edge,
// Android, Electron). Other browsers keep the plain frosted blur from
// glass.css — `lensSupported()` decides.

interface LensOptions {
  /** 0–100: how strongly the bezel bends what's behind it. */
  refraction: number;
  /** 0–100: frosting blur. */
  frost: number;
  dark: boolean;
}

interface Target {
  selector: string;
  /** Only while this media query matches (e.g. phone-only floating bars). */
  media?: string;
  /** Relative frosting: bars stay clear so the lens shows; menus stay readable. */
  frost: number;
}

// Floating chrome that sits over content or the wallpaper.
const TARGETS: Target[] = [
  { selector: ".sidebar", frost: 1 },
  { selector: ".tabbar, .toast", frost: 0.45 },
  { selector: ".topbar", media: "(max-width: 800px)", frost: 0.45 },
  { selector: ".menu, .modal, .sheet, .welcome-card, .as-panel", frost: 1 },
  { selector: ".cp-bubble", frost: 0.6 },
  { selector: ".pv-selbar, .pv-showui, .pv-topbar, .pv-embedded .pv-toolbar", frost: 0.45 },
  { selector: ".pv-pop, .pv-sheet, .pv-embedded .pv-docker", frost: 1 },
  { selector: ".gv-zoom, .sk-controls, .sk-legend, .co-gen-bar", frost: 0.45 },
  { selector: ".gv-panel, .sk-panel", frost: 1 },
  { selector: ".bn-toolbar", frost: 0.6 },
  { selector: ".bn-suggestion-menu, .bn-grid-suggestion-menu, .bn-menu-dropdown, .bn-panel-popover, .bn-form-popover", frost: 1 },
  { selector: ".excalidraw .Island", frost: 0.45 },
];
const ALL = TARGETS.map((t) => t.selector).join(", ");

const MAX_FILTERS = 64;
const SVG_NS = "http://www.w3.org/2000/svg";

/** Chromium is the only engine that renders SVG filters in backdrop-filter. */
export function lensSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  return Boolean(brands?.some((b) => b.brand === "Chromium"));
}

// ---- displacement map ---------------------------------------------------------------

/**
 * RGBA map for a rounded rectangle: R/G = displacement (128 = none), B = rim
 * highlight, A = 255. `depth` is the largest displacement in px.
 */
function buildMap(w: number, h: number, radius: number, bezel: number): { url: string } {
  // Maps are smooth, so half resolution is plenty for large surfaces.
  const k = Math.max(w, h) > 320 ? 0.5 : 1;
  const cw = Math.max(1, Math.ceil(w * k));
  const ch = Math.max(1, Math.ceil(h * k));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(cw, ch);
  const data = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(radius, hw, hh);
  // Light from the top-left, a softer bounce from the bottom-right.
  const lx = -0.6;
  const ly = -0.8;
  for (let j = 0; j < ch; j++) {
    const y = (j + 0.5) / k;
    const dy = y - hh;
    const qy = Math.abs(dy) - (hh - r);
    for (let i = 0; i < cw; i++) {
      const x = (i + 0.5) / k;
      const dx = x - hw;
      const qx = Math.abs(dx) - (hw - r);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const inside = Math.min(Math.max(qx, qy), 0);
      const d = r - (outside + inside); // distance in from the edge
      const o = (j * cw + i) * 4;
      data[o + 3] = 255;
      if (d >= bezel || d < 0) {
        data[o] = 128;
        data[o + 1] = 128;
        data[o + 2] = 0;
        continue;
      }
      // Outward normal of the rounded rectangle at this point.
      let nx: number;
      let ny: number;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1;
        nx = qx / len;
        ny = qy / len;
      } else if (qx > qy) {
        nx = 1;
        ny = 0;
      } else {
        nx = 0;
        ny = 1;
      }
      if (dx < 0) nx = -nx;
      if (dy < 0) ny = -ny;
      // Convex bezel: steepest (strongest bend) at the rim, flat where it meets the face.
      const t = d / bezel;
      const m = (1 - t) * (1 - t);
      // Sample outward: the rim shows what lies just past the edge, squeezed in,
      // the way light bends through the rounded edge of a thick lens.
      data[o] = Math.round(128 + nx * m * 127);
      data[o + 1] = Math.round(128 + ny * m * 127);
      const rim = Math.exp(-d / 1.8);
      const key = Math.max(0, nx * lx + ny * ly);
      const fill = Math.max(0, -(nx * lx + ny * ly));
      const spec = rim * (key * key * 1.0 + fill * fill * 0.45) + Math.exp(-d / 5) * key * 0.18;
      data[o + 2] = Math.round(Math.min(1, spec) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL("image/png") };
}

// ---- filters ------------------------------------------------------------------------

interface FilterEntry {
  id: string;
  node: SVGFilterElement;
  users: number;
  lastUsed: number;
}

let defs: SVGDefsElement | null = null;
const filters = new Map<string, FilterEntry>();
let nextId = 1;

function ensureDefs(): SVGDefsElement {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  defs = document.createElementNS(SVG_NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function makeFilter(w: number, h: number, radius: number, opts: LensOptions, frostScale: number): SVGFilterElement {
  const strength = Math.max(0, Math.min(100, opts.refraction)) / 100;
  const bezel = Math.max(6, Math.min(28, Math.min(w, h) * 0.3));
  // Largest shift in px. Sampling outward only ever compresses the rim, so it
  // can't fold over into a mirrored copy however strong it gets.
  const depth = bezel * (0.3 + 0.9 * strength);
  const blur = (Math.max(0, Math.min(100, opts.frost)) / 100) * 16 * frostScale;
  const map = buildMap(w, h, radius, bezel);
  const scale = depth * 2;
  // Let the filter see a little past the edge: the rim samples what lies just outside.
  const pad = Math.ceil(depth * 1.2 + blur * 3);
  const f = el("filter", {
    x: -pad,
    y: -pad,
    width: w + pad * 2,
    height: h + pad * 2,
    filterUnits: "userSpaceOnUse",
    primitiveUnits: "userSpaceOnUse",
    "color-interpolation-filters": "sRGB",
  });
  f.append(
    el("feImage", { href: map.url, x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: "map" }),
    // Neutral (no bend) around the element, where the map image doesn't reach.
    el("feFlood", { "flood-color": "rgb(128,128,0)", result: "flat" }),
    el("feComposite", { in: "map", in2: "flat", operator: "over", result: "field" }),
    // One displacement for all channels: splitting them into a prism fringe
    // left colored specks at the corners of bars.
    el("feDisplacementMap", { in: "SourceGraphic", in2: "field", scale: scale.toFixed(1), xChannelSelector: "R", yChannelSelector: "G", result: "lens" }),
    // Frost after bending, like light scattering in the glass.
    el("feGaussianBlur", { in: "lens", stdDeviation: blur.toFixed(1), edgeMode: "duplicate", result: "frost" }),
    el("feColorMatrix", { in: "frost", type: "saturate", values: 1.1, result: "vivid" }),
    // Specular rim from the map's blue channel, as white light.
    el("feColorMatrix", {
      in: "map",
      type: "matrix",
      values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 ${opts.dark ? 0.55 : 0.85} 0 0`,
      result: "spec",
    }),
    el("feComposite", { in: "spec", in2: "vivid", operator: "over" }),
  );
  return f;
}

function acquire(w: number, h: number, radius: number, frostScale: number, opts: LensOptions): FilterEntry {
  const key = `${w}x${h}r${radius}f${frostScale}|${opts.refraction}|${opts.frost}|${opts.dark ? 1 : 0}`;
  let entry = filters.get(key);
  if (!entry) {
    const node = makeFilter(w, h, radius, opts, frostScale);
    const id = `lg-${nextId++}`;
    node.id = id;
    ensureDefs().appendChild(node);
    entry = { id, node, users: 0, lastUsed: 0 };
    filters.set(key, entry);
    evict();
  }
  entry.users++;
  entry.lastUsed = performance.now();
  return entry;
}

function release(entry: FilterEntry | undefined) {
  if (entry) entry.users = Math.max(0, entry.users - 1);
}

function evict() {
  if (filters.size <= MAX_FILTERS) return;
  const idle = [...filters.entries()].filter(([, e]) => e.users === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [key, e] of idle.slice(0, filters.size - MAX_FILTERS)) {
    e.node.remove();
    filters.delete(key);
  }
}

function clearFilters() {
  for (const e of filters.values()) e.node.remove();
  filters.clear();
}

// ---- tracking surfaces ------------------------------------------------------------------

interface Tracked {
  entry?: FilterEntry;
  key: string;
}

let options: LensOptions | null = null;
const tracked = new Map<HTMLElement, Tracked>();
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
const pending = new Set<HTMLElement>();
let frame = 0;

function targetFor(node: HTMLElement): Target | undefined {
  return TARGETS.find((t) => node.matches(t.selector) && (!t.media || matchMedia(t.media).matches));
}

function wanted(node: HTMLElement): boolean {
  return targetFor(node) !== undefined;
}

/**
 * Chromium positions feImage (our map) against the element's painted bounds, so
 * an outer box-shadow or outline that pokes out above or left of the element
 * shifts and crops the map. Lensed surfaces therefore keep only their inset
 * shadows (highlights); the lens rim and specular edge give them depth.
 */
function insetShadows(value: string): string {
  if (!value || value === "none") return "none";
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= value.length; i++) {
    const c = value[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === "," && depth === 0) || i === value.length) {
      const part = value.slice(start, i).trim();
      if (/\binset\b/.test(part)) out.push(part);
      start = i + 1;
    }
  }
  return out.length ? out.join(", ") : "none";
}

function radiusOf(node: HTMLElement, w: number, h: number): number {
  const r = parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0;
  return Math.round(Math.min(r, w / 2, h / 2));
}

function refresh(node: HTMLElement) {
  const state = tracked.get(node);
  if (!state || !options) return;
  const target = node.isConnected ? targetFor(node) : undefined;
  if (!target) {
    untrack(node);
    return;
  }
  const w = Math.round(node.offsetWidth);
  const h = Math.round(node.offsetHeight);
  if (w < 8 || h < 8) return;
  const radius = radiusOf(node, w, h);
  const key = `${w}x${h}r${radius}f${target.frost}`;
  if (state.entry && state.key === key) return;
  const entry = acquire(w, h, radius, target.frost, options);
  release(state.entry);
  state.entry = entry;
  state.key = key;
  if (!("lens" in node.dataset)) {
    node.style.removeProperty("box-shadow");
    const shadow = insetShadows(getComputedStyle(node).boxShadow);
    node.style.setProperty("box-shadow", shadow, "important");
    node.style.setProperty("outline", "none", "important");
    node.dataset.lens = "";
  }
  node.style.setProperty("backdrop-filter", `url(#${entry.id})`);
  node.style.setProperty("-webkit-backdrop-filter", `url(#${entry.id})`);
}

function schedule(node: HTMLElement) {
  pending.add(node);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const nodes = [...pending];
    pending.clear();
    for (const n of nodes) refresh(n);
  });
}

function track(node: HTMLElement) {
  if (tracked.has(node) || !wanted(node)) return;
  tracked.set(node, { key: "" });
  resizeObserver?.observe(node);
  schedule(node);
  // Popovers often size themselves just after they appear.
  setTimeout(() => schedule(node), 120);
}



function untrack(node: HTMLElement) {
  const state = tracked.get(node);
  if (!state) return;
  release(state.entry);
  tracked.delete(node);
  resizeObserver?.unobserve(node);
  node.style.removeProperty("backdrop-filter");
  node.style.removeProperty("-webkit-backdrop-filter");
  node.style.removeProperty("box-shadow");
  node.style.removeProperty("outline");
  delete node.dataset.lens;
}

function scan(root: ParentNode) {
  if (root instanceof HTMLElement && root.matches(ALL)) track(root);
  root.querySelectorAll?.<HTMLElement>(ALL).forEach(track);
}

function start() {
  resizeObserver = new ResizeObserver((entries) => {
    for (const e of entries) schedule(e.target as HTMLElement);
  });
  mutationObserver = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => {
        if (n.nodeType === 1) scan(n as Element as HTMLElement);
      });
      if (r.removedNodes.length) {
        for (const node of tracked.keys()) if (!node.isConnected) untrack(node);
      }
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });
  scan(document.body);
  addEventListener("resize", rescanForMedia);
}

// Surfaces that only get glass at some sizes (the phone top bar).
function rescanForMedia() {
  for (const node of [...tracked.keys()]) if (!wanted(node)) untrack(node);
  scan(document.body);
}

function stop() {
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  resizeObserver = null;
  mutationObserver = null;
  removeEventListener("resize", rescanForMedia);
  for (const node of [...tracked.keys()]) untrack(node);
  clearFilters();
}

/**
 * Turn refraction on (with these settings) or off (null). Safe to call often:
 * only a change of settings rebuilds the filters.
 */
export function setLiquidGlass(next: LensOptions | null) {
  if (next && !lensSupported()) next = null;
  const same =
    (next === null && options === null) ||
    (next !== null &&
      options !== null &&
      next.refraction === options.refraction &&
      next.frost === options.frost &&
      next.dark === options.dark);
  if (same) return;
  const wasOn = options !== null;
  options = next;
  if (!next) {
    if (wasOn) stop();
    delete document.documentElement.dataset.lens;
    return;
  }
  document.documentElement.dataset.lens = "";
  if (!wasOn) {
    if (document.body) start();
    else addEventListener("DOMContentLoaded", start, { once: true });
    return;
  }
  // New settings: rebuild every surface's filter.
  for (const [node, state] of tracked) {
    release(state.entry);
    state.entry = undefined;
    state.key = "";
    schedule(node);
  }
  clearFilters();
}

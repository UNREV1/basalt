// DOM builders that turn a stroke into a self-contained SVG group (its own
// filter / pressure mask live inside it, so a group can be cloned for export,
// moved between masks, or reused in previews).

import { pressureRuns, type StrokeGeom } from "./brushes.ts";
import { isIdentity, matString, toMat } from "./geometry.ts";
import type { Stroke } from "./types.ts";

export const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | undefined | null>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  return e;
}

const r2 = (n: number) => String(Math.round(n * 100) / 100);

function regionAttrs(g: StrokeGeom) {
  return {
    filterUnits: "userSpaceOnUse",
    x: r2(g.box.x0),
    y: r2(g.box.y0),
    width: r2(Math.max(1, g.box.x1 - g.box.x0)),
    height: r2(Math.max(1, g.box.y1 - g.box.y0)),
  };
}

function effectFilter(s: Stroke, g: StrokeGeom, id: string): SVGFilterElement | null {
  const effect = s.options?.effect;
  const size = s.size;
  const seed = s.options?.seed ?? 1;
  const f = svgEl("filter", { id, ...regionAttrs(g), "color-interpolation-filters": "sRGB" });
  switch (effect) {
    case "pencil":
      // Graphite catches on paper grain: noise thins the stroke's alpha unevenly.
      f.append(
        svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: "0.7 0.5", numOctaves: 3, seed, result: "n" }),
        svgEl("feColorMatrix", {
          in: "n",
          type: "matrix",
          values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.3 0 0 0 -0.42",
          result: "grain",
        }),
        svgEl("feComposite", { in: "SourceGraphic", in2: "grain", operator: "in" }),
      );
      return f;
    case "airbrush":
      f.append(svgEl("feGaussianBlur", { stdDeviation: r2(size * 0.3) }));
      return f;
    case "soft":
      f.append(svgEl("feGaussianBlur", { stdDeviation: r2(size * 0.22) }));
      return f;
    case "watercolor":
      f.append(
        // Low-frequency noise wobbles the edges like pigment spreading in water.
        svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: r2(Math.max(0.004, 1 / (size * 0.9))), numOctaves: 2, seed, result: "n" }),
        svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: r2(size * 0.28), xChannelSelector: "R", yChannelSelector: "G", result: "d" }),
        svgEl("feGaussianBlur", { in: "d", stdDeviation: r2(size * 0.03), result: "soft" }),
        svgEl("feGaussianBlur", { in: "d", stdDeviation: r2(size * 0.13), result: "wide" }),
        // Pigment pools at the rim: boost where the tight blur exceeds the wide one.
        svgEl("feComposite", { in: "soft", in2: "wide", operator: "arithmetic", k1: 0, k2: 2.1, k3: -1.35, k4: 0, result: "rim" }),
        // Paper granulation modulates the wash.
        svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: 0.16, numOctaves: 3, seed: seed + 11, result: "g" }),
        svgEl("feColorMatrix", { in: "g", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.75 0 0 0 0.55", result: "grain" }),
        svgEl("feComposite", { in: "rim", in2: "grain", operator: "in" }),
      );
      return f;
    default:
      return null;
  }
}

function pressureMask(s: Stroke, g: StrokeGeom, id: string): SVGMaskElement {
  const m = svgEl("mask", { id, maskUnits: "userSpaceOnUse", ...regionAttrs(g) });
  m.removeAttribute("filterUnits");
  const width = s.size * (1 + (s.options.pressureSize === false ? 0 : (s.options.thinning ?? 0.5))) + g.pad * 2 + 2;
  // Blur the stepped opacity runs into a smooth gradient along the stroke.
  const blur = svgEl("filter", { id: `${id}-b`, ...regionAttrs(g) });
  blur.append(svgEl("feGaussianBlur", { stdDeviation: r2(Math.max(1, s.size * 0.35)) }));
  const group = svgEl("g", { filter: `url(#${id}-b)` });
  m.append(blur, group);
  for (const run of pressureRuns(s, 24)) {
    const v = Math.round(run.level * 255);
    group.append(
      svgEl("path", {
        d: run.d,
        fill: "none",
        stroke: `rgb(${v},${v},${v})`,
        "stroke-width": r2(width),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );
  }
  return m;
}

/**
 * Build the SVG group for a stroke. `prefix` namespaces ids (filters, masks)
 * per renderer instance so previews and the canvas never collide.
 */
export function buildStrokeElement(s: Stroke, g: StrokeGeom, prefix: string): SVGGElement {
  const root = svgEl("g", { "data-sid": s.id });
  const m = toMat(s.transform);
  if (!isIdentity(m)) root.setAttribute("transform", matString(m));

  if (s.kind === "image") {
    const img = svgEl("image", {
      x: s.x ?? 0,
      y: s.y ?? 0,
      width: s.w ?? 0,
      height: s.h ?? 0,
      preserveAspectRatio: "none",
    });
    // Only embedded images: a remote URL would leak viewers' IPs to a third party.
    if (typeof s.src === "string" && s.src.startsWith("data:image/")) {
      img.setAttribute("href", s.src);
      img.setAttributeNS(XLINK_NS, "xlink:href", s.src);
    }
    if (s.opacity < 1) img.setAttribute("opacity", r2(s.opacity));
    if (s.blend && s.blend !== "normal") img.style.mixBlendMode = s.blend;
    root.append(img);
    return root;
  }

  const erase = s.kind === "erase";
  const color = erase ? "#000" : s.color;
  const effect = s.options?.effect;
  const filter = effectFilter(s, g, `${prefix}f-${s.id}`);
  if (filter) root.append(filter);
  const usePressureMask = !!s.options?.pressureOpacity && (s.kind === "brush" || erase) && s.points.length >= 6;
  if (usePressureMask) root.append(pressureMask(s, g, `${prefix}pm-${s.id}`));

  const both = !!g.fillD && !!g.d;
  const target: SVGGElement = both ? svgEl("g") : root;
  if (both) {
    if (s.opacity < 1) target.setAttribute("opacity", r2(s.opacity));
    if (s.blend && s.blend !== "normal") target.style.mixBlendMode = s.blend;
    root.append(target);
  }
  const decorate = (p: SVGPathElement) => {
    if (!both) {
      if (s.opacity < 1) p.setAttribute("fill-opacity", r2(s.opacity));
      if (s.blend && s.blend !== "normal") p.style.mixBlendMode = s.blend;
    }
    if (effect === "pixel") p.setAttribute("shape-rendering", "crispEdges");
  };
  if (g.fillD) {
    const fp = svgEl("path", { d: g.fillD, fill: s.options.fill ?? color });
    decorate(fp);
    target.append(fp);
  }
  if (g.d) {
    const p = svgEl("path", { d: g.d, fill: color });
    if (filter) p.setAttribute("filter", `url(#${filter.id})`);
    if (usePressureMask) p.setAttribute("mask", `url(#${prefix}pm-${s.id})`);
    decorate(p);
    target.append(p);
  }
  return root;
}

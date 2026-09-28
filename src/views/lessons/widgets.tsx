// Visual parts of lesson steps: diagrams (sanitized inline SVG or an image)
// and the slider widget with its live graph and readout.

import DOMPurify from "dompurify";
import { useMemo } from "react";
import { compile } from "../../../shared/expr.ts";
import type { Visual, Widget } from "../../../shared/lesson.ts";
import { Markdown } from "../tutor/ai-ui.tsx";

/** A diagram above a step: inline SVG (scripts, handlers and external references removed) or an image. */
export function Figure({ step }: { step: Visual }) {
  const svg = useMemo(() => {
    if (!step.figure?.startsWith("<")) return null;
    return DOMPurify.sanitize(step.figure, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ["foreignObject", "script", "image", "use"],
      FORBID_ATTR: ["href", "xlink:href"],
    });
  }, [step.figure]);
  if (!step.figure) return null;
  return (
    <figure className="lp-figure">
      {svg !== null ? (
        <div className="lp-svg" role="img" aria-label={step.caption || "Diagram"} dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <img src={step.figure} alt={step.caption || ""} loading="lazy" referrerPolicy="no-referrer" />
      )}
      {step.caption && (
        <figcaption>
          <Markdown md={step.caption} />
        </figcaption>
      )}
    </figure>
  );
}

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3;
  return Number(n.toFixed(digits)).toLocaleString();
};

export const stepOf = (w: Widget) => w.step ?? (w.max - w.min) / 100;

/** The slider, its value, and (when set) a live graph y = plot(x, v) and a computed readout. */
export function WidgetView({
  w,
  value,
  onChange,
  disabled,
  target,
}: {
  w: Widget;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Mark the right value on the graph (after answering). */
  target?: number;
}) {
  const readout = w.readout ? compile(w.readout)({ v: value }) : null;
  return (
    <div className="lp-widget">
      {w.plot && <Plot w={w} v={value} target={target} />}
      <label className="lp-slider">
        <span className="lp-slider-label">
          {w.label || "Value"}
          <strong>
            {fmt(value)}
            {w.unit ? ` ${w.unit}` : ""}
          </strong>
        </span>
        <input
          type="range"
          min={w.min}
          max={w.max}
          step={stepOf(w)}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${fmt(value)}${w.unit ? ` ${w.unit}` : ""}`}
        />
        <span className="lp-slider-ends" aria-hidden>
          <span>{fmt(w.min)}</span>
          <span>{fmt(w.max)}</span>
        </span>
      </label>
      {readout !== null && (
        <div className="lp-readout">
          {w.readoutLabel || "Result"} = <strong>{fmt(readout)}</strong>
        </div>
      )}
    </div>
  );
}

const W = 520;
const H = 240;
const PAD = { l: 44, r: 14, t: 12, b: 28 };

/** y = f(x, v) over [xMin, xMax]; the y axis is fixed across the slider's range so shapes compare. */
function Plot({ w, v, target }: { w: Widget; v: number; target?: number }) {
  const f = useMemo(() => compile(w.plot!), [w.plot]);
  const x0 = w.xMin ?? 0;
  const x1 = w.xMax ?? 10;
  const N = 120;
  const xs = useMemo(() => Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N), [x0, x1]);
  // A stable y range from the slider's extremes and middle.
  const [y0, y1] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const vv of [w.min, (w.min + w.max) / 2, w.max]) {
      for (const x of xs) {
        const y = f({ x, v: vv });
        if (Number.isFinite(y)) {
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
      }
    }
    if (!Number.isFinite(lo)) return [0, 1];
    if (lo === hi) return [lo - 1, hi + 1];
    const pad = (hi - lo) * 0.06;
    return [Math.min(0, lo) - (lo < 0 ? pad : 0), hi + pad];
  }, [f, xs, w.min, w.max]);
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - ((y - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const path = (vv: number) => {
    let d = "";
    let pen = false;
    for (const x of xs) {
      const y = f({ x, v: vv });
      if (!Number.isFinite(y) || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const ticks = (a: number, b: number) => [a, a + (b - a) / 2, b];
  return (
    <svg className="lp-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Graph of y = ${w.plot}`}>
      <g className="lp-plot-grid">
        {ticks(y0, y1).map((y) => (
          <g key={`y${y}`}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(y)} y2={sy(y)} />
            <text x={PAD.l - 6} y={sy(y) + 4} textAnchor="end">
              {fmt(y)}
            </text>
          </g>
        ))}
        {ticks(x0, x1).map((x) => (
          <text key={`x${x}`} x={sx(x)} y={H - 8} textAnchor="middle">
            {fmt(x)}
          </text>
        ))}
        {y0 < 0 && y1 > 0 && <line className="lp-plot-zero" x1={PAD.l} x2={W - PAD.r} y1={sy(0)} y2={sy(0)} />}
      </g>
      {target !== undefined && <path className="lp-plot-target" d={path(target)} />}
      <path className="lp-plot-line" d={path(v)} />
    </svg>
  );
}

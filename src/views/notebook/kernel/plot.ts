// A tiny SVG line-chart helper for the JavaScript kernel:
//   plot(ys)                         index on the x axis
//   plot(xs, ys | fn | [ys | fn, …], opts?)
//   plot(fn, { domain: [a, b] })
// Colors are CSS variables (with hex fallbacks) so the chart follows the app theme.

export interface PlotOptions {
  title?: string;
  xlabel?: string;
  ylabel?: string;
  labels?: string[];
  width?: number;
  height?: number;
  domain?: [number, number];
  samples?: number;
  points?: boolean;
}

type Series = number[] | ((x: number) => number);

const FALLBACK = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const seriesColor = (i: number) => `var(--nb-series-${(i % FALLBACK.length) + 1}, ${FALLBACK[i % FALLBACK.length]})`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f >= 7.5 ? 10 : f >= 3.5 ? 5 : f >= 1.5 ? 2 : 1) * pow;
}

function ticks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = niceStep(max - min, count);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

function fmt(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) return v.toExponential(1).replace("e+", "e");
  return String(Number(v.toPrecision(4)));
}

function isSeries(v: unknown): v is Series {
  return typeof v === "function" || (Array.isArray(v) && v.every((n) => typeof n === "number" || n == null));
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

export function plotSvg(a: unknown, b?: unknown, c?: unknown): string {
  let xs: number[];
  let series: Series[];
  let opts: PlotOptions = {};
  if (typeof a === "function") {
    opts = (b as PlotOptions) ?? {};
    const [lo, hi] = opts.domain ?? [-10, 10];
    xs = linspace(lo, hi, opts.samples ?? 200);
    series = [a as Series];
  } else if (Array.isArray(a) && (b === undefined || (typeof b === "object" && b !== null && !Array.isArray(b)))) {
    if (a.length && a.every((s) => isSeries(s) && typeof s !== "number")) {
      series = a as Series[];
      xs = Array.from({ length: Math.max(...series.map((s) => (Array.isArray(s) ? s.length : 0))) }, (_, i) => i);
    } else {
      series = [a as number[]];
      xs = a.map((_, i) => i);
    }
    opts = (b as PlotOptions) ?? {};
  } else if (Array.isArray(a)) {
    xs = a.map(Number);
    opts = (c as PlotOptions) ?? {};
    series = Array.isArray(b) && b.length && b.every((s) => typeof s === "function" || Array.isArray(s)) ? (b as Series[]) : [b as Series];
  } else {
    throw new TypeError("plot(xs, ys | fn, opts?) expects arrays of numbers or a function");
  }
  if (!series.every(isSeries)) throw new TypeError("plot: each series must be an array of numbers or a function");

  const data = series.map((s) =>
    xs.map((x, i) => {
      const y = typeof s === "function" ? s(x) : s[i];
      return [x, y == null ? NaN : Number(y)] as const;
    }),
  );
  const finite = data.flat().filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!finite.length) throw new RangeError("plot: no finite points to draw");

  const W = opts.width ?? 640;
  const H = opts.height ?? 320;
  const multi = series.length > 1;
  const m = { l: 56, r: 18, t: (opts.title ? 30 : 12) + (multi ? 22 : 0), b: opts.xlabel ? 48 : 32 };
  if (opts.ylabel) m.l += 16;
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  let [x0, x1] = [Math.min(...finite.map((p) => p[0])), Math.max(...finite.map((p) => p[0]))];
  let [y0, y1] = [Math.min(...finite.map((p) => p[1])), Math.max(...finite.map((p) => p[1]))];
  if (x0 === x1) [x0, x1] = [x0 - 1, x1 + 1];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const pad = (y1 - y0) * 0.05;
  y0 -= pad;
  y1 += pad;
  const sx = (x: number) => m.l + ((x - x0) / (x1 - x0)) * pw;
  const sy = (y: number) => m.t + ph - ((y - y0) / (y1 - y0)) * ph;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" class="nb-plot" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.title ?? "Line chart")}" style="max-width:100%;height:auto;font-family:var(--font, sans-serif);font-size:11px;color:inherit">`,
  );
  if (opts.title) parts.push(`<text x="${m.l}" y="18" fill="currentColor" style="font-size:13px;font-weight:600">${esc(opts.title)}</text>`);

  for (const t of ticks(y0, y1, Math.max(2, Math.round(ph / 48)))) {
    const y = sy(t).toFixed(1);
    parts.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" stroke="currentColor" stroke-opacity="0.1"/>`);
    parts.push(`<text x="${m.l - 8}" y="${y}" dy="0.32em" text-anchor="end" fill="currentColor" fill-opacity="0.6">${fmt(t)}</text>`);
  }
  for (const t of ticks(x0, x1, Math.max(2, Math.round(pw / 80)))) {
    const x = sx(t).toFixed(1);
    parts.push(`<line x1="${x}" x2="${x}" y1="${m.t + ph}" y2="${m.t + ph + 4}" stroke="currentColor" stroke-opacity="0.35"/>`);
    parts.push(`<text x="${x}" y="${m.t + ph + 16}" text-anchor="middle" fill="currentColor" fill-opacity="0.6">${fmt(t)}</text>`);
  }
  parts.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${m.t + ph}" y2="${m.t + ph}" stroke="currentColor" stroke-opacity="0.35"/>`);
  if (opts.xlabel) parts.push(`<text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle" fill="currentColor" fill-opacity="0.75">${esc(opts.xlabel)}</text>`);
  if (opts.ylabel)
    parts.push(`<text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" fill="currentColor" fill-opacity="0.75">${esc(opts.ylabel)}</text>`);

  data.forEach((pts, si) => {
    const color = seriesColor(si);
    let d = "";
    let pen = false;
    for (const [x, y] of pts) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
      pen = true;
    }
    parts.push(`<path d="${d}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
    const label = opts.labels?.[si] ?? (multi ? `Series ${si + 1}` : "");
    const every = Math.max(1, Math.ceil(pts.length / 300));
    const showPoints = opts.points ?? pts.length <= 24;
    pts.forEach(([x, y], i) => {
      if (i % every || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const tip = `${label ? `${label}: ` : ""}x = ${fmt(x)}, y = ${fmt(y)}`;
      parts.push(
        `<circle cx="${sx(x).toFixed(1)}" cy="${sy(y).toFixed(1)}" r="${showPoints ? 3.5 : 6}" style="fill:${showPoints ? color : "transparent"}"${showPoints ? ' stroke="var(--bg, #fff)" stroke-width="1.5"' : ""}><title>${esc(tip)}</title></circle>`,
      );
    });
  });

  if (multi) {
    let lx = m.l;
    const ly = (opts.title ? 30 : 12) + 8;
    series.forEach((_, si) => {
      const label = opts.labels?.[si] ?? `Series ${si + 1}`;
      parts.push(`<rect x="${lx}" y="${ly - 5}" width="14" height="3" rx="1.5" style="fill:${seriesColor(si)}"/>`);
      parts.push(`<text x="${lx + 19}" y="${ly}" dy="0.3em" fill="currentColor" fill-opacity="0.8">${esc(label)}</text>`);
      lx += 34 + label.length * 6.2;
    });
  }
  parts.push("</svg>");
  return parts.join("");
}

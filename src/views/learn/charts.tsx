// Review heatmap (last 120 days) and 7-day review forecast: plain SVG/CSS.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { DAY, dayNumber } from "../../../shared/srs.ts";
import { todayKey } from "../../../shared/model.ts";

interface Tip {
  x: number;
  y: number;
  title: string;
  detail: string;
}

function useTooltip() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: ReactPointerEvent<Element> | { currentTarget: Element }, title: string, detail: string) => {
    const host = hostRef.current;
    if (!host) return;
    const hr = host.getBoundingClientRect();
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ x: r.left + r.width / 2 - hr.left, y: r.top - hr.top, title, detail });
  };
  // Touch has no hover: a tapped tooltip stays until the next tap outside the chart.
  useEffect(() => {
    if (!tip) return;
    const onDown = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setTip(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [tip]);
  const hide = (e: ReactPointerEvent<Element>) => {
    if (e.pointerType === "mouse") setTip(null);
  };
  const node = tip ? (
    <div className="learn-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.title}</strong>
      <span>{tip.detail}</span>
    </div>
  ) : null;
  return { hostRef, show, hide, node };
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

export function ReviewHeatmap({ stats, now, days = 120 }: { stats: Map<string, number>; now: number; days?: number }) {
  const { hostRef, show, hide, node } = useTooltip();
  const model = useMemo(() => {
    const today = new Date(now);
    today.setHours(12, 0, 0, 0);
    const first = new Date(today.getTime() - (days - 1) * DAY);
    // Align the grid to Monday so rows are weekdays.
    const lead = (first.getDay() + 6) % 7;
    const cells: { key: string; date: Date; count: number; inRange: boolean }[] = [];
    for (let i = -lead; i < days; i++) {
      const date = new Date(first.getTime() + i * DAY);
      date.setHours(12, 0, 0, 0);
      const key = todayKey(date);
      cells.push({ key, date, count: i < 0 ? 0 : (stats.get(key) ?? 0), inRange: i >= 0 });
    }
    const counts = cells.filter((c) => c.inRange && c.count > 0).map((c) => c.count).sort((a, b) => a - b);
    const q = (p: number) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] ?? 0;
    const thresholds = [q(0.25), q(0.5), q(0.75)];
    const level = (n: number) => (n <= 0 ? 0 : n <= thresholds[0] ? 1 : n <= thresholds[1] ? 2 : n <= thresholds[2] ? 3 : 4);
    const weeks = Math.ceil(cells.length / 7);
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const c = cells[w * 7];
      const m = c.date.getMonth();
      if (m !== lastMonth) {
        if (w > 0 || c.date.getDate() <= 7) months.push({ col: w, label: c.date.toLocaleDateString(undefined, { month: "short" }) });
        lastMonth = m;
      }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    return { cells, level, weeks, months, total, activeDays: counts.length };
  }, [stats, now, days]);

  const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const todayNum = dayNumber(now);

  return (
    <div className="learn-heatmap" ref={hostRef} onPointerLeave={hide}>
      <div className="learn-heatmap-scroll" style={{ "--weeks": model.weeks } as CSSProperties}>
        <div className="learn-heatmap-months" style={{ gridTemplateColumns: `repeat(${model.weeks}, var(--hm-cell))` }}>
          {model.months.map((m) => (
            <span key={`${m.col}-${m.label}`} style={{ gridColumn: `${m.col + 1} / span 3` }}>
              {m.label}
            </span>
          ))}
        </div>
        <div className="learn-heatmap-body">
          <div className="learn-heatmap-days" aria-hidden>
            {WEEKDAYS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div
            className="learn-heatmap-grid"
            role="img"
            aria-label={`${plural(model.total, "review")} on ${plural(model.activeDays, "day")} in the last ${days} days`}
            style={{ gridTemplateColumns: `repeat(${model.weeks}, var(--hm-cell))` }}
          >
            {model.cells.map((c) =>
              c.inRange ? (
                <span
                  key={c.key}
                  className={`hm-cell hm-${model.level(c.count)}${dayNumber(c.date.getTime()) === todayNum ? " hm-today" : ""}`}
                  onPointerEnter={(e) => show(e, c.count ? plural(c.count, "review") : "No reviews", fmt(c.date))}
                  onPointerDown={(e) => show(e, c.count ? plural(c.count, "review") : "No reviews", fmt(c.date))}
                />
              ) : (
                <span key={c.key} className="hm-cell hm-out" />
              ),
            )}
          </div>
        </div>
      </div>
      <div className="learn-heatmap-legend">
        <span className="muted small">
          {plural(model.total, "review")} · {plural(model.activeDays, "active day")}
        </span>
        <span className="learn-heatmap-scale">
          <span className="faint small">Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`hm-cell hm-${l}`} />
          ))}
          <span className="faint small">More</span>
        </span>
      </div>
      {node}
    </div>
  );
}

export function ForecastChart({ values, now }: { values: number[]; now: number }) {
  const { hostRef, show, hide, node } = useTooltip();
  const W = 336;
  const H = 150;
  const top = 22;
  const bottom = 24;
  const plotH = H - top - bottom;
  const slot = W / values.length;
  const barW = Math.min(24, slot * 0.5);
  const max = Math.max(1, ...values);
  const labels = values.map((_, i) => {
    if (i === 0) return "Today";
    const d = new Date(now + i * DAY);
    return i === 1 ? "Tmrw" : d.toLocaleDateString(undefined, { weekday: "short" });
  });
  const fullDate = (i: number) =>
    new Date(now + i * DAY).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className="learn-forecast" ref={hostRef} onPointerLeave={hide}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${plural(total, "review")} due in the next ${values.length} days`}>
        <line x1={0} x2={W} y1={top + plotH + 0.5} y2={top + plotH + 0.5} className="fc-axis" />
        {values.map((v, i) => {
          const h = v ? Math.max(4, (v / max) * plotH) : 0;
          const x = i * slot + (slot - barW) / 2;
          const y = top + plotH - h;
          const r = Math.min(4, h);
          const d = h
            ? `M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${top + plotH} Z`
            : "";
          const label = i === 0 ? "due today (incl. overdue)" : "due";
          return (
            <g key={i}>
              {h > 0 && <path d={d} className={i === 0 ? "fc-bar fc-today" : "fc-bar"} />}
              <text x={i * slot + slot / 2} y={top + plotH - h - 6} className="fc-value" textAnchor="middle">
                {v > 0 ? v.toLocaleString() : ""}
              </text>
              <text x={i * slot + slot / 2} y={H - 6} className={i === 0 ? "fc-label fc-label-today" : "fc-label"} textAnchor="middle">
                {labels[i]}
              </text>
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={H}
                className="fc-hit"
                onPointerEnter={(e) => show(e, plural(v, "card"), `${label} · ${fullDate(i)}`)}
                onPointerDown={(e) => show(e, plural(v, "card"), `${label} · ${fullDate(i)}`)}
              />
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

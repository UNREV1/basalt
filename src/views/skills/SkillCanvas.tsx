// The interactive skill tree: an SVG canvas with pan (drag / two fingers),
// zoom (wheel / pinch), node dragging (persisted as manual positions) and
// game-like nodes with XP rings, rank borders, locks and level-up effects.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { themedColor, type Skill, type SkillArea, type SkillStats } from "../../../shared/skills.ts";
import { GROUND_Y, layoutBounds, NODE_R, type AreaBand, type Point, type TreeLayout } from "./layout.ts";
import { fmt } from "./useSkillData.ts";

export interface View {
  x: number;
  y: number;
  k: number;
}

export interface CanvasApi {
  fit: (ids?: string[], animate?: boolean) => void;
  centerOn: (id: string) => void;
  zoomBy: (factor: number) => void;
  /** Pan so a node is visible (e.g. not hidden behind the side panel). */
  reveal: (id: string) => void;
}

/** A brief highlight on a node (e.g. after a level-up). */
export interface Effect {
  key: number;
  id: string;
}

export interface PeerMark {
  name: string;
  color: string;
}

const R = NODE_R;
const RING_C = 2 * Math.PI * R;
const MIN_K = 0.2;
const MAX_K = 2.5;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function wrapLabel(name: string, max = 16): string[] {
  const words = name.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(" "));
  return lines.map((l) => (l.length > max + 2 ? `${l.slice(0, max)}…` : l));
}

/** Tween node positions when the layout changes, so the tree re-flows smoothly. */
function useTweened(
  target: Map<string, Point>,
  reduceMotion: boolean,
  dropRef: RefObject<{ id: string; pos: Point } | null>,
): Map<string, Point> {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = new Map(shownRef.current);
    // A node just dropped by the user starts from where it was dropped.
    const drop = dropRef.current;
    if (drop) from.set(drop.id, drop.pos);
    let changed = false;
    for (const [id, p] of target) {
      const f = from.get(id);
      if (!f || Math.abs(f.x - p.x) > 0.5 || Math.abs(f.y - p.y) > 0.5) {
        changed = true;
        break;
      }
    }
    if (!changed || reduceMotion || from.size === 0) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const dur = 320;
    let raf = 0;
    const step = (t: number) => {
      const u = clamp((t - start) / dur, 0, 1);
      const e = 1 - Math.pow(1 - u, 3);
      const next = new Map<string, Point>();
      for (const [id, p] of target) {
        const f = from.get(id) ?? p;
        next.set(id, { x: f.x + (p.x - f.x) * e, y: f.y + (p.y - f.y) * e });
      }
      shownRef.current = next;
      setShown(next);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduceMotion, dropRef]);
  return shown;
}

interface NodeProps {
  skill: Skill;
  stats: SkillStats;
  color: string;
  x: number;
  y: number;
  selected: boolean;
  dim: boolean;
  effects: Effect[];
  peers: PeerMark[] | undefined;
}

const SkillNode = memo(function SkillNode({ skill, stats, color, x, y, selected, dim, effects, peers }: NodeProps) {
  const locked = !stats.unlocked;
  const done = stats.maxed || stats.goalReached;
  const lines = useMemo(() => wrapLabel(skill.name || "Untitled"), [skill.name]);
  const label = `${skill.name}, level ${stats.level}, ${stats.rank.name}${locked ? ", locked" : ""}${done ? ", goal reached" : ""}`;
  const cls = ["sk-node", locked && "locked", selected && "selected", dim && "dim"].filter(Boolean).join(" ");
  const levelText = String(stats.level);
  const pillW = 12 + levelText.length * 7;
  return (
    <g
      className={cls}
      transform={`translate(${x} ${y})`}
      data-skill-id={skill.id}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      style={{ ["--c" as string]: color }}
    >
      <circle className="sk-node-hit" r={R + 10} />
      {selected && <circle className="sk-node-select" r={R + 6} />}
      <circle className="sk-node-core" r={R} />
      {stats.progress.fraction > 0 && (
        <circle
          className="sk-ring"
          r={R}
          transform="rotate(-90)"
          strokeDasharray={`${Math.max(0.001, stats.progress.fraction * RING_C)} ${RING_C}`}
        />
      )}
      <text className="sk-node-icon" dy="0.05em">
        {skill.icon || "⭐"}
      </text>
      <g className="sk-node-level" transform={`translate(0 ${R})`}>
        <rect x={-pillW / 2} y={-9} width={pillW} height={18} rx={9} />
        <text dy="0.05em">{levelText}</text>
      </g>
      {locked ? (
        <g className="sk-node-lock" transform={`translate(${R * 0.78} ${-R * 0.78})`}>
          <rect x={-10} y={-10} width={44} height={20} rx={10} />
          <path d="M-4 0h8v5.5h-8zM-2.5 0v-2a2.5 2.5 0 0 1 5 0v2" />
          <text x={19} dy="0.05em">
            Lv {skill.requiredLevel}
          </text>
        </g>
      ) : (
        done && (
          <g className="sk-node-done" transform={`translate(${R * 0.78} ${-R * 0.78})`}>
            <circle r={9} />
            <path d="M-3.8 0.2l2.6 2.6 5-5.2" />
          </g>
        )
      )}
      {peers?.map((p, i) => (
        <circle key={p.name + i} className="sk-node-peer" cx={-R * 0.78 - i * 8} cy={-R * 0.78} r={5.5} fill={p.color}>
          <title>{p.name}</title>
        </circle>
      ))}
      <text className="sk-node-label" y={R + 27}>
        {lines.map((l, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 15}>
            {l}
          </tspan>
        ))}
      </text>
      {effects.map((fx) => (
        <circle key={fx.key} className="sk-node-flash" r={R + 6} />
      ))}
    </g>
  );
});

interface Tip {
  id: string;
  x: number;
  y: number;
  below: boolean;
}

export function SkillCanvas({
  skills,
  stats,
  areas,
  areaLevels,
  layout,
  dark,
  selectedId,
  onSelect,
  onMove,
  matches,
  effects,
  peers,
  insets,
  apiRef,
  initialView,
  onViewChange,
  reduceMotion,
}: {
  skills: Skill[];
  stats: Map<string, SkillStats>;
  areas: SkillArea[];
  areaLevels: Map<string, number>;
  layout: TreeLayout;
  dark: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, pos: Point) => void;
  /** When set, other nodes are dimmed. */
  matches: Set<string> | null;
  effects: Effect[];
  peers: Map<string, PeerMark[]>;
  /** Screen space covered by overlays (fit keeps nodes clear of them). */
  insets: { top: number; right: number; bottom: number; left: number };
  apiRef: RefObject<CanvasApi | null>;
  initialView: View | null;
  onViewChange: (v: View) => void;
  reduceMotion: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(initialView ?? { x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [drag, setDrag] = useState<{ id: string; pos: Point } | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [panning, setPanning] = useState(false);
  const dropRef = useRef<{ id: string; pos: Point } | null>(null);
  const shown = useTweened(layout.pos, reduceMotion, dropRef);
  // Hold a dropped node in place until its saved position comes back in the layout.
  useEffect(() => {
    const d = dropRef.current;
    if (!d) return;
    const p = layout.pos.get(d.id);
    if (!p || (Math.abs(p.x - d.pos.x) < 1 && Math.abs(p.y - d.pos.y) < 1)) {
      dropRef.current = null;
      setDrag(null);
    }
  }, [layout]);
  const positions = useMemo(() => {
    if (!drag) return shown;
    const m = new Map(shown);
    m.set(drag.id, drag.pos);
    return m;
  }, [shown, drag]);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  // Camera moves aim at where nodes end up, not where a tween currently has them.
  const targetRef = useRef(layout.pos);
  targetRef.current = layout.pos;
  const bandsRef = useRef<AreaBand[]>(layout.bands);
  bandsRef.current = layout.bands;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  const areaColor = useMemo(() => {
    const m = new Map(areas.map((a) => [a.id, themedColor(a.color, dark)]));
    return (s: Skill) => themedColor(s.color || m.get(s.category) || "#8b8d98", dark);
  }, [areas, dark]);

  const animRef = useRef(0);
  const animateTo = useCallback(
    (target: View, animate = true) => {
      cancelAnimationFrame(animRef.current);
      if (!animate || reduceMotion) {
        setView(target);
        return;
      }
      const from = viewRef.current;
      const start = performance.now();
      const step = (t: number) => {
        const u = clamp((t - start) / 380, 0, 1);
        const e = 1 - Math.pow(1 - u, 3);
        setView({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e });
        if (u < 1) animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    },
    [reduceMotion],
  );

  // Report camera changes (debounced) so the view can remember it.
  useEffect(() => {
    const t = window.setTimeout(() => onViewChange(view), 250);
    return () => window.clearTimeout(t);
  }, [view, onViewChange]);

  const api = useMemo<CanvasApi>(() => {
    const size = () => {
      const r = hostRef.current?.getBoundingClientRect();
      return { w: r?.width ?? 800, h: r?.height ?? 600 };
    };
    return {
      fit: (ids, animate = true) => {
        const pts = ids?.length
          ? ids.map((id) => targetRef.current.get(id)).filter((p): p is Point => !!p)
          : [...targetRef.current.values()];
        const near = ids?.length
          ? bandsRef.current.filter((band) =>
              pts.some((p) => p.x >= band.x0 && p.x <= band.x1 && band.y > p.y && band.y - p.y < GROUND_Y + 20),
            )
          : bandsRef.current;
        const b = layoutBounds(pts, near);
        if (!b) return;
        const { w, h } = size();
        const ins = insetsRef.current;
        const aw = Math.max(120, w - ins.left - ins.right);
        const ah = Math.max(120, h - ins.top - ins.bottom);
        const k = clamp(Math.min(aw / (b.x1 - b.x0), ah / (b.y1 - b.y0), 1.25), MIN_K, MAX_K);
        const cx = (b.x0 + b.x1) / 2;
        const cy = (b.y0 + b.y1) / 2;
        animateTo({ k, x: ins.left + aw / 2 - cx * k, y: ins.top + ah / 2 - cy * k }, animate);
      },
      centerOn: (id) => {
        const p = targetRef.current.get(id);
        if (!p) return;
        const { w, h } = size();
        const ins = insetsRef.current;
        const k = Math.max(viewRef.current.k, 0.8);
        const aw = w - ins.left - ins.right;
        const ah = h - ins.top - ins.bottom;
        animateTo({ k, x: ins.left + aw / 2 - p.x * k, y: ins.top + ah / 2 - p.y * k });
      },
      zoomBy: (factor) => {
        const { w, h } = size();
        const v = viewRef.current;
        const k = clamp(v.k * factor, MIN_K, MAX_K);
        const cx = w / 2;
        const cy = h / 2;
        animateTo({ k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k });
      },
      reveal: (id) => {
        const p = targetRef.current.get(id);
        if (!p) return;
        const { w, h } = size();
        const ins = insetsRef.current;
        const v = viewRef.current;
        const sx = p.x * v.k + v.x;
        const sy = p.y * v.k + v.y;
        const m = 70 * v.k;
        let dx = 0;
        let dy = 0;
        if (sx + m > w - ins.right) dx = w - ins.right - m - sx;
        else if (sx - m < ins.left) dx = ins.left + m - sx;
        if (sy + m > h - ins.bottom) dy = h - ins.bottom - m - sy;
        else if (sy - m < ins.top) dy = ins.top + m - sy;
        if (dx || dy) animateTo({ ...v, x: v.x + dx, y: v.y + dy });
      },
    };
  }, [animateTo]);
  useLayoutEffect(() => {
    apiRef.current = api;
    return () => {
      apiRef.current = null;
    };
  }, [api, apiRef]);

  // First layout with nodes: fit, unless a remembered camera exists.
  const fittedRef = useRef(!!initialView);
  useEffect(() => {
    if (fittedRef.current || !layout.pos.size) return;
    fittedRef.current = true;
    api.fit(undefined, false);
  }, [layout, api]);

  // ---- gestures ------------------------------------------------------------------

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<
    | { type: "pan"; start: Point; view: View; moved: boolean }
    | { type: "node"; id: string; start: Point; origin: Point; moved: boolean }
    | { type: "pinch"; dist: number; mid: Point; view: View }
    | null
  >(null);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = hostRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    gesture.current = {
      type: "pinch",
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      view: viewRef.current,
    };
    setDrag(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    hostRef.current?.setPointerCapture(e.pointerId);
    cancelAnimationFrame(animRef.current);
    setTip(null);
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
    const nodeEl = (e.target as Element).closest?.("[data-skill-id]");
    const id = nodeEl?.getAttribute("data-skill-id");
    if (id) {
      const origin = positionsRef.current.get(id);
      if (origin) gesture.current = { type: "node", id, start: p, origin, moved: false };
    } else {
      gesture.current = { type: "pan", start: p, view: viewRef.current, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = local(e);
    if (!pointers.current.has(e.pointerId)) {
      // Hover (mouse only): tooltip over nodes.
      if (e.pointerType !== "mouse") return;
      const id = (e.target as Element).closest?.("[data-skill-id]")?.getAttribute("data-skill-id");
      if (!id) {
        if (tip) setTip(null);
        return;
      }
      const pos = positionsRef.current.get(id);
      const v = viewRef.current;
      if (pos && tip?.id !== id) {
        const top = pos.y * v.k + v.y - (R + 8) * v.k;
        // Flip below the node when there is no room above (toolbar, quest strip).
        const below = top < insetsRef.current.top + 90;
        setTip({ id, x: pos.x * v.k + v.x, y: below ? pos.y * v.k + v.y + (R + 44) * v.k : top, below });
      }
      return;
    }
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pinch") {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = clamp(g.view.k * (dist / g.dist), MIN_K, MAX_K);
      const wx = (g.mid.x - g.view.x) / g.view.k;
      const wy = (g.mid.y - g.view.y) / g.view.k;
      setView({ k, x: mid.x - wx * k, y: mid.y - wy * k });
      return;
    }
    const dx = p.x - g.start.x;
    const dy = p.y - g.start.y;
    if (!g.moved && Math.hypot(dx, dy) < (e.pointerType === "mouse" ? 4 : 8)) return;
    g.moved = true;
    if (g.type === "pan") {
      setPanning(true);
      setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    } else {
      const k = viewRef.current.k;
      setDrag({ id: g.id, pos: { x: g.origin.x + dx / k, y: g.origin.y + dy / k } });
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.type === "pinch") {
      // Continue as a pan with the remaining finger.
      const rest = [...pointers.current.values()][0];
      gesture.current = rest ? { type: "pan", start: rest, view: viewRef.current, moved: true } : null;
      return;
    }
    gesture.current = null;
    setPanning(false);
    if (!g || cancelled) {
      setDrag(null);
      return;
    }
    if (g.type === "node") {
      if (g.moved) {
        const k = viewRef.current.k;
        const p = local(e);
        const pos = { x: Math.round(g.origin.x + (p.x - g.start.x) / k), y: Math.round(g.origin.y + (p.y - g.start.y) / k) };
        // Keep the dragged position until the saved layout arrives.
        const drop = { id: g.id, pos };
        dropRef.current = drop;
        setDrag(drop);
        onMove(g.id, pos);
        window.setTimeout(() => {
          if (dropRef.current === drop) {
            dropRef.current = null;
            setDrag(null);
          }
        }, 1500);
      } else {
        onSelect(g.id);
      }
    } else if (g.type === "pan" && !g.moved) {
      onSelect(null);
    }
  };

  // Wheel zoom (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelAnimationFrame(animRef.current);
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0018));
      setView((v) => {
        const k = clamp(v.k * factor, MIN_K, MAX_K);
        return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
      });
      setTip(null);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const nodeId = target.getAttribute?.("data-skill-id");
    if (nodeId && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onSelect(nodeId);
      return;
    }
    if (e.key === "Escape") onSelect(null);
    else if (e.key === "+" || e.key === "=") api.zoomBy(1.25);
    else if (e.key === "-" || e.key === "_") api.zoomBy(0.8);
    else if (e.key === "0" || e.key === "f") api.fit();
    else if (e.key.startsWith("Arrow") && !nodeId) {
      e.preventDefault();
      const d = 60;
      const dx = e.key === "ArrowLeft" ? d : e.key === "ArrowRight" ? -d : 0;
      const dy = e.key === "ArrowUp" ? d : e.key === "ArrowDown" ? -d : 0;
      animateTo({ ...viewRef.current, x: viewRef.current.x + dx, y: viewRef.current.y + dy }, false);
    }
  };

  // ---- rendering -----------------------------------------------------------------

  const effectsById = useMemo(() => {
    const m = new Map<string, Effect[]>();
    for (const fx of effects) {
      if (!m.has(fx.id)) m.set(fx.id, []);
      m.get(fx.id)!.push(fx);
    }
    return m;
  }, [effects]);

  const areaById = useMemo(() => new Map(areas.map((a) => [a.id, a])), [areas]);
  const byId = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const related = useMemo(() => {
    if (!selectedId) return null;
    const s = byId.get(selectedId);
    const set = new Set<string>([selectedId, ...(s?.parents ?? [])]);
    for (const c of skills) if (c.parents.includes(selectedId)) set.add(c.id);
    return set;
  }, [selectedId, byId, skills]);

  const edges: React.ReactNode[] = [];
  for (const child of skills) {
    const c = positions.get(child.id);
    const cs = stats.get(child.id);
    if (!c || !cs) continue;
    for (const pid of child.parents) {
      const p = positions.get(pid);
      if (!p || !byId.has(pid)) continue;
      const x1 = p.x;
      const y1 = p.y - R;
      const x2 = c.x;
      const y2 = c.y + R;
      const my = (y1 + y2) / 2;
      const d = `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
      const parentMet = (stats.get(pid)?.level ?? 0) >= child.requiredLevel;
      const on = cs.unlocked;
      const hl = related?.has(child.id) && related?.has(pid) && (child.id === selectedId || pid === selectedId);
      const dim = !!matches && !(matches.has(child.id) && matches.has(pid));
      const color = areaColor(child);
      edges.push(
        <g
          key={`${pid}>${child.id}`}
          className={`sk-edge${on ? " on" : parentMet ? " met" : " off"}${hl ? " hl" : ""}${dim ? " dim" : ""}`}
          style={{ ["--c" as string]: color }}
        >
          <path className="sk-edge-line" d={d} />
        </g>,
      );
    }
  }

  const tipSkill = tip ? byId.get(tip.id) : undefined;
  const tipStats = tip ? stats.get(tip.id) : undefined;
  const k = view.k;

  return (
    <div
      ref={hostRef}
      className={`sk-canvas${panning ? " panning" : ""}${drag ? " dragging" : ""}`}
      tabIndex={0}
      role="application"
      aria-label="Skill tree canvas. Drag to pan, scroll or pinch to zoom, press F to fit."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e)}
      onPointerCancel={(e) => endPointer(e, true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && !pointers.current.size && setTip(null)}
      onKeyDown={onKeyDown}
    >
      <svg className="sk-svg" width="100%" height="100%">
        <defs>
          <pattern
            id="sk-dots"
            width={28}
            height={28}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${k})`}
          >
            <circle cx={1.5} cy={1.5} r={1.3} className="sk-dot" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sk-dots)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
          <g className="sk-ground">
            {layout.bands.map((b) => {
              const ids = [b.areaId, ...b.alsoAreas];
              return (
                <g key={`${b.areaId}:${b.x0}:${b.y}`} className="sk-band">
                  <line x1={b.x0} x2={Math.max(b.x0 + 40, b.x1)} y1={b.y - 16} y2={b.y - 16} />
                  <text x={(b.x0 + b.x1) / 2} y={b.y + 4}>
                    {ids.map((id, i) => {
                      const area = areaById.get(id);
                      const level = areaLevels.get(id) ?? 0;
                      return (
                        <tspan key={id}>
                          {i > 0 && "     "}
                          <tspan className="sk-band-dot" style={{ fill: themedColor(area?.color ?? "#8b8d98", dark) }}>
                            ●{" "}
                          </tspan>
                          {area?.name ?? "Other"}
                          {level > 0 && <tspan className="sk-band-level"> · Lv {level}</tspan>}
                        </tspan>
                      );
                    })}
                  </text>
                </g>
              );
            })}
          </g>
          <g className="sk-edges">{edges}</g>
          <g className="sk-nodes">
            {skills.map((s) => {
              const p = positions.get(s.id);
              const st = stats.get(s.id);
              if (!p || !st) return null;
              return (
                <SkillNode
                  key={s.id}
                  skill={s}
                  stats={st}
                  color={areaColor(s)}
                  x={p.x}
                  y={p.y}
                  selected={s.id === selectedId}
                  dim={!!matches && !matches.has(s.id)}
                  effects={effectsById.get(s.id) ?? NO_EFFECTS}
                  peers={peers.get(s.id)}
                />
              );
            })}
          </g>
        </g>
      </svg>
      {tip && tipSkill && tipStats && !drag && (
        <div className={`sk-tip${tip.below ? " below" : ""}`} style={{ left: tip.x, top: tip.y }} role="status">
          <div className="sk-tip-title">{tipSkill.name}</div>
          <div className="sk-tip-meta">
            Level {tipStats.level} · {tipStats.rank.name}
            {tipStats.progress.next !== null && <> · {fmt(tipStats.progress.next - tipStats.xp)} XP to next</>}
          </div>
          {!tipStats.unlocked && (
            <div className="sk-tip-lock">
              Locked · needs {tipStats.missing.map((m) => `${m.name} level ${m.need} (now ${m.have})`).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const NO_EFFECTS: Effect[] = [];

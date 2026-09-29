// The skill map: every skill as a live map around the six abilities, with
// prerequisite arrows, topics and their parts, learning paths and courses.
// Clicking a skill starts its next lesson; right-click (or press and hold)
// shows its details. See skill-graph.ts for the engine.

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { allLessons, getCurriculum, getProgress } from "../../../../shared/course.ts";
import { displayTitle, getPage, pageMeta } from "../../../../shared/model.ts";
import { allParts, formatModifier, requirementText, skillDone, themedColor } from "../../../../shared/skills.ts";
import { entryGlyph, missingFor, nextLeaf, trail, type SkillMap } from "../../../../shared/skill-map.ts";
import type { Skill } from "../../../../shared/skills.ts";
import { Icon } from "../../../components/ui.tsx";
import { SkillGlyph } from "../SkillGlyph.tsx";
import type { Workspace } from "../../../lib/workspace.ts";
import { fmt, type SkillTreeData } from "../useSkillData.ts";
import { SkillGraph as Engine, type GraphLayout, type SGLink, type SGNode } from "./skill-graph.ts";
import "./skill-graph.css";

/** Camera moves the Skills page asks for. */
export interface CanvasApi {
  fit: (ids?: string[], animate?: boolean) => void;
  centerOn: (id: string) => void;
  zoomBy: (f: number) => void;
  reveal: (id: string) => void;
}

/** A brief highlight on a skill that levelled up. */
export interface Effect {
  key: number;
  id: string;
}

type Status = "all" | "unlocked" | "locked" | "goal" | "branch";

interface Prefs {
  layout: GraphLayout;
  labels: boolean;
  courses: boolean;
}

const PREFS_KEY = "basalt:skill-map";
const DEFAULT_PREFS: Prefs = { layout: "radial", labels: true, courses: true };

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { layout?: string; labels?: boolean; courses?: boolean };
    const layout = saved.layout === "tree" || saved.layout === "clusters" || saved.layout === "radial" ? saved.layout : "radial";
    return { ...DEFAULT_PREFS, ...saved, layout };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Longest chain of links above each node (roots are 0). */
function depths(ids: string[], links: SGLink[]): Map<string, number> {
  const up = new Map<string, string[]>();
  for (const l of links) if (l.kind !== "course" && l.kind !== "related") up.set(l.target, [...(up.get(l.target) ?? []), l.source]);
  const memo = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const d = Math.max(-1, ...(up.get(id) ?? []).map((p) => visit(p, seen))) + 1;
    memo.set(id, d);
    return d;
  };
  for (const id of ids) visit(id, new Set());
  return memo;
}

/** Every skill on the map, general to detail: each topic, then what's inside it. */
function a11yOrder(map: SkillMap) {
  const out: SkillMap["entries"] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    const e = map.byId.get(id);
    if (!e || seen.has(id)) return;
    seen.add(id);
    out.push(e);
    e.children.forEach(walk);
  };
  for (const e of map.entries) if (!e.parent) walk(e.id);
  for (const e of map.entries) walk(e.id);
  return out;
}

const touch = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;

export function SkillGraphView({
  ws,
  data,
  dark,
  selectedId,
  onStart,
  onStartCourse,
  onDetails,
  onAbility,
  onDeselect,
  matches,
  effects,
  insets,
  apiRef,
  busy,
  peers,
  toolsBottom = 12,
  hideTools = false,
  center,
  onCenter,
}: {
  ws: Workspace;
  data: SkillTreeData;
  dark: boolean;
  selectedId: string | null;
  /** Click on a skill: start its next lesson. */
  onStart: (skillId: string) => void;
  onStartCourse: (courseId: string) => void;
  /** Right-click / press and hold on a skill: its details. */
  onDetails: (skillId: string) => void;
  onAbility: (areaId: string) => void;
  onDeselect: () => void;
  matches: Set<string> | null;
  effects: Effect[];
  insets: { top: number; right: number; bottom: number; left: number };
  apiRef: MutableRefObject<CanvasApi | null>;
  /** Skills Claude is planning or writing lessons for. */
  busy: Set<string>;
  /** Skill id → colors of collaborators looking at it. */
  peers: Map<string, string[]>;
  /** How far above the bottom the toolbar sits (clear of a bottom sheet). */
  toolsBottom?: number;
  hideTools?: boolean;
  /** You, in the middle of the radial map. */
  center: { initials: string; color: string; title: string; sub: string };
  /** Click on you in the middle. */
  onCenter: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [status, setStatus] = useState<Status>("all");
  const [branch, setBranch] = useState("");
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [legend, setLegend] = useState(false);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Not remembered; fine.
      }
      return next;
    });

  // Nodes and links from the map: the built-in tree with your skills in it.
  const model = useMemo(() => {
    const nodes: SGNode[] = [];
    const links: SGLink[] = [];
    const map = data.map;
    const areaColor = new Map(data.areas.map((a) => [a.id, themedColor(a.color, dark)]));
    const used = new Set(map.entries.map((e) => e.ability));
    const abilities = data.areas.filter((a) => used.has(a.id) || ["str", "dex", "con", "int", "wis", "cha"].includes(a.id));
    for (const a of abilities) {
      const st = data.sheet.areas.find((x) => x.area.id === a.id);
      nodes.push({
        id: a.id,
        kind: "ability",
        label: a.attribute || a.name.slice(0, 3).toUpperCase(),
        icon: a.icon,
        color: areaColor.get(a.id)!,
        ability: a.id,
        level: st?.level ?? 0,
        progress: 0,
        locked: false,
        goal: false,
        depth: 0,
        sub: st ? `${st.score} (${formatModifier(st.modifier)})` : "10 (+0)",
      });
    }
    // Innermost parts learnt, for a topic's ring.
    const leaves = new Map<string, { done: number; total: number }>();
    const count = (id: string): { done: number; total: number } => {
      const known = leaves.get(id);
      if (known) return known;
      leaves.set(id, { done: 0, total: 0 });
      const e = map.byId.get(id)!;
      const v = e.children.length
        ? e.children.map(count).reduce((a, c) => ({ done: a.done + c.done, total: a.total + c.total }), { done: 0, total: 0 })
        : { done: e.done ? 1 : 0, total: 1 };
      leaves.set(id, v);
      return v;
    };
    // Where a topic "ends": its parts nothing else in it builds on. What needs
    // the topic hangs off those, so the map reads topic → parts → next topic.
    const exits = (id: string): string[] => {
      const inside = map.byId.get(id)?.children ?? [];
      const set = new Set(inside);
      const out = inside.filter((p) => !inside.some((q) => set.has(q) && map.byId.get(q)!.needs.includes(p)));
      return out.length ? out : [id];
    };
    const courseNodes = new Map<string, SGNode>();
    for (const e of map.entries) {
      const s = e.real;
      const st = s ? data.stats.get(s.id) : undefined;
      const color = (s?.color ? themedColor(s.color, dark) : undefined) ?? areaColor.get(e.ability) ?? "#8b8d98";
      const learnt = e.children.length ? count(e.id) : undefined;
      nodes.push({
        id: e.id,
        kind: "skill",
        label: e.name,
        icon: e.icon,
        color,
        ability: abilities.some((a) => a.id === e.ability) ? e.ability : (abilities[0]?.id ?? e.ability),
        level: st?.level ?? 0,
        progress: learnt ? (learnt.total ? learnt.done / learnt.total : 0) : (st?.progress.fraction ?? 0),
        locked: e.locked,
        goal: !!st?.goalReached,
        depth: 0,
        branch: e.branch,
        learnt,
        done: e.done,
        busy: busy.has(e.id),
        peers: peers.get(e.id),
        glyph: entryGlyph(e),
        planned: !s,
        tier: e.tier,
      });
      // What comes first. A topic you need is drawn from its last parts.
      for (const n of e.needs) {
        const need = map.byId.get(n);
        if (!need) continue;
        const missing = st?.missing.some((m) => m.parentId === n);
        const met = e.cat ? need.done : !missing;
        for (const f of need.children.length ? exits(n) : [n]) links.push({ source: f, target: e.id, kind: "prereq", met });
      }
      // Related skills in other trees: linked, not needed.
      for (const r of e.related) if (map.byId.has(r)) links.push({ source: e.id, target: r, kind: "related", met: true });
      // A topic → its parts: drawn to the ones you start with, the rest only shape the layout.
      if (e.parent && map.byId.has(e.parent)) {
        const siblings = new Set(map.byId.get(e.parent)!.children);
        const entry = !e.needs.some((n) => siblings.has(n));
        links.push({ source: e.parent, target: e.id, kind: "part", met: !map.byId.get(e.parent)!.locked, hidden: !entry });
      }
      for (const cid of s?.courseIds ?? []) {
        const page = getPage(ws.doc, cid);
        const c = page && !page.get("deletedAt") ? getCurriculum(page) : null;
        if (!page || !c) continue;
        // A course planned for this skill (named after it) is the skill itself on the map.
        if ((displayTitle(pageMeta(page)) || c.topic).trim().toLowerCase() === s!.name.trim().toLowerCase()) continue;
        const id = `course:${cid}`;
        if (!courseNodes.has(id)) {
          const lessons = allLessons(c);
          const done = lessons.filter((l) => getProgress(page, l.lesson.id).status === "mastered").length;
          courseNodes.set(id, {
            id,
            kind: "course",
            label: displayTitle(pageMeta(page)) || c.topic,
            icon: pageMeta(page).icon || "🎓",
            color,
            ability: e.ability,
            level: 0,
            progress: lessons.length ? done / lessons.length : 0,
            locked: false,
            goal: false,
            depth: 0,
            sub: `${done}/${lessons.length} lessons`,
          });
        }
        links.push({ source: e.id, target: id, kind: "course", met: true });
      }
    }
    nodes.push(...courseNodes.values());
    const depth = depths(
      map.entries.map((e) => e.id),
      links,
    );
    for (const n of nodes) {
      if (n.kind === "skill") n.depth = depth.get(n.id) ?? 0;
      else if (n.kind === "course") {
        const owner = links.find((l) => l.kind === "course" && l.target === n.id)?.source;
        n.depth = (owner ? (depth.get(owner) ?? 0) : 0) + 0.5;
      }
    }
    return { nodes, links, order: abilities.map((a) => a.id) };
  }, [data, dark, ws, busy, peers]);

  // Paths to filter by: the fields, grouped by their area; then paths of your own.
  const branches = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const e of data.map.entries) {
      if (e.tier !== "field") continue;
      const area = e.parent ? data.map.byId.get(e.parent)?.name : undefined;
      groups.set(area ?? "Other", [...(groups.get(area ?? "Other") ?? []), e.name]);
    }
    const catalog = new Set([...groups.values()].flat());
    const own = [...new Set(data.map.entries.map((e) => e.branch).filter((b): b is string => !!b && !catalog.has(b)))].sort();
    const areaNames = new Set(data.map.entries.filter((e) => e.tier === "general").map((e) => e.name));
    if (own.filter((b) => !areaNames.has(b)).length) groups.set("Your paths", own.filter((b) => !areaNames.has(b)));
    return [...groups];
  }, [data.map]);

  // Search / ability filter from the toolbar, plus this view's status and path filters.
  const visibleMatches = useMemo(() => {
    if (!matches && status === "all" && !branch) return null;
    const out = new Set<string>();
    for (const e of data.map.entries) {
      if (matches && !matches.has(e.id)) continue;
      const st = e.real ? data.stats.get(e.real.id) : undefined;
      if (status === "unlocked" && e.locked) continue;
      if (status === "locked" && !e.locked) continue;
      if (status === "goal" && !st?.goalReached) continue;
      if (status === "branch" && !e.branch) continue;
      if (branch && e.branch !== branch) continue;
      out.add(e.id);
      for (const c of e.real?.courseIds ?? []) out.add(`course:${c}`);
    }
    return out;
  }, [matches, status, branch, data]);

  const cbRef = useRef({ onStart, onStartCourse, onDetails, onAbility, onDeselect, onCenter, data, order: model.order });
  cbRef.current = { onStart, onStartCourse, onDetails, onAbility, onDeselect, onCenter, data, order: model.order };

  // The engine lives as long as the canvas.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const e = new Engine(canvas, {
      onSelect: (id) => {
        const cb = cbRef.current;
        if (!id) return cb.onDeselect();
        if (id === "@you") return cb.onCenter();
        if (id.startsWith("course:")) return cb.onStartCourse(id.slice(7));
        if (cb.order.includes(id) && !cb.data.map.byId.has(id)) return cb.onAbility(id);
        cb.onStart(id);
      },
      onDetails: (id) => {
        const cb = cbRef.current;
        if (id.startsWith("course:")) {
          const owner = cb.data.skills.find((s) => s.courseIds.includes(id.slice(7)));
          if (owner) cb.onDetails(owner.id);
          return;
        }
        if (cb.data.map.byId.has(id)) cb.onDetails(id);
      },
      onHover: (id, at) => setHover(id && at ? { id, x: at.x, y: at.y } : null),
    });
    engine.current = e;
    apiRef.current = {
      fit: (ids, animate) => e.fit(ids, animate),
      centerOn: (id) => e.centerOn(id),
      zoomBy: (f) => e.zoomBy(f),
      reveal: (id) => e.reveal(id),
    };
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) e.resize(width, height);
    });
    ro.observe(hostRef.current!);
    return () => {
      ro.disconnect();
      e.destroy();
      engine.current = null;
      apiRef.current = null;
    };
    // The engine is created once; callbacks go through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine.current?.setData(model.nodes, model.links, model.order);
  }, [model]);

  const centerKey = `${center.initials}|${center.color}|${center.title}|${center.sub}`;
  useEffect(() => {
    engine.current?.setOptions({ ...prefs, dark, matches: visibleMatches, selectedId, center });
    // The center is compared by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, dark, visibleMatches, selectedId, centerKey]);

  useEffect(() => {
    engine.current?.setInsets(insets);
  }, [insets]);

  useEffect(() => {
    if (effects.length) engine.current?.pulse(effects.map((f) => f.id));
  }, [effects]);

  useEffect(() => {
    const css = getComputedStyle(hostRef.current!);
    const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
    engine.current?.setTheme({
      text: v("--text", "#1d1d1f"),
      muted: v("--text-muted", "#6e6e73"),
      bg: v("--chrome", "") || v("--bg", dark ? "#1c1c1e" : "#ffffff"),
      accent: v("--accent", "#0a84ff"),
      edge: v("--border-strong", dark ? "#48484a" : "#c7c7cc"),
      gold: dark ? "#f0b93a" : "#e0a100",
      font: v("--font", "system-ui, sans-serif"),
    });
  }, [dark]);

  const nodeById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model]);
  const hovered = hover ? hoverInfo(hover.id, data, model.nodes, ws) : null;
  const sheet = hideTools;

  return (
    <div className="sg-root" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="sg-canvas"
        tabIndex={0}
        aria-label="Skill map. Click a skill to start its next lesson; right-click, or press and hold, for its details. Drag to pan, scroll or pinch to zoom. Keys: arrows pan, plus and minus zoom, F fits, Escape closes details."
        onKeyDown={(ev) => {
          const e = engine.current;
          if (!e) return;
          if (ev.key === "Escape") onDeselect();
          else if (ev.key === "+" || ev.key === "=") e.zoomBy(1.25);
          else if (ev.key === "-" || ev.key === "_") e.zoomBy(0.8);
          else if (ev.key === "0" || ev.key === "f") e.fit();
          else if (ev.key.startsWith("Arrow")) {
            ev.preventDefault();
            e.panBy(ev.key === "ArrowLeft" ? 60 : ev.key === "ArrowRight" ? -60 : 0, ev.key === "ArrowUp" ? 60 : ev.key === "ArrowDown" ? -60 : 0);
          }
        }}
      />

      {/* The map for keyboards and screen readers: every skill, in learning order. Tab moves
          through them (the map follows), Enter starts the next lesson, the context-menu key or
          Shift+F10 shows details. */}
      <ul className="sg-a11y" aria-label="Skills on the map">
        {a11yOrder(data.map).map((e) => {
          const node = nodeById.get(e.id);
          const state = e.locked
            ? "locked"
            : e.done
              ? "learnt"
              : node?.learnt
                ? `${node.learnt.done} of ${node.learnt.total} parts learnt`
                : e.real
                  ? `level ${data.stats.get(e.real.id)?.level ?? 1}`
                  : "not started";
          const parent = e.parent ? data.map.byId.get(e.parent) : undefined;
          return (
            <li key={e.id}>
              <button
                data-skill={e.id}
                onFocus={() => engine.current?.focus(e.id)}
                onBlur={() => engine.current?.focus(null)}
                onClick={() => onStart(e.id)}
                onKeyDown={(ev) => {
                  if (ev.key === "ContextMenu" || (ev.shiftKey && ev.key === "F10")) {
                    ev.preventDefault();
                    onDetails(e.id);
                  }
                }}
              >
                {e.name}, {state}
                {parent ? `, part of ${parent.name}` : ""}. Start the next lesson.
              </button>
            </li>
          );
        })}
      </ul>

      {!sheet && (
        <div className="sg-tools" role="toolbar" aria-label="Map options" style={{ bottom: toolsBottom, maxWidth: `calc(100% - ${insets.right + 24}px)` }}>
          <div className="sg-seg" role="radiogroup" aria-label="Layout">
            {(
              [
                ["radial", "Radial", "An RPG skill tree: you in the middle, every path branching out"],
                ["tree", "Tree", "A column per ability, foundations at the top, each topic's parts below it"],
                ["clusters", "Clusters", "Skills gather around their ability"],
              ] as const
            ).map(([id, label, title]) => (
              <button
                key={id}
                role="radio"
                aria-checked={prefs.layout === id}
                className={prefs.layout === id ? "on" : ""}
                title={title}
                onClick={() => setPrefs({ layout: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <select className="select sg-select" value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Show">
            <option value="all">All skills</option>
            <option value="unlocked">Unlocked</option>
            <option value="locked">Locked</option>
            <option value="goal">Goals reached</option>
            <option value="branch">In a path</option>
          </select>
          {branches.length > 0 && (
            <select className="select sg-select" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Field">
              <option value="">Every field</option>
              {branches.map(([area, list]) => (
                <optgroup key={area} label={area}>
                  {list.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <label className="sg-toggle">
            <input type="checkbox" checked={prefs.courses} onChange={(e) => setPrefs({ courses: e.target.checked })} /> Courses
          </label>
          <label className="sg-toggle">
            <input type="checkbox" checked={prefs.labels} onChange={(e) => setPrefs({ labels: e.target.checked })} /> Labels
          </label>
          <span className="sg-zoom">
            <button className="icon-btn" aria-label="Zoom out" title="Zoom out (−)" onClick={() => engine.current?.zoomBy(0.8)}>
              <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M5 12h14" />
              </svg>
            </button>
            <button className="icon-btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => engine.current?.zoomBy(1.25)}>
              <Icon name="plus" />
            </button>
            <button className="icon-btn" aria-label="Fit the map to the screen" title="Fit (F)" onClick={() => engine.current?.fit()}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
          </span>
          <button className={`icon-btn${legend ? " active" : ""}`} aria-label="What the map shows" aria-expanded={legend} onClick={() => setLegend((l) => !l)}>
            ?
          </button>
        </div>
      )}

      {legend && !sheet && (
        <div className="sg-legend" role="dialog" aria-label="What the map shows" style={{ bottom: toolsBottom + 52 }}>
          <div className="row">
            <strong className="grow">Reading the map</strong>
            <button className="icon-btn" aria-label="Close" onClick={() => setLegend(false)}>
              <Icon name="x" size={14} />
            </button>
          </div>
          <ul>
            <li>
              <span className="sg-key disc" /> A skill: bigger means a higher level, the color is its ability, the ring fills toward the next level.
            </li>
            <li>
              <span className="sg-key topic" /> A topic, like Arithmetic: its parts are what you learn to advance, and its ring shows how many you've learnt.
            </li>
            <li>
              <span className="sg-key dashed" /> Locked: learn what it needs first.
            </li>
            <li>
              <span className="sg-key gold" /> Goal reached.
            </li>
            <li>
              <span className="sg-key arrow" /> What to learn first → what it unlocks. Solid once met, dashed until then.
            </li>
            <li>
              <span className="sg-key hub" /> An ability, with its score and modifier. Click to show only its skills.
            </li>
            <li>
              <span className="sg-key course" /> A course that trains the skill, filling as you finish lessons.
            </li>
            <li>
              <span className="sg-key road" /> A learning path Claude planned for you, named where it starts.
            </li>
            <li>
              <span className="sg-key tier" /> From the general to the detailed: areas (like Formal sciences), their fields (Mathematics), topics
              (Algebra, which branch and join), the steps inside each, then advanced skills after everything they need, from any tree. Nothing is
              skipped. Radial: out from you. Tree: left to right, like an outline. Clusters: each field in its own space, inside its area.
            </li>
            <li>
              <span className="sg-key dashed" /> Light and outlined: planned in Basalt's skill tree, not started yet. Click to start it.
            </li>
          </ul>
          <p className="small faint">
            {touch
              ? "Tap a skill to start its next lesson; press and hold for its details."
              : "Click a skill to start its next lesson; right-click for its details."}{" "}
            Hover a skill to light up its path. Drag to rearrange.
          </p>
        </div>
      )}

      {hovered && hover && (
        <div className="sg-tip" style={{ left: hover.x, top: hover.y }} role="tooltip">
          <div className="sg-tip-head">
            {hovered.glyph ? (
              <SkillGlyph path={hovered.glyph} color={nodeById.get(hover.id)?.color ?? "#8b8d98"} size={24} />
            ) : (
              <span className="sg-tip-icon">{hovered.icon}</span>
            )}
            <strong>{hovered.title}</strong>
          </div>
          {hovered.lines.map((l, i) => (
            <div key={i} className="sg-tip-line">
              {l}
            </div>
          ))}
          {hovered.action && <div className="sg-tip-action">{hovered.action}</div>}
        </div>
      )}
    </div>
  );
}

function hoverInfo(
  id: string,
  data: SkillTreeData,
  nodes: SGNode[],
  ws: Workspace,
): { icon: string; title: string; lines: string[]; action?: string; skill?: Skill; glyph?: string } | null {
  if (id === "@you") {
    const learnt = data.skills.filter((s) => !data.skills.some((x) => x.topic === s.id) && skillDone(ws.doc, data.skills, s, data.stats)).length;
    return {
      icon: "🧙",
      title: `Level ${data.sheet.level} · ${data.sheet.title}`,
      lines: [`${fmt(data.sheet.xp)} XP`, `${learnt} skill${learnt === 1 ? "" : "s"} learnt, ${data.skills.length} on your map`],
      action: `${touch ? "Tap" : "Click"} for your character`,
    };
  }
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  if (node.kind === "ability") {
    const area = data.areas.find((a) => a.id === id);
    const count = data.skills.filter((s) => s.category === id).length;
    return {
      icon: node.icon,
      title: area?.name ?? node.label,
      lines: [`Score ${node.sub}`, `${count} skill${count === 1 ? "" : "s"}`],
      action: "Click to show only these",
    };
  }
  if (node.kind === "course") return { icon: node.icon, title: node.label, lines: [node.sub ?? ""], action: "Click to start its next lesson" };
  const e = data.map.byId.get(id);
  if (!e) return null;
  const verb = touch ? "Tap" : "Click";
  const area = data.areas.find((a) => a.id === e.ability);
  const where = trail(data.map, id)
    .slice(0, -1)
    .map((x) => x.name)
    .join(" › ");
  const needs = e.locked
    ? missingFor(data.map, id)
        .slice(0, 3)
        .map((m) => m.name)
    : [];
  const leaf = e.children.length ? nextLeaf(data.map, id) : undefined;
  const s = e.real;
  const st = s ? data.stats.get(s.id) : undefined;
  if (!s || !st) {
    // Planned: in the built-in tree, not started yet.
    const kind = e.tier === "general" ? "Area" : e.tier === "field" ? "Field" : e.tier === "sub" ? "Topic" : e.tier === "advanced" ? "Advanced" : "Step";
    const lines = [`${area?.attribute ?? area?.name ?? ""} · ${kind} · not started`];
    if (where) lines.push(where);
    if (node.learnt) lines.push(`${node.learnt.total} step${node.learnt.total === 1 ? "" : "s"} inside`);
    if (needs.length) lines.push(`Needs ${needs.join(", ")} first`);
    const action = e.locked ? `${verb} to see what to learn first` : leaf && leaf.id !== id ? `${verb} to start with ${leaf.name}` : `${verb} to start`;
    return { icon: e.icon, title: e.name, lines, action, glyph: node.glyph };
  }
  const lines = [`${area?.attribute ?? area?.name ?? ""} · Level ${st.level} ${st.rank.name}`];
  if (node.learnt) lines.push(`${node.learnt.done} of ${node.learnt.total} parts learnt`);
  else
    lines.push(
      st.progress.next === null
        ? `${fmt(st.xp)} XP · max level`
        : `${fmt(st.xp - st.progress.floor)} / ${fmt(st.progress.next - st.progress.floor)} XP to level ${st.level + 1}`,
    );
  const lessons = s.courseIds.map((c) => data.courses.get(c)).filter((c): c is NonNullable<typeof c> => !!c && c.total > 0);
  if (!node.learnt && lessons.length)
    lines.push(`${lessons.reduce((a, c) => a + c.mastered + c.skipped, 0)} of ${lessons.reduce((a, c) => a + c.total, 0)} lessons done`);
  if (where) lines.push(where);
  if (needs.length) lines.push(`Needs ${needs.join(", ")} first`);
  else if (!st.unlocked) lines.push(`Needs ${st.missing.map((m) => requirementText(m, { now: false })).join(", ")}`);
  if (st.streak.current > 1) lines.push(`${st.streak.current}-day streak`);
  if (s.goalLevel) lines.push(`Goal: level ${s.goalLevel}${st.goalReached ? " ✓" : ""}`);
  if (s.branch && !e.cat) lines.push(`Path: ${s.branch}`);
  let action: string;
  if (e.locked) action = `${verb} to see what to learn first`;
  else if (e.done) action = `Learnt · ${verb.toLowerCase()} to review`;
  else if (leaf) action = leaf.id === id ? `${verb} to start` : `${verb} to continue with ${leaf.name}`;
  else action = lessons.length ? `${verb} to start the next lesson` : `${verb} to plan it and start`;
  return { icon: s.icon, title: s.name, lines, action, skill: s, glyph: node.glyph };
}

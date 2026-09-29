// The skill map: every skill as a live map around the six abilities, with
// prerequisite arrows, topics and their parts, learning paths and courses.
// Clicking a skill starts its next lesson; right-click (or press and hold)
// shows its details. See skill-graph.ts for the engine.

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { allLessons, getCurriculum, getProgress } from "../../../../shared/course.ts";
import { displayTitle, getPage, pageMeta } from "../../../../shared/model.ts";
import { allParts, formatModifier, learningOrder, requirementText, skillDone, themedColor, topicProgress } from "../../../../shared/skills.ts";
import { Icon } from "../../../components/ui.tsx";
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

const PREFS_KEY = "basalt:skill-graph";
const DEFAULT_PREFS: Prefs = { layout: "tree", labels: true, courses: true };

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { layout?: string; labels?: boolean; courses?: boolean };
    // "Flow" became the Tree layout.
    const layout = saved.layout === "flow" ? "tree" : saved.layout;
    return { ...DEFAULT_PREFS, ...saved, layout: layout === "clusters" || layout === "rings" || layout === "tree" ? layout : "tree" };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Longest chain of links above each node (roots are 0). */
function depths(ids: string[], links: SGLink[]): Map<string, number> {
  const up = new Map<string, string[]>();
  for (const l of links) if (l.kind !== "course") up.set(l.target, [...(up.get(l.target) ?? []), l.source]);
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

  // Nodes and links from the skill tree.
  const model = useMemo(() => {
    const nodes: SGNode[] = [];
    const links: SGLink[] = [];
    const areaColor = new Map(data.areas.map((a) => [a.id, themedColor(a.color, dark)]));
    const used = new Set(data.skills.map((s) => s.category));
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
    const skills = data.skills;
    const parts = new Map<string, typeof skills>();
    for (const s of skills) if (s.topic && data.byId.has(s.topic)) parts.set(s.topic, [...(parts.get(s.topic) ?? []), s]);
    // Where a topic "ends": its parts nothing else in it builds on. What needs
    // the topic hangs off those, so the map reads topic → parts → next topic.
    const exits = (topicId: string): string[] => {
      const inside = parts.get(topicId) ?? [];
      const ids = new Set(inside.map((p) => p.id));
      const out = inside.filter((p) => !inside.some((q) => q.parents.includes(p.id) && ids.has(q.id))).map((p) => p.id);
      return out.length ? out : [topicId];
    };
    const courseNodes = new Map<string, SGNode>();
    for (const s of skills) {
      const st = data.stats.get(s.id);
      const color = areaColor.get(s.category) ?? "#8b8d98";
      const inside = parts.get(s.id);
      const learnt = inside ? topicProgress(ws.doc, skills, s.id, data.stats) : undefined;
      nodes.push({
        id: s.id,
        kind: "skill",
        label: s.name,
        icon: s.icon,
        color,
        ability: abilities.some((a) => a.id === s.category) ? s.category : (abilities[0]?.id ?? s.category),
        level: st?.level ?? 1,
        progress: learnt ? (learnt.total ? learnt.done / learnt.total : 0) : (st?.progress.fraction ?? 0),
        locked: !(st?.unlocked ?? true),
        goal: !!st?.goalReached,
        depth: 0,
        branch: s.branch,
        learnt,
        done: skillDone(ws.doc, skills, s, data.stats),
        busy: busy.has(s.id),
        peers: peers.get(s.id),
      });
      // Prerequisites. A topic you need is drawn from its last parts.
      for (const p of s.parents) {
        if (!data.byId.has(p)) continue;
        const missing = st?.missing.find((m) => m.parentId === p);
        const from = parts.has(p) ? exits(p) : [p];
        for (const f of from) links.push({ source: f, target: s.id, kind: "prereq", met: !missing });
      }
      // A topic → its parts: drawn to the ones you start with, the rest only shape the layout.
      if (s.topic && data.byId.has(s.topic)) {
        const siblings = new Set((parts.get(s.topic) ?? []).map((x) => x.id));
        const entry = !s.parents.some((p) => siblings.has(p));
        links.push({ source: s.topic, target: s.id, kind: "part", met: data.stats.get(s.topic)?.unlocked ?? true, hidden: !entry });
      }
      for (const cid of s.courseIds) {
        const page = getPage(ws.doc, cid);
        const c = page && !page.get("deletedAt") ? getCurriculum(page) : null;
        if (!page || !c) continue;
        // A course planned for this skill (named after it) is the skill itself on the map.
        if ((displayTitle(pageMeta(page)) || c.topic).trim().toLowerCase() === s.name.trim().toLowerCase()) continue;
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
            ability: s.category,
            level: 0,
            progress: lessons.length ? done / lessons.length : 0,
            locked: false,
            goal: false,
            depth: 0,
            sub: `${done}/${lessons.length} lessons`,
          });
        }
        links.push({ source: s.id, target: id, kind: "course", met: true });
      }
    }
    nodes.push(...courseNodes.values());
    const depth = depths(
      skills.map((s) => s.id),
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

  const branches = useMemo(() => [...new Set(data.skills.map((s) => s.branch).filter((b): b is string => !!b))].sort(), [data.skills]);

  // Search / ability filter from the toolbar, plus this view's status and path filters.
  const visibleMatches = useMemo(() => {
    if (!matches && status === "all" && !branch) return null;
    const out = new Set<string>();
    for (const s of data.skills) {
      if (matches && !matches.has(s.id)) continue;
      const st = data.stats.get(s.id);
      if (status === "unlocked" && !st?.unlocked) continue;
      if (status === "locked" && st?.unlocked) continue;
      if (status === "goal" && !st?.goalReached) continue;
      if (status === "branch" && !s.branch) continue;
      if (branch && s.branch !== branch) continue;
      out.add(s.id);
      for (const c of s.courseIds) out.add(`course:${c}`);
    }
    return out;
  }, [matches, status, branch, data]);

  const cbRef = useRef({ onStart, onStartCourse, onDetails, onAbility, onDeselect, data, order: model.order });
  cbRef.current = { onStart, onStartCourse, onDetails, onAbility, onDeselect, data, order: model.order };

  // The engine lives as long as the canvas.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const e = new Engine(canvas, {
      onSelect: (id) => {
        const cb = cbRef.current;
        if (!id) return cb.onDeselect();
        if (id.startsWith("course:")) return cb.onStartCourse(id.slice(7));
        if (cb.order.includes(id) && !cb.data.byId.has(id)) return cb.onAbility(id);
        cb.onStart(id);
      },
      onDetails: (id) => {
        const cb = cbRef.current;
        if (id.startsWith("course:")) {
          const owner = cb.data.skills.find((s) => s.courseIds.includes(id.slice(7)));
          if (owner) cb.onDetails(owner.id);
          return;
        }
        if (cb.data.byId.has(id)) cb.onDetails(id);
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

  useEffect(() => {
    engine.current?.setOptions({ ...prefs, dark, matches: visibleMatches, selectedId });
  }, [prefs, dark, visibleMatches, selectedId]);

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
        {learningOrder(data.skills).map((s) => {
          const node = nodeById.get(s.id);
          const st = data.stats.get(s.id);
          const state = !st?.unlocked
            ? "locked"
            : node?.done
              ? "learnt"
              : node?.learnt
                ? `${node.learnt.done} of ${node.learnt.total} parts learnt`
                : `level ${st.level}`;
          return (
            <li key={s.id}>
              <button
                data-skill={s.id}
                onFocus={() => engine.current?.focus(s.id)}
                onBlur={() => engine.current?.focus(null)}
                onClick={() => onStart(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                    e.preventDefault();
                    onDetails(s.id);
                  }
                }}
              >
                {s.name}, {state}
                {s.topic && data.byId.has(s.topic) ? `, part of ${data.byId.get(s.topic)!.name}` : ""}. Start the next lesson.
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
                ["tree", "Tree", "A column per ability, foundations at the top, each topic's parts below it"],
                ["clusters", "Clusters", "Skills gather around their ability"],
                ["rings", "Rings", "Abilities in the middle, each skill further out the deeper it is"],
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
            <select className="select sg-select" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Path">
              <option value="">Every path</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
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
              <span className="sg-key tier" /> Tree and Rings: tiers, how deep a skill is in its path.
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
            <span className="sg-tip-icon">{hovered.icon}</span>
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

function hoverInfo(id: string, data: SkillTreeData, nodes: SGNode[], ws: Workspace): { icon: string; title: string; lines: string[]; action?: string } | null {
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
  const s = data.byId.get(id);
  const st = data.stats.get(id);
  if (!s || !st) return null;
  const area = data.areas.find((a) => a.id === s.category);
  const lines = [`${area?.attribute ?? area?.name ?? ""} · Level ${st.level} ${st.rank.name}`];
  const inside = data.skills.filter((x) => x.topic === s.id);
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
  if (s.topic && data.byId.has(s.topic)) lines.push(`Part of ${data.byId.get(s.topic)!.name}`);
  if (!st.unlocked) lines.push(`Needs ${st.missing.map((m) => requirementText(m, { now: false })).join(", ")}`);
  if (st.streak.current > 1) lines.push(`${st.streak.current}-day streak`);
  if (s.goalLevel) lines.push(`Goal: level ${s.goalLevel}${st.goalReached ? " ✓" : ""}`);
  if (s.branch) lines.push(`Path: ${s.branch}`);
  const verb = touch ? "Tap" : "Click";
  let action: string;
  if (!st.unlocked) action = `${verb} to see what to learn first`;
  else if (node.done) action = `Learnt · ${verb.toLowerCase()} to review`;
  else if (inside.length) {
    const hasParts = (p: { id: string }) => data.skills.some((x) => x.topic === p.id);
    const next = allParts(data.skills, s.id).find(
      (p) => !hasParts(p) && data.stats.get(p.id)?.unlocked !== false && !skillDone(ws.doc, data.skills, p, data.stats),
    );
    action = next ? `${verb} to continue with ${next.name}` : `${verb} to start`;
  } else action = lessons.length ? `${verb} to start the next lesson` : `${verb} to plan it and start`;
  return { icon: s.icon, title: s.name, lines, action };
}

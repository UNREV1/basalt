// The Skills page's graph: every skill as a live, force-directed map around
// the six abilities, with prerequisite arrows, learning branches, courses,
// and the whole path of any skill lit up on hover. See skill-graph.ts.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  allLessons,
  getCurriculum,
  getProgress,
} from "../../../../shared/course.ts";
import { displayTitle, getPage, pageMeta } from "../../../../shared/model.ts";
import {
  formatModifier,
  themedColor,
  type Skill,
} from "../../../../shared/skills.ts";
import { Icon } from "../../../components/ui.tsx";
import { useApp } from "../../../lib/hooks.ts";
import type { Workspace } from "../../../lib/workspace.ts";
import type { CanvasApi, Effect } from "../SkillCanvas.tsx";
import { fmt, type SkillTreeData } from "../useSkillData.ts";
import {
  SkillGraph as Engine,
  type GraphLayout,
  type SGLink,
  type SGNode,
} from "./skill-graph.ts";
import "./skill-graph.css";

type Status = "all" | "unlocked" | "locked" | "goal" | "branch";

interface Prefs {
  layout: GraphLayout;
  labels: boolean;
  courses: boolean;
}

const PREFS_KEY = "basalt:skill-graph";

function loadPrefs(): Prefs {
  try {
    return {
      layout: "clusters",
      labels: true,
      courses: true,
      ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}"),
    };
  } catch {
    return { layout: "clusters", labels: true, courses: true };
  }
}

/** Longest prerequisite chain above each skill (roots are 0). */
function depths(skills: Skill[]): Map<string, number> {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const memo = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const s = byId.get(id);
    const d = s
      ? Math.max(
          -1,
          ...s.parents.filter((p) => byId.has(p)).map((p) => visit(p, seen)),
        ) + 1
      : 0;
    memo.set(id, d);
    return d;
  };
  for (const s of skills) visit(s.id, new Set());
  return memo;
}

export function SkillGraphView({
  ws,
  data,
  dark,
  selectedId,
  onSelect,
  onAbility,
  matches,
  effects,
  insets,
  apiRef,
}: {
  ws: Workspace;
  data: SkillTreeData;
  dark: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAbility: (areaId: string) => void;
  matches: Set<string> | null;
  effects: Effect[];
  insets: { top: number; right: number; bottom: number; left: number };
  apiRef: MutableRefObject<CanvasApi | null>;
}) {
  const { openPage } = useApp();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [status, setStatus] = useState<Status>("all");
  const [branch, setBranch] = useState("");
  const [hover, setHover] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
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
    const depth = depths(data.skills);
    const areaColor = new Map(
      data.areas.map((a) => [a.id, themedColor(a.color, dark)]),
    );
    const used = new Set(data.skills.map((s) => s.category));
    const abilities = data.areas.filter(
      (a) =>
        used.has(a.id) ||
        ["str", "dex", "con", "int", "wis", "cha"].includes(a.id),
    );
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
    const courseNodes = new Map<string, SGNode>();
    for (const s of data.skills) {
      const st = data.stats.get(s.id);
      const color = areaColor.get(s.category) ?? "#8b8d98";
      nodes.push({
        id: s.id,
        kind: "skill",
        label: s.name,
        icon: s.icon,
        color,
        ability: abilities.some((a) => a.id === s.category)
          ? s.category
          : (abilities[0]?.id ?? s.category),
        level: st?.level ?? 1,
        progress: st?.progress.fraction ?? 0,
        locked: !(st?.unlocked ?? true),
        goal: !!st?.goalReached,
        depth: depth.get(s.id) ?? 0,
        branch: s.branch,
      });
      for (const p of s.parents) {
        if (!data.byId.has(p)) continue;
        const parentLevel = data.stats.get(p)?.level ?? 1;
        links.push({
          source: p,
          target: s.id,
          kind: "prereq",
          met: parentLevel >= s.requiredLevel,
        });
      }
      for (const cid of s.courseIds) {
        const page = getPage(ws.doc, cid);
        const c = page && !page.get("deletedAt") ? getCurriculum(page) : null;
        if (!page || !c) continue;
        const id = `course:${cid}`;
        if (!courseNodes.has(id)) {
          const lessons = allLessons(c);
          const done = lessons.filter(
            (l) => getProgress(page, l.lesson.id).status === "mastered",
          ).length;
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
            depth: (depth.get(s.id) ?? 0) + 0.5,
            sub: `${done}/${lessons.length} lessons`,
          });
        }
        links.push({ source: s.id, target: id, kind: "course", met: true });
      }
    }
    nodes.push(...courseNodes.values());
    return { nodes, links, order: abilities.map((a) => a.id) };
  }, [data, dark, ws]);

  const branches = useMemo(
    () =>
      [
        ...new Set(
          data.skills.map((s) => s.branch).filter((b): b is string => !!b),
        ),
      ].sort(),
    [data.skills],
  );

  // Search / ability filter from the toolbar, plus this view's status and branch filters.
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

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onAbilityRef = useRef(onAbility);
  onAbilityRef.current = onAbility;
  const openPageRef = useRef(openPage);
  openPageRef.current = openPage;
  const dataRef = useRef(data);
  dataRef.current = data;
  const orderRef = useRef(model.order);
  orderRef.current = model.order;

  // The engine lives as long as the canvas.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const e = new Engine(canvas, {
      onSelect: (id) => {
        if (!id) return onSelectRef.current(null);
        if (id.startsWith("course:")) return openPageRef.current(id.slice(7));
        if (orderRef.current.includes(id) && !dataRef.current.byId.has(id))
          return onAbilityRef.current(id);
        onSelectRef.current(id);
      },
      onOpen: (id) => {
        if (id.startsWith("course:")) return openPageRef.current(id.slice(7));
        const s = dataRef.current.byId.get(id);
        if (s?.pageId) openPageRef.current(s.pageId);
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
    // The engine is created once; callbacks go through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engine.current?.setData(model.nodes, model.links, model.order);
  }, [model]);

  useEffect(() => {
    engine.current?.setOptions({
      ...prefs,
      dark,
      matches: visibleMatches,
      selectedId,
    });
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

  const hovered = hover ? hoverInfo(hover.id, data, model.nodes) : null;
  // On a phone the skill panel is a bottom sheet over the toolbar.
  const sheet = insets.bottom > 120;

  return (
    <div className="sg-root" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="sg-canvas"
        tabIndex={0}
        aria-label="Skill graph. Drag to pan, scroll or pinch to zoom, click a skill for details, double-click to open it. Keys: arrows pan, plus and minus zoom, F fits, Escape deselects."
        onKeyDown={(ev) => {
          const e = engine.current;
          if (!e) return;
          if (ev.key === "Escape") onSelect(null);
          else if (ev.key === "+" || ev.key === "=") e.zoomBy(1.25);
          else if (ev.key === "-" || ev.key === "_") e.zoomBy(0.8);
          else if (ev.key === "0" || ev.key === "f") e.fit();
          else if (ev.key.startsWith("Arrow")) {
            ev.preventDefault();
            e.panBy(
              ev.key === "ArrowLeft" ? 60 : ev.key === "ArrowRight" ? -60 : 0,
              ev.key === "ArrowUp" ? 60 : ev.key === "ArrowDown" ? -60 : 0,
            );
          }
        }}
      />

      {!sheet && (
        <div className="sg-tools" role="toolbar" aria-label="Graph options">
          <div className="sg-seg" role="radiogroup" aria-label="Layout">
            {(
              [
                ["clusters", "Clusters", "Skills gather around their ability"],
                [
                  "flow",
                  "Flow",
                  "A column per ability, foundations at the top, advanced tiers below",
                ],
                [
                  "rings",
                  "Rings",
                  "Abilities in the middle, each skill further out the deeper it is",
                ],
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
          <select
            className="select sg-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            aria-label="Show"
          >
            <option value="all">All skills</option>
            <option value="unlocked">Unlocked</option>
            <option value="locked">Locked</option>
            <option value="goal">Goals reached</option>
            <option value="branch">In a path</option>
          </select>
          {branches.length > 0 && (
            <select
              className="select sg-select"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              aria-label="Path"
            >
              <option value="">Every path</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
          <label className="sg-toggle">
            <input
              type="checkbox"
              checked={prefs.courses}
              onChange={(e) => setPrefs({ courses: e.target.checked })}
            />{" "}
            Courses
          </label>
          <label className="sg-toggle">
            <input
              type="checkbox"
              checked={prefs.labels}
              onChange={(e) => setPrefs({ labels: e.target.checked })}
            />{" "}
            Labels
          </label>
          <span className="sg-zoom">
            <button
              className="icon-btn"
              aria-label="Zoom out"
              title="Zoom out (−)"
              onClick={() => engine.current?.zoomBy(0.8)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M5 12h14" />
              </svg>
            </button>
            <button
              className="icon-btn"
              aria-label="Zoom in"
              title="Zoom in (+)"
              onClick={() => engine.current?.zoomBy(1.25)}
            >
              <Icon name="plus" />
            </button>
            <button
              className="icon-btn"
              aria-label="Fit the graph to the screen"
              title="Fit (F)"
              onClick={() => engine.current?.fit()}
            >
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
          <button
            className={`icon-btn${legend ? " active" : ""}`}
            aria-label="What the graph shows"
            aria-expanded={legend}
            onClick={() => setLegend((l) => !l)}
          >
            ?
          </button>
        </div>
      )}

      {legend && !sheet && (
        <div
          className="sg-legend"
          role="dialog"
          aria-label="What the graph shows"
        >
          <div className="row">
            <strong className="grow">Reading the graph</strong>
            <button
              className="icon-btn"
              aria-label="Close"
              onClick={() => setLegend(false)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
          <ul>
            <li>
              <span className="sg-key disc" /> A skill: bigger means a higher
              level, the color is its ability, the ring fills toward the next
              level.
            </li>
            <li>
              <span className="sg-key dashed" /> Locked: its prerequisites
              aren't at the level they need yet.
            </li>
            <li>
              <span className="sg-key gold" /> Goal reached.
            </li>
            <li>
              <span className="sg-key arrow" /> Prerequisite → what it unlocks.
              Solid once met, dashed until then.
            </li>
            <li>
              <span className="sg-key hub" /> An ability, with its score and
              modifier. Click to show only its skills.
            </li>
            <li>
              <span className="sg-key course" /> A course that trains the skill,
              filling as you finish lessons.
            </li>
            <li>
              <span className="sg-key road" /> A learning path Claude mapped for
              one of your goals, named where it starts.
            </li>
            <li>
              <span className="sg-key tier" /> Flow and Rings: tiers, how many
              prerequisites deep a skill is.
            </li>
          </ul>
          <p className="small faint">
            Hover or click a skill to light up its whole path. Double-click to
            open it. Drag to rearrange.
          </p>
        </div>
      )}

      {hovered && hover && (
        <div
          className="sg-tip"
          style={{ left: hover.x, top: hover.y }}
          role="tooltip"
        >
          <div className="sg-tip-head">
            <span className="sg-tip-icon">{hovered.icon}</span>
            <strong>{hovered.title}</strong>
          </div>
          {hovered.lines.map((l, i) => (
            <div key={i} className="sg-tip-line">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function hoverInfo(
  id: string,
  data: SkillTreeData,
  nodes: SGNode[],
): { icon: string; title: string; lines: string[] } | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  if (node.kind === "ability") {
    const area = data.areas.find((a) => a.id === id);
    const count = data.skills.filter((s) => s.category === id).length;
    return {
      icon: node.icon,
      title: area?.name ?? node.label,
      lines: [
        `Score ${node.sub}`,
        `${count} skill${count === 1 ? "" : "s"}`,
        "Click to show only these",
      ],
    };
  }
  if (node.kind === "course")
    return {
      icon: node.icon,
      title: node.label,
      lines: [node.sub ?? "", "Click to open the course"],
    };
  const s = data.byId.get(id);
  const st = data.stats.get(id);
  if (!s || !st) return null;
  const area = data.areas.find((a) => a.id === s.category);
  const lines = [
    `${area?.attribute ?? area?.name ?? ""} · Level ${st.level} ${st.rank.name}`,
  ];
  lines.push(
    st.progress.next === null
      ? `${fmt(st.xp)} XP · max level`
      : `${fmt(st.xp - st.progress.floor)} / ${fmt(st.progress.next - st.progress.floor)} XP to level ${st.level + 1}`,
  );
  if (!st.unlocked)
    lines.push(
      `Needs ${st.missing.map((m) => `${m.name} level ${m.need}`).join(", ")}`,
    );
  if (st.streak.current > 1) lines.push(`${st.streak.current}-day streak`);
  if (s.goalLevel)
    lines.push(`Goal: level ${s.goalLevel}${st.goalReached ? " ✓" : ""}`);
  if (s.branch) lines.push(`Path: ${s.branch}`);
  return { icon: s.icon, title: s.name, lines };
}

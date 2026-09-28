// Real-life skill tree ("life RPG"): skills as nodes with prerequisites,
// levels, XP and ranks, each training one of six D&D abilities, progressing
// from real practice, quests and AI-tutor courses.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RANKS, updateSkill, listSkills, deleteSkill, ensureSkillPages, type SkillStats } from "../../../shared/skills.ts";
import { aiAvailable } from "../../lib/ai.ts";
import { useApp, useMediaQuery, usePeers } from "../../lib/hooks.ts";
import { useSettings } from "../../lib/settings.ts";
import { useTheme } from "../../lib/theme.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon, Menu, Modal, type Anchor, type MenuItem } from "../../components/ui.tsx";
import { OverviewView, QuestCheck } from "./Overview.tsx";
import { GenerateTreeModal } from "./GenerateTree.tsx";
import { layoutTree, type Point } from "./layout.ts";
import { SkillCanvas, type CanvasApi, type Effect, type PeerMark, type View } from "./SkillCanvas.tsx";
import { AddSkillModal, AreasModal, applyTemplate, TemplateGrid, TemplatesModal } from "./SkillDialogs.tsx";
import { SkillPanel } from "./SkillPanel.tsx";
import { fmt, plural, useSkillTree } from "./useSkillData.ts";
import type { SkillTemplate } from "./templates.ts";
import { takeSkillFocus } from "./focus.ts";
import "./skills.css";

type Tab = "tree" | "overview";

interface Remembered {
  tab?: Tab;
  view?: View;
}

function loadRemembered(wsId: string): Remembered {
  try {
    return JSON.parse(localStorage.getItem(`basalt:skills:${wsId}`) ?? "{}") as Remembered;
  } catch {
    return {};
  }
}

function saveRemembered(wsId: string, patch: Remembered) {
  try {
    localStorage.setItem(`basalt:skills:${wsId}`, JSON.stringify({ ...loadRemembered(wsId), ...patch }));
  } catch {
    // Storage may be unavailable (private mode); remembering the camera is optional.
  }
}

function openAiSettings() {
  window.dispatchEvent(new CustomEvent("basalt:open-settings", { detail: { tab: "ai" } }));
}

export default function SkillTreeView({ ws }: { ws: Workspace }) {
  const { toast } = useApp();
  const data = useSkillTree(ws);
  const settings = useSettings();
  const hasAi = useMemo(() => aiAvailable(), [settings.anthropicKey]);
  const dark = useTheme() === "dark";
  const phone = useMediaQuery("(max-width: 720px)");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const remembered = useMemo(() => loadRemembered(ws.id), [ws.id]);

  const [tab, setTabState] = useState<Tab>(remembered.tab === "overview" ? "overview" : "tree");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [adding, setAdding] = useState<{ parentId?: string } | null>(null);
  const [modal, setModal] = useState<"areas" | "templates" | "generate" | "archived" | null>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [legend, setLegend] = useState(false);
  const [effects, setEffects] = useState<Effect[]>([]);
  const apiRef = useRef<CanvasApi | null>(null);
  const pending = useRef<{ fit?: string[] | "all"; reveal?: string; version: number } | null>(null);

  const setTab = (t: Tab) => {
    setTabState(t);
    saveRemembered(ws.id, { tab: t });
  };

  const onViewChange = useCallback((v: View) => saveRemembered(ws.id, { view: v }), [ws.id]);

  // Every skill is a page; older skills get theirs here.
  useEffect(() => ensureSkillPages(ws.doc), [ws]);

  // Arriving from a skill page's "Tree" button.
  useEffect(() => {
    const id = takeSkillFocus();
    if (id && data.byId.has(id)) select(id);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The selection disappears if the skill is deleted or archived elsewhere.
  useEffect(() => {
    if (selectedId && !data.byId.has(selectedId)) setSelectedId(null);
  }, [data, selectedId]);

  // Presence: show which skill each collaborator is looking at.
  useEffect(() => {
    ws.setPresence({ skillsSelection: selectedId });
  }, [ws, selectedId]);
  useEffect(() => () => ws.setPresence({ skillsSelection: null }), [ws]);
  const peers = usePeers(ws);
  const peerMarks = useMemo(() => {
    const m = new Map<string, PeerMark[]>();
    for (const p of peers) {
      const id = p.state.skillsSelection;
      if (typeof id !== "string") continue;
      if (!m.has(id)) m.set(id, []);
      m.get(id)!.push({ name: p.state.user.name, color: p.state.user.color });
    }
    return m;
  }, [peers]);

  // A brief highlight on skills that level up (local or remote changes).
  const prevStats = useRef<Map<string, SkillStats> | null>(null);
  const fxKey = useRef(0);
  useEffect(() => {
    const prev = prevStats.current;
    prevStats.current = data.stats;
    if (!prev) return;
    const added: Effect[] = [];
    for (const [id, st] of data.stats) {
      const before = prev.get(id);
      if (!before) continue;
      if (st.level > before.level) added.push({ key: ++fxKey.current, id });
    }
    if (!added.length) return;
    setEffects((fx) => [...fx, ...added]);
    const keys = new Set(added.map((a) => a.key));
    window.setTimeout(() => setEffects((fx) => fx.filter((f) => !keys.has(f.key))), 1500);
  }, [data.stats]);

  const layout = useMemo(() => layoutTree(data.skills, data.areas.map((a) => a.id), phone ? 0.75 : 1.7), [data.skills, data.areas, phone]);
  const areaLevels = useMemo(() => new Map(data.sheet.areas.map((a) => [a.area.id, a.level])), [data.sheet]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q && !areaFilter) return null;
    const set = new Set<string>();
    for (const s of data.skills) {
      if (areaFilter && s.category !== areaFilter) continue;
      if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q)) continue;
      set.add(s.id);
    }
    return set;
  }, [search, areaFilter, data.skills]);

  const panelOpen = !!selectedId && tab === "tree";
  const questStrip = tab === "tree" && data.quests.length > 0;
  const insets = useMemo(
    () => ({
      top: questStrip ? 56 : 12,
      right: panelOpen && !phone ? 408 : 12,
      bottom: panelOpen && phone ? Math.round(window.innerHeight * 0.55) : 56,
      left: 12,
    }),
    [questStrip, panelOpen, phone],
  );

  // Deferred camera moves, run once the skills they target are laid out
  // (new skills arrive with the next data snapshot).
  useEffect(() => {
    const p = pending.current;
    const api = apiRef.current;
    if (!p || !api) return;
    const ids = [...(Array.isArray(p.fit) ? p.fit : []), ...(p.reveal ? [p.reveal] : [])];
    const ready = p.fit === "all" ? data.version > p.version && layout.pos.size > 0 : ids.every((id) => layout.pos.has(id));
    if (!ready) return;
    pending.current = null;
    requestAnimationFrame(() => {
      if (p.fit) api.fit(p.fit === "all" ? undefined : p.fit);
      else if (p.reveal) api.reveal(p.reveal);
    });
  });

  const queueCamera = (move: { fit?: string[] | "all"; reveal?: string }) => {
    pending.current = { ...move, version: data.version };
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) {
      if (tab !== "tree") setTab("tree");
      queueCamera({ reveal: id });
    }
  };

  const onMove = useCallback((id: string, pos: Point) => updateSkill(ws.doc, id, { pos }), [ws]);

  const tidy = () => {
    const withPos = listSkills(ws.doc, { includeArchived: true }).filter((s) => s.pos);
    ws.doc.transact(() => {
      for (const s of withPos) updateSkill(ws.doc, s.id, { pos: undefined });
    });
    queueCamera({ fit: "all" });
    toast("Layout reset");
  };

  const afterCreate = (ids: string[]) => {
    setTab("tree");
    setSelectedId(null);
    setAreaFilter("");
    if (ids.length) queueCamera({ fit: data.skills.length ? ids : "all" });
  };

  const pickTemplate = (t: SkillTemplate) => {
    const ids = [...applyTemplate(ws, t).values()];
    toast(`Added ${ids.length} skills from “${t.name}”`);
    afterCreate(ids);
  };

  const showArea = (areaId: string) => {
    setAreaFilter(areaId);
    setTab("tree");
    const ids = data.skills.filter((s) => s.category === areaId).map((s) => s.id);
    if (ids.length) queueCamera({ fit: ids });
  };

  const hasManualPositions = data.skills.some((s) => s.pos);
  const menuItems: MenuItem[] = [
    { label: "Add from template…", icon: <Icon name="copy" size={15} />, onClick: () => setModal("templates") },
    { label: "Edit abilities…", icon: <Icon name="edit" size={15} />, onClick: () => setModal("areas") },
    { label: "Reset layout", icon: <Icon name="graph" size={15} />, onClick: tidy, disabled: !hasManualPositions },
    { label: `Archived skills${data.archived.length ? ` (${data.archived.length})` : ""}`, icon: <Icon name="trash" size={15} />, onClick: () => setModal("archived"), disabled: !data.archived.length },
  ];

  const empty = data.skills.length === 0;
  const selected = selectedId ? data.byId.get(selectedId) : undefined;

  const aiButton = hasAi ? (
    <button className="btn sk-ai-btn" onClick={() => setModal("generate")} title="Describe a goal and let Claude design a tree">
      <Icon name="sparkle" size={15} />
      <span className="sk-hide-narrow">Generate with AI</span>
    </button>
  ) : (
    <button className="btn btn-ghost sk-ai-hint" onClick={openAiSettings} title="Add your Anthropic API key in Settings → AI to generate trees with Claude">
      <Icon name="sparkle" size={15} />
      <span className="sk-hide-narrow">Set up AI</span>
    </button>
  );

  return (
    <div className="sk-root">
      <div className="sk-toolbar">
        <div className="tabs sk-tabs" role="tablist" aria-label="Skill views">
          <button role="tab" aria-selected={tab === "tree"} className={`tab${tab === "tree" ? " active" : ""}`} onClick={() => setTab("tree")}>
            <Icon name="graph" size={15} />
            Tree
          </button>
          <button role="tab" aria-selected={tab === "overview"} className={`tab${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>
            <Icon name="shapes" size={15} />
            Character
          </button>
        </div>
        {tab === "tree" && !empty && (
          <div className="sk-filters">
            <label className="sk-search">
              <Icon name="search" size={14} />
              <input
                placeholder="Find a skill"
                aria-label="Find a skill"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches?.size) {
                    const first = data.skills.find((s) => matches.has(s.id));
                    if (first) {
                      setSelectedId(first.id);
                      apiRef.current?.centerOn(first.id);
                    }
                  }
                  if (e.key === "Escape") setSearch("");
                }}
              />
              {search && (
                <button className="sk-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
                  <Icon name="x" size={12} />
                </button>
              )}
            </label>
            <select
              className="select sk-area-filter"
              aria-label="Filter by ability"
              value={areaFilter}
              onChange={(e) => (e.target.value ? showArea(e.target.value) : setAreaFilter(""))}
            >
              <option value="">All abilities</option>
              {data.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icon} {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <span className="spacer" />
        {!empty && (
          <button className="sk-stat" onClick={() => setTab("overview")} title={`Total level ${data.sheet.totalLevel} · ${fmt(data.sheet.xp)} XP`}>
            <span className="sk-stat-main">Level {data.sheet.level}</span>
            <span className="sk-stat-sub">
              {data.sheet.rank.name} · {plural(data.sheet.skills, "skill")}
            </span>
          </button>
        )}
        {!empty && aiButton}
        {!empty && (
          <button className="btn btn-primary" onClick={() => setAdding({})}>
            <Icon name="plus" size={15} />
            <span className="sk-hide-narrow">Add skill</span>
          </button>
        )}
        <button className="icon-btn" aria-label="More" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
          <Icon name="dots" />
        </button>
      </div>

      <div className={`sk-body${panelOpen ? " with-panel" : ""}`}>
        {tab === "overview" ? (
          <OverviewView
            ws={ws}
            data={data}
            dark={dark}
            onShowArea={showArea}
            onSelectSkill={(id) => select(id)}
            onEditAreas={() => setModal("areas")}
          />
        ) : empty ? (
          <EmptyState
            archived={data.archived.length}
            hasAi={hasAi}
            onTemplate={pickTemplate}
            onAdd={() => setAdding({})}
            onGenerate={() => (hasAi ? setModal("generate") : openAiSettings())}
            onArchived={() => setModal("archived")}
          />
        ) : (
          <>
            <SkillCanvas
              skills={data.skills}
              stats={data.stats}
              areas={data.areas}
              areaLevels={areaLevels}
              layout={layout}
              dark={dark}
              selectedId={selectedId}
              onSelect={select}
              onMove={onMove}
              matches={matches}
              effects={effects}
              peers={peerMarks}
              insets={insets}
              apiRef={apiRef}
              initialView={remembered.view ?? null}
              onViewChange={onViewChange}
              reduceMotion={reduceMotion}
            />
            {questStrip && (
              <div className="sk-quest-strip" role="group" aria-label="Today's quests">
                <span className="sk-quest-strip-label">
                  Today’s quests
                  <span className="faint">
                    {data.quests.filter((q) => q.status.done).length}/{data.quests.length}
                  </span>
                </span>
                {data.quests.map((q) => (
                  <QuestCheck key={`${q.skill.id}:${q.status.quest.id}`} ws={ws} q={q} compact />
                ))}
              </div>
            )}
            {!(phone && panelOpen) && (
              <div className="sk-controls" role="toolbar" aria-label="Canvas controls">
                <button className="icon-btn" aria-label="Zoom out" onClick={() => apiRef.current?.zoomBy(0.8)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M5 12h14" />
                  </svg>
                </button>
                <button className="icon-btn" aria-label="Zoom in" onClick={() => apiRef.current?.zoomBy(1.25)}>
                  <Icon name="plus" />
                </button>
                <button className="icon-btn sk-fit" aria-label="Fit tree to screen" title="Fit (F)" onClick={() => apiRef.current?.fit()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                  <span>Fit</span>
                </button>
                <span className="sk-controls-sep" />
                <button className={`icon-btn${legend ? " active" : ""}`} aria-label="Legend" aria-expanded={legend} onClick={() => setLegend((l) => !l)}>
                  ?
                </button>
              </div>
            )}
            {legend && !(phone && panelOpen) && <Legend onClose={() => setLegend(false)} />}
            {selected && (
              <SkillPanel
                ws={ws}
                data={data}
                skillId={selected.id}
                dark={dark}
                onClose={() => setSelectedId(null)}
                onSelect={(id) => {
                  setSelectedId(id);
                  apiRef.current?.centerOn(id);
                }}
                onAddChild={(parentId) => setAdding({ parentId })}
              />
            )}
          </>
        )}
      </div>

      {menu && <Menu anchor={menu} items={menuItems} onClose={() => setMenu(null)} />}
      {adding && (
        <AddSkillModal
          ws={ws}
          data={data}
          parentId={adding.parentId}
          defaultArea={areaFilter || undefined}
          onClose={() => setAdding(null)}
          onCreated={(id) => {
            setTab("tree");
            setSelectedId(id);
            queueCamera(empty ? { fit: [id] } : { reveal: id });
          }}
        />
      )}
      {modal === "areas" && <AreasModal ws={ws} areas={data.areas} dark={dark} onClose={() => setModal(null)} />}
      {modal === "templates" && <TemplatesModal ws={ws} data={data} dark={dark} onClose={() => setModal(null)} onApplied={afterCreate} />}
      {modal === "generate" && <GenerateTreeModal ws={ws} areas={data.areas} dark={dark} onClose={() => setModal(null)} onCreated={afterCreate} />}
      {modal === "archived" && (
        <Modal title="Archived skills" onClose={() => setModal(null)} width={480}>
          {data.archived.length === 0 && <p className="muted">Nothing archived.</p>}
          <div className="sk-link-list">
            {data.archived.map((s) => (
              <div key={s.id} className="sk-link-row">
                <span className="sk-link-main static">
                  <span className="sk-mini-badge">{s.icon}</span>
                  <span className="grow ellipsis">{s.name}</span>
                </span>
                <button className="btn btn-sm" onClick={() => updateSkill(ws.doc, s.id, { archived: undefined })}>
                  Restore
                </button>
                <button className="icon-btn" aria-label={`Delete ${s.name}`} onClick={() => deleteSkill(ws.doc, s.id)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Legend({ onClose }: { onClose: () => void }) {
  return (
    <div className="sk-legend" role="dialog" aria-label="How the tree works">
      <div className="row">
        <strong className="grow">How it works</strong>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className="small muted">
        Practice, quests and course lessons earn XP. The ring around a skill fills toward its next level; the number below it is
        the level. A skill unlocks once each prerequisite reaches the level shown on its lock.
      </p>
      <div className="sk-legend-ranks">
        {RANKS.map((r, i) => (
          <div key={r.id} className="sk-legend-row" title={r.description}>
            <span className="grow">{r.name}</span>
            <span className="faint small">
              Level {r.minLevel}
              {RANKS[i + 1] ? `–${RANKS[i + 1].minLevel - 1}` : "+"}
            </span>
          </div>
        ))}
      </div>
      <p className="small faint">Drag skills to arrange them. Scroll or pinch to zoom.</p>
    </div>
  );
}

function EmptyState({
  archived,
  hasAi,
  onTemplate,
  onAdd,
  onGenerate,
  onArchived,
}: {
  archived: number;
  hasAi: boolean;
  onTemplate: (t: SkillTemplate) => void;
  onAdd: () => void;
  onGenerate: () => void;
  onArchived: () => void;
}) {
  return (
    <div className="sk-empty-scroll">
      <div className="sk-empty">
        <div className="sk-empty-head">
          <h2>Skills</h2>
          <p className="muted">
            Map what you want to get better at, in any part of life. Skills earn XP from practice, quests and courses, level up
            from Novice to Grandmaster, and unlock the skills that build on them.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={onAdd}>
              <Icon name="plus" size={15} /> Add a skill
            </button>
            <button className="btn" onClick={onGenerate} title={hasAi ? undefined : "Add your Anthropic API key in Settings → AI"}>
              <Icon name="sparkle" size={15} /> {hasAi ? "Generate with AI" : "Set up AI to generate"}
            </button>
            {archived > 0 && (
              <button className="btn btn-ghost" onClick={onArchived}>
                {archived} archived
              </button>
            )}
          </div>
        </div>
        <h3 className="sk-empty-sub">Start from a template</h3>
        <TemplateGrid onPick={onTemplate} />
      </div>
    </div>
  );
}

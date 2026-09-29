// Real-life skill tree ("life RPG"): one map of every skill, with topics and
// the parts you learn to advance, prerequisites, levels, XP and ranks, each
// skill training one of six D&D abilities. Clicking a skill starts its next
// lesson; your character sits beside the map.

import { useEffect, useMemo, useRef, useState } from "react";
import { updateSkill, deleteSkill, ensureSkillPages, type SkillStats } from "../../../shared/skills.ts";
import { aiAvailable } from "../../lib/ai.ts";
import { useClaudeJobs } from "../../lib/claude.ts";
import { useApp, useMediaQuery, usePeers } from "../../lib/hooks.ts";
import { useSettings } from "../../lib/settings.ts";
import { useTheme } from "../../lib/theme.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon, Menu, Modal, type Anchor, type MenuItem } from "../../components/ui.tsx";
import { usePlayer } from "../lessons/player.ts";
import { ClaudeJobLine } from "../lessons/ClaudeStatus.tsx";
import { useLessonStarter } from "../lessons/start.ts";
import { CharacterPanel } from "./CharacterPanel.tsx";
import { QuestCheck } from "./Overview.tsx";
import { GenerateTreeModal } from "./GenerateTree.tsx";
import { AddSkillModal, AreasModal, applyTemplate, TemplateGrid, TemplatesModal } from "./SkillDialogs.tsx";
import { SkillPanel } from "./SkillPanel.tsx";
import { fmt, plural, useSkillTree } from "./useSkillData.ts";
import type { SkillTemplate } from "./templates.ts";
import { takeSkillFocus } from "./focus.ts";
import { SkillGraphView, type CanvasApi, type Effect } from "./graph/SkillGraph.tsx";
import "./skills.css";

const CHAR_KEY = "basalt:skills:character";

function characterOpen(): boolean {
  try {
    return localStorage.getItem(CHAR_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function openAiSettings() {
  window.dispatchEvent(new CustomEvent("basalt:open-settings", { detail: { tab: "ai" } }));
}

export default function SkillTreeView({ ws }: { ws: Workspace }) {
  const { toast, openPage } = useApp();
  const data = useSkillTree(ws);
  const settings = useSettings();
  const hasAi = useMemo(() => aiAvailable(), [settings.anthropicKey]);
  const dark = useTheme() === "dark";
  const phone = useMediaQuery("(max-width: 720px)");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [charOpenState, setCharOpenState] = useState(characterOpen);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [adding, setAdding] = useState<{ parentId?: string } | null>(null);
  const [modal, setModal] = useState<"areas" | "templates" | "generate" | "archived" | null>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [effects, setEffects] = useState<Effect[]>([]);
  const apiRef = useRef<CanvasApi | null>(null);
  const pending = useRef<{ fit?: string[] | "all"; reveal?: string; version: number } | null>(null);

  // On a phone the character is always there, as a sheet peeking up from the map.
  const charOpen = phone || charOpenState;
  const setCharOpen = (open: boolean) => {
    setCharOpenState(open);
    try {
      localStorage.setItem(CHAR_KEY, open ? "shown" : "hidden");
    } catch {
      // Not remembered; fine.
    }
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) queueCamera({ reveal: id });
  };

  const starter = useLessonStarter(ws, { toast, openPage, showSkill: (id) => select(id) });
  // The lesson player shows its own unlocks.
  const player = usePlayer();
  const playerOpen = useRef(false);
  playerOpen.current = !!player;

  // Every skill is a page; older skills get theirs here.
  useEffect(() => ensureSkillPages(ws.doc), [ws]);

  // Arriving from a skill page or a path's "Show on the map".
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
  const peerColors = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of peers) {
      const id = p.state.skillsSelection;
      if (typeof id === "string") m.set(id, [...(m.get(id) ?? []), p.state.user.color]);
    }
    return m;
  }, [peers]);

  // Skills Claude is planning or writing lessons for right now.
  const jobs = useClaudeJobs();
  const busy = useMemo(() => {
    const out = new Set<string>();
    for (const j of jobs) {
      if (j.status !== "running") continue;
      if (j.key.startsWith("skill-plan:")) out.add(j.key.slice(11));
      if (j.key.startsWith("ahead:")) {
        const c = j.key.slice(6);
        for (const s of data.skills) if (s.courseIds.includes(c)) out.add(s.id);
      }
    }
    if (starter.starting?.skillId && starter.job?.status === "running") out.add(starter.starting.skillId);
    return out;
  }, [jobs, data.skills, starter.starting, starter.job]);

  // A brief highlight on skills that level up (local or remote changes).
  const prevStats = useRef<Map<string, SkillStats> | null>(null);
  const fxKey = useRef(0);
  useEffect(() => {
    const prev = prevStats.current;
    prevStats.current = data.stats;
    if (!prev) return;
    const added: Effect[] = [];
    const opened: string[] = [];
    for (const [id, st] of data.stats) {
      const before = prev.get(id);
      if (!before) continue;
      if (st.level > before.level) added.push({ key: ++fxKey.current, id });
      // Unlocked, like in an RPG: a pulse on the map and a word about it.
      if (st.unlocked && !before.unlocked) {
        added.push({ key: ++fxKey.current, id });
        opened.push(data.byId.get(id)?.name ?? "");
      }
    }
    if (opened.length && !playerOpen.current) toast(`Unlocked: ${opened.slice(0, 3).join(", ")}${opened.length > 3 ? ` and ${opened.length - 3} more` : ""}`);
    if (!added.length) return;
    setEffects((fx) => [...fx, ...added]);
    const keys = new Set(added.map((a) => a.key));
    window.setTimeout(() => setEffects((fx) => fx.filter((f) => !keys.has(f.key))), 1500);
  }, [data.stats]);

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

  const side = !!selectedId || charOpen;
  const center = useMemo(
    () => ({
      initials:
        settings.identity.name
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "ME",
      color: settings.identity.color,
      title: `Level ${data.sheet.level}`,
      sub: data.sheet.title,
    }),
    [settings.identity.name, settings.identity.color, data.sheet.level, data.sheet.title],
  );
  const questStrip = data.quests.length > 0;
  const insets = useMemo(
    () => ({
      top: questStrip ? 56 : 12,
      right: side && !phone ? 408 : 12,
      bottom: phone ? (selectedId ? Math.round(window.innerHeight * 0.55) : 104 + 100) : 56,
      left: 12,
    }),
    [questStrip, side, phone, selectedId],
  );

  // Deferred camera moves, run once the skills they target are on the map
  // (new skills arrive with the next data snapshot).
  useEffect(() => {
    const p = pending.current;
    const api = apiRef.current;
    if (!p || !api) return;
    const ids = [...(Array.isArray(p.fit) ? p.fit : []), ...(p.reveal ? [p.reveal] : [])];
    const ready = p.fit === "all" ? data.version > p.version : ids.every((id) => data.byId.has(id));
    if (!ready) return;
    pending.current = null;
    // Give new skills a moment to find their place first.
    window.setTimeout(() => {
      if (p.fit) api.fit(p.fit === "all" ? undefined : p.fit);
      else if (p.reveal) api.reveal(p.reveal);
    }, 400);
  });

  const queueCamera = (move: { fit?: string[] | "all"; reveal?: string }) => {
    pending.current = { ...move, version: data.version };
  };

  const afterCreate = (ids: string[]) => {
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
    const ids = data.skills.filter((s) => s.category === areaId).map((s) => s.id);
    if (ids.length) queueCamera({ fit: ids });
  };

  const menuItems: MenuItem[] = [
    { label: "Add from template…", icon: <Icon name="copy" size={15} />, onClick: () => setModal("templates") },
    { label: "Edit abilities…", icon: <Icon name="edit" size={15} />, onClick: () => setModal("areas") },
    { label: charOpen ? "Hide character" : "Show character", icon: <Icon name="shapes" size={15} />, onClick: () => setCharOpen(!charOpen), disabled: phone },
    { label: `Archived skills${data.archived.length ? ` (${data.archived.length})` : ""}`, icon: <Icon name="trash" size={15} />, onClick: () => setModal("archived"), disabled: !data.archived.length },
  ];

  const empty = data.skills.length === 0;
  const selected = selectedId ? data.byId.get(selectedId) : undefined;

  const aiButton = hasAi ? (
    <button className="btn sk-ai-btn" onClick={() => setModal("generate")} title="Describe a goal and let Claude design a tree">
      <Icon name="sparkle" size={15} />
      <span className="sk-hide-narrow">Generate with AI</span>
    </button>
  ) : null;

  return (
    <div className="sk-root">
      <div className="sk-toolbar">
        {!empty && (
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
            <select className="select sk-area-filter" aria-label="Filter by ability" value={areaFilter} onChange={(e) => (e.target.value ? showArea(e.target.value) : setAreaFilter(""))}>
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
          <button
            className={`sk-stat${charOpen && !phone ? " on" : ""}`}
            onClick={() => {
              setSelectedId(null);
              if (!phone) setCharOpen(!charOpen || !!selectedId);
            }}
            title={charOpen ? "Your character (click to hide)" : "Show your character"}
            aria-pressed={charOpen}
          >
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

      <div className={`sk-body${side ? " with-panel" : ""}`}>
        {empty ? (
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
            <SkillGraphView
              ws={ws}
              data={data}
              dark={dark}
              selectedId={selectedId}
              onStart={(id) => starter.startSkill(id)}
              onStartCourse={(id) => starter.startCourse(id)}
              onDetails={(id) => select(id)}
              onAbility={showArea}
              onDeselect={() => setSelectedId(null)}
              matches={matches}
              effects={effects}
              insets={insets}
              apiRef={apiRef}
              busy={busy}
              peers={peerColors}
              toolsBottom={phone && !selectedId ? 112 : 12}
              hideTools={phone && !!selectedId}
              center={center}
              onCenter={() => {
                setSelectedId(null);
                setCharOpen(true);
              }}
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
            {starter.starting && (
              <ClaudeJobLine className="sk-starting" label={starter.starting.label} job={starter.job} note="It opens as soon as it's written." onClose={starter.cancel} />
            )}
            {selected ? (
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
                onStart={(id) => starter.startSkill(id)}
              />
            ) : (
              charOpen && (
                <CharacterPanel
                  ws={ws}
                  data={data}
                  dark={dark}
                  phone={phone}
                  onStart={(id) => starter.startSkill(id)}
                  onShowArea={showArea}
                  onEditAreas={() => setModal("areas")}
                  onCollapse={() => setCharOpen(false)}
                />
              )
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

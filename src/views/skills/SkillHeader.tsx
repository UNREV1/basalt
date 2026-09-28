// The top of a Skill page: level, rank and XP, what it takes to unlock, its
// quests and a practice log. The rest of the page is ordinary notes.

import { useEffect, useMemo, useState } from "react";
import {
  addQuest,
  completeQuest,
  ensureSkillForPage,
  levelForXp,
  logPractice,
  practiceXp,
  questStatus,
  removeQuest,
  themedColor,
  totalXp,
  undoQuest,
  updateSkill,
  xpEntries,
  MAX_PRACTICE_MINUTES,
  type Skill,
} from "../../../shared/skills.ts";
import { Icon } from "../../components/ui.tsx";
import { useApp } from "../../lib/hooks.ts";
import { navigate } from "../../lib/router.ts";
import { useTheme } from "../../lib/theme.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { focusSkill } from "./focus.ts";
import { levelUpMessage } from "./Overview.tsx";
import { QuestForm, XpBar } from "./SkillPanel.tsx";
import { fmt, plural, useSkillTree } from "./useSkillData.ts";
import "./skills.css";

export default function SkillHeader({ ws, pageId }: { ws: Workspace; pageId: string }) {
  const { openPage, toast } = useApp();
  const data = useSkillTree(ws);
  const dark = useTheme() === "dark";
  const doc = ws.doc;
  const [skillId, setSkillId] = useState<string | undefined>();
  const [minutes, setMinutes] = useState("");
  const [addingQuest, setAddingQuest] = useState(false);

  // A page just given the Skill type (or duplicated from one) becomes a skill.
  useEffect(() => setSkillId(ensureSkillForPage(doc, pageId)), [doc, pageId, data.version]);

  const skill = skillId ? data.byId.get(skillId) : undefined;
  const archived = skillId ? data.archived.find((s) => s.id === skillId) : undefined;
  const stats = skillId ? data.stats.get(skillId) : undefined;
  const entries = useMemo(() => (skillId ? xpEntries(doc, skillId) : []), [doc, skillId, data.version]);

  if (archived) {
    return (
      <div className="sk-page sk-page-archived">
        <span className="grow small muted">This skill is archived, so it’s hidden from your skill tree.</span>
        <button className="btn btn-sm" onClick={() => updateSkill(doc, archived.id, { archived: false })}>
          Bring it back
        </button>
      </div>
    );
  }
  if (!skill || !stats) return null;

  const area = data.areas.find((a) => a.id === skill.category);
  const color = themedColor(skill.color || area?.color || "#8b8d98", dark);
  const parents = skill.parents.map((p) => data.byId.get(p)).filter((s): s is Skill => !!s);
  const children = data.skills.filter((s) => s.parents.includes(skill.id));
  const nextXp = stats.progress.next;
  const custom = Number(minutes);

  const celebrate = (before: number) => {
    const msg = levelUpMessage(skill.name, before, levelForXp(totalXp(doc, skill.id)));
    if (msg) toast(msg);
  };
  const log = (mins: number) => {
    if (!(mins > 0)) return;
    const before = stats.level;
    if (!logPractice(doc, skill.id, mins)) return;
    setMinutes("");
    celebrate(before);
  };
  const toggleQuest = (questId: string, done: boolean) => {
    const before = stats.level;
    if (done) undoQuest(doc, skill.id, questId);
    else {
      completeQuest(doc, skill.id, questId);
      celebrate(before);
    }
  };
  const openSkill = (s: Skill) => (s.pageId ? openPage(s.pageId) : showInTree(s.id));
  const showInTree = (id: string) => {
    focusSkill(id);
    navigate({ name: "view", wsId: ws.id, view: "skills" });
  };

  return (
    <section className="sk-page" style={{ ["--c" as string]: color }} aria-label={`${skill.name} skill`}>
      <div className="sk-page-top">
        <div className="sk-level-num">
          Level {stats.level}
          <span className="sk-rank" title={stats.rank.description}>
            {stats.rank.name}
          </span>
        </div>
        <label className="sk-area-pick" title="Life area">
          <span className="sk-dot-c" aria-hidden />
          {area ? area.name : skill.category || "Other"}
          <Icon name="down" size={12} />
          <select value={skill.category} aria-label="Life area" onChange={(e) => updateSkill(doc, skill.id, { category: e.target.value })}>
            {!area && <option value={skill.category}>{skill.category || "Other"}</option>}
            {data.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.icon} {a.name}
              </option>
            ))}
          </select>
        </label>
        <span className="grow" />
        {stats.streak.current > 0 && (
          <span className={`sk-streak${stats.streak.today ? " today" : ""}`}>{stats.streak.current}-day streak</span>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => showInTree(skill.id)} title="Show in the skill tree">
          <Icon name="tree" size={14} /> Tree
        </button>
      </div>

      <XpBar fraction={stats.progress.fraction} color={color} label="XP toward next level" />
      <div className="sk-level-foot small">
        {nextXp !== null ? (
          <span>
            <strong>{fmt(stats.xp - stats.progress.floor)}</strong> / {fmt(nextXp - stats.progress.floor)} XP to level {stats.level + 1}
          </span>
        ) : (
          <strong>Max level reached</strong>
        )}
        <span className="muted">{fmt(stats.xp)} XP total</span>
      </div>

      {!stats.unlocked && (
        <div className="sk-locked-note" role="note">
          <Icon name="lock" size={15} />
          <div>
            <strong>Locked.</strong> Reach{" "}
            {stats.missing.map((m, i) => {
              const p = data.byId.get(m.parentId);
              return (
                <span key={m.parentId}>
                  {i > 0 && (i === stats.missing.length - 1 ? " and " : ", ")}
                  <button className="sk-link" onClick={() => p && openSkill(p)}>
                    {m.name}
                  </button>{" "}
                  level {m.need} (now {m.have})
                </span>
              );
            })}{" "}
            to unlock it. Practice still earns XP.
          </div>
        </div>
      )}

      <div className="sk-page-grid">
        <div className="col" style={{ gap: 6 }}>
          <div className="row sk-page-label">
            <span className="grow">Quests</span>
            {!addingQuest && (
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingQuest(true)}>
                <Icon name="plus" size={14} /> Add
              </button>
            )}
          </div>
          {(skill.quests ?? []).length === 0 && !addingQuest && (
            <p className="sk-empty-line">Habits that earn XP, like “Read 20 min daily” or “Run 3× a week”.</p>
          )}
          <div className="sk-quest-list">
            {(skill.quests ?? []).map((q) => {
              const st = questStatus(entries, q, data.now);
              return (
                <div key={q.id} className={`sk-quest${st.done ? " done" : ""}`}>
                  <button
                    className="sk-check"
                    role="checkbox"
                    aria-checked={st.done}
                    aria-label={st.done ? `Undo ${q.title}` : `Complete ${q.title}`}
                    onClick={() => toggleQuest(q.id, st.done)}
                  >
                    {st.done ? <Icon name="check" size={14} stroke={2.6} /> : st.count > 0 ? <span className="sk-check-count">{st.count}</span> : null}
                  </button>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis sk-quest-title">{q.title}</div>
                    <div className="small muted">
                      {q.target > 1 ? `${st.count}/${q.target} this ${q.cadence === "daily" ? "day" : "week"}` : q.cadence === "daily" ? "Daily" : "Weekly"}
                      {st.streak > 1 && ` · ${st.streak}-${q.cadence === "daily" ? "day" : "week"} streak`}
                    </div>
                  </div>
                  <span className="sk-quest-xp">{q.xp} XP</span>
                  <button className="icon-btn sk-row-action" aria-label={`Remove quest ${q.title}`} onClick={() => removeQuest(doc, skill.id, q.id)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          {addingQuest && <QuestForm onCancel={() => setAddingQuest(false)} onSave={(q) => (addQuest(doc, skill.id, q), setAddingQuest(false))} />}
        </div>

        <div className="col" style={{ gap: 6 }}>
          <div className="sk-page-label">Log practice</div>
          <div className="sk-quick">
            {[15, 30, 60].map((m) => (
              <button key={m} className="sk-quick-btn" onClick={() => log(m)}>
                <strong>{m} min</strong>
                <span>{fmt(practiceXp(m))} XP</span>
              </button>
            ))}
          </div>
          <div className="sk-log-row">
            <input
              className="input sk-min-input grow"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PRACTICE_MINUTES}
              placeholder="Minutes"
              aria-label="Minutes practised"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && log(custom)}
            />
            <button className="btn btn-primary btn-sm" disabled={!(custom > 0)} onClick={() => log(custom)}>
              Log{custom > 0 ? ` +${fmt(practiceXp(custom))}` : ""}
            </button>
          </div>
          {entries.length > 0 && <span className="small faint">{plural(entries.length, "entry", "entries")} logged</span>}
        </div>
      </div>

      {(parents.length > 0 || children.length > 0) && (
        <div className="sk-page-links small">
          {parents.length > 0 && (
            <span className="sk-page-chips">
              <span className="muted">Builds on</span>
              {parents.map((p) => (
                <button key={p.id} className="sk-page-chip" onClick={() => openSkill(p)}>
                  {p.icon} {p.name}
                  <span className="faint">L{data.stats.get(p.id)?.level ?? 0}</span>
                </button>
              ))}
            </span>
          )}
          {children.length > 0 && (
            <span className="sk-page-chips">
              <span className="muted">Leads to</span>
              {children.map((c) => (
                <button key={c.id} className="sk-page-chip" onClick={() => openSkill(c)}>
                  {c.icon} {c.name}
                </button>
              ))}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

// Your character, beside the skill map: level and class, what to learn next
// (one click starts the lesson), the six ability scores, planning every skill
// with Claude, today's quests and recent activity. On a phone it's a bottom
// sheet that peeks up from the map.

import { useMemo, useState } from "react";
import { finishedLessons } from "../../../shared/learning.ts";
import { allParts, formatModifier, scoreProgress, skillDone, themedColor, xpEntries, type Skill, type XpSource } from "../../../shared/skills.ts";
import { Avatar, Icon, timeAgo } from "../../components/ui.tsx";
import { useApp } from "../../lib/hooks.ts";
import { useSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { dismissClaudeJob, useClaudeJobs } from "../../lib/claude.ts";
import { AskClaudeFallback, ClaudeJobLine } from "../lessons/ClaudeStatus.tsx";
import { canRunClaude, planAllText, planEverySkill, stopPlanningEverySkill, unplannedSkills, usePlanAll } from "../lessons/plan.ts";
import { QuestCheck, Radar } from "./Overview.tsx";
import { SkillGlyph } from "./SkillGlyph.tsx";
import { XpBar } from "./SkillPanel.tsx";
import { fmt, plural, type SkillTreeData } from "./useSkillData.ts";

const SOURCE_LABEL: Record<XpSource, string> = {
  practice: "Practice",
  lesson: "Lesson",
  quiz: "Quiz",
  flashcards: "Flashcards",
  task: "Task",
  manual: "XP",
  claude: "Claude",
  quest: "Quest",
};

interface NextUp {
  skill: Skill;
  /** The topic it's the next part of. */
  topic?: Skill;
  lessons: { done: number; total: number };
  at: number;
}

/** What to learn next: the next part of each topic you've begun, and skills with a course under way. */
function nextUp(ws: Workspace, data: SkillTreeData): NextUp[] {
  const skills = data.skills;
  const last = new Map<string, number>();
  for (const f of finishedLessons(ws.doc)) if (!last.has(f.courseId)) last.set(f.courseId, f.at);
  const lessons = (s: Skill) => {
    let done = 0;
    let total = 0;
    let at = 0;
    for (const c of s.courseIds) {
      const x = data.courses.get(c);
      if (!x) continue;
      done += x.mastered + x.skipped;
      total += x.total;
      at = Math.max(at, last.get(c) ?? 0);
    }
    return { done, total, at };
  };
  const hasParts = (s: Skill) => skills.some((x) => x.topic === s.id);
  const open = (s: Skill) => data.stats.get(s.id)?.unlocked !== false && !skillDone(ws.doc, skills, s, data.stats);
  const out: NextUp[] = [];
  const seen = new Set<string>();
  // Each subject (a topic of its own): its next part.
  for (const root of skills.filter((s) => hasParts(s) && !(s.topic && data.byId.has(s.topic)))) {
    const next = allParts(skills, root.id).find((p) => !hasParts(p) && open(p));
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    const l = lessons(next);
    const topic = next.topic ? data.byId.get(next.topic) : undefined;
    out.push({ skill: next, topic, lessons: l, at: Math.max(l.at, ...allParts(skills, root.id).map((p) => lessons(p).at)) });
  }
  // Skills of their own with a course under way.
  for (const s of skills) {
    if (seen.has(s.id) || hasParts(s) || (s.topic && data.byId.has(s.topic)) || !open(s)) continue;
    const l = lessons(s);
    if (!l.total || !l.done) continue;
    out.push({ skill: s, lessons: l, at: l.at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, 4);
}

export function CharacterPanel({
  ws,
  data,
  dark,
  phone,
  onStart,
  onShowArea,
  onEditAreas,
  onCollapse,
}: {
  ws: Workspace;
  data: SkillTreeData;
  dark: boolean;
  phone: boolean;
  onStart: (skillId: string) => void;
  onShowArea: (areaId: string) => void;
  onEditAreas: () => void;
  onCollapse: () => void;
}) {
  const { toast } = useApp();
  const settings = useSettings();
  const identity = settings.identity;
  const { sheet } = data;
  const [expanded, setExpanded] = useState(false);
  const planAll = usePlanAll();
  const failedJob = useClaudeJobs().find((j) => j.key === planAll.failed);
  const up = useMemo(() => nextUp(ws, data), [ws, data]);
  const unplanned = useMemo(() => unplannedSkills(ws).filter((s) => !s.topic), [ws, data]);

  const recent = useMemo(() => {
    const out: { skillId: string; icon: string; name: string; at: number; amount: number; text: string }[] = [];
    for (const s of data.skills) {
      const titles = new Map((s.quests ?? []).map((q) => [q.id, q.title]));
      for (const e of xpEntries(ws.doc, s.id)) {
        const text =
          e.source === "quest"
            ? `Quest · ${titles.get(e.note) ?? "completed"}`
            : e.note || `${SOURCE_LABEL[e.source]}${e.minutes ? ` · ${e.minutes} min` : ""}`;
        out.push({ skillId: s.id, icon: s.icon, name: s.name, at: e.at, amount: e.amount, text });
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 5);
  }, [ws, data]);

  const planEverything = () => {
    if (!ws.info.sync) {
      toast("Turn on sync for this workspace so Claude can reach it (Share → Sync)");
      return;
    }
    void planEverySkill(ws);
  };

  return (
    <aside className={`sk-panel sk-char${expanded ? " expanded" : ""}`} aria-label="Your character">
      {phone && (
        <button className="sk-sheet-handle" onClick={() => setExpanded((x) => !x)} aria-label={expanded ? "Collapse character" : "Expand character"}>
          <span />
        </button>
      )}
      <div className="sk-char-head" onClick={phone ? () => setExpanded(true) : undefined}>
        <Avatar name={identity.name} color={identity.color} size={44} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="sk-char-title">
            Level {sheet.level}
            <span className="sk-rank" title="Rank and class: the class comes from your strongest abilities">
              {sheet.title}
            </span>
          </div>
          <XpBar fraction={sheet.progress.fraction} color="var(--accent)" label="XP toward next level" />
          <div className="small muted">
            {sheet.progress.next !== null
              ? `${fmt(sheet.xp - sheet.progress.floor)} / ${fmt(sheet.progress.next - sheet.progress.floor)} XP to level ${sheet.level + 1}`
              : `${fmt(sheet.xp)} XP · max level`}
          </div>
        </div>
        {!phone && (
          <button className="icon-btn" onClick={onCollapse} aria-label="Hide character" title="Hide character">
            <Icon name="chevron" size={14} />
          </button>
        )}
      </div>

      <div className="sk-panel-body">
        <section className="sk-char-section">
          <h3>Up next</h3>
          {up.length === 0 ? (
            <p className="sk-empty-line">Click any skill on the map to start learning it. Claude plans it and writes your first lesson.</p>
          ) : (
            <div className="sk-upnext">
              {up.map((u) => (
                <button key={u.skill.id} className="sk-upnext-row" onClick={() => onStart(u.skill.id)}>
                  <SkillGlyph skill={u.skill} color={themedColor(data.areas.find((a) => a.id === u.skill.category)?.color ?? "#8b8d98", dark)} size={32} />
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="sk-upnext-name ellipsis">{u.skill.name}</span>
                    <span className="small muted ellipsis">
                      {u.topic ? `${u.topic.name} · ` : ""}
                      {u.lessons.total ? `${u.lessons.done}/${u.lessons.total} lessons` : "Not planned yet"}
                    </span>
                  </span>
                  <span className="sk-upnext-go" aria-hidden>
                    <Icon name="play" size={13} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="sk-char-section">
          <header className="row">
            <h3 className="grow">Abilities</h3>
            <button className="btn btn-ghost btn-sm" onClick={onEditAreas}>
              <Icon name="edit" size={13} /> Edit
            </button>
          </header>
          <div className="sk-char-abilities">
            {sheet.areas.map((a) => {
              const color = themedColor(a.area.color, dark);
              const sp = scoreProgress(a.xp);
              return (
                <button
                  key={a.area.id}
                  className="sk-char-ability"
                  style={{ ["--c" as string]: color }}
                  onClick={() => onShowArea(a.area.id)}
                  title={`${a.area.name}: ${a.area.description ?? ""}`}
                  aria-label={`${a.area.name} ${a.score}, modifier ${formatModifier(a.modifier)}. Show on the map`}
                >
                  <span className="sk-char-abbr">{a.area.attribute || a.area.name.slice(0, 3).toUpperCase()}</span>
                  <span className="sk-char-mod">{formatModifier(a.modifier)}</span>
                  <span className="sk-char-score">{a.score}</span>
                  <XpBar fraction={a.skills ? sp.fraction : 0} color={color} label={`${a.area.name}: progress to ${a.score + 1}`} />
                </button>
              );
            })}
          </div>
          <Radar areas={sheet.areas} dark={dark} onPick={onShowArea} />
        </section>

        {(unplanned.length > 0 || planAll.running || planAll.failed) && (
          <section className="sk-char-section sk-char-plan">
            <h3>Plan every skill</h3>
            {planAll.running ? (
              <div className="sk-job" role="status">
                <span className="sk-spinner" aria-hidden />
                <span className="grow">
                  Planning {Math.min(planAll.done + 1, planAll.total)} of {planAll.total}
                  {planAll.current ? `: ${planAll.current}` : ""}…
                </span>
                <button className="btn btn-sm btn-ghost" onClick={stopPlanningEverySkill}>
                  Stop
                </button>
              </div>
            ) : planAll.failed && failedJob?.status === "error" ? (
              <ClaudeJobLine label="Planning every skill" job={failedJob} onRetry={planEverything} onClose={() => dismissClaudeJob(failedJob.key)} />
            ) : (
              <>
                <p className="small muted">
                  {plural(unplanned.length, "skill")} {unplanned.length === 1 ? "has" : "have"} no plan yet. Claude can map each one now, the same way for all
                  of them: topics, the parts you learn to advance, and every lesson title. Lessons are written later, as you reach them.
                </p>
                {canRunClaude() ? (
                  <button className="btn btn-sm" onClick={planEverything}>
                    <Icon name="sparkle" size={13} /> Plan {unplanned.length === 1 ? "it" : `all ${unplanned.length}`}
                  </button>
                ) : (
                  <AskClaudeFallback request={{ key: "plan-all", label: "Plan every skill", prompt: planAllText(ws) }} />
                )}
              </>
            )}
          </section>
        )}

        {data.quests.length > 0 && (
          <section className="sk-char-section">
            <h3>
              Today’s quests{" "}
              <span className="small muted">
                {data.quests.filter((q) => q.status.done).length}/{data.quests.length}
              </span>
            </h3>
            <div className="sk-quest-list">
              {data.quests.map((q) => (
                <QuestCheck key={`${q.skill.id}:${q.status.quest.id}`} ws={ws} q={q} compact />
              ))}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section className="sk-char-section">
            <h3>Recent</h3>
            <div className="sk-history">
              {recent.map((r, i) => (
                <div key={`${r.at}-${i}`} className="sk-history-row">
                  <span className="sk-history-icon">{r.icon}</span>
                  <span className="grow ellipsis">
                    {r.name} <span className="muted">· {r.text}</span>
                  </span>
                  <span className={`sk-history-xp${r.amount < 0 ? " neg" : ""}`}>
                    {r.amount >= 0 ? "+" : ""}
                    {fmt(r.amount)}
                  </span>
                  <span className="small faint sk-history-time">{timeAgo(r.at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

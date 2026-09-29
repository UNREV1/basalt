// Learn: the home screen. Pick up where you left off, review what's due,
// reflect once a week, ask for any skill or topic and get the branch to
// follow, see your courses and character, and explore the course library.

import { Fragment, useEffect, useReducer, useState } from "react";
import { allLessons, getCurriculum, getProgress } from "../../../shared/course.ts";
import { installCourse, findLibraryCourse } from "../../../shared/library/install.ts";
import type { LibraryCourse } from "../../../shared/library/types.ts";
import { courseAhead, dueReviews, finishedLessons, learnerStats, learningMap, reflectionDue } from "../../../shared/learning.ts";
import { getLessonContent } from "../../../shared/lesson.ts";
import { displayTitle, ensureSystemPage, getPage, listPages } from "../../../shared/model.ts";
import {
  areaOf,
  characterSheet,
  computeSkillStats,
  courseXp,
  learningOrder,
  partsOf,
  requirementText,
  skillDone,
  topicProgress,
  ensureSkillPages,
  formatModifier,
  listAreas,
  listSkills,
  themedColor,
  todaysQuests,
  type Skill,
} from "../../../shared/skills.ts";
import { Icon } from "../../components/ui.tsx";
import { useClaudeJobs, dismissClaudeJob } from "../../lib/claude.ts";
import { useApp } from "../../lib/hooks.ts";
import { appendMarkdown } from "../../lib/markdown.ts";
import { navigate } from "../../lib/router.ts";
import { getSettings, useSettings } from "../../lib/settings.ts";
import { useTheme } from "../../lib/theme.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { useDueCount } from "../registry.tsx";
import { QuestCheck } from "../skills/Overview.tsx";
import { SkillGlyph } from "../skills/SkillGlyph.tsx";
import { focusSkill } from "../skills/focus.ts";
import { useSkillTree } from "../skills/useSkillData.ts";
import { trail } from "../../../shared/skill-map.ts";
import { AskClaudeFallback, ClaudeJobLine } from "./ClaudeStatus.tsx";
import { ABILITY_ORDER, LIBRARY } from "./library.ts";
import { branchRequest, canRunClaude, runRequest } from "./plan.ts";
import { useLessonStarter } from "./start.ts";
import { openLesson, openReview } from "./player.ts";
import "../skills/skills.css";
import "./home.css";

/** Re-render on any workspace change (throttled to a frame). */
function useDocTick(ws: Workspace) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), bump()));
    };
    ws.doc.on("update", on);
    return () => {
      ws.doc.off("update", on);
      cancelAnimationFrame(raf);
    };
  }, [ws]);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

interface CourseInfo {
  id: string;
  title: string;
  icon: string;
  done: number;
  total: number;
  next: { id: string; title: string; ready: boolean } | null;
  lastAt: number;
  skill?: Skill;
}

function courses(ws: Workspace): CourseInfo[] {
  const skills = listSkills(ws.doc);
  const last = new Map<string, number>();
  for (const f of finishedLessons(ws.doc)) if (!last.has(f.courseId)) last.set(f.courseId, f.at);
  const target = learnerStats(ws.doc).aheadTarget;
  const out: CourseInfo[] = [];
  for (const meta of listPages(ws.doc)) {
    if (meta.kind !== "course") continue;
    const page = getPage(ws.doc, meta.id);
    const c = page ? getCurriculum(page) : null;
    if (!page || !c) continue;
    const lessons = allLessons(c);
    const ahead = courseAhead(page, target);
    out.push({
      id: meta.id,
      title: displayTitle(meta) || c.topic,
      icon: meta.icon || "🎓",
      done: lessons.filter((l) => getProgress(page, l.lesson.id).status === "mastered").length,
      total: lessons.length,
      next: ahead.next ? { id: ahead.next.id, title: ahead.next.title, ready: !!getLessonContent(page, ahead.next.id) } : null,
      lastAt: last.get(meta.id) ?? meta.createdAt,
      skill: skills.find((s) => s.courseIds.includes(meta.id)),
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

export default function LearnHome({ ws }: { ws: Workspace }) {
  useDocTick(ws);
  const settings = useSettings();
  const first = settings.identity.name.split(" ")[0];
  useEffect(() => ensureSkillPages(ws.doc), [ws]);
  const stats = learnerStats(ws.doc);
  const list = courses(ws);
  const current = list.find((c) => c.next && c.done < c.total) ?? null;
  const reviews = dueReviews(ws.doc);
  const cards = useDueCount(ws);
  const quests = todaysQuests(ws.doc).slice(0, 5);

  return (
    <div className="lh-root">
      <header className="lh-head">
        <div>
          <h1>
            {greeting()}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="lh-sub">
            {stats.today ? `${stats.today} lesson${stats.today === 1 ? "" : "s"} today. ` : "One short lesson a day adds up. "}
            Preview, understand, explain, recall, apply, then review later.
          </p>
        </div>
        <div className="lh-stats">
          <span className={`lh-stat${stats.streak ? " hot" : ""}`} title="Days in a row with a finished lesson">
            <Icon name="flame" size={16} /> {stats.streak} day{stats.streak === 1 ? "" : "s"}
          </span>
          <span className={`lh-stat${stats.today ? " done" : ""}`} title="Daily goal: one lesson">
            <Icon name={stats.today ? "check" : "target"} size={16} /> {Math.min(stats.today, 1)}/1 today
          </span>
        </div>
      </header>

      <div className="lh-grid">
        <div className="lh-main">
          <ContinueCard current={current} />
          {reviews.length > 0 && (
            <button className="lh-card lh-review" onClick={openReview}>
              <span className="lh-review-icon">
                <Icon name="reset" size={20} />
              </span>
              <span className="grow">
                <strong>
                  {reviews.length} lesson{reviews.length === 1 ? "" : "s"} to review
                </strong>
                <span className="lh-muted">Spaced review, mixed across topics: the fastest way to remember for good.</span>
              </span>
              <span className="btn btn-primary">Review</span>
            </button>
          )}
          {reflectionDue(ws.doc) && <ReflectCard ws={ws} />}
          <AskCard ws={ws} />
          <Branches ws={ws} />
          <CourseList list={list.filter((c) => c.id !== current?.id)} />
          <Library ws={ws} />
        </div>
        <aside className="lh-side">
          <CharacterCard ws={ws} />
          {(cards > 0 || quests.length > 0) && (
            <section className="lh-card">
              <h2 className="lh-h2">Today</h2>
              {cards > 0 && (
                <button className="lh-row" onClick={() => navigate({ name: "view", wsId: ws.id, view: "learn" })}>
                  <Icon name="cards" size={16} />
                  <span className="grow">
                    {cards} flashcard{cards === 1 ? "" : "s"} due
                  </span>
                  <Icon name="chevron" size={12} />
                </button>
              )}
              {quests.length > 0 && (
                <div className="lh-quests">
                  {quests.map((q) => (
                    <QuestCheck key={`${q.skill.id}:${q.status.quest.id}`} ws={ws} q={q} compact />
                  ))}
                </div>
              )}
            </section>
          )}
          <section className="lh-card lh-method">
            <h2 className="lh-h2">How Basalt teaches</h2>
            <ol>
              <li>
                <strong>Preview</strong> the big picture and what you already know
              </li>
              <li>
                <strong>Understand</strong> why it works, by doing
              </li>
              <li>
                <strong>Explain</strong> it in your own words
              </li>
              <li>
                <strong>Recall</strong> it from memory
              </li>
              <li>
                <strong>Apply</strong> it to something new
              </li>
              <li>
                <strong>Review</strong> after 1 day, 3 days, a week and a month
              </li>
            </ol>
            <p className="lh-muted">Skills add deliberate practice with a timer, honest feedback and one thing to change next time.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ContinueCard({ current }: { current: CourseInfo | null }) {
  const { openPage } = useApp();
  if (!current) {
    return (
      <section className="lh-card lh-hero empty">
        <div>
          <span className="lh-kicker">Start here</span>
          <h2>Pick something to learn</h2>
          <p className="lh-muted">Ask for any skill or topic below and Claude maps your path, or start a ready-made course from the library.</p>
        </div>
      </section>
    );
  }
  const pct = current.total ? current.done / current.total : 0;
  return (
    <section className="lh-card lh-hero">
      <button className="lh-hero-course" onClick={() => openPage(current.id)}>
        <span className="lh-hero-icon">{current.icon}</span>
        <span className="grow">
          <span className="lh-kicker">Continue</span>
          <strong>{current.title}</strong>
        </span>
      </button>
      <div className="lh-hero-next">
        <span className="grow">
          <span className="lh-muted">Next lesson</span>
          <strong>{current.next?.title}</strong>
        </span>
        <button className="btn btn-primary lh-go" disabled={!current.next?.ready} onClick={() => current.next && openLesson(current.id, current.next.id)}>
          <Icon name="play" size={15} /> {current.next?.ready ? "Continue" : "Being written…"}
        </button>
      </div>
      <div className="lh-bar">
        <span style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="lh-muted">
        {current.done} of {current.total} lessons
        {current.skill ? ` · trains ${current.skill.name}` : ""}
      </span>
    </section>
  );
}

function ReflectCard({ ws }: { ws: Workspace }) {
  const { toast } = useApp();
  const [worked, setWorked] = useState("");
  const [didnt, setDidnt] = useState("");
  const [unclear, setUnclear] = useState("");
  const save = () => {
    const at = Date.now();
    const date = new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    const id = ensureSystemPage(ws.doc, "learning-journal", { title: "Learning journal", icon: "📓", createdBy: getSettings().identity.name });
    appendMarkdown(ws, id, `## Week of ${date}\n\n**What worked:** ${worked || "—"}\n\n**What didn't:** ${didnt || "—"}\n\n**Still unclear:** ${unclear || "—"}\n`);
    learningMap(ws.doc).set("lastReflectionAt", at);
    learningMap(ws.doc).set("lastReflection", { at, worked, didnt, unclear });
    toast("Saved to your Learning journal. Claude uses it to plan what's next.");
  };
  return (
    <section className="lh-card lh-reflect">
      <span className="lh-kicker">Weekly reflection</span>
      <h2>How did your learning go this week?</h2>
      <label>
        What worked?
        <input className="input" value={worked} onChange={(e) => setWorked(e.target.value)} placeholder="e.g. short sessions before breakfast" />
      </label>
      <label>
        What didn't?
        <input className="input" value={didnt} onChange={(e) => setDidnt(e.target.value)} placeholder="e.g. skipped reviews on busy days" />
      </label>
      <label>
        What's still unclear?
        <input className="input" value={unclear} onChange={(e) => setUnclear(e.target.value)} placeholder="e.g. when to use the complement rule" />
      </label>
      <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btn-ghost" onClick={() => learningMap(ws.doc).set("lastReflectionAt", Date.now())}>
          Skip this week
        </button>
        <button className="btn btn-primary" disabled={!worked && !didnt && !unclear} onClick={save}>
          Save reflection
        </button>
      </div>
    </section>
  );
}

function AskCard({ ws }: { ws: Workspace }) {
  const { toast, openPage } = useApp();
  const [goal, setGoal] = useState("");
  const jobs = useClaudeJobs().filter((j) => j.key.startsWith("branch:") || j.key.startsWith("skill-course:"));
  const req = goal.trim() ? branchRequest(ws, goal) : null;
  const tree = useSkillTree(ws).map;
  const starter = useLessonStarter(ws, {
    toast,
    openPage,
    showSkill: (id) => {
      focusSkill(id);
      navigate({ name: "view", wsId: ws.id, view: "skills" });
    },
  });
  // It's probably in the skill tree already: the most general matches first.
  const q = goal.trim().toLowerCase();
  const rank = (t?: string) => (t === "general" ? 0 : t === "sub" || t === "advanced" ? 1 : 2);
  const found = q.length >= 2 ? tree.entries.filter((e) => e.name.toLowerCase().includes(q)).sort((a, b) => rank(a.tier) - rank(b.tier) || a.name.length - b.name.length).slice(0, 5) : [];
  const go = () => {
    const exact = found.find((e) => e.name.toLowerCase() === q);
    if (exact) {
      starter.startSkill(exact.id);
      setGoal("");
      return;
    }
    if (!req) return;
    if (!ws.info.sync) {
      toast("Turn on sync for this workspace so Claude can reach it (Share → Sync)");
      return;
    }
    void runRequest(ws, req);
    setGoal("");
  };
  return (
    <section className="lh-card lh-ask">
      <h2>What do you want to learn?</h2>
      <p className="lh-muted">A skill or a topic, anything from “play guitar” to “quantum mechanics”. Claude researches it and maps the branch you’ll follow, then writes your first lessons.</p>
      <form
        className="lh-ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canRunClaude() || found.some((f) => f.name.toLowerCase() === q)) go();
        }}
      >
        <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Speak conversational Spanish" aria-label="What do you want to learn?" />
        {canRunClaude() && (
          <button className="btn btn-primary" disabled={!goal.trim()}>
            <Icon name="path" size={14} /> Map my path
          </button>
        )}
      </form>
      {found.length > 0 && (
        <div className="lh-found">
          <span className="small muted">In your skill tree already:</span>
          {found.map((e) => {
            const where = trail(tree, e.id)
              .slice(0, -1)
              .map((x) => x.name)
              .join(" › ");
            return (
              <button key={e.id} className="lh-found-row" onClick={() => starter.startSkill(e.id)}>
                <span className="grow" style={{ minWidth: 0 }}>
                  <span className="lh-found-name ellipsis">{e.name}</span>
                  <span className="small muted ellipsis">
                    {where || "General topic"}
                    {e.locked ? " · locked" : e.done ? " · learnt" : ""}
                  </span>
                </span>
                <Icon name={e.locked ? "lock" : "play"} size={13} />
              </button>
            );
          })}
        </div>
      )}
      {starter.starting && <ClaudeJobLine label={starter.starting.label} job={starter.job} note="It opens as soon as it's written." onClose={starter.cancel} />}
      {!canRunClaude() && goal.trim() && <AskClaudeFallback request={req} label="Copy the request" />}
      {jobs.map((j) => (
        <ClaudeJobLine key={j.key} label={j.label} job={j} onClose={j.status !== "running" ? () => dismissClaudeJob(j.key) : undefined} />
      ))}
    </section>
  );
}

/** Lessons done out of total across a skill's courses. */
function lessonCount(ws: Workspace, s: Skill): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const c of s.courseIds) {
    const x = courseXp(ws.doc, c);
    done += x.mastered + x.skipped;
    total += x.total;
  }
  return { done, total };
}

/**
 * Your paths: each branch Claude planned, as the steps to follow. A planned
 * subject shows its topics (Arithmetic, Algebra, …); the topic you're on
 * opens up to show its parts, the things to learn before the next one.
 */
function Branches({ ws }: { ws: Workspace }) {
  const { openPage, toast } = useApp();
  const dark = useTheme() === "dark";
  const jobs = useClaudeJobs();
  const starter = useLessonStarter(ws, {
    toast,
    openPage,
    showSkill: (id) => {
      focusSkill(id);
      navigate({ name: "view", wsId: ws.id, view: "skills" });
    },
  });
  const all = listSkills(ws.doc);
  const stats = computeSkillStats(ws.doc);
  const areas = listAreas(ws.doc);
  const branches = new Map<string, Skill[]>();
  for (const s of all) if (s.branch) branches.set(s.branch, [...(branches.get(s.branch) ?? []), s]);
  if (!branches.size) return null;

  const busy = (s: Skill) =>
    (starter.starting?.skillId === s.id && starter.job?.status === "running" ? starter.job : undefined) ??
    jobs.find((j) => j.status === "running" && (j.key === `skill-plan:${s.id}` || s.courseIds.some((c) => j.key === `ahead:${c}`)));

  const row = (s: Skill, n: number, isNext: boolean, small = false) => {
    const area = areaOf(ws.doc, s, areas);
    const st = stats.get(s.id);
    const done = skillDone(ws.doc, all, s, stats);
    const hasParts = all.some((x) => x.topic === s.id);
    const tp = hasParts ? topicProgress(ws.doc, all, s.id, stats) : null;
    const lc = hasParts ? null : lessonCount(ws, s);
    const job = busy(s);
    const locked = st ? !st.unlocked : false;
    return (
      <li key={s.id} className={`lh-step${done ? " done" : ""}${isNext ? " next" : ""}${small ? " small" : ""}${locked ? " locked" : ""}`} style={{ ["--c" as string]: themedColor(area.color, dark) }}>
        <span className="lh-step-dot">{done ? <Icon name="check" size={small ? 11 : 13} stroke={3} /> : locked ? <Icon name="lock" size={11} /> : n + 1}</span>
        <SkillGlyph skill={s} color={themedColor(area.color, dark)} size={small ? 26 : 30} locked={locked} />
        <span className="grow lh-step-text">
          <span className="lh-step-name">{s.name}</span>
          <span className="lh-muted">
            <span className="lh-attr">{area.attribute ?? area.name}</span> level {st?.level ?? 1}
            {tp ? ` · ${tp.done}/${tp.total} learnt` : lc && lc.total ? ` · ${lc.done}/${lc.total} lessons` : " · not planned yet"}
          </span>
        </span>
        {job ? (
          <span className="lh-muted lh-step-status">
            <span className="cp-spinner" aria-hidden /> {job.activity}…
          </span>
        ) : done ? null : locked ? (
          <span className="lh-muted lh-step-status" title={st?.missing.map((m) => requirementText(m)).join(", ")}>
            Locked
          </span>
        ) : (
          <button className={`btn btn-sm${isNext ? " btn-primary" : ""}`} onClick={() => starter.startSkill(s.id)}>
            <Icon name="play" size={13} /> {st && st.xp > 0 ? "Continue" : "Start"}
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="lh-section">
      <h2 className="lh-h2">Your paths</h2>
      {starter.starting && <ClaudeJobLine label={starter.starting.label} job={starter.job} note="The lesson opens as soon as it's written." onClose={starter.cancel} />}
      {[...branches.entries()].map(([name, members]) => {
        // The steps: a planned subject's topics, or the branch's own skills.
        const ids = new Set(members.map((m) => m.id));
        const top = learningOrder(members.filter((m) => !m.topic || !ids.has(m.topic)));
        const subject = top.length === 1 && members.some((m) => m.topic === top[0].id) ? top[0] : null;
        const steps = subject ? partsOf(all, subject.id) : top;
        const nextIndex = steps.findIndex((s) => !skillDone(ws.doc, all, s, stats));
        const current = nextIndex >= 0 ? steps[nextIndex] : null;
        const parts = current ? partsOf(all, current.id) : [];
        const nextPart = parts.findIndex((p) => !skillDone(ws.doc, all, p, stats));
        return (
          <div key={name} className="lh-card lh-branch">
            <div className="lh-branch-head">
              <strong className="row" style={{ gap: 8 }}>
                {subject && <SkillGlyph skill={subject} color={themedColor(areaOf(ws.doc, subject, areas).color, dark)} size={26} />}
                {name}
              </strong>
              <span className="row" style={{ gap: 6 }}>
                {subject && (
                  <button className="btn btn-sm btn-primary" onClick={() => starter.startSkill(subject.id)}>
                    <Icon name="play" size={13} /> Continue path
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    focusSkill((subject ?? steps[0]).id);
                    navigate({ name: "view", wsId: ws.id, view: "skills" });
                  }}
                >
                  Show on the map
                </button>
              </span>
            </div>
            <ol className="lh-branch-steps">
              {steps.map((s, n) => (
                <Fragment key={s.id}>
                  {row(s, n, n === nextIndex)}
                  {s === current && parts.length > 0 && (
                    <li className="lh-parts">
                      <span className="lh-muted lh-parts-title">Learn these to unlock the next step</span>
                      <ol className="lh-branch-steps">{parts.map((p, i) => row(p, i, i === nextPart, true))}</ol>
                    </li>
                  )}
                </Fragment>
              ))}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

function CourseList({ list }: { list: CourseInfo[] }) {
  const { openPage } = useApp();
  if (!list.length) return null;
  return (
    <section className="lh-section">
      <h2 className="lh-h2">Your courses</h2>
      <div className="lh-courses">
        {list.map((c) => (
          <button key={c.id} className="lh-card lh-course" onClick={() => openPage(c.id)}>
            <span className="lh-course-icon">{c.icon}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <strong className="ellipsis">{c.title}</strong>
              <span className="lh-muted ellipsis">{c.done >= c.total && c.total ? "Complete" : c.next ? `Next: ${c.next.title}` : ""}</span>
              <span className="lh-bar small">
                <span style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function CharacterCard({ ws }: { ws: Workspace }) {
  const sheet = characterSheet(ws.doc);
  const dark = useTheme() === "dark";
  return (
    <button className="lh-card lh-character" onClick={() => navigate({ name: "view", wsId: ws.id, view: "skills" })}>
      <span className="lh-kicker">Character</span>
      <strong>
        Level {sheet.level} · {sheet.title}
      </strong>
      <span className="lh-abilities">
        {sheet.areas.slice(0, 6).map((a) => (
          <span key={a.area.id} className="lh-ability" style={{ ["--c" as string]: themedColor(a.area.color, dark) }} title={`${a.area.name} ${a.score}`}>
            <b>{a.area.attribute ?? a.area.name.slice(0, 3)}</b>
            {formatModifier(a.modifier)}
          </span>
        ))}
      </span>
    </button>
  );
}

function Library({ ws }: { ws: Workspace }) {
  const { openPage } = useApp();
  const dark = useTheme() === "dark";
  const areas = listAreas(ws.doc);
  const [ability, setAbility] = useState<string>("all");
  if (!LIBRARY.length) return null;
  const shown = LIBRARY.filter((c) => ability === "all" || c.ability === ability).sort(
    (a, b) => ABILITY_ORDER.indexOf(a.ability) - ABILITY_ORDER.indexOf(b.ability),
  );
  const start = (c: LibraryCourse) => {
    const id = installCourse(ws.doc, c, getSettings().identity.name);
    openPage(id);
  };
  const present = ABILITY_ORDER.filter((a) => LIBRARY.some((c) => c.ability === a));
  return (
    <section className="lh-section">
      <div className="lh-lib-head">
        <h2 className="lh-h2">Explore courses</h2>
        <div className="lh-filter" role="tablist" aria-label="Filter by ability">
          <button role="tab" aria-selected={ability === "all"} className={ability === "all" ? "on" : ""} onClick={() => setAbility("all")}>
            All
          </button>
          {present.map((a) => {
            const area = areas.find((x) => x.id === a);
            return (
              <button key={a} role="tab" aria-selected={ability === a} className={ability === a ? "on" : ""} onClick={() => setAbility(a)}>
                {area?.attribute ?? a.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
      <div className="lh-library">
        {shown.map((c) => {
          const area = areas.find((a) => a.id === c.ability);
          const installed = findLibraryCourse(ws.doc, c.id);
          const page = installed ? getPage(ws.doc, installed) : undefined;
          const done = page ? c.lessons.filter((l) => getProgress(page, l.id).status === "mastered").length : 0;
          return (
            <button key={c.id} className="lh-card lh-lib" style={{ ["--c" as string]: area ? themedColor(area.color, dark) : "var(--accent)" }} onClick={() => start(c)}>
              <span className="lh-lib-top">
                <span className="lh-lib-icon">{c.icon}</span>
                <span className="lh-attr">{area?.attribute ?? c.ability.toUpperCase()}</span>
              </span>
              <strong>{c.title}</strong>
              <span className="lh-muted lh-lib-blurb">{c.blurb}</span>
              <span className="lh-lib-foot">
                {c.skill.icon} {c.skill.name} · {c.lessons.length} lessons
                {installed ? ` · ${done}/${c.lessons.length} done` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

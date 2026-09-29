// A course as a path to walk, like Brilliant: its goal, the lessons in order
// (done, next, ready, being written), the skill and ability it trains, the
// mistakes to fix, and Claude keeping the next lessons written ahead of you.

import { useEffect, useMemo, useState } from "react";
import type * as Y from "yjs";
import { allLessons, courseMap, getCurriculum, getProgress } from "../../../shared/course.ts";
import { courseAhead, courseMistakes, learnerStats, MISTAKE_WHY } from "../../../shared/learning.ts";
import { getLessonContent } from "../../../shared/lesson.ts";
import { displayTitle, pageMeta } from "../../../shared/model.ts";
import { areaOf, levelForXp, listSkills, needsMasteryCheck, themedColor, totalXp } from "../../../shared/skills.ts";
import { Icon } from "../../components/ui.tsx";
import { useApp, useY } from "../../lib/hooks.ts";
import { navigate } from "../../lib/router.ts";
import { useTheme } from "../../lib/theme.ts";
import { dismissClaudeJob, useClaudeJobs } from "../../lib/claude.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { focusSkill } from "../skills/focus.ts";
import { aheadEnabled, aheadRequest, canRunClaude, keepAhead, runRequest, setAheadEnabled } from "./plan.ts";
import { openCheck, openLesson } from "./player.ts";
import { AskClaudeFallback, ClaudeJobLine } from "./ClaudeStatus.tsx";
import "./path.css";

const starsOf = (mastery: number) => (mastery >= 0.9 ? 3 : mastery >= 0.6 ? 2 : 1);

export function CoursePath({ ws, pageId, page }: { ws: Workspace; pageId: string; page: Y.Map<any> }) {
  const { toast } = useApp();
  const course = courseMap(page) as Y.Map<any> | undefined;
  useY(course, true);
  useY(page);
  const dark = useTheme() === "dark";
  const jobs = useClaudeJobs();
  const curriculum = getCurriculum(page);
  const title = displayTitle(pageMeta(page)) || curriculum?.topic || "Course";
  const goal = (course?.get("goal") as string | undefined) ?? "";
  const [editingGoal, setEditingGoal] = useState(false);
  const [ahead_, setAheadState] = useState(aheadEnabled);
  const setAhead = (on: boolean) => {
    setAheadEnabled(on);
    setAheadState(on);
  };

  const refs = useMemo(() => (curriculum ? allLessons(curriculum) : []), [curriculum]);
  const skill = listSkills(ws.doc).find((s) => s.courseIds.includes(pageId));
  const area = skill ? areaOf(ws.doc, skill) : null;
  const color = area ? themedColor(area.color, dark) : "var(--accent)";
  const stats = learnerStats(ws.doc);
  const ahead = courseAhead(page, stats.aheadTarget);
  const mastered = refs.filter((r) => getProgress(page, r.lesson.id).status === "mastered").length;
  const next = ahead.next;
  const nextReady = next ? !!getLessonContent(page, next.id) : false;
  const nextToMaster = next ? (getProgress(page, next.id).toMaster?.length ?? 0) : 0;
  const checkDue = !!skill && needsMasteryCheck(ws.doc, skill);
  const job = jobs.find((j) => j.key === `ahead:${pageId}`);
  const mistakes = courseMistakes(page).slice(-8).reverse();

  // Opening the course keeps its next lessons written (desktop app with Claude Code).
  useEffect(() => {
    keepAhead(ws, pageId);
  }, [ws, pageId]);

  const write = (lessonId?: string) => {
    const req = aheadRequest(ws, pageId, { force: true, lessonId });
    if (!req) return;
    if (!ws.info.sync) {
      toast("Turn on sync for this workspace so Claude can reach it");
      return;
    }
    void runRequest(ws, req);
  };

  if (!curriculum) {
    return (
      <div className="cp-root">
        <p className="muted">This course has no lessons yet.</p>
      </div>
    );
  }

  const skillLevel = skill ? levelForXp(totalXp(ws.doc, skill.id)) : 0;
  return (
    <div className="cp-root" style={{ ["--c" as string]: color }}>
      <header className="cp-head">
        <div className="cp-head-top">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="cp-meta">
              {skill && area && (
                <button className="cp-skill" onClick={() => (focusSkill(skill.id), navigate({ name: "view", wsId: ws.id, view: "skills" }))} title="Show in the skill tree">
                  <span className="cp-attr">{area.attribute ?? area.name}</span>
                  {skill.icon} {skill.name} · level {skillLevel}
                </button>
              )}
              <span>
                {mastered}/{refs.length} lessons mastered
              </span>
            </div>
          </div>
          {next && (
            <button className="btn btn-primary cp-go" disabled={!nextReady} onClick={() => openLesson(pageId, next.id)}>
              <Icon name="play" size={14} /> {nextToMaster ? "Master what you missed" : mastered ? "Continue" : "Start"}
            </button>
          )}
          {!next && checkDue && (
            <button className="btn btn-primary cp-go" onClick={() => openCheck(skill!.id)}>
              <Icon name="star" size={14} /> Take the mastery check
            </button>
          )}
        </div>
        <div className="cp-bar" aria-label={`${mastered} of ${refs.length} lessons done`}>
          <span style={{ width: `${refs.length ? (mastered / refs.length) * 100 : 0}%` }} />
        </div>
        <div className="cp-goal">
          <Icon name="target" size={14} />
          {editingGoal ? (
            <input
              className="input"
              autoFocus
              defaultValue={goal}
              placeholder="A clear, specific goal, e.g. “Juggle 3 balls for 30 seconds by next month”"
              onBlur={(e) => {
                course?.set("goal", e.target.value.trim());
                setEditingGoal(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <button className="cp-goal-text" onClick={() => setEditingGoal(true)}>
              {goal ? <>Goal: {goal}</> : "Set a clear, specific goal: what you'll be able to do, and by when"}
            </button>
          )}
        </div>
      </header>

      {job && (
        <ClaudeJobLine
          label={job.status === "done" ? "Claude finished preparing your lessons" : job.label}
          job={job}
          onClose={job.status !== "running" ? () => dismissClaudeJob(job.key) : undefined}
        />
      )}

      <div className="cp-path">
        {curriculum.levels.map((level) => (
          <section key={level.id} className="cp-level">
            {curriculum.levels.length > 1 && <h2 className="cp-level-name">{level.name}</h2>}
            {level.modules.map((mod) => (
              <div key={mod.id} className="cp-module">
                <div className="cp-module-head">
                  <strong>{mod.title}</strong>
                  {mod.summary && <span>{mod.summary}</span>}
                </div>
                <ol className="cp-lessons">
                  {mod.lessons.map((lesson, n) => {
                    const p = getProgress(page, lesson.id);
                    const done = p.status === "mastered";
                    const toMaster = p.toMaster?.length ?? 0;
                    const ready = !!getLessonContent(page, lesson.id);
                    const isNext = next?.id === lesson.id;
                    const due = p.review && p.review.due <= Date.now();
                    const cls = done ? "done" : isNext ? "next" : ready ? "ready" : "unwritten";
                    return (
                      <li key={lesson.id} className={`cp-lesson ${cls}`} style={{ ["--offset" as string]: `${[0, 34, 52, 34, 0, -34, -52, -34][n % 8]}px` }}>
                        <button
                          className="cp-node"
                          disabled={!ready}
                          onClick={() => openLesson(pageId, lesson.id)}
                          aria-label={`${lesson.title}${done ? ", done" : isNext ? ", up next" : ready ? "" : ", not written yet"}`}
                        >
                          {done ? <Icon name="check" size={20} stroke={2.6} /> : ready ? <Icon name="play" size={18} /> : <Icon name="edit" size={16} />}
                        </button>
                        <div className="cp-lesson-text">
                          <span className="cp-lesson-title">{lesson.title}</span>
                          <span className="cp-lesson-sub">
                            {done ? (
                              <>
                                {"★".repeat(starsOf(p.mastery))}
                                <span className="cp-dim">{"★".repeat(3 - starsOf(p.mastery))}</span>
                                {due && <span className="cp-due"> · review due</span>}
                              </>
                            ) : toMaster ? (
                              `${toMaster} still to master${isNext ? " · up next" : ""}`
                            ) : isNext ? (
                              ready ? "Up next" : "Up next · being written"
                            ) : ready ? (
                              lesson.objectives[0] ?? "Ready"
                            ) : (
                              "Not written yet"
                            )}
                          </span>
                          {!ready && canRunClaude() && job?.status !== "running" && (
                            <button className="btn btn-ghost btn-sm cp-write" onClick={() => write(lesson.id)}>
                              <Icon name="sparkle" size={13} /> Write it with Claude
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </section>
        ))}
        {skill && (
          <div className={`cp-check${skill.masteredAt ? " done" : checkDue ? " due" : ""}`}>
            <Icon name={skill.masteredAt ? "check" : "star"} size={18} />
            <div className="grow">
              <strong>{skill.masteredAt ? `${skill.name} mastered` : "Mastery check"}</strong>
              <span>
                {skill.masteredAt
                  ? "You passed the mastery check: what comes next is open."
                  : checkDue
                    ? "Every lesson mastered. One question from each: get every one right to master it and move on."
                    : "Once every lesson is mastered: one question from each, all right, before you move on."}
              </span>
            </div>
            {checkDue && (
              <button className="btn btn-primary btn-sm" onClick={() => openCheck(skill.id)}>
                Take it
              </button>
            )}
          </div>
        )}
        <div className="cp-end">
          {canRunClaude() ? (
            <button className="btn" disabled={job?.status === "running"} onClick={() => write()}>
              <Icon name="path" size={14} /> {ahead.nearEnd ? "Extend the path with Claude" : "Have Claude write ahead now"}
            </button>
          ) : (
            (ahead.toWrite.length > 0 || ahead.nearEnd) && <AskClaudeFallback request={aheadRequest(ws, pageId, { force: true })} />
          )}
          <p className="cp-end-note">
            Claude keeps about {stats.aheadTarget} lessons written ahead of you ({stats.pace.toFixed(1)} a day lately) and extends the path as you go.
          </p>
          {canRunClaude() && (
            <label className="cp-ahead-toggle">
              <input type="checkbox" checked={ahead_} onChange={(e) => setAhead(e.target.checked)} /> Let Claude prepare lessons in the background
            </label>
          )}
        </div>
      </div>

      {mistakes.length > 0 && (
        <section className="cp-mistakes">
          <h2>Mistakes to learn from</h2>
          <p className="cp-end-note">They come back in your reviews until you get them right.</p>
          <ul>
            {mistakes.map((m) => (
              <li key={`${m.at}-${m.prompt}`}>
                <div className="cp-mistake-q">{m.prompt.replace(/[*_`$]/g, "")}</div>
                <div className="cp-mistake-a">
                  You: <s>{m.given || "—"}</s> · Right: <strong>{m.correct}</strong>
                  {m.why && <span className="cp-why"> · {MISTAKE_WHY[m.why]}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {skill && area && (
        <p className="cp-ability-note">
          Mastering lessons levels up {skill.name} and raises your {area.name} score.
        </p>
      )}
    </div>
  );
}

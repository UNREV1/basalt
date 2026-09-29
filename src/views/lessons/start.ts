// Starting a lesson from a skill or a course, whatever state it's in: open the
// next written lesson; have Claude write it (or plan the skill's course) when
// there isn't one yet; install the matching built-in course; or say what's
// missing. The skill map and the Learn home both start lessons through here.

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { getCurriculum } from "../../../shared/course.ts";
import { courseAhead, finishedLessons, learnerStats } from "../../../shared/learning.ts";
import { getLessonContent } from "../../../shared/lesson.ts";
import { findLibraryCourse, installCourse } from "../../../shared/library/install.ts";
import type { LibraryCourse } from "../../../shared/library/types.ts";
import { getPage } from "../../../shared/model.ts";
import { allParts, computeSkillStats, listSkills, nextStepToward, requirementText, skillDone, type Requirement } from "../../../shared/skills.ts";
import { isJobRunning, useClaudeJobs, type ClaudeJob } from "../../lib/claude.ts";
import { getSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { LIBRARY } from "./library.ts";
import { aheadRequest, canRunClaude, planSkillRequest, runRequest, type ClaudeRequest } from "./plan.ts";
import { openLesson } from "./player.ts";

export type StartPlan =
  /** A written lesson is ready to play. */
  | { kind: "open"; courseId: string; lessonId: string; title: string }
  /** The next lesson is planned but not written (or the course ran out): Claude writes it. */
  | { kind: "write"; courseId: string; title: string; req: ClaudeRequest }
  /** No course yet, but a built-in one trains this skill. */
  | { kind: "library"; course: LibraryCourse }
  /** Nothing planned yet: Claude plans the skill (its parts and lesson titles) and writes the first lesson. */
  | { kind: "build"; req: ClaudeRequest }
  /** Every part of this topic is learnt. */
  | { kind: "done"; name: string }
  /** Nothing to play and Claude can't run here: the course page shows what to do. */
  | { kind: "course-page"; courseId: string }
  /** No course and Claude can't run here: a request to paste into Claude. */
  | { kind: "ask"; req: ClaudeRequest | null }
  /** The skill's prerequisites come first. */
  | { kind: "locked"; missing: Requirement[] };

const isCourse = (page: Y.Map<any> | undefined): page is Y.Map<any> => !!page && !page.get("deletedAt") && !!getCurriculum(page);
const interactive = (page: Y.Map<any>) => (page.get("course") as Y.Map<any> | undefined)?.get("format") === "interactive";

/** What starting a course's next lesson means right now. */
export function planCourseStart(ws: Workspace, courseId: string): StartPlan {
  const page = getPage(ws.doc, courseId);
  if (!isCourse(page) || !interactive(page)) return { kind: "course-page", courseId };
  const ahead = courseAhead(page, learnerStats(ws.doc).aheadTarget);
  const next = ahead.next;
  // Finished: the course page, to review.
  if (!next) return { kind: "course-page", courseId };
  if (getLessonContent(page, next.id)) return { kind: "open", courseId, lessonId: next.id, title: next.title };
  // Planned but not written yet: Claude writes it now.
  const req = aheadRequest(ws, courseId, { lessonId: next.id });
  if (req && canRunClaude()) return { kind: "write", courseId, title: next.title, req };
  return { kind: "course-page", courseId };
}

/** What clicking a skill to start a lesson means right now. */
export function planSkillStart(ws: Workspace, skillId: string): StartPlan {
  const skills = listSkills(ws.doc);
  const skill = skills.find((s) => s.id === skillId);
  if (!skill) return { kind: "ask", req: null };
  const stats = computeSkillStats(ws.doc);
  const st = stats.get(skillId);
  if (st && !st.unlocked) return { kind: "locked", missing: st.missing };

  // A topic: carry on with its next part (Mathematics → Arithmetic → Fractions).
  const parts = allParts(skills, skillId);
  if (parts.length) {
    const leaves = parts.filter((p) => !skills.some((x) => x.topic === p.id));
    const next = leaves.find((p) => stats.get(p.id)?.unlocked !== false && !skillDone(ws.doc, skills, p, stats));
    if (next) return planSkillStart(ws, next.id);
    const blocked = leaves.find((p) => !skillDone(ws.doc, skills, p, stats));
    if (blocked) return { kind: "locked", missing: stats.get(blocked.id)?.missing ?? [] };
    return { kind: "done", name: skill.name };
  }

  const courses = skill.courseIds.filter((id) => isCourse(getPage(ws.doc, id)));
  if (courses.length) {
    // The course learnt most recently first, then the order they were linked.
    const last = new Map<string, number>();
    for (const f of finishedLessons(ws.doc)) if (!last.has(f.courseId)) last.set(f.courseId, f.at);
    const ordered = [...courses].sort((a, b) => (last.get(b) ?? 0) - (last.get(a) ?? 0));
    const plans = ordered.map((id) => planCourseStart(ws, id));
    return plans.find((p) => p.kind === "open") ?? plans.find((p) => p.kind === "write") ?? plans[0];
  }

  const lower = skill.name.trim().toLowerCase();
  const lib = LIBRARY.find((c) => c.skill.name.trim().toLowerCase() === lower);
  if (lib) return { kind: "library", course: lib };
  const req = planSkillRequest(ws, skillId);
  if (req && canRunClaude()) return { kind: "build", req };
  return { kind: "ask", req };
}

export interface Starting {
  /** The skill (or course) we're getting a lesson ready for. */
  skillId?: string;
  courseId?: string;
  label: string;
  jobKey: string;
}

export interface StartUi {
  toast: (msg: string) => void;
  openPage: (id: string) => void;
  /** Show a skill's details (locked skills, or nothing to start here). */
  showSkill?: (id: string) => void;
}

/**
 * Starting lessons, with the wait while Claude writes one: `start` returns
 * right away; when the lesson it asked for is written, it opens by itself.
 */
export function useLessonStarter(ws: Workspace, ui: StartUi) {
  const [starting, setStarting] = useState<Starting | null>(null);
  const jobs = useClaudeJobs();
  const job: ClaudeJob | undefined = starting ? jobs.find((j) => j.key === starting.jobKey) : undefined;

  // Open the lesson as soon as it's written.
  useEffect(() => {
    if (!starting) return;
    const check = () => {
      const plan = starting.skillId ? planSkillStart(ws, starting.skillId) : starting.courseId ? planCourseStart(ws, starting.courseId) : null;
      if (plan?.kind === "open") {
        setStarting(null);
        openLesson(plan.courseId, plan.lessonId);
      }
    };
    check();
    ws.doc.on("update", check);
    return () => ws.doc.off("update", check);
  }, [ws, starting]);

  const run = (req: ClaudeRequest, target: Omit<Starting, "jobKey" | "label">, label: string) => {
    if (!ws.info.sync) {
      ui.toast("Turn on sync for this workspace so Claude can reach it (Share → Sync)");
      return;
    }
    if (!isJobRunning(req.key)) void runRequest(ws, req);
    setStarting({ ...target, label, jobKey: req.key });
  };

  const act = (plan: StartPlan, target: Omit<Starting, "jobKey" | "label">) => {
    switch (plan.kind) {
      case "open":
        setStarting(null);
        openLesson(plan.courseId, plan.lessonId);
        return;
      case "write":
        run(plan.req, target, plan.title ? `Claude is writing “${plan.title}”` : "Claude is adding the next lessons");
        return;
      case "build":
        run(plan.req, target, "Claude is planning this skill and writing your first lesson");
        return;
      case "done":
        ui.toast(`You've learnt all of ${plan.name}`);
        return;
      case "library": {
        const existing = findLibraryCourse(ws.doc, plan.course.id);
        const id = existing ?? installCourse(ws.doc, plan.course, getSettings().identity.name);
        const next = planCourseStart(ws, id);
        if (next.kind === "open") openLesson(next.courseId, next.lessonId);
        else ui.openPage(id);
        return;
      }
      case "course-page":
        ui.openPage(plan.courseId);
        return;
      case "locked": {
        const m = plan.missing;
        const next = target.skillId ? nextStepToward(ws.doc, target.skillId) : undefined;
        ui.toast(`Locked: first ${m[0] ? requirementText(m[0], { now: false }) : "what it needs"}${next ? `. Next step: ${next.name}` : ""}`);
        if (target.skillId) ui.showSkill?.(target.skillId);
        return;
      }
      case "ask":
        if (target.skillId) ui.showSkill?.(target.skillId);
        return;
    }
  };

  return {
    starting,
    job,
    startSkill: (skillId: string) => act(planSkillStart(ws, skillId), { skillId }),
    startCourse: (courseId: string) => act(planCourseStart(ws, courseId), { courseId }),
    cancel: () => setStarting(null),
  };
}

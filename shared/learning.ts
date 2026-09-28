// The learner, across courses: pace, accuracy, streak, and how far ahead of
// them Claude should keep lessons written. Used by the app (to plan ahead in
// the background) and the MCP server (so Claude sees the same picture).

import * as Y from "yjs";
import { allLessons, courseMap, getCurriculum, getProgress, setProgress, type CurriculumLesson } from "./course.ts";
import { getLessonContent, isInteractive, type InteractiveStep, type LessonStep } from "./lesson.ts";
import { getPage, listPages, todayKey } from "./model.ts";

const DAY = 86_400_000;

export interface Finished {
  courseId: string;
  lessonId: string;
  at: number;
  /** First-try accuracy (0..1). */
  score: number;
}

/** Every finished lesson attempt, newest first. */
export function finishedLessons(doc: Y.Doc): Finished[] {
  const out: Finished[] = [];
  for (const meta of listPages(doc)) {
    if (meta.kind !== "course" || meta.deletedAt) continue;
    const page = getPage(doc, meta.id);
    const c = page ? getCurriculum(page) : null;
    if (!page || !c) continue;
    for (const { lesson } of allLessons(c)) {
      for (const q of getProgress(page, lesson.id).quizzes) out.push({ courseId: meta.id, lessonId: lesson.id, at: q.at, score: q.score });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}

export interface LearnerStats {
  /** Lessons finished per day, averaged over the last 14 days. */
  pace: number;
  /** First-try accuracy over the last 8 finished lessons (null before any). */
  accuracy: number | null;
  /** Lessons finished today. */
  today: number;
  /** Days in a row with at least one finished lesson (today or yesterday counts as live). */
  streak: number;
  /** How many upcoming lessons to keep written: about three days at this pace, 2 to 8. */
  aheadTarget: number;
}

export function learnerStats(doc: Y.Doc, now = Date.now()): LearnerStats {
  const done = finishedLessons(doc);
  const recent = done.filter((d) => now - d.at < 14 * DAY);
  const pace = recent.length / 14;
  const last = done.slice(0, 8);
  const accuracy = last.length ? last.reduce((s, d) => s + d.score, 0) / last.length : null;
  const days = new Set(done.map((d) => todayKey(new Date(d.at))));
  const today = done.filter((d) => todayKey(new Date(d.at)) === todayKey(new Date(now))).length;
  let streak = 0;
  let cursor = new Date(now);
  if (!days.has(todayKey(cursor))) cursor = new Date(now - DAY);
  while (days.has(todayKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - DAY);
  }
  const aheadTarget = Math.max(2, Math.min(8, 2 + Math.ceil(pace * 3)));
  return { pace, accuracy, today, streak, aheadTarget };
}

export interface CourseAhead {
  /** The next lesson to take (first not finished), or null when all are done. */
  next: CurriculumLesson | null;
  /** Unfinished lessons from `next` on. */
  remaining: CurriculumLesson[];
  /** How many of those, in order from `next`, are already written. */
  written: number;
  /** The first unwritten lessons, up to `target` from `next`: what to write next. */
  toWrite: CurriculumLesson[];
  /** True when the course is about to run out: time to extend its path. */
  nearEnd: boolean;
}

/** What Claude should write next in a course so lessons stay ready ahead of the learner. */
export function courseAhead(page: Y.Map<any>, target: number): CourseAhead {
  const c = getCurriculum(page);
  const lessons = c ? allLessons(c).map((l) => l.lesson) : [];
  const remaining = lessons.filter((l) => {
    const s = getProgress(page, l.id).status;
    return s !== "mastered" && s !== "skipped";
  });
  let written = 0;
  while (written < remaining.length && getLessonContent(page, remaining[written].id)) written++;
  const toWrite = remaining.slice(0, target).filter((l) => !getLessonContent(page, l.id));
  return { next: remaining[0] ?? null, remaining, written, toWrite, nearEnd: remaining.length < target + 2 };
}

// ---- spaced review ("review later") ------------------------------------------------------

/** Days until each review after finishing a lesson: 1 day, 3 days, a week, a month, three months. */
export const REVIEW_DAYS = [1, 3, 7, 30, 90];

/** After a lesson is finished for the first time: first review tomorrow. */
export function scheduleReview(page: Y.Map<any>, lessonId: string, now = Date.now()) {
  const p = getProgress(page, lessonId);
  if (p.review) return;
  setProgress(page, lessonId, { review: { stage: 0, due: now + REVIEW_DAYS[0] * DAY } });
}

/** A review answer: right moves to the next, longer interval; wrong starts over tomorrow. */
export function recordReview(page: Y.Map<any>, lessonId: string, right: boolean, now = Date.now()) {
  const stage = getProgress(page, lessonId).review?.stage ?? 0;
  const next = right ? Math.min(stage + 1, REVIEW_DAYS.length - 1) : 0;
  setProgress(page, lessonId, { review: { stage: next, due: now + REVIEW_DAYS[next] * DAY } });
}

export interface DueReview {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  due: number;
  steps: LessonStep[];
}

export function dueReviews(doc: Y.Doc, now = Date.now()): DueReview[] {
  const out: DueReview[] = [];
  for (const meta of listPages(doc)) {
    if (meta.kind !== "course") continue;
    const page = getPage(doc, meta.id);
    const c = page ? getCurriculum(page) : null;
    if (!page || !c) continue;
    for (const { lesson } of allLessons(c)) {
      const r = getProgress(page, lesson.id).review;
      const content = r && r.due <= now ? getLessonContent(page, lesson.id) : undefined;
      if (r && content) out.push({ courseId: meta.id, courseTitle: meta.title || c.topic, lessonId: lesson.id, lessonTitle: lesson.title, due: r.due, steps: content.steps });
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

export interface ReviewItem {
  courseId: string;
  lessonId: string;
  step: InteractiveStep;
}

/**
 * A mixed review session: one question from each due lesson (recall and apply
 * questions first, and ones the learner got wrong before), interleaved across
 * courses and topics rather than grouped.
 */
export function reviewSession(doc: Y.Doc, now = Date.now(), max = 8): ReviewItem[] {
  const due = dueReviews(doc, now).slice(0, max);
  const items: ReviewItem[] = [];
  for (const d of due) {
    const page = getPage(doc, d.courseId)!;
    const missed = new Set(courseMistakes(page).filter((m) => m.lessonId === d.lessonId).map((m) => m.prompt));
    const pool = d.steps.filter(isInteractive);
    if (!pool.length) continue;
    const rank = (s: InteractiveStep) => (missed.has(s.prompt) ? 0 : s.phase === "recall" || s.phase === "apply" ? 1 : 2);
    const best = Math.min(...pool.map(rank));
    const choices = pool.filter((s) => rank(s) === best);
    items.push({ courseId: d.courseId, lessonId: d.lessonId, step: choices[Math.floor(Math.random() * choices.length)] });
  }
  // Interleave: never two from the same course in a row when it can be avoided.
  const out: ReviewItem[] = [];
  const left = [...items].sort(() => Math.random() - 0.5);
  while (left.length) {
    const i = left.findIndex((it) => it.courseId !== out.at(-1)?.courseId);
    out.push(left.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out;
}

// ---- error log -------------------------------------------------------------------------------

export type MistakeWhy = "didnt-know" | "misread" | "slip" | "mixed-up";

export const MISTAKE_WHY: Record<MistakeWhy, string> = {
  "didnt-know": "I didn't know it",
  misread: "I misread the question",
  slip: "A careless slip",
  "mixed-up": "I mixed it up with something else",
};

export interface Mistake {
  lessonId: string;
  prompt: string;
  /** What the learner answered, and the right answer, as text. */
  given: string;
  correct: string;
  why?: MistakeWhy;
  at: number;
}

function mistakesArray(page: Y.Map<any>, create: boolean): Y.Array<Mistake> | undefined {
  const course = courseMap(page);
  if (!course) return undefined;
  let arr = course.get("mistakes") as Y.Array<Mistake> | undefined;
  if (!arr && create) {
    arr = new Y.Array<Mistake>();
    course.set("mistakes", arr);
  }
  return arr;
}

export function courseMistakes(page: Y.Map<any>): Mistake[] {
  return mistakesArray(page, false)?.toArray() ?? [];
}

/** Keep the last 200 mistakes per course. */
export function logMistake(page: Y.Map<any>, m: Mistake) {
  const run = () => {
    const arr = mistakesArray(page, true)!;
    arr.push([m]);
    if (arr.length > 200) arr.delete(0, arr.length - 200);
  };
  if (page.doc) page.doc.transact(run);
  else run();
}

/** Note why a logged mistake happened (matched by time and prompt). */
export function explainMistake(page: Y.Map<any>, at: number, prompt: string, why: MistakeWhy) {
  const arr = mistakesArray(page, false);
  if (!arr) return;
  const i = arr.toArray().findIndex((m) => m.at === at && m.prompt === prompt);
  if (i < 0) return;
  const run = () => {
    const m = arr.get(i);
    arr.delete(i, 1);
    arr.insert(i, [{ ...m, why }]);
  };
  if (page.doc) page.doc.transact(run);
  else run();
}

// ---- weekly reflection ----------------------------------------------------------------------

export const learningMap = (doc: Y.Doc) => doc.getMap<unknown>("learning");

/** A week after the last reflection (and after some learning), it's time to reflect. */
export function reflectionDue(doc: Y.Doc, now = Date.now()): boolean {
  const last = Number(learningMap(doc).get("lastReflectionAt")) || 0;
  const done = finishedLessons(doc);
  if (done.length < 3) return false;
  return now - last > 7 * DAY && now - done[done.length - 1].at > 5 * DAY;
}

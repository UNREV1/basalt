// Mastery before moving on. A lesson counts as mastered only once every aspect
// of it is: every question right first time, every key point of an
// explain-it-yourself covered, every practice done and gone well. Whatever was
// missed goes on the lesson's "still to master" list, and a short round of just
// those (each after the explanation that teaches it) clears it. A skill counts
// as learnt only once every lesson is mastered and it has passed its mastery
// check: one question from every lesson, all of them right. A miss in the check
// puts that lesson back on the list. Only then does what comes next unlock.

import * as Y from "yjs";
import { allLessons, getCurriculum, getProgress, setProgress } from "./course.ts";
import { courseMistakes } from "./learning.ts";
import { getLessonContent, isInteractive, type LessonStep } from "./lesson.ts";
import { getPage } from "./model.ts";

/** Practice counts as mastered when it went "Good" or "Great" (4 or 5 of 5). */
export const PRACTICE_MASTERED = 4;

/** A step that shows mastery: a question, an explain-it-yourself, or a practice. */
export const isAspect = (s: LessonStep) => isInteractive(s) || s.type === "teach" || s.type === "practice";

/** A lesson's aspects, by step number (as text: the keys of its "still to master" list). */
export const aspectKeys = (steps: LessonStep[]): string[] => steps.flatMap((s, i) => (isAspect(s) ? [String(i)] : []));

/** What a lesson still needs mastered (its step numbers); empty once it's mastered. */
export function stillToMaster(page: Y.Map<any>, lessonId: string): string[] {
  return getProgress(page, lessonId).toMaster ?? [];
}

export interface Outcome {
  /** The aspect's step number in its lesson. */
  key: string;
  mastered: boolean;
}

export interface Attempt {
  /** The lesson is mastered now. */
  mastered: boolean;
  /** …for the first time. */
  firstTime: boolean;
  /** It was mastered, and isn't any more. */
  lost: boolean;
  /** What's still to master. */
  toMaster: string[];
}

/**
 * An attempt at a lesson: the whole lesson (what it still needs is what was
 * missed this time), or a round of what it still needed (what was mastered
 * comes off, a miss stays). `score` is the first-try accuracy of a whole attempt.
 */
export function recordAttempt(
  page: Y.Map<any>,
  lessonId: string,
  outcomes: Outcome[],
  opts: { whole: boolean; score?: number; now?: number },
): Attempt {
  const now = opts.now ?? Date.now();
  const prev = getProgress(page, lessonId);
  const was = prev.status === "mastered" || prev.status === "skipped";
  // Playing a mastered lesson again is practice: misses go to the error log and reviews, but
  // don't take back what's mastered (only a failed mastery check does, a round at a time).
  const missed = prev.status === "mastered" && opts.whole ? [] : outcomes.filter((o) => !o.mastered).map((o) => o.key);
  let toMaster: string[];
  if (opts.whole) toMaster = missed;
  else {
    const cleared = new Set(outcomes.filter((o) => o.mastered).map((o) => o.key));
    toMaster = (prev.toMaster ?? []).filter((k) => !cleared.has(k));
    for (const k of missed) if (!toMaster.includes(k)) toMaster.push(k);
  }
  toMaster.sort((a, b) => Number(a) - Number(b));
  const mastered = toMaster.length === 0;
  setProgress(page, lessonId, {
    status: mastered ? (prev.status === "skipped" && !opts.whole ? "skipped" : "mastered") : "in-progress",
    toMaster,
    ...(opts.whole && opts.score !== undefined
      ? { mastery: Math.max(prev.mastery, opts.score), quizzes: [...prev.quizzes, { at: now, score: opts.score }] }
      : {}),
    ...(mastered && !prev.masteredAt ? { masteredAt: now } : {}),
  });
  return { mastered, firstTime: mastered && !prev.masteredAt, lost: was && !mastered, toMaster };
}

/**
 * The round that masters what a lesson still needs: each aspect again, after
 * the explanation that teaches it (the nearest one before it, once).
 */
export function masteryRound(steps: LessonStep[], keys: string[]): { step: LessonStep; index?: number }[] {
  const wanted = new Set(keys);
  const used = new Set<number>();
  const out: { step: LessonStep; index?: number }[] = [];
  steps.forEach((step, i) => {
    if (!wanted.has(String(i)) || !isAspect(step)) return;
    for (let j = i - 1; j >= 0; j--) {
      const s = steps[j];
      if (s.type !== "explain" && s.type !== "explore" && s.type !== "reveal") continue;
      if (!used.has(j)) {
        used.add(j);
        out.push({ step: s });
      }
      break;
    }
    out.push({ step, index: i });
  });
  return out;
}

export interface CheckItem {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  /** The step's number in its lesson. */
  index: number;
  step: LessonStep;
}

/**
 * A skill's mastery check: one question from every written lesson of its
 * courses, so every aspect of it is covered. What you got wrong before comes
 * first, then recall and apply questions; a lesson without questions gives its
 * explain-it-yourself or its practice.
 */
export function masteryCheck(doc: Y.Doc, courseIds: string[], rand: () => number = Math.random): CheckItem[] {
  const out: CheckItem[] = [];
  for (const courseId of courseIds) {
    const page = getPage(doc, courseId);
    const c = page && !page.get("deletedAt") ? getCurriculum(page) : null;
    if (!page || !c) continue;
    const mistakes = courseMistakes(page);
    for (const { lesson } of allLessons(c)) {
      const steps = getLessonContent(page, lesson.id)?.steps;
      if (!steps) continue;
      const pick = (test: (s: LessonStep) => boolean) => steps.map((s, i) => ({ s, i })).filter(({ s }) => test(s));
      let pool = pick(isInteractive);
      if (!pool.length) pool = pick((s) => s.type === "teach");
      if (!pool.length) pool = pick((s) => s.type === "practice");
      if (!pool.length) continue;
      const missed = new Set(mistakes.filter((m) => m.lessonId === lesson.id).map((m) => m.prompt));
      const rank = ({ s }: { s: LessonStep }) =>
        "prompt" in s && missed.has(s.prompt) ? 0 : "phase" in s && (s.phase === "recall" || s.phase === "apply") ? 1 : 2;
      const best = Math.min(...pool.map(rank));
      const choices = pool.filter((x) => rank(x) === best);
      const { s, i } = choices[Math.floor(rand() * choices.length)];
      out.push({ courseId, lessonId: lesson.id, lessonTitle: lesson.title, index: i, step: s });
    }
  }
  return out;
}

/** Whether a skill's mastery check has anything to ask (some lesson of it is written). */
export function hasMasteryCheck(doc: Y.Doc, courseIds: string[]): boolean {
  for (const courseId of courseIds) {
    const page = getPage(doc, courseId);
    const c = page && !page.get("deletedAt") ? getCurriculum(page) : null;
    if (page && c && allLessons(c).some(({ lesson }) => getLessonContent(page, lesson.id)?.steps.some(isAspect))) return true;
  }
  return false;
}

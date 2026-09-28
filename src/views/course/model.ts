// Derived views over the course data (shared/course.ts): lesson lookup,
// progress statistics and the outline text used as context in prompts.

import * as Y from "yjs";
import {
  allLessons,
  courseMap,
  setProgress,
  type ChatMessage,
  type Curriculum,
  type CurriculumLesson,
  type CurriculumLevel,
  type CurriculumModule,
  type LessonProgress,
  type LessonStatus,
} from "../../../shared/course.ts";
import { getPage } from "../../../shared/model.ts";

/** Transaction origin for every write the tutor makes. */
export const TUTOR_ORIGIN = "basalt-tutor";

export interface CourseInfo {
  topic: string;
  goal: string;
  startLevel: string;
  notes: string;
}

export function courseInfo(page: Y.Map<any>): CourseInfo {
  const c = courseMap(page);
  return {
    topic: (c?.get("topic") as string | undefined) || (page.get("title") as string) || "",
    goal: (c?.get("goal") as string | undefined) || "Deep understanding",
    startLevel: (c?.get("startLevel") as string | undefined) || "Complete beginner",
    notes: (c?.get("notes") as string | undefined) ?? "",
  };
}

export interface LessonRef {
  level: CurriculumLevel;
  levelIndex: number;
  module: CurriculumModule;
  moduleIndex: number;
  lesson: CurriculumLesson;
  /** Position in the whole course. */
  index: number;
}

export function lessonRefs(c: Curriculum): LessonRef[] {
  const out: LessonRef[] = [];
  c.levels.forEach((level, levelIndex) =>
    level.modules.forEach((module, moduleIndex) =>
      module.lessons.forEach((lesson) => out.push({ level, levelIndex, module, moduleIndex, lesson, index: out.length })),
    ),
  );
  return out;
}

export function findLesson(c: Curriculum, lessonId: string): LessonRef | undefined {
  return lessonRefs(c).find((r) => r.lesson.id === lessonId);
}

const EMPTY_PROGRESS: LessonProgress = { status: "not-started", mastery: 0, quizzes: [], updatedAt: 0 };

export type ProgressOf = (lessonId: string) => LessonProgress;

/** Snapshot reader for the course's progress map. */
export function progressReader(page: Y.Map<any>): ProgressOf {
  const map = courseMap(page)?.get("progress") as Y.Map<LessonProgress> | undefined;
  return (id) => map?.get(id) ?? EMPTY_PROGRESS;
}

export interface LevelStats {
  total: number;
  mastered: number;
  skipped: number;
  inProgress: number;
  done: number;
}

export interface CourseStats extends LevelStats {
  levels: LevelStats[];
  nextUp?: LessonRef;
  /** Level the learner is currently working in. */
  currentLevelIndex: number;
  averageMastery: number;
}

const isDone = (s: LessonStatus) => s === "mastered" || s === "skipped";

export function courseStats(c: Curriculum, progressOf: ProgressOf): CourseStats {
  const refs = lessonRefs(c);
  const levels: LevelStats[] = c.levels.map(() => ({ total: 0, mastered: 0, skipped: 0, inProgress: 0, done: 0 }));
  const totals: LevelStats = { total: 0, mastered: 0, skipped: 0, inProgress: 0, done: 0 };
  let nextUp: LessonRef | undefined;
  let masterySum = 0;
  let masteryCount = 0;
  for (const ref of refs) {
    const p = progressOf(ref.lesson.id);
    for (const s of [levels[ref.levelIndex], totals]) {
      s.total++;
      if (p.status === "mastered") s.mastered++;
      if (p.status === "skipped") s.skipped++;
      if (p.status === "in-progress") s.inProgress++;
      if (isDone(p.status)) s.done++;
    }
    if (p.quizzes.length) {
      masterySum += p.mastery;
      masteryCount++;
    }
    if (!nextUp && !isDone(p.status)) nextUp = ref;
  }
  return {
    ...totals,
    levels,
    nextUp,
    currentLevelIndex: nextUp ? nextUp.levelIndex : Math.max(0, c.levels.length - 1),
    averageMastery: masteryCount ? masterySum / masteryCount : 0,
  };
}

/** Is `pageId` an existing, non-trashed page? */
export function pageAlive(doc: Y.Doc, pageId: string | undefined): pageId is string {
  if (!pageId) return false;
  const p = getPage(doc, pageId);
  return !!p && !p.get("deletedAt");
}

export function writeProgress(page: Y.Map<any>, lessonId: string, patch: Partial<LessonProgress>) {
  const doc = page.doc;
  if (doc) doc.transact(() => setProgress(page, lessonId, patch), TUTOR_ORIGIN);
  else setProgress(page, lessonId, patch);
}

export function chatsMap(page: Y.Map<any>): Y.Map<ChatMessage[]> | undefined {
  return courseMap(page)?.get("chats") as Y.Map<ChatMessage[]> | undefined;
}

const STATUS_LABEL: Record<LessonStatus, string> = {
  "not-started": "not started",
  "in-progress": "in progress",
  mastered: "mastered",
  skipped: "skipped (already known)",
};

export function statusLabel(s: LessonStatus): string {
  return STATUS_LABEL[s];
}

/** Compact course outline with the learner's progress, for prompts. */
export function outlineText(c: Curriculum, progressOf?: ProgressOf, currentLessonId?: string): string {
  const lines: string[] = [];
  c.levels.forEach((level, li) => {
    lines.push(`Level ${li + 1}: ${level.name}${level.summary ? ` (${level.summary})` : ""}`);
    level.modules.forEach((m) => {
      lines.push(`  Module: ${m.title}`);
      for (const l of m.lessons) {
        const p = progressOf?.(l.id);
        const status = p ? ` [${statusLabel(p.status)}${p.quizzes.length ? `, best quiz ${Math.round(p.mastery * 100)}%` : ""}]` : "";
        lines.push(`    - ${l.title}${status}${l.id === currentLessonId ? "  <- current lesson" : ""}`);
      }
    });
  });
  return lines.join("\n");
}

export function lessonCount(c: Curriculum): number {
  return allLessons(c).length;
}

/** sessionStorage key remembering which lesson a course view has open. */
export function openLessonKey(pageId: string): string {
  return `basalt:course-lesson:${pageId}`;
}

export function rememberOpenLesson(pageId: string, lessonId: string | null) {
  try {
    if (lessonId) sessionStorage.setItem(openLessonKey(pageId), lessonId);
    else sessionStorage.removeItem(openLessonKey(pageId));
  } catch {
    // storage unavailable (private mode); the view just opens on the roadmap
  }
}

export function recallOpenLesson(pageId: string): string | null {
  try {
    return sessionStorage.getItem(openLessonKey(pageId));
  } catch {
    return null;
  }
}

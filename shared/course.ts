// Data shape for AI tutor courses (page kind "course"). Shared by the in-app
// tutor and the MCP server so either can create and advance a course.
//
// page.get("course") is a Y.Map with:
//   topic: string            what the learner wants to learn
//   goal: string             free text, e.g. "research-level understanding"
//   startLevel: string       self-reported starting level
//   curriculum: Curriculum   plain JSON, replaced as a whole when (re)generated
//   progress: Y.Map          lessonId -> LessonProgress (plain JSON per lesson)
//   chats: Y.Map             lessonId | "course" -> ChatMessage[] (plain JSON)
//   createdAt: number

import * as Y from "yjs";
import { randomId } from "./crypto.ts";

export const LEVELS = [
  "Foundations",
  "Beginner",
  "Intermediate",
  "Advanced",
  "Graduate",
  "PhD / Research frontier",
] as const;

export interface CurriculumLesson {
  id: string;
  title: string;
  objectives: string[];
}

export interface CurriculumModule {
  id: string;
  title: string;
  summary: string;
  lessons: CurriculumLesson[];
}

export interface CurriculumLevel {
  id: string;
  name: string;
  summary: string;
  modules: CurriculumModule[];
}

export interface Curriculum {
  topic: string;
  overview: string;
  levels: CurriculumLevel[];
}

export type LessonStatus = "not-started" | "in-progress" | "mastered" | "skipped";

export interface LessonProgress {
  status: LessonStatus;
  /** 0..1 best quiz score */
  mastery: number;
  lessonPageId?: string;
  quizzes: { at: number; score: number }[];
  updatedAt: number;
  /** Spaced review: which interval comes next and when it's due (see shared/learning.ts). */
  review?: { stage: number; due: number };
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  at: number;
}

export function courseMap(page: Y.Map<any>): Y.Map<any> {
  return page.get("course") as Y.Map<any>;
}

/** Ensure the nested containers exist (call from the creating client only). */
export function initCourse(page: Y.Map<any>, init: { topic: string; goal?: string; startLevel?: string }) {
  const course = courseMap(page);
  const doc = page.doc;
  const run = () => {
    course.set("topic", init.topic);
    course.set("goal", init.goal ?? "");
    course.set("startLevel", init.startLevel ?? "Complete beginner");
    course.set("createdAt", Date.now());
    if (!course.get("progress")) course.set("progress", new Y.Map());
    if (!course.get("chats")) course.set("chats", new Y.Map());
  };
  if (doc) doc.transact(run);
  else run();
}

/** Assign ids to anything missing them (model output may omit ids). */
export function normalizeCurriculum(c: Curriculum): Curriculum {
  return {
    topic: c.topic,
    overview: c.overview ?? "",
    levels: (c.levels ?? []).map((l) => ({
      id: l.id || randomId(8),
      name: l.name,
      summary: l.summary ?? "",
      modules: (l.modules ?? []).map((m) => ({
        id: m.id || randomId(8),
        title: m.title,
        summary: m.summary ?? "",
        lessons: (m.lessons ?? []).map((ls) => ({
          id: ls.id || randomId(8),
          title: ls.title,
          objectives: ls.objectives ?? [],
        })),
      })),
    })),
  };
}

export function getCurriculum(page: Y.Map<any>): Curriculum | null {
  return (courseMap(page)?.get("curriculum") as Curriculum | undefined) ?? null;
}

export function setCurriculum(page: Y.Map<any>, c: Curriculum) {
  courseMap(page).set("curriculum", normalizeCurriculum(c));
}

export function getProgress(page: Y.Map<any>, lessonId: string): LessonProgress {
  const p = (courseMap(page)?.get("progress") as Y.Map<LessonProgress> | undefined)?.get(lessonId);
  return p ?? { status: "not-started", mastery: 0, quizzes: [], updatedAt: 0 };
}

export function setProgress(page: Y.Map<any>, lessonId: string, patch: Partial<LessonProgress>) {
  const map = courseMap(page).get("progress") as Y.Map<LessonProgress>;
  map.set(lessonId, { ...getProgress(page, lessonId), ...patch, updatedAt: Date.now() });
}

export function allLessons(c: Curriculum): { level: CurriculumLevel; module: CurriculumModule; lesson: CurriculumLesson }[] {
  const out: { level: CurriculumLevel; module: CurriculumModule; lesson: CurriculumLesson }[] = [];
  for (const level of c.levels) for (const module of level.modules) for (const lesson of module.lessons) out.push({ level, module, lesson });
  return out;
}

/** JSON schema for a curriculum (for structured outputs). */
export const CURRICULUM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "overview", "levels"],
  properties: {
    topic: { type: "string" },
    overview: { type: "string" },
    levels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "summary", "modules"],
        properties: {
          name: { type: "string" },
          summary: { type: "string" },
          modules: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "summary", "lessons"],
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                lessons: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "objectives"],
                    properties: {
                      title: { type: "string" },
                      objectives: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

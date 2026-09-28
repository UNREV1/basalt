// Claude-backed actions of a course: design the curriculum, write lessons,
// build quizzes, grade answers and write remedial explanations. Each runs as a
// job (see jobs.ts) and writes its result into the workspace Y.Doc.

import type * as Y from "yjs";
import {
  CURRICULUM_SCHEMA,
  LEVELS,
  courseMap,
  getCurriculum,
  normalizeCurriculum,
  type ChatMessage,
  type Curriculum,
  type LessonProgress,
} from "../../../shared/course.ts";
import { createPage, getPage } from "../../../shared/model.ts";
import { generateJson, streamText } from "../../lib/ai.ts";
import { appendMarkdown, pageToMarkdown, setPageMarkdown } from "../../lib/markdown.ts";
import { getSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { jobKeys, runJob } from "./jobs.ts";
import {
  chatsMap,
  courseInfo,
  findLesson,
  lessonRefs,
  pageAlive,
  progressReader,
  TUTOR_ORIGIN,
  writeProgress,
  type LessonRef,
} from "./model.ts";
import {
  clip,
  curriculumPrompt,
  curriculumSystem,
  GRADE_SCHEMA,
  gradePrompt,
  gradeSystem,
  lessonPrompt,
  lessonSystem,
  PLACEMENT_LEVELS,
  PLACEMENT_SCHEMA,
  placementPrompt,
  QUIZ_SCHEMA,
  quizPrompt,
  quizSystem,
  remedialPrompt,
  type Grade,
  type MissedItem,
  type PlacementQuestion,
  type QuizQuestion,
} from "./prompts.ts";

// ---- curriculum ---------------------------------------------------------------------

/** Rough size of a finished curriculum as JSON, for the progress indicator. */
export const EXPECTED_CURRICULUM_CHARS = 30000;

function setGenerating(ws: Workspace, course: Y.Map<any>, on: boolean) {
  ws.doc.transact(() => {
    if (on) {
      course.set("status", "generating");
      course.set("generatingBy", getSettings().identity.name);
      course.set("generatingClient", ws.doc.clientID);
      course.set("generationStartedAt", Date.now());
    } else if (course.get("generatingClient") === ws.doc.clientID) {
      for (const k of ["status", "generatingBy", "generatingClient", "generationStartedAt"]) course.delete(k);
    }
  }, TUTOR_ORIGIN);
}

function coerceCurriculum(raw: Curriculum, topic: string): Curriculum {
  const levels = (raw.levels ?? []).filter((l) => l.modules?.some((m) => m.lessons?.length));
  if (levels.length < LEVELS.length) {
    throw new Error(`Claude returned ${levels.length} of ${LEVELS.length} levels. Please try again.`);
  }
  return normalizeCurriculum({
    topic: raw.topic || topic,
    overview: raw.overview,
    levels: LEVELS.map((name, i) => ({
      ...levels[i],
      id: "",
      name,
      modules: levels[i].modules
        .map((m) => ({ ...m, id: "", lessons: m.lessons.filter((l) => l.title?.trim()).map((l) => ({ ...l, id: "" })) }))
        .filter((m) => m.lessons.length),
    })),
  });
}

/** Carry progress and chats over to lessons whose titles survived a regeneration. */
function remapByTitle(course: Y.Map<any>, oldC: Curriculum, newC: Curriculum) {
  const key = (t: string) => t.trim().toLowerCase();
  const byTitle = new Map<string, string>();
  for (const r of lessonRefs(newC)) byTitle.set(key(r.lesson.title), r.lesson.id);
  const progress = course.get("progress") as Y.Map<LessonProgress> | undefined;
  const chats = course.get("chats") as Y.Map<ChatMessage[]> | undefined;
  const oldProgress = new Map(progress ? [...progress.entries()] : []);
  const oldChats = new Map(chats ? [...chats.entries()] : []);
  progress?.clear();
  for (const k of oldChats.keys()) if (k !== "course") chats?.delete(k);
  for (const r of lessonRefs(oldC)) {
    const newId = byTitle.get(key(r.lesson.title));
    if (!newId) continue;
    const p = oldProgress.get(r.lesson.id);
    if (p) progress?.set(newId, p);
    const ch = oldChats.get(r.lesson.id);
    if (ch) chats?.set(newId, ch);
  }
}

export function startCurriculum(ws: Workspace, pageId: string, feedback?: string) {
  const page = getPage(ws.doc, pageId);
  const course = page && courseMap(page);
  if (!page || !course) return Promise.resolve(undefined);
  const info = courseInfo(page);
  const previous = getCurriculum(page);
  setGenerating(ws, course, true);
  return runJob(jobKeys.curriculum(pageId), async ({ signal, setChars }) => {
    try {
      const raw = await generateJson<Curriculum>({
        system: curriculumSystem(),
        prompt: curriculumPrompt(info, { previous, feedback }),
        schema: CURRICULUM_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 64000,
        signal,
        onProgress: setChars,
      });
      const next = coerceCurriculum(raw, info.topic);
      ws.doc.transact(() => {
        const current = getCurriculum(page);
        course.set("curriculum", next);
        if (current) remapByTitle(course, current, next);
      }, TUTOR_ORIGIN);
      return next;
    } finally {
      setGenerating(ws, course, false);
    }
  });
}

// ---- lessons ------------------------------------------------------------------------

/** Markdown of a lesson page with LaTeX restored, or "" when not written yet. */
export function lessonMarkdown(ws: Workspace, lessonPageId: string | undefined): string {
  if (!pageAlive(ws.doc, lessonPageId)) return "";
  return pageToMarkdown(ws, lessonPageId);
}

/** Tidy model output before it becomes a page: no duplicate title, one card per block. */
export function finalizeLesson(md: string): string {
  let out = md.replace(/^\s*#\s+[^\n]*\n+/, "").trim();
  const m = out.match(/^##\s+(?:🃏\s*)?Flashcards\b[^\n]*\n/im);
  if (m && m.index !== undefined) {
    const start = m.index + m[0].length;
    const nextHeading = out.slice(start).search(/^#{1,2}\s/m);
    const end = nextHeading === -1 ? out.length : start + nextHeading;
    const cards = out
      .slice(start, end)
      .split("\n")
      .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim())
      .filter(Boolean);
    out = `${out.slice(0, start)}\n${cards.join("\n\n")}\n${out.slice(end) ? `\n${out.slice(end)}` : ""}`.trim();
  }
  return out;
}

function lessonContext(ws: Workspace, page: Y.Map<any>, c: Curriculum, ref: LessonRef) {
  const progressOf = progressReader(page);
  const refs = lessonRefs(c);
  const previousInModule = ref.module.lessons.slice(0, ref.module.lessons.findIndex((l) => l.id === ref.lesson.id)).map((l) => l.title);
  const existingPages = refs
    .filter((r) => r.index < ref.index && pageAlive(ws.doc, progressOf(r.lesson.id).lessonPageId))
    .map((r) => r.lesson.title)
    .slice(-25);
  const recentProgress = refs
    .filter((r) => r.index < ref.index && progressOf(r.lesson.id).quizzes.length)
    .slice(-6)
    .map((r) => `- ${r.lesson.title}: best quiz ${Math.round(progressOf(r.lesson.id).mastery * 100)}% (${progressOf(r.lesson.id).status})`);
  return { previousInModule, existingPages, recentProgress, nextTitle: refs[ref.index + 1]?.lesson.title };
}

export function startLesson(ws: Workspace, pageId: string, lessonId: string) {
  const page = getPage(ws.doc, pageId);
  const c = page && getCurriculum(page);
  const ref = c && findLesson(c, lessonId);
  if (!page || !c || !ref) return Promise.resolve(undefined);
  const info = courseInfo(page);
  return runJob(jobKeys.lesson(pageId, lessonId), async ({ signal, setText }) => {
    const md = await streamText({
      system: lessonSystem(info, ref),
      messages: [{ role: "user", content: lessonPrompt({ info, curriculum: c, ref, ...lessonContext(ws, page, c, ref) }) }],
      maxTokens: 48000,
      signal,
      onText: (_, full) => setText(full),
    });
    if (signal.aborted) return undefined;
    const content = finalizeLesson(md);
    const prev = progressReader(page)(lessonId);
    let lessonPageId = prev.lessonPageId;
    ws.doc.transact(() => {
      if (!pageAlive(ws.doc, lessonPageId)) {
        lessonPageId = createPage(ws.doc, {
          kind: "doc",
          title: ref.lesson.title,
          icon: "📘",
          parentId: pageId,
          order: ref.index,
          createdBy: getSettings().identity.name,
        });
      }
      setPageMarkdown(ws, lessonPageId!, content);
      writeProgress(page, lessonId, {
        lessonPageId,
        status: prev.status === "mastered" ? "mastered" : "in-progress",
      });
    }, TUTOR_ORIGIN);
    return lessonPageId;
  });
}

export function startRemedial(ws: Workspace, pageId: string, lessonId: string, missed: MissedItem[]) {
  const page = getPage(ws.doc, pageId);
  const c = page && getCurriculum(page);
  const ref = c && findLesson(c, lessonId);
  const lessonPageId = page && progressReader(page)(lessonId).lessonPageId;
  if (!page || !ref || !pageAlive(ws.doc, lessonPageId)) return Promise.resolve(undefined);
  const info = courseInfo(page);
  return runJob(jobKeys.remedial(pageId, lessonId), async ({ signal, setText }) => {
    const text = await streamText({
      system: lessonSystem(info, ref),
      messages: [{ role: "user", content: remedialPrompt(ref, clip(lessonMarkdown(ws, lessonPageId), 30000), missed) }],
      maxTokens: 24000,
      signal,
      onText: (_, full) => setText(full),
    });
    if (signal.aborted) return undefined;
    const body = text.replace(/^\s*#{1,2}\s+[^\n]*\n+/, "").trim();
    ws.doc.transact(() => appendMarkdown(ws, lessonPageId, `## Another angle\n\n${body}`), TUTOR_ORIGIN);
    return body;
  });
}

// ---- quizzes ------------------------------------------------------------------------

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle options so the answer position is truly random, and drop malformed items. */
function tidyMc<T extends { options: string[]; answer: number }>(q: T): T | null {
  const options = q.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2 || q.answer < 0 || q.answer >= options.length) return null;
  const order = shuffled(options.map((_, i) => i));
  return { ...q, options: order.map((i) => options[i]), answer: order.indexOf(q.answer) };
}

export function tidyQuiz(questions: QuizQuestion[]): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (const q of questions) {
    if (!q.question?.trim()) continue;
    if (q.kind === "short") out.push({ ...q, options: [], answer: -1 });
    else {
      const t = tidyMc(q);
      if (t) out.push(t);
    }
  }
  return out;
}

export function startQuiz(ws: Workspace, pageId: string, lessonId: string, avoid: string[] = []) {
  const page = getPage(ws.doc, pageId);
  const c = page && getCurriculum(page);
  const ref = c && findLesson(c, lessonId);
  if (!page || !ref) return Promise.resolve(undefined);
  const info = courseInfo(page);
  const md = lessonMarkdown(ws, progressReader(page)(lessonId).lessonPageId);
  return runJob(jobKeys.quiz(pageId, lessonId), async ({ signal, setChars }) => {
    const res = await generateJson<{ questions: QuizQuestion[] }>({
      system: quizSystem(info),
      prompt: quizPrompt({ ref, lessonMarkdown: clip(md || "(No lesson text yet: base the quiz on the objectives.)", 40000), avoid }),
      schema: QUIZ_SCHEMA,
      effort: "medium",
      signal,
      onProgress: setChars,
    });
    const questions = tidyQuiz(res.questions ?? []);
    if (questions.length < 3) throw new Error("Claude returned too few usable questions. Please try again.");
    return questions;
  });
}

export async function gradeShortAnswer(page: Y.Map<any>, q: QuizQuestion, answer: string, signal?: AbortSignal): Promise<Grade> {
  if (!answer.trim()) return { score: 0, verdict: "incorrect", feedback: "No answer was given." };
  const g = await generateJson<Grade>({
    system: gradeSystem(courseInfo(page)),
    prompt: gradePrompt(q, answer),
    schema: GRADE_SCHEMA,
    effort: "low",
    maxTokens: 8000,
    signal,
  });
  return { ...g, score: Math.max(0, Math.min(1, Number(g.score) || 0)) };
}

export function startPlacement(ws: Workspace, pageId: string) {
  const page = getPage(ws.doc, pageId);
  const c = page && getCurriculum(page);
  if (!page || !c) return Promise.resolve(undefined);
  const info = courseInfo(page);
  return runJob(jobKeys.placement(pageId), async ({ signal, setChars }) => {
    const res = await generateJson<{ questions: PlacementQuestion[] }>({
      system: quizSystem(info),
      prompt: placementPrompt(info, c),
      schema: PLACEMENT_SCHEMA,
      effort: "medium",
      signal,
      onProgress: setChars,
    });
    const questions = (res.questions ?? [])
      .filter((q) => q.question?.trim() && q.level >= 0 && q.level < PLACEMENT_LEVELS)
      .map((q) => tidyMc(q))
      .filter((q): q is PlacementQuestion => !!q)
      .sort((a, b) => a.level - b.level);
    if (questions.length < PLACEMENT_LEVELS) throw new Error("Claude returned too few usable questions. Please try again.");
    return questions;
  });
}

/** Mark every not-yet-started lesson in levels below `levelIndex` as skipped. */
export function skipBelow(page: Y.Map<any>, levelIndex: number): number {
  const c = getCurriculum(page);
  if (!c) return 0;
  const progressOf = progressReader(page);
  let n = 0;
  const run = () => {
    for (const r of lessonRefs(c)) {
      if (r.levelIndex >= levelIndex) continue;
      const p = progressOf(r.lesson.id);
      if (p.status === "not-started") {
        writeProgress(page, r.lesson.id, { status: "skipped" });
        n++;
      }
    }
  };
  if (page.doc) page.doc.transact(run, TUTOR_ORIGIN);
  else run();
  return n;
}

export function appendChat(page: Y.Map<any>, scope: string, message: ChatMessage) {
  const chats = chatsMap(page);
  if (!chats) return;
  const run = () => chats.set(scope, [...(chats.get(scope) ?? []), message]);
  if (page.doc) page.doc.transact(run, TUTOR_ORIGIN);
  else run();
}

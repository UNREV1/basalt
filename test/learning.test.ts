import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import * as Y from "yjs";
import { compile, validExpr } from "../shared/expr.ts";
import { getProgress, setProgress } from "../shared/course.ts";
import {
  checkChoice,
  checkInput,
  checkMatch,
  checkOrder,
  checkSlider,
  getLessonContent,
  isInteractive,
  lessonProblems,
  normalizeFigure,
  normalizeStep,
  parseNumber,
  starsFor,
  type InputStep,
  type SliderStep,
} from "../shared/lesson.ts";
import {
  courseAhead,
  courseMistakes,
  dueReviews,
  learnerStats,
  logMistake,
  recordReview,
  reviewSession,
  scheduleReview,
} from "../shared/learning.ts";
import { findLibraryCourse, installCourse } from "../shared/library/install.ts";
import type { LibraryCourse } from "../shared/library/types.ts";
import { getPage } from "../shared/model.ts";
import { listSkills, totalXp } from "../shared/skills.ts";

const DAY = 86_400_000;

test("steps: normalizing keeps good steps and drops broken ones", () => {
  assert.deepEqual(normalizeStep({ type: "explain", body: " Hi " }), { type: "explain", body: "Hi" });
  assert.equal(normalizeStep({ type: "choice", prompt: "?", options: ["a", "b"], answer: [5] }), null, "answer out of range");
  assert.equal(normalizeStep({ type: "choice", prompt: "?", options: ["a", "b"], answer: [0, 1] }), null, "every option can't be right");
  assert.deepEqual(normalizeStep({ type: "choice", prompt: "?", options: ["a", "b", "c"], answer: 2, explain: "x" })?.type, "choice");
  assert.equal(normalizeStep({ type: "order", prompt: "?", items: ["a", "a"] }), null, "duplicate items");
  assert.equal(normalizeStep({ type: "slider", prompt: "?", min: 0, max: 10, answer: 20 }), null, "answer outside the range");
  assert.equal(normalizeStep({ type: "slider", prompt: "?", min: 0, max: 10, answer: 3, plot: "alert(1)" }), null, "unknown names in plots");
  assert.equal((normalizeStep({ type: "slider", prompt: "?", min: 0, max: 10, value: 3, explain: "e" }) as SliderStep).answer, 3, "flat AI shape");
  assert.equal(normalizeStep({ type: "practice", prompt: "Juggle", minutes: 0 }), null);
  assert.equal(normalizeStep({ type: "teach", prompt: "Explain", keyPoints: ["a"], model: "m" })?.type, "teach");
  assert.equal(normalizeStep({ type: "explain", body: "x", phase: "nope" })?.phase, undefined);
  assert.equal(normalizeStep({ type: "explain", body: "x", phase: "recall" })?.phase, "recall");
  assert.equal(normalizeStep({ type: "bogus" }), null);
});

test("steps: figures are inline SVG or https images only", () => {
  assert.equal(normalizeFigure('<svg viewBox="0 0 1 1"></svg>'), '<svg viewBox="0 0 1 1"></svg>');
  assert.equal(normalizeFigure("https://upload.wikimedia.org/a.png"), "https://upload.wikimedia.org/a.png");
  assert.equal(normalizeFigure("http://example.com/a.png"), undefined);
  assert.equal(normalizeFigure("javascript:alert(1)"), undefined);
  assert.equal(normalizeFigure("<div>hi</div>"), undefined);
});

test("steps: lesson problems explain what's missing", () => {
  assert.ok(lessonProblems([{ type: "explain", body: "a" }]).some((p) => p.includes("at least 3")));
  assert.ok(
    lessonProblems([
      { type: "explain", body: "a" },
      { type: "explain", body: "b" },
      { type: "explain", body: "c" },
    ]).some((p) => p.includes("interactive")),
  );
  assert.ok(lessonProblems([{ type: "choice", prompt: "?", options: ["a"], answer: [0] }]).some((p) => p.includes("step 1")));
});

test("answers: numbers, text, choices, order, match and sliders", () => {
  assert.equal(parseNumber("1,000"), 1000);
  assert.equal(parseNumber("3/4"), 0.75);
  assert.equal(parseNumber("50%"), 50);
  assert.equal(parseNumber("abc"), null);
  const num: InputStep = { type: "input", prompt: "?", answers: ["0.5", "1/2"], explain: "" };
  assert.ok(checkInput(num, "1/2"));
  assert.ok(checkInput(num, " .5 "));
  assert.ok(!checkInput(num, "0.51"));
  const tol: InputStep = { ...num, answers: ["0.167"], tolerance: 0.005 };
  assert.ok(checkInput(tol, "1/6"));
  const word: InputStep = { type: "input", prompt: "?", answers: ["Mitochondria"], explain: "" };
  assert.ok(checkInput(word, "  the mitochondria. "));
  assert.ok(!checkInput(word, ""));
  const choice = { type: "choice" as const, prompt: "?", options: ["a", "b", "c"], answer: [0, 2], explain: "" };
  assert.ok(checkChoice(choice, [2, 0]));
  assert.ok(!checkChoice(choice, [0]));
  assert.ok(checkOrder({ type: "order", prompt: "?", items: ["a", "b", "c"], explain: "" }, [0, 1, 2]));
  assert.ok(!checkOrder({ type: "order", prompt: "?", items: ["a", "b", "c"], explain: "" }, [1, 0, 2]));
  const pairs = [
    { left: "a", right: "1" },
    { left: "b", right: "2" },
  ];
  assert.ok(checkMatch({ type: "match", prompt: "?", pairs, explain: "" }, [0, 1]));
  assert.ok(!checkMatch({ type: "match", prompt: "?", pairs, explain: "" }, [1, 0]));
  const slider: SliderStep = { type: "slider", prompt: "?", min: 0, max: 100, answer: 40, explain: "" };
  assert.ok(checkSlider(slider, 41.5), "default tolerance is 2% of the range");
  assert.ok(!checkSlider(slider, 43));
  assert.deepEqual([starsFor(9, 10), starsFor(6, 10), starsFor(1, 10), starsFor(0, 0)], [3, 2, 1, 3]);
});

test("expressions: safe math for graphs and readouts", () => {
  assert.equal(compile("v*x^2")({ x: 2, v: 3 }), 12);
  assert.equal(compile("2x + 1")({ x: 3 }), 7, "implicit multiplication");
  assert.equal(compile("-x^2")({ x: 3 }), -9);
  assert.equal(compile("2^3^2")({}), 512, "right-associative powers");
  assert.ok(Math.abs(compile("sin(pi/2)")({}) - 1) < 1e-12);
  assert.ok(Number.isNaN(compile("y + 1")({ x: 1 })), "unknown variables give NaN, not an exception");
  assert.ok(Number.isNaN(compile("1/0")({})));
  assert.ok(validExpr("sqrt(2*x/9.81)*v", ["x", "v"]));
  assert.ok(!validExpr("constructor", ["x"]));
  assert.ok(!validExpr("x; alert(1)", ["x"]));
});

const COURSE: LibraryCourse = {
  id: "demo",
  title: "Demo",
  icon: "🧪",
  blurb: "A demo.",
  ability: "int",
  skill: { name: "Memory", icon: "🧠" },
  lessons: ["one", "two", "three", "four", "five", "six"].map((id) => ({
    id,
    title: `Lesson ${id}`,
    summary: "",
    steps: [
      { type: "explain", body: "Idea", phase: "understand" },
      { type: "choice", prompt: `Q ${id}`, options: ["a", "b"], answer: [0], explain: "because", phase: "recall" },
      { type: "input", prompt: `Type ${id}`, answers: ["1"], explain: "because" },
    ],
  })),
};

test("library: installing creates a course page, lessons and the linked skill, once", () => {
  const doc = new Y.Doc();
  const id = installCourse(doc, COURSE, "Me");
  assert.equal(installCourse(doc, COURSE, "Me"), id, "installing twice finds the same course");
  assert.equal(findLibraryCourse(doc, "demo"), id);
  const page = getPage(doc, id)!;
  assert.equal(getLessonContent(page, "one")!.steps.length, 3);
  const skill = listSkills(doc).find((s) => s.name === "Memory")!;
  assert.equal(skill.category, "int");
  assert.ok(skill.courseIds.includes(id));
  setProgress(page, "one", { status: "mastered", mastery: 1, quizzes: [{ at: Date.now(), score: 1 }] });
  assert.equal(totalXp(doc, skill.id), 120, "a finished lesson counts toward the skill");
});

test("learning: pace, streak, what to write ahead, and spaced review", () => {
  const doc = new Y.Doc();
  const id = installCourse(doc, COURSE);
  const page = getPage(doc, id)!;
  const now = Date.UTC(2026, 8, 20, 12);
  // Finished yesterday and today.
  setProgress(page, "one", { status: "mastered", mastery: 1, quizzes: [{ at: now - DAY, score: 1 }] });
  setProgress(page, "two", { status: "mastered", mastery: 0.5, quizzes: [{ at: now, score: 0.5 }] });
  const stats = learnerStats(doc, now);
  assert.equal(stats.today, 1);
  assert.equal(stats.streak, 2);
  assert.equal(stats.accuracy, 0.75);
  assert.equal(stats.aheadTarget, 3, "about three days at this pace, at least 2");

  const ahead = courseAhead(page, 3);
  assert.equal(ahead.next?.id, "three");
  assert.equal(ahead.written, 4, "the library course is fully written");
  assert.deepEqual(ahead.toWrite, []);
  assert.equal(ahead.nearEnd, true, "4 left < target + 2: time to extend the path");

  // Review: tomorrow, then 3 days, a week...; a miss starts over.
  scheduleReview(page, "one", now);
  assert.equal(dueReviews(doc, now).length, 0);
  assert.equal(dueReviews(doc, now + DAY).length, 1);
  recordReview(page, "one", true, now + DAY);
  assert.equal(getProgress(page, "one").review!.stage, 1);
  assert.equal(getProgress(page, "one").review!.due, now + DAY + 3 * DAY);
  recordReview(page, "one", false, now + 4 * DAY);
  assert.deepEqual(getProgress(page, "one").review, { stage: 0, due: now + 5 * DAY });

  // A review session prefers questions the learner got wrong.
  scheduleReview(page, "two", now);
  logMistake(page, { lessonId: "two", prompt: "Type two", given: "2", correct: "1", at: now });
  assert.equal(courseMistakes(page).length, 1);
  const items = reviewSession(doc, now + 6 * DAY);
  assert.equal(items.length, 2);
  assert.equal(items.find((i) => i.lessonId === "two")!.step.prompt, "Type two");
  assert.ok(items.every((i) => isInteractive(i.step)));
});

test("library content: every built-in lesson is valid and answerable", async () => {
  const dir = new URL("../shared/library/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "types.ts" && f !== "install.ts");
  assert.ok(files.length >= 6, `expected the library courses, found ${files.join(", ")}`);
  const ids = new Set<string>();
  for (const f of files) {
    const course = (await import(new URL(f, dir).href)).default as LibraryCourse;
    assert.ok(!ids.has(course.id), `duplicate course id ${course.id}`);
    ids.add(course.id);
    assert.ok(["str", "dex", "con", "int", "wis", "cha"].includes(course.ability), `${f}: ability`);
    const lessonIds = new Set<string>();
    for (const lesson of course.lessons) {
      assert.ok(!lessonIds.has(lesson.id), `${f}: duplicate lesson ${lesson.id}`);
      lessonIds.add(lesson.id);
      assert.deepEqual(lessonProblems(lesson.steps), [], `${f} › ${lesson.id}`);
      const normalized = lesson.steps.map(normalizeStep);
      assert.equal(normalized.filter(Boolean).length, lesson.steps.length, `${f} › ${lesson.id}: a step was dropped`);
      for (const s of lesson.steps) {
        if (s.figure) assert.ok(normalizeFigure(s.figure), `${f} › ${lesson.id}: figure`);
        if (s.type === "input") assert.ok(checkInput(s, s.answers[0]), `${f} › ${lesson.id}: "${s.prompt}" rejects its own answer`);
        if (s.type === "slider") assert.ok(checkSlider(s, s.answer), `${f} › ${lesson.id}: slider rejects its own answer`);
      }
    }
  }
});

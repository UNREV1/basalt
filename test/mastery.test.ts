import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { getProgress } from "../shared/course.ts";
import { getLessonContent } from "../shared/lesson.ts";
import { installCourse } from "../shared/library/install.ts";
import type { LibraryCourse } from "../shared/library/types.ts";
import { masteryCheck, masteryRound, recordAttempt } from "../shared/mastery.ts";
import { getPage } from "../shared/model.ts";
import {
  computeSkillStats,
  courseXp,
  createSkill,
  getSkill,
  lessonsMastered,
  listSkills,
  needsMasteryCheck,
  requirementText,
  skillDone,
  updateSkill,
} from "../shared/skills.ts";

const COURSE: LibraryCourse = {
  id: "mastery-demo",
  title: "Demo",
  icon: "🧪",
  blurb: "A demo.",
  ability: "int",
  skill: { name: "Memory", icon: "🧠" },
  lessons: ["one", "two", "three"].map((id) => ({
    id,
    title: `Lesson ${id}`,
    summary: "",
    steps: [
      { type: "explain", body: "Idea", phase: "understand" },
      { type: "choice", prompt: `Q ${id}`, options: ["a", "b"], answer: [0], explain: "because", phase: "recall" },
      { type: "explain", body: "Another idea", phase: "understand" },
      { type: "input", prompt: `Type ${id}`, answers: ["1"], explain: "because" },
    ],
  })),
};

const all = (right: boolean) => [
  { key: "1", mastered: right },
  { key: "3", mastered: right },
];

test("mastery: a lesson is mastered only once every aspect of it is; what's missed comes back after its explanation", () => {
  const doc = new Y.Doc();
  const page = getPage(doc, installCourse(doc, COURSE))!;
  // One question missed: not mastered, and that question is still to master.
  let a = recordAttempt(page, "one", [{ key: "1", mastered: true }, { key: "3", mastered: false }], { whole: true, score: 0.5 });
  assert.deepEqual([a.mastered, a.toMaster], [false, ["3"]]);
  assert.equal(getProgress(page, "one").status, "in-progress");
  // The round: the explanation that teaches it, then the question again.
  const steps = getLessonContent(page, "one")!.steps;
  assert.deepEqual(
    masteryRound(steps, ["3"]).map((r) => [r.step.type, r.index]),
    [
      ["explain", undefined],
      ["input", 3],
    ],
  );
  // Missed again: still to master. Right: mastered, for the first time.
  a = recordAttempt(page, "one", [{ key: "3", mastered: false }], { whole: false });
  assert.equal(a.mastered, false);
  a = recordAttempt(page, "one", [{ key: "3", mastered: true }], { whole: false });
  assert.deepEqual([a.mastered, a.firstTime], [true, true]);
  assert.equal(getProgress(page, "one").status, "mastered");
  assert.ok(getProgress(page, "one").masteredAt);
  // Playing it again is practice: a slip doesn't take it back.
  a = recordAttempt(page, "one", all(false), { whole: true, score: 0 });
  assert.deepEqual([a.mastered, a.firstTime], [true, false]);
});

test("mastery: a skill is learnt, and what comes next unlocks, only after every lesson is mastered and its check is passed", () => {
  const doc = new Y.Doc();
  const courseId = installCourse(doc, COURSE);
  const page = getPage(doc, courseId)!;
  const memory = listSkills(doc).find((s) => s.name === "Memory")!;
  const next = createSkill(doc, { name: "Memory palace", category: "int", parents: [memory.id] });
  const locked = () => computeSkillStats(doc).get(next.id)!;

  // Two of three lessons: locked. A goal level reached doesn't count.
  recordAttempt(page, "one", all(true), { whole: true, score: 1 });
  recordAttempt(page, "two", all(true), { whole: true, score: 1 });
  updateSkill(doc, memory.id, { goalLevel: 1 });
  assert.equal(locked().unlocked, false);
  assert.equal(requirementText(locked().missing[0]), "Memory (2/3 lessons mastered)");

  // Every lesson mastered: now the mastery check, one question from every lesson.
  recordAttempt(page, "three", all(true), { whole: true, score: 1 });
  let skill = getSkill(doc, memory.id)!;
  assert.equal(needsMasteryCheck(doc, skill), true);
  assert.equal(skillDone(doc, listSkills(doc), skill), false);
  assert.equal(locked().unlocked, false);
  assert.equal(requirementText(locked().missing[0]), "the mastery check for Memory");
  const check = masteryCheck(doc, skill.courseIds, () => 0);
  assert.deepEqual(
    check.map((c) => c.lessonId),
    ["one", "two", "three"],
  );
  assert.ok(check.every((c) => c.step.type === "choice"), "recall questions first");

  // A miss in the check sends its lesson back to master; its XP stays.
  const xp = courseXp(doc, courseId).xp;
  recordAttempt(page, "two", [{ key: String(check[1].index), mastered: false }], { whole: false });
  assert.deepEqual(lessonsMastered(doc, skill), { done: 2, total: 3 });
  assert.equal(courseXp(doc, courseId).xp, xp);
  recordAttempt(page, "two", [{ key: String(check[1].index), mastered: true }], { whole: false });

  // Passed: learnt, and the next skill is open.
  updateSkill(doc, memory.id, { masteredAt: Date.now() });
  skill = getSkill(doc, memory.id)!;
  assert.equal(skillDone(doc, listSkills(doc), skill), true);
  assert.equal(locked().unlocked, true);
});

// Put a built-in course into the workspace: a course page (under "Courses")
// with every lesson already written, linked to the D&D skill it trains.

import type * as Y from "yjs";
import { courseMap, initCourse, setCurriculum, type Curriculum } from "../course.ts";
import { setLessonContent } from "../lesson.ts";
import { createPage, ensureSystemPage, getPage, listPages } from "../model.ts";
import { createSkill, getSkill, listSkills, updateSkill } from "../skills.ts";
import type { AbilityId, LibraryCourse } from "./types.ts";

export const COURSES_SYSTEM = "courses";

/** The course page made from a library course, if it's in the workspace. */
export function findLibraryCourse(doc: Y.Doc, libraryId: string): string | undefined {
  return listPages(doc).find((p) => {
    if (p.kind !== "course") return false;
    const page = getPage(doc, p.id);
    return page ? courseMap(page)?.get("libraryId") === libraryId : false;
  })?.id;
}

/** Link a course to the skill with this name, creating the skill (under `ability`) if needed. */
export function linkCourseToSkill(doc: Y.Doc, courseId: string, skill: { name: string; icon: string }, ability: AbilityId): string {
  const lower = skill.name.trim().toLowerCase();
  const existing = listSkills(doc).find((s) => s.name.trim().toLowerCase() === lower);
  const s = existing ?? createSkill(doc, { name: skill.name, icon: skill.icon, category: ability });
  if (!s.courseIds.includes(courseId)) updateSkill(doc, s.id, { courseIds: [...s.courseIds, courseId] });
  return s.id;
}

/** Install (or find) a library course; returns its page id. */
export function installCourse(doc: Y.Doc, course: LibraryCourse, createdBy = ""): string {
  const found = findLibraryCourse(doc, course.id);
  if (found) return found;
  let id = "";
  doc.transact(() => {
    const parentId = ensureSystemPage(doc, COURSES_SYSTEM, { title: "Courses", icon: "🎓", createdBy });
    id = createPage(doc, { title: course.title, kind: "course", icon: course.icon, parentId, createdBy });
    const page = getPage(doc, id)!;
    initCourse(page, { topic: course.title, goal: course.blurb });
    const c = courseMap(page);
    c.set("libraryId", course.id);
    c.set("format", "interactive");
    c.set("ability", course.ability);
    setCurriculum(page, {
      topic: course.title,
      overview: course.blurb,
      levels: [
        {
          id: "foundations",
          name: "Foundations",
          summary: "",
          modules: [{ id: "core", title: course.title, summary: course.blurb, lessons: course.lessons.map((l) => ({ id: l.id, title: l.title, objectives: [l.summary] })) }],
        },
      ],
    });
    for (const l of course.lessons) setLessonContent(page, l.id, l.steps, "library");
    linkCourseToSkill(doc, id, course.skill, course.ability);
  });
  return id;
}

/**
 * A planned course for a skill: the outline only (levels → modules → lesson
 * titles), written lesson by lesson later, just before the learner gets there.
 * Goes under "Courses" and is linked to the skill. A skill that already has a
 * course keeps it (returns that one).
 */
export function createCourseOutline(
  doc: Y.Doc,
  input: { skillId: string; title?: string; goal?: string; curriculum: Omit<Curriculum, "topic">; createdBy?: string },
): { id: string; created: boolean } {
  const skill = getSkill(doc, input.skillId);
  if (!skill) throw new Error(`No skill ${input.skillId}`);
  const existing = skill.courseIds.find((c) => {
    const p = getPage(doc, c);
    return p && !p.get("deletedAt");
  });
  if (existing) return { id: existing, created: false };
  const title = input.title?.trim() || skill.name;
  let id = "";
  doc.transact(() => {
    const parentId = ensureSystemPage(doc, COURSES_SYSTEM, { title: "Courses", icon: "🎓", createdBy: input.createdBy ?? "" });
    id = createPage(doc, { title, kind: "course", icon: skill.icon || "🎓", parentId, createdBy: input.createdBy ?? "" });
    const page = getPage(doc, id)!;
    initCourse(page, { topic: title, goal: input.goal });
    courseMap(page).set("format", "interactive");
    courseMap(page).set("ability", skill.category);
    setCurriculum(page, { topic: title, ...input.curriculum });
    updateSkill(doc, skill.id, { courseIds: [...skill.courseIds, id] });
  });
  return { id, created: true };
}

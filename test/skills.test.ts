import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { createPage, deletePageForever, findSystemPage, getPage, pageMeta, restorePage, trashPage, updatePage } from "../shared/model.ts";
import { initCourse, setCurriculum, setProgress } from "../shared/course.ts";
import {
  addQuest,
  addXp,
  areaOf,
  canAddParent,
  characterSheet,
  childrenOf,
  completeQuest,
  computeSkillStats,
  courseXp,
  createArea,
  createSkill,
  createSkillsFromPlan,
  deleteArea,
  deleteSkill,
  ensureSkillForPage,
  ensureSkillPages,
  SKILLS_SYSTEM,
  skillsMap,
  getSkill,
  isUnlocked,
  levelForXp,
  levelProgress,
  listAreas,
  listSkills,
  logPractice,
  MAX_LEVEL,
  periodKey,
  practiceXp,
  questStatus,
  rankForLevel,
  RANKS,
  removeXpEntry,
  resolveAreaId,
  roots,
  saveArea,
  setParents,
  skillStreak,
  skillTreeSummary,
  skillXpMap,
  streakFromDays,
  todaysQuests,
  totalXp,
  undoQuest,
  updateSkill,
  xpEntries,
  xpForLevel,
} from "../shared/skills.ts";

const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

test("level curve: level 1 at 0 XP, monotonic, capped", () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 100);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  for (let l = 2; l <= MAX_LEVEL; l++) assert.ok(xpForLevel(l) > xpForLevel(l - 1), `level ${l} needs more XP`);
  assert.equal(levelForXp(1e12), MAX_LEVEL);
  const p = levelProgress(xpForLevel(7) + (xpForLevel(8) - xpForLevel(7)) / 2);
  assert.equal(p.level, 7);
  assert.ok(Math.abs(p.fraction - 0.5) < 0.01);
  assert.equal(levelProgress(1e12).next, null);
  assert.equal(levelProgress(1e12).fraction, 1);
});

test("ranks go from Novice to Grandmaster", () => {
  assert.equal(rankForLevel(1).name, "Novice");
  assert.equal(rankForLevel(MAX_LEVEL).name, "Grandmaster");
  assert.deepEqual(
    RANKS.map((r) => r.name),
    ["Novice", "Apprentice", "Journeyman", "Adept", "Expert", "Master", "Grandmaster"],
  );
  for (let i = 1; i < RANKS.length; i++) {
    assert.equal(rankForLevel(RANKS[i].minLevel).name, RANKS[i].name);
    assert.equal(rankForLevel(RANKS[i].minLevel - 1).name, RANKS[i - 1].name);
    assert.ok(RANKS[i].description.length > 0);
  }
});

test("practice XP: 10 per minute, capped per log", () => {
  assert.equal(practiceXp(15), 150);
  assert.equal(practiceXp(0), 0);
  assert.equal(practiceXp(-5), 0);
  assert.equal(practiceXp(10_000), practiceXp(240));
});

test("areas: built-ins, overrides, custom areas and resolution", () => {
  const doc = new Y.Doc();
  const areas = listAreas(doc);
  assert.equal(areas.length, 9);
  assert.deepEqual(areas.slice(0, 2).map((a) => a.id), ["body", "mind"]);
  saveArea(doc, { ...areas[0], name: "Health" });
  assert.equal(listAreas(doc)[0].name, "Health");
  assert.equal(resolveAreaId(doc, "health"), "body");
  assert.equal(resolveAreaId(doc, "INT"), "mind");
  assert.equal(resolveAreaId(doc, "career"), "craft");
  assert.equal(resolveAreaId(doc, "nope"), undefined);

  const parenting = createArea(doc, { name: "Parenting", icon: "👪" });
  assert.equal(listAreas(doc).length, 10);
  const s = createSkill(doc, { name: "Bedtime stories", category: "Parenting" });
  assert.equal(s.category, parenting.id);
  // Unknown names create a custom area.
  const t = createSkill(doc, { name: "Chess openings", category: "Games" });
  assert.equal(areaOf(doc, t).name, "Games");

  deleteArea(doc, parenting.id, "heart");
  assert.equal(getSkill(doc, s.id)!.category, "heart");
  deleteArea(doc, "wealth");
  assert.ok(!listAreas(doc).some((a) => a.id === "wealth"));
  assert.ok(listAreas(doc, { includeDeleted: true }).some((a) => a.id === "wealth"));
});

test("skills: create, edit, children/roots, delete cleans up prerequisites", () => {
  const doc = new Y.Doc();
  const a = createSkill(doc, { name: "Python basics", icon: "🐍", category: "craft" });
  const b = createSkill(doc, { name: "Data analysis", parents: [a.id], requiredLevel: 3, category: "mind" });
  const c = createSkill(doc, { name: "Machine learning", parents: [b.id, "missing-id"] });
  assert.deepEqual(getSkill(doc, c.id)!.parents, [b.id], "unknown parents are dropped");
  assert.ok(skillXpMap(doc).get(a.id) instanceof Y.Array, "XP log is created with the skill");
  assert.deepEqual(roots(doc).map((s) => s.id), [a.id]);
  assert.deepEqual(childrenOf(doc, a.id).map((s) => s.id), [b.id]);

  const edited = updateSkill(doc, a.id, { description: "Syntax, data types", goalLevel: 20 });
  assert.equal(edited!.description, "Syntax, data types");
  assert.equal(edited!.goalLevel, 20);
  assert.equal(updateSkill(doc, a.id, { goalLevel: undefined })!.goalLevel, undefined);

  // Deleting moves the skill's page to the trash; a trashed prerequisite doesn't block.
  deleteSkill(doc, b.id);
  assert.equal(getSkill(doc, b.id), undefined);
  assert.equal(listSkills(doc).some((s) => s.id === b.id), false);
  assert.ok(isUnlocked(doc, c.id));
  // Restoring the page brings it all back.
  restorePage(doc, b.pageId!);
  assert.equal(getSkill(doc, b.id)!.name, "Data analysis");
  assert.deepEqual(getSkill(doc, c.id)!.parents, [b.id]);
  // Deleting the page for good removes the skill and its XP log.
  deletePageForever(doc, b.pageId!);
  assert.equal(skillsMap(doc).get(b.id), undefined);
  assert.equal(skillXpMap(doc).get(b.id), undefined);

  // Old page-less skills are removed outright, with their prerequisite links.
  skillsMap(doc).set("old", { id: "old", name: "Old", parents: [], createdAt: 1, updatedAt: 1 } as any);
  updateSkill(doc, c.id, { parents: ["old"] });
  deleteSkill(doc, "old");
  assert.equal(skillsMap(doc).get("old"), undefined);
  assert.deepEqual(getSkill(doc, c.id)!.parents, []);

  updateSkill(doc, c.id, { archived: true });
  assert.equal(listSkills(doc).length, 1);
  assert.equal(listSkills(doc, { includeArchived: true }).length, 2);
});

test("setParents prevents cycles", () => {
  const doc = new Y.Doc();
  const a = createSkill(doc, { name: "A" });
  const b = createSkill(doc, { name: "B", parents: [a.id] });
  const c = createSkill(doc, { name: "C", parents: [b.id] });
  assert.equal(canAddParent(doc, a.id, c.id), false);
  assert.equal(canAddParent(doc, a.id, a.id), false);
  assert.deepEqual(setParents(doc, a.id, [c.id, b.id, a.id]), []);
  const d = createSkill(doc, { name: "D" });
  assert.deepEqual(setParents(doc, c.id, [b.id, d.id], 4), [b.id, d.id]);
  assert.equal(getSkill(doc, c.id)!.requiredLevel, 4);
});

test("XP log, totals and unlocking", () => {
  const doc = new Y.Doc();
  const a = createSkill(doc, { name: "Scales" });
  const b = createSkill(doc, { name: "Improvisation", parents: [a.id], requiredLevel: 3 });
  assert.equal(isUnlocked(doc, a.id), true, "roots are always unlocked");
  assert.equal(isUnlocked(doc, b.id), false);
  logPractice(doc, a.id, 30, "C major");
  assert.equal(totalXp(doc, a.id), 300);
  assert.equal(isUnlocked(doc, b.id), false, "level 2 < 3");
  const e = addXp(doc, a.id, { amount: 200, source: "claude", note: "Quiz aced" })!;
  assert.equal(levelForXp(totalXp(doc, a.id)), 3);
  assert.equal(isUnlocked(doc, b.id), true);
  const stats = computeSkillStats(doc);
  assert.equal(stats.get(b.id)!.unlocked, true);
  assert.equal(stats.get(a.id)!.level, 3);
  assert.equal(xpEntries(doc, a.id).length, 2);
  assert.equal(addXp(doc, "nope", { amount: 5 }), null);
  assert.ok(removeXpEntry(doc, a.id, e));
  assert.equal(totalXp(doc, a.id), 300);
  const locked = computeSkillStats(doc).get(b.id)!;
  assert.equal(locked.unlocked, false);
  assert.deepEqual(locked.missing, [{ parentId: a.id, name: "Scales", need: 3, have: 2 }]);
  // Archived prerequisites don't block.
  updateSkill(doc, a.id, { archived: true });
  assert.equal(isUnlocked(doc, b.id), true);
});

test("XP logs from two clients merge", () => {
  const d1 = new Y.Doc();
  const d2 = new Y.Doc();
  const s = createSkill(d1, { name: "Running" });
  Y.applyUpdate(d2, Y.encodeStateAsUpdate(d1));
  logPractice(d1, s.id, 20);
  logPractice(d2, s.id, 40);
  Y.applyUpdate(d2, Y.encodeStateAsUpdate(d1));
  Y.applyUpdate(d1, Y.encodeStateAsUpdate(d2));
  assert.equal(totalXp(d1, s.id), 600);
  assert.equal(totalXp(d2, s.id), 600);
});

test("linked courses contribute derived XP", () => {
  const doc = new Y.Doc();
  const courseId = createPage(doc, { kind: "course", title: "Linear algebra" });
  const page = getPage(doc, courseId)!;
  initCourse(page, { topic: "Linear algebra" });
  setCurriculum(page, {
    topic: "Linear algebra",
    overview: "",
    levels: [
      {
        id: "l1",
        name: "Foundations",
        summary: "",
        modules: [
          {
            id: "m1",
            title: "Vectors",
            summary: "",
            lessons: [
              { id: "a", title: "What is a vector", objectives: [] },
              { id: "b", title: "Dot product", objectives: [] },
              { id: "c", title: "Cross product", objectives: [] },
            ],
          },
        ],
      },
    ],
  });
  setProgress(page, "a", { status: "mastered" });
  setProgress(page, "b", { status: "mastered" });
  setProgress(page, "c", { status: "skipped" });
  const s = createSkill(doc, { name: "Linear algebra", courseIds: [courseId] });
  assert.deepEqual(
    { ...courseXp(doc, courseId), title: "" },
    { courseId, title: "", xp: 280, mastered: 2, skipped: 1, total: 3 },
  );
  logPractice(doc, s.id, 10);
  assert.equal(totalXp(doc, s.id), 380);
  assert.equal(totalXp(doc, s.id, { courses: false }), 100);
  assert.equal(computeSkillStats(doc).get(s.id)!.courseXp, 280);
  trashPage(doc, courseId);
  assert.equal(totalXp(doc, s.id), 100, "trashed courses don't count");
  // Non-course pages contribute nothing.
  const note = createPage(doc, { title: "Notes" });
  assert.equal(courseXp(doc, note).xp, 0);
});

test("practice streaks", () => {
  const now = at(2026, 9, 28, 18);
  assert.deepEqual(streakFromDays(["2026-09-26", "2026-09-27", "2026-09-28"], now), { current: 3, best: 3, today: true });
  // Yesterday keeps the streak alive.
  assert.deepEqual(streakFromDays(["2026-09-25", "2026-09-26", "2026-09-27"], now), { current: 3, best: 3, today: false });
  assert.deepEqual(streakFromDays(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-26"], now), {
    current: 0,
    best: 4,
    today: false,
  });
  // Month boundaries.
  assert.equal(streakFromDays(["2026-08-31", "2026-09-01"], at(2026, 9, 1)).current, 2);

  const doc = new Y.Doc();
  const s = createSkill(doc, { name: "Meditation" });
  addXp(doc, s.id, { amount: 50, at: now - 2 * DAY, source: "practice" });
  addXp(doc, s.id, { amount: 50, at: now - DAY, source: "practice" });
  addXp(doc, s.id, { amount: 50, at: now, source: "practice" });
  addXp(doc, s.id, { amount: -20, at: now - 5 * DAY, source: "manual" });
  const st = skillStreak(doc, s.id, now);
  assert.equal(st.current, 3);
  assert.equal(st.today, true);
  assert.equal(st.lastAt, now);
});

test("quests: check-off grants XP, respects the period target, tracks streaks", () => {
  const doc = new Y.Doc();
  const s = createSkill(doc, { name: "Running", category: "body", quests: [{ title: "Run 3×/week", cadence: "weekly", target: 3, xp: 50 }] });
  const weekly = getSkill(doc, s.id)!.quests![0];
  const daily = addQuest(doc, s.id, { title: "Stretch 10 min", cadence: "daily" })!;
  assert.equal(daily.xp, 25);
  assert.equal(daily.target, 1);

  // Monday 2026-09-21 .. Sunday 2026-09-27 is one week; 2026-09-28 is a Monday.
  assert.equal(periodKey("weekly", at(2026, 9, 27)), "2026-09-21");
  assert.equal(periodKey("weekly", at(2026, 9, 28)), "2026-09-28");
  assert.equal(periodKey("daily", at(2026, 9, 27, 23)), "2026-09-27");

  const lastWeek = [at(2026, 9, 21), at(2026, 9, 23), at(2026, 9, 25)];
  for (const t of lastWeek) assert.ok(completeQuest(doc, s.id, weekly.id, t));
  assert.equal(completeQuest(doc, s.id, weekly.id, at(2026, 9, 26)), null, "target reached for that week");
  const now = at(2026, 9, 28);
  let st = questStatus(xpEntries(doc, s.id), weekly, now);
  assert.deepEqual([st.count, st.done, st.streak], [0, false, 1], "last week's streak is still alive");
  completeQuest(doc, s.id, weekly.id, now);
  completeQuest(doc, s.id, weekly.id, now + 1000);
  completeQuest(doc, s.id, weekly.id, now + 2000);
  st = questStatus(xpEntries(doc, s.id), weekly, now + 3000);
  assert.deepEqual([st.count, st.done, st.streak], [3, true, 2]);
  assert.equal(totalXp(doc, s.id), 6 * 50);

  assert.ok(undoQuest(doc, s.id, weekly.id, now + 4000));
  st = questStatus(xpEntries(doc, s.id), weekly, now + 5000);
  assert.deepEqual([st.count, st.done], [2, false]);
  assert.equal(totalXp(doc, s.id), 5 * 50);

  completeQuest(doc, s.id, daily.id, now);
  const today = todaysQuests(doc, now + 6000);
  assert.equal(today.length, 2);
  assert.equal(today[0].status.quest.id, weekly.id, "open quests come first");
  assert.equal(today[1].status.done, true);
});

test("character sheet: area levels, title, totals", () => {
  const doc = new Y.Doc();
  assert.equal(characterSheet(doc).title, "Novice Adventurer");
  assert.equal(characterSheet(doc).topRank, null);
  const run = createSkill(doc, { name: "Running", category: "body" });
  const lift = createSkill(doc, { name: "Lifting", category: "body" });
  const read = createSkill(doc, { name: "Reading", category: "mind" });
  logPractice(doc, run.id, 240);
  logPractice(doc, lift.id, 60);
  logPractice(doc, read.id, 30);
  const sheet = characterSheet(doc);
  assert.equal(sheet.skills, 3);
  assert.equal(sheet.xp, 3300);
  assert.equal(sheet.level, levelForXp(3300));
  assert.equal(sheet.archetype, "Athlete");
  assert.equal(sheet.title, `${rankForLevel(sheet.level).name} Athlete`);
  const body = sheet.areas.find((a) => a.area.id === "body")!;
  assert.equal(body.skills, 2);
  assert.equal(body.xp, 3000);
  assert.equal(body.level, levelForXp(3000));
  assert.equal(body.top!.id, run.id);
  assert.equal(sheet.areas.find((a) => a.area.id === "wealth")!.level, 0);
  assert.equal(sheet.totalLevel, levelForXp(2400) + levelForXp(600) + levelForXp(300));
  assert.equal(sheet.topRank!.name, rankForLevel(levelForXp(2400)).name);
});

test("plans create linked skills and resolve existing parents", () => {
  const doc = new Y.Doc();
  const existing = createSkill(doc, { name: "Algebra", category: "mind" });
  const ids = createSkillsFromPlan(doc, [
    { key: "calc", name: "Calculus", icon: "∫", category: "Mind", parentKeys: ["Algebra"] },
    { key: "stats", name: "Statistics", category: "mind", parentKeys: ["calc"], requiredLevel: 5 },
    { key: "ml", name: "Machine learning", category: "craft", parentKeys: ["stats", "calc", "unknown"], quests: [{ title: "Read a paper", cadence: "weekly" }] },
    { key: "loop", name: "Loop", parentKeys: ["loop"] },
  ]);
  assert.equal(ids.size, 4);
  assert.deepEqual(getSkill(doc, ids.get("calc")!)!.parents, [existing.id]);
  assert.equal(getSkill(doc, ids.get("stats")!)!.requiredLevel, 5);
  assert.deepEqual(getSkill(doc, ids.get("ml")!)!.parents.sort(), [ids.get("stats")!, ids.get("calc")!].sort());
  assert.equal(getSkill(doc, ids.get("ml")!)!.quests!.length, 1);
  assert.deepEqual(getSkill(doc, ids.get("loop")!)!.parents, [], "self-reference ignored");
});

test("summary outlines the tree for Claude", () => {
  const doc = new Y.Doc();
  const a = createSkill(doc, { name: "Python", icon: "🐍", category: "craft", goalLevel: 10 });
  const b = createSkill(doc, { name: "Pandas", icon: "🐼", category: "craft", parents: [a.id], requiredLevel: 5 });
  const c = createSkill(doc, { name: "Statistics", icon: "📊", category: "mind" });
  const d = createSkill(doc, { name: "Data science", icon: "🔬", category: "craft", parents: [b.id, c.id] });
  addQuest(doc, a.id, { title: "Code 30 min", cadence: "daily", xp: 40 });
  logPractice(doc, a.id, 60, "Exercises");
  const text = skillTreeSummary(doc);
  assert.match(text, /4 skills/);
  assert.match(text, /🛠️ Craft & Career \[area craft\]/);
  assert.match(text, new RegExp(`🐍 Python \\[${a.id}\\]: L3 Novice, 600 XP`));
  assert.match(text, /goal L10/);
  assert.match(text, /LOCKED: needs Python L5 \(now L3\)/);
  assert.match(text, /"Code 30 min" \(1×\/day, 40 XP, 0\/1 this day\)/);
  assert.match(text, /also requires Statistics|also requires Pandas/);
  assert.ok(text.includes(d.id));
  assert.match(skillTreeSummary(new Y.Doc()), /No skills yet/);
});

test("every skill is a page", () => {
  const doc = new Y.Doc();
  const a = createSkill(doc, { name: "Guitar", icon: "🎸" });
  assert.ok(a.pageId);
  const page = getPage(doc, a.pageId!)!;
  const meta = pageMeta(page);
  assert.equal(meta.typeId, "skill");
  assert.equal(meta.skillId, a.id);
  assert.equal(meta.title, "Guitar");
  assert.equal(meta.parentId, findSystemPage(doc, SKILLS_SYSTEM), "lives under the Skills page");

  // The page title and icon are the skill's name and icon, both ways.
  updatePage(doc, a.pageId!, { title: "Electric guitar", icon: "⚡" });
  assert.equal(getSkill(doc, a.id)!.name, "Electric guitar");
  assert.equal(getSkill(doc, a.id)!.icon, "⚡");
  updateSkill(doc, a.id, { name: "Bass" });
  assert.equal(page.get("title"), "Bass");

  // Changing the page to another type takes it out of the tree.
  updatePage(doc, a.pageId!, { typeId: "page" });
  assert.equal(listSkills(doc).length, 0);
  updatePage(doc, a.pageId!, { typeId: "skill" });
  assert.equal(listSkills(doc).length, 1);

  // Trashing the Skills page hides every skill; a new skill restores it.
  trashPage(doc, findSystemPage(doc, SKILLS_SYSTEM)!);
  assert.equal(listSkills(doc).length, 0);
});

test("skills from before pages get one; Skill-typed pages become skills", () => {
  const doc = new Y.Doc();
  skillsMap(doc).set("legacy", { id: "legacy", name: "Chess", icon: "♟️", parents: [], createdAt: 1, updatedAt: 1 } as any);
  skillsMap(doc).set("shelved", { id: "shelved", name: "Old hobby", parents: [], archived: true, createdAt: 2, updatedAt: 2 } as any);
  ensureSkillPages(doc);
  const chess = getSkill(doc, "legacy")!;
  assert.ok(chess.pageId && getPage(doc, chess.pageId));
  assert.equal(getPage(doc, chess.pageId!)!.get("skillId"), "legacy");
  assert.equal(getSkill(doc, "shelved")!.pageId, undefined, "archived skills wait until they come back");
  ensureSkillPages(doc);
  assert.equal([...doc.getMap("pages").keys()].filter((k) => k.startsWith("skill-")).length, 1, "idempotent");

  // A page given the Skill type by hand.
  const pid = createPage(doc, { title: "Cooking", typeId: "skill" });
  const sid = ensureSkillForPage(doc, pid)!;
  assert.equal(getSkill(doc, sid)!.name, "Cooking");
  assert.equal(getSkill(doc, sid)!.pageId, pid);
  assert.equal(ensureSkillForPage(doc, pid), sid, "stable");

  // A duplicate of a skill page (same skillId) becomes a skill of its own.
  const dup = createPage(doc, { title: "Cooking copy", typeId: "skill" });
  getPage(doc, dup)!.set("skillId", sid);
  const dupSkill = ensureSkillForPage(doc, dup)!;
  assert.notEqual(dupSkill, sid);
  assert.equal(getSkill(doc, sid)!.pageId, pid);
});

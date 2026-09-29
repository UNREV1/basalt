// What Claude does in the background, through Claude Code and Basalt's MCP
// tools (src/lib/claude.ts): map the branch for something you want to learn,
// and keep lessons written ahead of you at your own pace. Each builder also
// returns the same request as text, for pasting into Claude Code or Claude
// Desktop where the app can't start Claude itself (browsers, phones).

import { useSyncExternalStore } from "react";
import { getCurriculum } from "../../../shared/course.ts";
import { courseAhead, courseMistakes, learnerStats, learningMap, MISTAKE_WHY, type LearnerStats } from "../../../shared/learning.ts";
import { displayTitle, getPage, pageMeta } from "../../../shared/model.ts";
import { GENERAL_PLAN, PLAN_STEPS } from "../../../shared/skill-plan.ts";
import { listSkills, type Skill } from "../../../shared/skills.ts";
import { claudeBridge, isJobRunning, startClaudeJob } from "../../lib/claude.ts";
import { shareLink, type Workspace } from "../../lib/workspace.ts";

const AHEAD_KEY = "basalt:claude-ahead";

/** Whether Claude may prepare lessons in the background (on unless turned off). */
export function aheadEnabled(): boolean {
  try {
    return localStorage.getItem(AHEAD_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAheadEnabled(on: boolean) {
  try {
    localStorage.setItem(AHEAD_KEY, on ? "on" : "off");
  } catch {
    // Not remembered; the default applies.
  }
}

/** Claude can run from this app (desktop app with Claude Code). */
export const canRunClaude = () => !!claudeBridge;

const SYSTEM = `You are Claude working inside Basalt, the user's learning app, through its MCP tools (mcp__basalt__*). The user isn't reading this conversation: never ask questions, make sensible choices and finish the whole task. The app shows your work live as you write. When you're done, reply with one short sentence saying what you did.`;

const ABILITIES = `the D&D ability it trains (area: str / dex / con / int / wis / cha; Intelligence is academics and memory techniques, Wisdom awareness, judgment and know-how, Charisma people and performance, Strength power, Dexterity agility and hand skills, Constitution endurance and health)`;

function statsLine(s: LearnerStats, ws?: Workspace): string {
  const acc = s.accuracy === null ? "no answers yet" : `${Math.round(s.accuracy * 100)}% right first try lately`;
  let line = `Learner: ${s.pace.toFixed(1)} lessons a day over the last two weeks, ${acc}${s.streak ? `, ${s.streak}-day streak` : ""}.`;
  // Their last weekly reflection (metacognition) steers what comes next.
  const r = ws ? (learningMap(ws.doc).get("lastReflection") as { worked?: string; didnt?: string; unclear?: string } | undefined) : undefined;
  if (r && (r.worked || r.didnt || r.unclear)) {
    line += ` Their latest weekly reflection: what worked: ${r.worked || "—"}; what didn't: ${r.didnt || "—"}; still unclear: ${r.unclear || "—"}.`;
  }
  return line;
}

const ADAPT = `Adapt to them: if they get most questions right first time, move a little faster and go deeper; if they're under about 60%, use smaller steps, more worked examples and more practice.`;

export interface ClaudeRequest {
  key: string;
  label: string;
  prompt: string;
}

/**
 * Plan the whole path for a skill or topic up front (the general plan: the
 * subject, its topics and their parts, each part's lesson titles), then write
 * the first lessons so the learner can start.
 */
export function branchRequest(ws: Workspace, goal: string): ClaudeRequest {
  const g = goal.trim();
  const stats = learnerStats(ws.doc);
  const prompt = `I want to learn: "${g}".

Plan my whole path to mastery now, as titles only, and get me started:
1. Research it (web search) enough to know the field's real topics and the order people learn them in.
2. Call get_skill_tree. Reuse skills I already have instead of duplicating them: an existing skill can be the subject, or a prerequisite.
3. Plan it with the general plan below, with branch "${g}" on every skill and each skill under ${ABILITIES}. The first lessons to write: ${stats.aheadTarget}.

${GENERAL_PLAN}

${PLAN_STEPS}

${statsLine(stats, ws)} ${ADAPT}`;
  return { key: `branch:${g.toLowerCase()}`, label: `Planning your path to “${g}”`, prompt };
}

/** Skills with nothing planned yet: no parts and no course. */
export function unplannedSkills(ws: Workspace): Skill[] {
  const skills = listSkills(ws.doc);
  return skills.filter((s) => !s.courseIds.some((c) => getPage(ws.doc, c) && !getPage(ws.doc, c)!.get("deletedAt")) && !skills.some((x) => x.topic === s.id));
}

/**
 * Plan one skill with the general plan: its topics and parts (or, for a narrow
 * skill, just its course), each part's lesson titles. With `lessons`, also
 * write the first lessons so it can be started right away.
 */
export function planSkillRequest(ws: Workspace, skillId: string, opts: { lessons?: boolean } = {}): ClaudeRequest | null {
  const skill = listSkills(ws.doc).find((s) => s.id === skillId);
  if (!skill) return null;
  const stats = learnerStats(ws.doc);
  const lessons = opts.lessons ?? true;
  const topic = skill.topic ? listSkills(ws.doc).find((s) => s.id === skill.topic) : undefined;
  const prompt = `Plan my skill "${skill.name}" (skill id ${skill.id})${skill.description ? `: ${skill.description}` : ""}${topic ? `. It's part of "${topic.name}"` : ""}.
1. Call get_skill_tree, and research the skill (web search) enough to be accurate.
2. If it's narrow enough to learn in about ten short lessons, just give it a course outline with plan_courses. Otherwise plan it completely with the general plan below, with "${skill.name}" itself as the subject (don't add a new subject skill: its topics get topic "${skill.id}")${skill.branch ? ` and branch "${skill.branch}"` : ""}.
3. ${lessons ? `Write the first ${stats.aheadTarget} lessons of the first course on its path with write_interactive_lesson, following its style guide and the learning loop.` : "Don't write any lessons yet: titles only."}

${GENERAL_PLAN}

${PLAN_STEPS}

${statsLine(stats, ws)} ${ADAPT}`;
  return { key: `skill-plan:${skill.id}`, label: lessons ? `Planning ${skill.name} and writing your first lesson` : `Planning ${skill.name}`, prompt };
}

/** The request to plan every unplanned skill, as text (to paste into Claude where the app can't run it). */
export function planAllText(ws: Workspace): string {
  const list = unplannedSkills(ws);
  return `Plan every skill in my Basalt skill tree that has no plan yet, one after another, titles only (don't write lessons): ${list.map((s) => `"${s.name}" (${s.id})`).join(", ")}.
For each: call get_skill_tree first; if it's narrow enough for about ten short lessons, give it a course outline with plan_courses; otherwise plan it with the general plan below, with the skill itself as the subject (its topics get topic = its id).

${GENERAL_PLAN}`;
}

// ---- planning every skill, one Claude run per skill -------------------------------------------

interface PlanAll {
  running: boolean;
  total: number;
  done: number;
  current: string;
}

let planAll: PlanAll = { running: false, total: 0, done: 0, current: "" };
let stopPlanAll = false;
const planListeners = new Set<() => void>();
const setPlanAll = (p: Partial<PlanAll>) => {
  planAll = { ...planAll, ...p };
  planListeners.forEach((l) => l());
};

export function usePlanAll(): PlanAll {
  return useSyncExternalStore(
    (l) => {
      planListeners.add(l);
      return () => planListeners.delete(l);
    },
    () => planAll,
  );
}

/** Plan every skill that has no plan yet, one at a time, in the background. */
export async function planEverySkill(ws: Workspace) {
  if (planAll.running || !canRunClaude()) return;
  stopPlanAll = false;
  const queue = unplannedSkills(ws).filter((s) => !s.topic);
  setPlanAll({ running: true, total: queue.length, done: 0, current: "" });
  for (const skill of queue) {
    if (stopPlanAll) break;
    // Planned meanwhile (by hand, or as part of another skill)?
    if (!unplannedSkills(ws).some((s) => s.id === skill.id)) {
      setPlanAll({ done: planAll.done + 1 });
      continue;
    }
    setPlanAll({ current: skill.name });
    const req = planSkillRequest(ws, skill.id, { lessons: false });
    const job = req ? await runRequest(ws, req) : undefined;
    setPlanAll({ done: planAll.done + 1 });
    // Claude couldn't run (signed out, no connection): the rest would fail the same way.
    if (job?.status === "error") break;
  }
  setPlanAll({ running: false, current: "" });
}

export function stopPlanningEverySkill() {
  stopPlanAll = true;
}

/**
 * Keep the next lessons of a course written before the learner gets there,
 * and extend the path (and the skill's branch) when it's about to run out.
 * `force` asks even when enough is written; `lessonId` asks for one lesson.
 */
export function aheadRequest(ws: Workspace, courseId: string, opts: { force?: boolean; lessonId?: string } = {}): ClaudeRequest | null {
  const page = getPage(ws.doc, courseId);
  const c = page ? getCurriculum(page) : null;
  if (!page || !c) return null;
  const title = displayTitle(pageMeta(page)) || c.topic;
  const stats = learnerStats(ws.doc);
  const ahead = courseAhead(page, stats.aheadTarget);
  const one = opts.lessonId ? c.levels.flatMap((l) => l.modules.flatMap((m) => m.lessons)).find((l) => l.id === opts.lessonId) : undefined;
  const toWrite = one ? [one] : ahead.toWrite;
  if (!opts.force && !toWrite.length && !ahead.nearEnd) return null;
  const skill = listSkills(ws.doc).find((s) => s.courseIds.includes(courseId));
  const mistakes = courseMistakes(page).slice(-6);
  const mistakesLine = mistakes.length
    ? `Recent mistakes to address when relevant: ${mistakes.map((m) => `"${m.prompt.slice(0, 90)}" (answered ${m.given.slice(0, 40)}, right: ${m.correct.slice(0, 40)}${m.why ? `; ${MISTAKE_WHY[m.why].toLowerCase()}` : ""})`).join("; ")}.`
    : "";
  const steps = [`1. Call get_course("${courseId}").`];
  if (toWrite.length) {
    steps.push(`2. Research anything you're unsure about (web search), then write these lessons with write_interactive_lesson: ${toWrite.map((l) => `"${l.title}" (${l.id})`).join(", ")}.`);
  }
  if (!one && (ahead.nearEnd || opts.force)) {
    steps.push(
      `${steps.length + 1}. The path is about to run out: add the next module with extend_course, building deeper on what I've done, and write its first lesson.${
        skill ? ` If no skill in the tree follows "${skill.name}" yet, add one or two follow-up skills with add_skills (prerequisite "${skill.name}"${skill.branch ? `, branch "${skill.branch}"` : ""}) so the branch continues.` : ""
      }`,
    );
  }
  const prompt = `Keep lessons ready ahead of me in my course "${title}" (id ${courseId}).
${statsLine(stats, ws)} ${ADAPT} ${mistakesLine}

${steps.join("\n")}`;
  return { key: `ahead:${courseId}`, label: one ? `Writing “${one.title}”` : `Preparing lessons for “${title}”`, prompt };
}

/** Run a request in the background with Claude Code. */
export function runRequest(ws: Workspace, req: ClaudeRequest) {
  return startClaudeJob(req.key, req.label, { prompt: req.prompt, system: SYSTEM, web: true, link: shareLink(ws.info) });
}

/** After a lesson or when a course opens: quietly keep its lessons ahead of the learner. */
export function keepAhead(ws: Workspace, courseId: string) {
  if (!canRunClaude() || !aheadEnabled() || !ws.info.sync) return;
  const req = aheadRequest(ws, courseId);
  if (req && !isJobRunning(req.key)) void runRequest(ws, req);
}

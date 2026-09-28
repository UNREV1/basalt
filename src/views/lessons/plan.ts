// What Claude does in the background, through Claude Code and Basalt's MCP
// tools (src/lib/claude.ts): map the branch for something you want to learn,
// and keep lessons written ahead of you at your own pace. Each builder also
// returns the same request as text, for pasting into Claude Code or Claude
// Desktop where the app can't start Claude itself (browsers, phones).

import { getCurriculum } from "../../../shared/course.ts";
import { courseAhead, courseMistakes, learnerStats, learningMap, MISTAKE_WHY, type LearnerStats } from "../../../shared/learning.ts";
import { displayTitle, getPage, pageMeta } from "../../../shared/model.ts";
import { listSkills } from "../../../shared/skills.ts";
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

/** Map the branch to follow for a skill or topic, and start its first course. */
export function branchRequest(ws: Workspace, goal: string): ClaudeRequest {
  const g = goal.trim();
  const stats = learnerStats(ws.doc);
  const prompt = `I want to learn: "${g}".

Map the branch I should follow and get me started:
1. Research it (web search) enough to know the real sub-skills or topics and a sensible order, most useful first (the 20% that gives 80% of the results).
2. Call get_skill_tree. Then call add_skills once with branch "${g}": 4 to 10 skills from foundations to mastery, each concrete and measurable, with prerequisites (keys) that form the path, ${ABILITIES}, a fitting emoji, and one habit quest for skills that need regular practice. Reuse existing skills as prerequisites instead of duplicating them.
3. For the first skill on the branch, create_course with a short curriculum (one level, two or three modules of three short lessons; more gets added as I progress), with a clear, specific goal. Link it with link_to_skill. Then write its first ${stats.aheadTarget} lessons with write_interactive_lesson, following its style guide and the learning loop.

${statsLine(stats, ws)} ${ADAPT}`;
  return { key: `branch:${g.toLowerCase()}`, label: `Mapping your path to “${g}”`, prompt };
}

/** Build the course for a skill that has none yet. */
export function skillCourseRequest(ws: Workspace, skillId: string): ClaudeRequest | null {
  const skill = listSkills(ws.doc).find((s) => s.id === skillId);
  if (!skill) return null;
  const stats = learnerStats(ws.doc);
  const prompt = `Create a course for my skill "${skill.name}" (skill id ${skill.id})${skill.description ? `: ${skill.description}` : ""}.
1. Research it (web search) enough to be accurate.
2. create_course with a short curriculum (one level, two or three modules of three short lessons; more gets added as I progress) and a clear, specific goal, then link_to_skill to "${skill.id}".
3. Write the first ${stats.aheadTarget} lessons with write_interactive_lesson, following its style guide and the learning loop.

${statsLine(stats, ws)} ${ADAPT}`;
  return { key: `skill-course:${skill.id}`, label: `Building a course for ${skill.name}`, prompt };
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

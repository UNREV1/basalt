// Skill-tree tools: let Claude act as a "life coach" that designs the user's
// real-life skill tree, logs practice, awards XP and manages quests. The tree
// itself lives in the workspace (shared/skills.ts), so the user sees changes
// live in the Skill tree view.

import type * as Y from "yjs";
import { z } from "zod";
import { allLessons, getCurriculum } from "../shared/course.ts";
import { displayTitle, getPage, listPages, pageMeta } from "../shared/model.ts";
import {
  ABILITY_SKILLS,
  addQuest,
  addXp,
  completeQuest,
  createSkillsFromPlan,
  getSkill,
  levelForXp,
  listAreas,
  listSkills,
  logPractice,
  rankForLevel,
  resolveAreaId,
  setParents,
  setTopic,
  skillTreeSummary,
  todaysQuests,
  totalXp,
  updateSkill,
  type Skill,
} from "../shared/skills.ts";
import { createCourseOutline } from "../shared/library/install.ts";
import { GENERAL_PLAN } from "../shared/skill-plan.ts";
import { ToolError } from "./ops.ts";
import { CURRICULUM } from "./schemas.ts";

export type ToolFn = (
  name: string,
  config: { title: string; description: string; input: Record<string, z.ZodType>; readOnly?: boolean; destructive?: boolean },
  run: (args: Record<string, any>) => Promise<string> | string,
) => void;

const MAX_AWARD = 1000;

function resolveSkill(doc: Y.Doc, ref: string): Skill {
  const r = ref.trim();
  const byId = getSkill(doc, r);
  if (byId) return byId;
  const lower = r.toLowerCase();
  const hit = listSkills(doc).find((s) => s.name.trim().toLowerCase() === lower);
  if (!hit) throw new ToolError(`No skill "${ref}". Call get_skill_tree to see skill names and ids.`);
  return hit;
}

function levelLine(doc: Y.Doc, skill: Skill, before: number): string {
  const xp = totalXp(doc, skill.id);
  const level = levelForXp(xp);
  const rank = rankForLevel(level).name;
  const up = level > before ? ` Level up: L${before} → L${level} (${rank})!` : ` Now L${level} ${rank}, ${Math.round(xp)} XP.`;
  return up;
}

export function registerSkillTools(tool: ToolFn, ctx: { doc: Y.Doc; tx: <T>(fn: () => T) => T; agent: string }) {
  const { doc, tx, agent } = ctx;

  const COURSE_OUTLINE = z
    .object({
      title: z.string().optional().describe("Course title (default: the skill's name)"),
      goal: z.string().optional().describe("What the learner can do at the end"),
      curriculum: CURRICULUM,
    })
    .describe("The skill's course outline: lesson titles and one-line objectives only. Lessons are written later with write_interactive_lesson, just before the learner reaches them.");

  /** Outline courses for skills; returns one line per skill. */
  const outline = (items: { skillId: string; course: { title?: string; goal?: string; curriculum: unknown } }[]): string[] =>
    items.map(({ skillId, course }) => {
      const { id, created } = createCourseOutline(doc, {
        skillId,
        title: course.title,
        goal: course.goal,
        curriculum: course.curriculum as never,
        createdBy: agent,
      });
      const page = getPage(doc, id);
      const c = page ? getCurriculum(page) : null;
      const lessons = c ? allLessons(c) : [];
      const first = lessons[0]?.lesson;
      return `  course ${created ? "" : "(already had one) "}"${page ? displayTitle(pageMeta(page)) : id}" [${id}]: ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}${
        first ? `, first "${first.title}" (${first.id})` : ""
      }`;
    });

  tool(
    "get_skill_tree",
    {
      title: "Get skill tree",
      description:
        "The user's real-life skill tree, built like a D&D character: every skill trains one of six abilities (Strength, Dexterity, Constitution, Intelligence = academics and memory techniques, Wisdom, Charisma) whose scores and modifiers grow with XP. Lists ability scores, every skill with level, rank, XP, streaks, lock state, prerequisites and quests, plus today's quests. Each skill is also a page (its id is listed) where notes, plans and resources for it go — read or edit it with the note tools. Call this before coaching, planning or logging progress.",
      input: {},
      readOnly: true,
    },
    () => {
      const today = todaysQuests(doc);
      const open = today.filter((q) => !q.status.done);
      const quests = today.length
        ? `\n\nToday's quests: ${open.length} open of ${today.length}\n${today
            .map((q) => `- ${q.status.done ? "[x]" : "[ ]"} ${q.skill.icon} ${q.skill.name}: "${q.status.quest.title}" (${q.status.count}/${q.status.quest.target}) [${q.status.quest.id}]`)
            .join("\n")}`
        : "";
      return skillTreeSummary(doc) + quests;
    },
  );

  tool(
    "list_life_areas",
    {
      title: "List abilities",
      description:
        "The D&D-style abilities skills train (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma, plus any the user added), with ids and the D&D skills under each read as real life. Use an ability id, name, abbreviation or D&D skill name (e.g. \"Arcana\") as `area` when adding skills.",
      input: {},
      readOnly: true,
    },
    () =>
      listAreas(doc)
        .map((a) => {
          const dnd = ABILITY_SKILLS[a.id]?.map((s) => `${s.name} (${s.meaning})`).join("; ");
          return `${a.icon} ${a.name}${a.attribute ? ` ${a.attribute}` : ""} [${a.id}]${a.description ? ` — ${a.description}` : ""}${dnd ? `\n  D&D skills: ${dnd}` : ""}`;
        })
        .join("\n"),
  );

  const QUEST = z.object({
    title: z.string().describe('Concrete, checkable action, e.g. "Run 5 km", "Read 20 minutes"'),
    cadence: z.enum(["daily", "weekly"]).optional().describe("Default daily"),
    target: z.number().int().min(1).max(14).optional().describe("Completions per period, e.g. 3 for 3×/week"),
    xp: z.number().int().min(1).max(200).optional().describe("XP per completion (default 25)"),
  });

  tool(
    "add_skills",
    {
      title: "Add skills",
      description:
        "Add one or more skills to the user's skill tree in a single call (e.g. a whole plan for a life goal). Order foundations first. Prerequisites reference other `key`s in this call or existing skill names/ids; a skill unlocks when each prerequisite reaches `required_level`. `topic` makes a skill part of a bigger one (Mathematics → Arithmetic → Fractions): the app draws the parts under their topic, and a topic's parts stay locked until the topic unlocks. `course` gives a skill its course outline (lesson titles only) in the same call. Keep skills concrete and measurable, give each a fitting emoji and the ability it trains, and add 1–2 realistic habit quests where practice matters. For planning a whole subject, follow the general plan:\n" + GENERAL_PLAN,
      input: {
        skills: z
          .array(
            z.object({
              key: z.string().describe("Local key used by prerequisites within this call"),
              name: z.string(),
              icon: z.string().optional().describe("One emoji"),
              area: z.string().optional().describe("Ability id, name or abbreviation, e.g. int / Intelligence / INT (see list_life_areas)"),
              description: z.string().optional().describe("What mastery looks like, in one or two sentences"),
              prerequisites: z.array(z.string()).optional(),
              required_level: z.number().int().min(1).max(50).optional().describe("Level each prerequisite needs (default 1)"),
              goal_level: z.number().int().min(1).max(50).optional(),
              quests: z.array(QUEST).optional(),
              topic: z.string().optional().describe("The bigger skill this is part of: a key in this call, or an existing skill's id or name"),
              course: COURSE_OUTLINE.optional(),
            }),
          )
          .min(1)
          .max(80),
        branch: z
          .string()
          .optional()
          .describe('The learning path these skills make up, e.g. "Play guitar": the app shows it as one branch to follow, in order'),
      },
    },
    ({ skills, branch }) => {
      const ids = tx(() =>
        createSkillsFromPlan(
          doc,
          skills.map((s: any) => ({
            key: s.key,
            name: s.name,
            icon: s.icon,
            category: s.area,
            description: s.description,
            parentKeys: s.prerequisites,
            requiredLevel: s.required_level,
            goalLevel: s.goal_level,
            quests: s.quests,
            branch,
            topicKey: s.topic,
          })),
        ),
      );
      const courses = new Map<string, string>();
      tx(() => {
        const withCourse = skills.filter((s: any) => s.course && ids.has(s.key)).map((s: any) => ({ skillId: ids.get(s.key)!, course: s.course }));
        outline(withCourse).forEach((line, i) => courses.set(withCourse[i].skillId, line));
      });
      const created = [...ids.entries()].map(([key, id]) => {
        const sk = getSkill(doc, id);
        const topic = sk?.topic ? getSkill(doc, sk.topic)?.name : undefined;
        return `- ${sk?.name ?? key} [${id}]${topic ? ` (part of ${topic})` : ""}${courses.has(id) ? `\n${courses.get(id)}` : ""}`;
      });
      return `Added ${created.length} skill${created.length === 1 ? "" : "s"} to the skill tree:\n${created.join("\n")}`;
    },
  );

  tool(
    "update_skill",
    {
      title: "Update skill",
      description: "Edit a skill: rename, change emoji/area/description/goal, set prerequisites, or archive it.",
      input: {
        skill: z.string().describe("Skill id or exact name"),
        name: z.string().optional(),
        icon: z.string().optional(),
        area: z.string().optional(),
        description: z.string().optional(),
        goal_level: z.number().int().min(1).max(50).optional(),
        prerequisites: z.array(z.string()).optional().describe("Replaces prerequisites (skill ids or names); [] removes all"),
        required_level: z.number().int().min(1).max(50).optional(),
        topic: z.string().optional().describe('Make it part of this skill (id or name); "" makes it a skill of its own'),
        archived: z.boolean().optional(),
      },
    },
    (a) => {
      const skill = resolveSkill(doc, a.skill);
      tx(() => {
        const patch: Partial<Skill> = {};
        if (a.name) patch.name = a.name;
        if (a.icon) patch.icon = a.icon;
        if (a.description !== undefined) patch.description = a.description;
        if (a.goal_level) patch.goalLevel = a.goal_level;
        if (a.archived !== undefined) patch.archived = a.archived;
        if (a.area) {
          const area = resolveAreaId(doc, a.area);
          if (!area) throw new ToolError(`Unknown area "${a.area}". Call list_life_areas.`);
          patch.category = area;
        }
        if (Object.keys(patch).length) updateSkill(doc, skill.id, patch);
        if (a.prerequisites) {
          const parents = a.prerequisites.map((p: string) => resolveSkill(doc, p).id);
          setParents(doc, skill.id, parents, a.required_level);
        } else if (a.required_level) {
          updateSkill(doc, skill.id, { requiredLevel: a.required_level });
        }
        if (a.topic !== undefined) {
          const topic = a.topic ? resolveSkill(doc, a.topic).id : undefined;
          if (!setTopic(doc, skill.id, topic)) throw new ToolError(`${skill.name} can't be part of itself or of its own parts.`);
        }
      });
      return `Updated ${getSkill(doc, skill.id)?.name ?? skill.name}.`;
    },
  );

  tool(
    "log_practice",
    {
      title: "Log practice",
      description: "Record time the user spent practicing a skill (earns XP proportional to minutes). Use when the user tells you what they did.",
      input: {
        skill: z.string().describe("Skill id or exact name"),
        minutes: z.number().min(1).max(600),
        note: z.string().optional().describe("What they did"),
      },
    },
    ({ skill: ref, minutes, note }) => {
      const skill = resolveSkill(doc, ref);
      const before = levelForXp(totalXp(doc, skill.id));
      const entry = tx(() => logPractice(doc, skill.id, minutes, note ?? ""));
      if (!entry) throw new ToolError("Could not log practice.");
      return `Logged ${minutes} min of ${skill.name} (+${entry.amount} XP).${levelLine(doc, skill, before)}`;
    },
  );

  tool(
    "award_xp",
    {
      title: "Award XP",
      description: `Award XP for an achievement that isn't timed practice (finished a project, passed an exam, a milestone). Be fair and consistent: ~25 small win, ~100 solid milestone, ~300 major achievement (max ${MAX_AWARD}).`,
      input: {
        skill: z.string().describe("Skill id or exact name"),
        amount: z.number().int().min(1).max(MAX_AWARD),
        reason: z.string().describe("Short description shown in the skill's history"),
      },
    },
    ({ skill: ref, amount, reason }) => {
      const skill = resolveSkill(doc, ref);
      const before = levelForXp(totalXp(doc, skill.id));
      tx(() => addXp(doc, skill.id, { amount, note: reason, source: "claude" }));
      return `+${amount} XP to ${skill.name} for "${reason}".${levelLine(doc, skill, before)}`;
    },
  );

  tool(
    "add_quest",
    {
      title: "Add quest",
      description: "Add a recurring habit quest to a skill (daily or weekly, with a target count). Completing it grants XP and builds a streak.",
      input: { skill: z.string().describe("Skill id or exact name"), ...QUEST.shape },
    },
    ({ skill: ref, title, cadence, target, xp }) => {
      const skill = resolveSkill(doc, ref);
      const quest = tx(() => addQuest(doc, skill.id, { title, cadence, target, xp }));
      if (!quest) throw new ToolError("Could not add the quest.");
      return `Added quest "${quest.title}" (${quest.target}× ${quest.cadence}, ${quest.xp} XP) to ${skill.name} [${quest.id}].`;
    },
  );

  tool(
    "complete_quest",
    {
      title: "Complete quest",
      description: "Check off one completion of a quest the user reports having done today.",
      input: {
        skill: z.string().describe("Skill id or exact name"),
        quest: z.string().describe("Quest id or exact title"),
      },
    },
    ({ skill: ref, quest: qref }) => {
      const skill = resolveSkill(doc, ref);
      const q = (skill.quests ?? []).find((x) => x.id === qref || x.title.toLowerCase() === String(qref).toLowerCase());
      if (!q) throw new ToolError(`No quest "${qref}" on ${skill.name}. Call get_skill_tree to see quest ids.`);
      const before = levelForXp(totalXp(doc, skill.id));
      const entry = tx(() => completeQuest(doc, skill.id, q.id));
      if (!entry) return `"${q.title}" is already complete for this ${q.cadence === "daily" ? "day" : "week"}.`;
      return `Completed "${q.title}" (+${entry.amount} XP).${levelLine(doc, skill, before)}`;
    },
  );

  tool(
    "plan_courses",
    {
      title: "Plan courses",
      description:
        "Give several skills their course outlines in one call: lesson titles and one-line objectives only, no content (write lessons later with write_interactive_lesson, just before the learner reaches them). Each course is linked to its skill, so its lessons earn XP. A skill that already has a course keeps it. Use it after add_skills to plan every part of a topic.",
      input: {
        courses: z
          .array(
            z.object({
              skill: z.string().describe("Skill id or exact name"),
              title: z.string().optional(),
              goal: z.string().optional(),
              curriculum: CURRICULUM,
            }),
          )
          .min(1)
          .max(30),
      },
    },
    ({ courses }) => {
      const items = courses.map((c: any) => ({ skillId: resolveSkill(doc, c.skill).id, course: c }));
      const lines = tx(() => outline(items));
      return `Planned ${lines.length} course${lines.length === 1 ? "" : "s"}:\n${items.map((it: { skillId: string }, i: number) => `- ${getSkill(doc, it.skillId)?.name}\n${lines[i]}`).join("\n")}`;
    },
  );

  tool(
    "link_to_skill",
    {
      title: "Link page to skill",
      description: "Link a course (so mastered lessons earn XP for the skill) or a note page to a skill.",
      input: {
        skill: z.string().describe("Skill id or exact name"),
        page: z.string().describe("Page id or exact title (a course or any note)"),
      },
    },
    ({ skill: ref, page: pref }) => {
      const skill = resolveSkill(doc, ref);
      const lower = String(pref).trim().toLowerCase();
      const titled = listPages(doc).filter((p) => displayTitle(p).toLowerCase() === lower);
      const meta = (getPage(doc, pref) && pageMeta(getPage(doc, pref)!)) || titled.find((p) => p.kind === "course") || titled[0];
      if (!meta) throw new ToolError(`No page "${pref}". Use search_notes to find it.`);
      tx(() => {
        if (meta.kind === "course") updateSkill(doc, skill.id, { courseIds: [...new Set([...skill.courseIds, meta.id])] });
        else updateSkill(doc, skill.id, { pageIds: [...new Set([...skill.pageIds, meta.id])] });
      });
      return `Linked ${meta.kind === "course" ? "course" : "note"} "${displayTitle(meta)}" to ${skill.name}.${
        meta.kind === "course" ? " Mastered lessons now count toward this skill." : ""
      }`;
    },
  );
}

export const LEVEL_UP_PROMPT = (goal?: string) => `Be my life coach and help me treat real life like a D&D campaign, using the skill tree in my Basalt workspace. My character has six abilities (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma); every skill trains one, and ability scores grow with XP.

1. Call get_skill_tree and list_life_areas to see my ability scores and skills. Check memory_view /memories/ for what you know about me.
2. ${goal ? `My goal: "${goal}". ` : "Ask what I want to get better at and how much time I have. "}Design or extend the tree with add_skills: foundations first, concrete measurable skills, sensible prerequisites and levels, each under the ability it trains (Intelligence is academics and memory techniques). Add 1–2 realistic habit quests per skill I'll actively practice — ambitious but sustainable.
3. When a skill is best learned through study, offer to build a course (teach_me) and link it with link_to_skill so lessons earn XP.
4. Whenever I report what I did, log it (log_practice, complete_quest, or award_xp for milestones) and tell me my progress in one line. Celebrate level-ups and score increases briefly, in the spirit of a DM, and suggest the next step.
5. Every so often, review my ability scores and streaks, point out neglected abilities, and adjust quests that are too easy or too hard. Remember important context about my goals in memory.`;

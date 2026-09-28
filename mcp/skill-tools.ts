// Skill-tree tools: let Claude act as a "life coach" that designs the user's
// real-life skill tree, logs practice, awards XP and manages quests. The tree
// itself lives in the workspace (shared/skills.ts), so the user sees changes
// live in the Skill tree view.

import type * as Y from "yjs";
import { z } from "zod";
import { displayTitle, getPage, listPages, pageMeta } from "../shared/model.ts";
import {
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
  skillTreeSummary,
  todaysQuests,
  totalXp,
  updateSkill,
  type Skill,
} from "../shared/skills.ts";
import { ToolError } from "./ops.ts";

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

export function registerSkillTools(tool: ToolFn, ctx: { doc: Y.Doc; tx: <T>(fn: () => T) => T }) {
  const { doc, tx } = ctx;

  tool(
    "get_skill_tree",
    {
      title: "Get skill tree",
      description:
        "The user's real-life skill tree (RPG-style progression across life areas: body, mind, career, wealth, social, heart, creativity, home, adventure): every skill with level, rank, XP, streaks, lock state, prerequisites and quests, plus today's quests. Each skill is also a page (its id is listed) where notes, plans and resources for it go — read or edit it with the note tools. Call this before coaching, planning or logging progress.",
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
      title: "List life areas",
      description: "Life areas (categories) skills belong to, with ids. Use an area id or name as `area` when adding skills.",
      input: {},
      readOnly: true,
    },
    () => listAreas(doc).map((a) => `${a.icon} ${a.name} [${a.id}]${a.description ? ` — ${a.description}` : ""}`).join("\n"),
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
        "Add one or more skills to the user's skill tree in a single call (e.g. a whole plan for a life goal). Order foundations first. Prerequisites reference other `key`s in this call or existing skill names/ids; a skill unlocks when each prerequisite reaches `required_level`. Keep skills concrete and measurable, give each a fitting emoji and area, and add 1–2 realistic habit quests where practice matters.",
      input: {
        skills: z
          .array(
            z.object({
              key: z.string().describe("Local key used by prerequisites within this call"),
              name: z.string(),
              icon: z.string().optional().describe("One emoji"),
              area: z.string().optional().describe("Life area id or name (see list_life_areas)"),
              description: z.string().optional().describe("What mastery looks like, in one or two sentences"),
              prerequisites: z.array(z.string()).optional(),
              required_level: z.number().int().min(1).max(50).optional().describe("Level each prerequisite needs (default 1)"),
              goal_level: z.number().int().min(1).max(50).optional(),
              quests: z.array(QUEST).optional(),
            }),
          )
          .min(1)
          .max(60),
      },
    },
    ({ skills }) => {
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
          })),
        ),
      );
      const created = [...ids.entries()].map(([key, id]) => `- ${getSkill(doc, id)?.name ?? key} [${id}]`);
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
      const meta =
        (getPage(doc, pref) && pageMeta(getPage(doc, pref)!)) ||
        listPages(doc).find((p) => displayTitle(p).toLowerCase() === lower);
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

export const LEVEL_UP_PROMPT = (goal?: string) => `Be my life coach and help me treat real life like an RPG, using the skill tree in my Basalt workspace.

1. Call get_skill_tree and list_life_areas to see where I stand. Check memory_view /memories/ for what you know about me.
2. ${goal ? `My goal: "${goal}". ` : "Ask what I want to get better at (any area of life) and how much time I have. "}Design or extend the tree with add_skills: foundations first, concrete measurable skills, sensible prerequisites and levels, spread across the relevant life areas. Add 1–2 realistic habit quests per skill I'll actively practice — ambitious but sustainable.
3. When a skill is best learned through study, offer to build a course (teach_me) and link it with link_to_skill so lessons earn XP.
4. Whenever I report what I did, log it (log_practice, complete_quest, or award_xp for milestones) and tell me my progress in one line. Celebrate level-ups briefly and suggest the next step.
5. Every so often, review balance across areas and streaks, and adjust quests that are too easy or too hard. Remember important context about my goals in memory.`;

// One consistent snapshot of the skill tree per change, shared by the canvas,
// panel and character sheet.

import { useMemo } from "react";
import {
  characterSheet,
  computeSkillStats,
  courseXp,
  listAreas,
  listSkills,
  todaysQuests,
  type CharacterSheet,
  type CourseXp,
  type Skill,
  type SkillArea,
  type SkillStats,
  type TodayQuest,
} from "../../../shared/skills.ts";
import { skillMapOf, type SkillMap } from "../../../shared/skill-map.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { useSkillsVersion } from "./useSkillXp.ts";

export interface SkillTreeData {
  version: number;
  now: number;
  skills: Skill[];
  byId: Map<string, Skill>;
  archived: Skill[];
  areas: SkillArea[];
  stats: Map<string, SkillStats>;
  sheet: CharacterSheet;
  quests: TodayQuest[];
  /** Lesson counts of every course linked to a skill. */
  courses: Map<string, CourseXp>;
  /** The whole map: the built-in tree with your skills in it (see shared/skill-map.ts). */
  map: SkillMap;
}

export function useSkillTree(ws: Workspace): SkillTreeData {
  const version = useSkillsVersion(ws);
  return useMemo(() => {
    const now = Date.now();
    const all = listSkills(ws.doc, { includeArchived: true });
    const skills = all.filter((s) => !s.archived);
    const stats = computeSkillStats(ws.doc, now, skills);
    return {
      version,
      now,
      skills,
      byId: new Map(skills.map((s) => [s.id, s])),
      archived: all.filter((s) => s.archived),
      areas: listAreas(ws.doc),
      stats,
      sheet: characterSheet(ws.doc, now, stats),
      quests: todaysQuests(ws.doc, now),
      courses: new Map([...new Set(skills.flatMap((s) => s.courseIds))].map((c) => [c, courseXp(ws.doc, c)])),
      map: skillMapOf(ws.doc, skills, stats),
    };
  }, [ws, version]);
}

export const fmt = (n: number) => Math.round(n).toLocaleString();

export function plural(n: number, word: string, many = `${word}s`) {
  return `${fmt(n)} ${n === 1 ? word : many}`;
}

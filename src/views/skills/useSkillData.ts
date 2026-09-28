// One consistent snapshot of the skill tree per change, shared by the canvas,
// panel and character sheet.

import { useMemo } from "react";
import {
  characterSheet,
  computeSkillStats,
  listAreas,
  listSkills,
  todaysQuests,
  type CharacterSheet,
  type Skill,
  type SkillArea,
  type SkillStats,
  type TodayQuest,
} from "../../../shared/skills.ts";
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
    };
  }, [ws, version]);
}

export const fmt = (n: number) => Math.round(n).toLocaleString();

export function plural(n: number, word: string, many = `${word}s`) {
  return `${fmt(n)} ${n === 1 ? word : many}`;
}

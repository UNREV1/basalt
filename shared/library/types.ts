// Built-in courses: hand-written interactive lessons that work without any AI,
// each training one D&D skill (and so one ability) of the skill tree.

import type { LessonStep } from "../lesson.ts";

export type AbilityId = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface LibraryLesson {
  /** Stable id, unique within the course (progress is stored under it). */
  id: string;
  title: string;
  /** One sentence shown on the course path. */
  summary: string;
  steps: LessonStep[];
}

export interface LibraryCourse {
  /** Stable id, e.g. "memory-palace". */
  id: string;
  title: string;
  icon: string;
  /** One or two sentences for the course card. */
  blurb: string;
  ability: AbilityId;
  /** The skill it trains; created in the skill tree (under `ability`) if missing. */
  skill: { name: string; icon: string };
  lessons: LibraryLesson[];
}

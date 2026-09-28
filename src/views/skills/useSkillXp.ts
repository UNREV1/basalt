// Live subscriptions to the skill tree data, plus a lightweight stats hook
// for the Home page / sidebar badge.

import { useEffect, useMemo, useState } from "react";
import type * as Y from "yjs";
import { pagesMap, todayKey } from "../../../shared/model.ts";
import { characterSheet, skillAreasMap, skillsMap, skillXpMap, type Rank } from "../../../shared/skills.ts";
import type { Workspace } from "../../lib/workspace.ts";

/**
 * A counter that bumps (once per animation frame at most) whenever skills,
 * XP logs, areas or course progress change, and when the local date rolls
 * over (quests and streaks are per day).
 */
export function useSkillsVersion(ws: Workspace): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let frame = 0;
    const bump = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVersion((v) => v + 1);
      });
    };
    const skills = skillsMap(ws.doc);
    const xp = skillXpMap(ws.doc);
    const areas = skillAreasMap(ws.doc);
    const pages = pagesMap(ws.doc);
    // Course progress lives deep inside pages. Only pages appearing or
    // disappearing, trashing, and course data matter; ignore everything else
    // (rich text, canvases, updatedAt) — except that a skill page's title,
    // icon and type are the skill's name, icon and existence.
    const SKILL_KEYS = ["title", "icon", "typeId", "skillId"];
    const onPages = (events: Y.YEvent<any>[]) => {
      for (const e of events) {
        const relevant =
          e.path.length === 0 ||
          (e.path.length === 1 &&
            (e.keys.has("deletedAt") ||
              e.keys.has("course") ||
              (SKILL_KEYS.some((k) => e.keys.has(k)) && (e.target as Y.Map<unknown>).get("skillId") !== undefined))) ||
          e.path[1] === "course";
        if (relevant) {
          bump();
          return;
        }
      }
    };
    skills.observe(bump);
    xp.observeDeep(bump);
    areas.observe(bump);
    pages.observeDeep(onPages);
    let day = todayKey();
    const timer = window.setInterval(() => {
      if (todayKey() !== day) {
        day = todayKey();
        bump();
      }
    }, 60_000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      skills.unobserve(bump);
      xp.unobserveDeep(bump);
      areas.unobserve(bump);
      pages.unobserveDeep(onPages);
    };
  }, [ws]);
  return version;
}

export interface SkillBadgeStats {
  /** Sum of all skill levels. */
  totalLevel: number;
  skills: number;
  /** Rank of the highest-level skill, or null with no skills. */
  topRank: Rank | null;
  /** Character level (from all XP). */
  level: number;
  /** e.g. "Apprentice Scholar". */
  title: string;
}

/** Summary numbers for the Home page card and the sidebar badge. */
export function useSkillStats(ws: Workspace): SkillBadgeStats {
  const version = useSkillsVersion(ws);
  return useMemo(() => {
    const sheet = characterSheet(ws.doc);
    return { totalLevel: sheet.totalLevel, skills: sheet.skills, topRank: sheet.topRank, level: sheet.level, title: sheet.title };
  }, [ws, version]);
}

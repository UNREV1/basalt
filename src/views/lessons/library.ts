// The built-in course library (shared/library/*.ts), found at build time.

import type { AbilityId, LibraryCourse } from "../../../shared/library/types.ts";

const modules = import.meta.glob<{ default?: LibraryCourse }>("../../../shared/library/*.ts", { eager: true });

export const LIBRARY: LibraryCourse[] = Object.values(modules)
  .map((m) => m.default)
  .filter((c): c is LibraryCourse => !!c && Array.isArray(c.lessons) && c.lessons.length > 0)
  .sort((a, b) => a.title.localeCompare(b.title));

export const ABILITY_ORDER: AbilityId[] = ["int", "wis", "cha", "str", "dex", "con"];

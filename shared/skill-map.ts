// The skill map: the built-in tree (shared/skill-catalog.ts) merged with the
// skills you have. A catalog entry you already have (by its catalog key, or by
// name in the same place) is your skill, with your progress; the rest are
// planned skills, shown on the map but not in your tree until you start them.
// Locks follow the catalog on top of your own prerequisites: nothing is
// skipped, a detail needs the one before it, a sub-topic needs everything
// before it, and an advanced skill everything it builds on.

import type * as Y from "yjs";
import { CATALOG, CATALOG_BY_KEY, catalogChildren, nameKey, type CatalogEntry, type CatalogTier } from "./skill-catalog.ts";
import { GLYPHS, glyphFor } from "./glyphs.ts";
import {
  computeSkillStats,
  createSkillsFromPlan,
  listSkills,
  setParents,
  setTopic,
  skillDone,
  updateSkill,
  type Skill,
  type SkillPlanItem,
  type SkillStats,
} from "./skills.ts";

export const PLANNED_PREFIX = "cat:";
export const isPlanned = (id: string) => id.startsWith(PLANNED_PREFIX);

export interface MapEntry {
  /** Your skill's id, or "cat:<catalog key>" for a planned one. */
  id: string;
  name: string;
  ability: string;
  icon: string;
  description: string;
  tier?: CatalogTier;
  cat?: CatalogEntry;
  real?: Skill;
  /** What it's part of (a map id). */
  parent?: string;
  /** Its parts, in order (map ids). */
  children: string[];
  /** What has to be learnt first (map ids): the catalog's and your own prerequisites. */
  needs: string[];
  /** Its general topic's name: the path it belongs to. */
  branch?: string;
  locked: boolean;
  done: boolean;
}

export interface SkillMap {
  entries: MapEntry[];
  byId: Map<string, MapEntry>;
  /** Catalog key → map id. */
  byKey: Map<string, string>;
}

/** What the app knows about one of your skills. */
export interface SkillState {
  unlocked: boolean;
  done: boolean;
}

/** Your skill for each catalog entry: by its catalog key, else by name where it belongs. */
function matchCatalog(skills: Skill[]): Map<string, Skill> {
  const realOf = new Map<string, Skill>();
  const used = new Set<string>();
  for (const s of skills) {
    if (s.catalog && CATALOG_BY_KEY.has(s.catalog) && !realOf.has(s.catalog)) {
      realOf.set(s.catalog, s);
      used.add(s.id);
    }
  }
  const byName = new Map<string, Skill[]>();
  for (const s of skills) if (!used.has(s.id)) byName.set(nameKey(s.name), [...(byName.get(nameKey(s.name)) ?? []), s]);
  // Parents come before their parts in the catalog, so a part can look for its topic's match.
  for (const e of CATALOG) {
    if (realOf.has(e.key)) continue;
    const found = (byName.get(nameKey(e.name)) ?? []).filter((s) => !used.has(s.id) && !s.catalog);
    if (!found.length) continue;
    const parent = e.parent ? realOf.get(e.parent) : undefined;
    const pick =
      found.find((s) => parent && s.topic === parent.id) ??
      // A skill of its own with the same name and ability takes its place in the tree.
      (e.tier !== "detail" ? found.find((s) => !s.topic && s.category === e.ability) : undefined) ??
      (e.tier === "general" ? found.find((s) => !s.topic) : undefined);
    if (!pick) continue;
    realOf.set(e.key, pick);
    used.add(pick.id);
  }
  return realOf;
}

export function buildSkillMap(skills: Skill[], state: (s: Skill) => SkillState): SkillMap {
  const realOf = matchCatalog(skills);
  const byKey = new Map<string, string>();
  for (const e of CATALOG) byKey.set(e.key, realOf.get(e.key)?.id ?? PLANNED_PREFIX + e.key);
  const known = new Set(skills.map((s) => s.id));
  const matched = new Set([...realOf.values()].map((s) => s.id));
  const entries: MapEntry[] = [];
  for (const e of CATALOG) {
    const real = realOf.get(e.key);
    const field = CATALOG_BY_KEY.get(e.field)!;
    const needs = e.needs.map((k) => byKey.get(k)!);
    for (const p of real?.parents ?? []) if (known.has(p) && !needs.includes(p)) needs.push(p);
    entries.push({
      id: byKey.get(e.key)!,
      name: real?.name ?? e.name,
      ability: e.ability,
      icon: real?.icon ?? e.icon,
      description: real?.description || e.description || "",
      tier: e.tier,
      cat: e,
      real,
      parent: e.parent ? byKey.get(e.parent) : undefined,
      children: [],
      needs,
      branch: field.name,
      locked: false,
      done: false,
    });
  }
  for (const s of skills) {
    if (matched.has(s.id)) continue;
    entries.push({
      id: s.id,
      name: s.name,
      ability: s.category,
      icon: s.icon,
      description: s.description,
      real: s,
      parent: s.topic && known.has(s.topic) ? s.topic : undefined,
      children: [],
      needs: s.parents.filter((p) => known.has(p)),
      branch: s.branch,
      locked: false,
      done: false,
    });
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const e of entries) if (e.parent && byId.has(e.parent)) byId.get(e.parent)!.children.push(e.id);
  // Parts in the catalog's order, then yours in the order you made them.
  const rank = (id: string) => byId.get(id)?.cat?.order ?? 1e6 + (byId.get(id)?.real?.createdAt ?? 0) / 1e13;
  for (const e of entries) e.children.sort((a, b) => rank(a) - rank(b));

  // Learnt: every part learnt; a skill of its own, when its lessons are done.
  const doneMemo = new Map<string, boolean>();
  const done = (id: string): boolean => {
    if (doneMemo.has(id)) return doneMemo.get(id)!;
    doneMemo.set(id, false);
    const e = byId.get(id);
    const v = !!e && (e.children.length ? e.children.every(done) : !!e.real && state(e.real).done);
    doneMemo.set(id, v);
    return v;
  };
  // Locked: its topic is, one of your prerequisites isn't met, or (in the catalog) something before it isn't learnt.
  const lockMemo = new Map<string, boolean>();
  const locked = (id: string): boolean => {
    if (lockMemo.has(id)) return lockMemo.get(id)!;
    lockMemo.set(id, false);
    const e = byId.get(id);
    const v =
      !!e &&
      ((!!e.parent && locked(e.parent)) ||
        (!!e.real && !state(e.real).unlocked) ||
        (!!e.cat && e.cat.needs.some((k) => !done(byKey.get(k)!))));
    lockMemo.set(id, v);
    return v;
  };
  for (const e of entries) {
    e.done = done(e.id);
    e.locked = locked(e.id);
  }
  return { entries, byId, byKey };
}

/** The map for a document, from its skills and their stats. */
export function skillMapOf(doc: Y.Doc, skills = listSkills(doc), stats: Map<string, SkillStats> = computeSkillStats(doc, Date.now(), skills)): SkillMap {
  return buildSkillMap(skills, (s) => ({ unlocked: stats.get(s.id)?.unlocked ?? true, done: skillDone(doc, skills, s, stats) }));
}

/** An entry's line icon: its own when its name has one, else its general topic's. */
export function entryGlyph(e: Pick<MapEntry, "name" | "ability" | "cat" | "real">): string {
  const own = glyphFor({ name: e.name, glyph: e.real?.glyph });
  if (own !== "star" || !e.cat) return GLYPHS[glyphFor({ name: e.name, glyph: e.real?.glyph, category: e.ability })];
  const field = CATALOG_BY_KEY.get(e.cat.field)!;
  return GLYPHS[glyphFor({ name: field.name, category: e.ability })];
}

/** The first thing to learn inside a skill: its first part (in order) that isn't learnt yet, or itself. */
export function nextLeaf(map: SkillMap, id: string, seen = new Set<string>()): MapEntry | undefined {
  const e = map.byId.get(id);
  if (!e || seen.has(id)) return undefined;
  seen.add(id);
  if (!e.children.length) return e.done ? undefined : e;
  for (const c of e.children) {
    const hit = nextLeaf(map, c, seen);
    if (hit) return hit;
  }
  return undefined;
}

/** For a locked skill: the next thing you can learn on the way to it. */
export function nextStep(map: SkillMap, id: string, seen = new Set<string>()): MapEntry | undefined {
  const e = map.byId.get(id);
  if (!e || e.done || seen.has(id)) return undefined;
  seen.add(id);
  if (!e.locked) {
    const leaf = nextLeaf(map, id);
    if (!leaf || leaf.id === id) return e;
    return leaf.locked ? nextStep(map, leaf.id, seen) : leaf;
  }
  if (e.parent && map.byId.get(e.parent)?.locked) return nextStep(map, e.parent, seen);
  for (const n of e.needs) {
    const hit = nextStep(map, n, seen);
    if (hit) return hit;
  }
  return undefined;
}

/** What a locked skill is waiting for: the things before it that aren't learnt yet. */
export function missingFor(map: SkillMap, id: string): MapEntry[] {
  const e = map.byId.get(id);
  if (!e) return [];
  const out = e.needs.map((n) => map.byId.get(n)).filter((n): n is MapEntry => !!n && !n.done);
  const parent = e.parent ? map.byId.get(e.parent) : undefined;
  return parent?.locked ? [...missingFor(map, parent.id), ...out] : out;
}

/** Where a skill sits: its general topic down to it ("Mathematics › Algebra › Linear equations"). */
export function trail(map: SkillMap, id: string): MapEntry[] {
  const out: MapEntry[] = [];
  for (let e = map.byId.get(id), n = 0; e && n < 16; e = e.parent ? map.byId.get(e.parent) : undefined, n++) out.unshift(e);
  return out;
}

/**
 * Make a planned skill yours so it can be started: it, the topics it's in, and
 * (for a sub-topic or advanced skill) all its details, in order, each needing
 * the one before. Returns your skill's id for it.
 */
export function adoptPlanned(doc: Y.Doc, map: SkillMap, id: string): string | undefined {
  const e = map.byId.get(id);
  if (!e) return undefined;
  if (e.real) return e.real.id;
  const cat = e.cat!;
  const realId = (key: string) => {
    const mid = map.byKey.get(key);
    return mid && !isPlanned(mid) ? mid : undefined;
  };
  // The unit you adopt: a sub-topic or advanced skill with its details; a detail brings its owner's.
  const owner = cat.tier === "detail" ? CATALOG_BY_KEY.get(cat.parent!)! : cat;
  const chain: CatalogEntry[] = [];
  for (let k = owner.parent; k; k = CATALOG_BY_KEY.get(k)?.parent) chain.unshift(CATALOG_BY_KEY.get(k)!);
  chain.push(owner);
  if (owner.tier !== "general") chain.push(...catalogChildren(owner.key));
  const inPlan = new Set(chain.filter((c) => !realId(c.key)).map((c) => c.key));
  const plan: SkillPlanItem[] = [];
  for (const c of chain) {
    if (!inPlan.has(c.key)) continue;
    plan.push({
      key: c.key,
      name: c.name,
      icon: c.icon,
      category: c.ability,
      description: c.description,
      branch: CATALOG_BY_KEY.get(c.field)!.name,
      catalog: c.key,
      topicKey: c.parent ? (realId(c.parent) ?? c.parent) : undefined,
      // Only what exists; anything still planned keeps it locked on the map until it's learnt.
      parentKeys: c.needs.map((n) => realId(n) ?? (inPlan.has(n) ? n : undefined)).filter((n): n is string => !!n),
    });
  }
  const ids = plan.length ? createSkillsFromPlan(doc, plan) : new Map<string, string>();
  return ids.get(cat.key) ?? realId(cat.key);
}

/**
 * Start the tree over from the built-in plan: your skills that are in it keep
 * their progress and take their place (topic and prerequisites from the plan);
 * the rest are archived, so they can be brought back. Returns the counts.
 */
export function startTreeOver(doc: Y.Doc): { kept: number; archived: number } {
  const skills = listSkills(doc);
  const realOf = matchCatalog(skills);
  const idOf = new Map([...realOf].map(([k, s]) => [k, s.id]));
  const keep = new Set(idOf.values());
  let archived = 0;
  doc.transact(() => {
    for (const [key, s] of realOf) {
      const cat = CATALOG_BY_KEY.get(key)!;
      updateSkill(doc, s.id, { catalog: key, branch: CATALOG_BY_KEY.get(cat.field)!.name, category: cat.ability });
      const topic = cat.parent ? idOf.get(cat.parent) : undefined;
      if (s.topic !== topic) setTopic(doc, s.id, topic);
      setParents(
        doc,
        s.id,
        cat.needs.map((n) => idOf.get(n)).filter((n): n is string => !!n),
      );
    }
    for (const s of skills) {
      if (keep.has(s.id)) continue;
      updateSkill(doc, s.id, { archived: true });
      archived++;
    }
  });
  return { kept: keep.size, archived };
}

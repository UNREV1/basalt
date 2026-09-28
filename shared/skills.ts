// Real-life skill tree ("life RPG"): skills with prerequisites, XP, levels,
// ranks, abilities and recurring quests. Pure and Node-safe so both the app
// and the MCP server (Claude) can read and manage the tree.
//
// Like a D&D character, every skill trains one of six abilities (Strength,
// Dexterity, Constitution, Intelligence, Wisdom, Charisma), read as real
// life: Intelligence is academics and memory techniques, Wisdom is awareness
// and judgment, and so on. Internally an ability is an "area" (the model
// predates them), and custom areas still work alongside the six.
//
//   doc.getMap("skills")      skillId -> Skill (plain JSON, replaced as a whole on edit)
//   doc.getMap("skillXp")     skillId -> Y.Array<XpEntry> (append-only log, merges under concurrency)
//   doc.getMap("skillAreas")  areaId  -> SkillArea (overrides of the built-in areas + custom areas)
//
// Every skill is also a page (type "skill", under the "Skills" system page):
// the page holds its notes, and its title and icon are the skill's name and
// icon. Trashing the page hides the skill; deleting it for good removes it.
// Skills from before pages existed get theirs from ensureSkillPages().
//
// A skill's XP = its logged XP + XP derived from linked courses (lesson
// progress in shared/course.ts). Levels follow an RPG curve; ranks echo the
// "from scratch to PhD" arc. Quest completions are XP entries with
// source "quest" and note = quest id.

import * as Y from "yjs";
import { randomId } from "./crypto.ts";
import { allLessons, getCurriculum, getProgress } from "./course.ts";
import { createPage, ensureBuiltinType, findSystemPage, getPage, todayKey, trashPage } from "./model.ts";

/** Transaction origin for every write made through this module. */
export const SKILLS_ORIGIN = "basalt-skills";

// ---- types --------------------------------------------------------------------

export type XpSource = "practice" | "lesson" | "quiz" | "flashcards" | "task" | "manual" | "claude" | "quest";

export const XP_SOURCES: XpSource[] = ["practice", "lesson", "quiz", "flashcards", "task", "manual", "claude", "quest"];

export interface XpEntry {
  at: number;
  amount: number;
  note: string;
  source: XpSource;
  minutes?: number;
}

export type QuestCadence = "daily" | "weekly";

export interface Quest {
  id: string;
  title: string;
  /** XP granted per completion. */
  xp: number;
  cadence: QuestCadence;
  /** Completions needed per period (e.g. 3 for "3× per week"). */
  target: number;
}

export interface Skill {
  id: string;
  name: string;
  /** Emoji. */
  icon: string;
  description: string;
  /** Ability (area) id (see listAreas). */
  category: string;
  /** Optional color override (hex); defaults to the area color. */
  color?: string;
  /** Prerequisite skill ids. */
  parents: string[];
  /** Minimum level each parent needs before this skill unlocks. */
  requiredLevel: number;
  /** Linked course pages (kind "course"). */
  courseIds: string[];
  /** Linked note pages. */
  pageIds: string[];
  goalLevel?: number;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  /** Manual position override on the tree canvas. */
  pos?: { x: number; y: number };
  quests?: Quest[];
  /** The skill's page (type "skill"). Missing on skills made before pages. */
  pageId?: string;
}

export interface SkillArea {
  id: string;
  name: string;
  icon: string;
  /** Hex color (light-theme step; see AREA_PALETTE for the dark step). */
  color: string;
  /** Three-letter attribute shown on the character sheet, e.g. "VIT". */
  attribute?: string;
  /** Character archetype when this is the strongest area, e.g. "Athlete". */
  archetype?: string;
  description?: string;
  order?: number;
  /** Tombstone for hidden built-in areas. */
  deleted?: boolean;
}

// ---- constants ----------------------------------------------------------------

export const MAX_LEVEL = 50;
export const XP_PER_MINUTE = 10;
/** A single practice log counts at most this many minutes. */
export const MAX_PRACTICE_MINUTES = 240;
export const LESSON_MASTERED_XP = 120;
export const LESSON_SKIPPED_XP = 40;
export const DEFAULT_QUEST_XP = 25;
/** Exponent of the level curve: reaching level L needs 100·(L−1)^CURVE XP in total. */
const CURVE = 2.2;

/**
 * Categorical area colors, validated for color-vision separation in this
 * order (light on #fcfcfb, dark on #1a1a19). Areas are always labelled, so
 * color is a secondary cue.
 */
export const AREA_PALETTE: { light: string; dark: string; name: string }[] = [
  { light: "#e34948", dark: "#e66767", name: "Red" },
  { light: "#2a78d6", dark: "#3987e5", name: "Blue" },
  { light: "#a0652a", dark: "#b0743a", name: "Bronze" },
  { light: "#e87ba4", dark: "#d55181", name: "Pink" },
  { light: "#eda100", dark: "#c98500", name: "Gold" },
  { light: "#4a3aa7", dark: "#9085e9", name: "Violet" },
  { light: "#eb6834", dark: "#d95926", name: "Orange" },
  { light: "#1baf7a", dark: "#1a9aa8", name: "Aqua" },
  { light: "#008300", dark: "#008300", name: "Green" },
];

/** The theme-appropriate step for a palette color (unknown colors pass through). */
export function themedColor(hex: string, dark: boolean): string {
  if (!dark) return hex;
  const hit = AREA_PALETTE.find((p) => p.light.toLowerCase() === hex.toLowerCase());
  return hit ? hit.dark : hex;
}

/** The six abilities, in character-sheet order. The archetype is the D&D class it leads to. */
export const DEFAULT_AREAS: SkillArea[] = [
  { id: "str", name: "Strength", icon: "💪", color: AREA_PALETTE[0].light, attribute: "STR", archetype: "Fighter", description: "Power and athletics: strength training, climbing, swimming, sport and physical work", order: 0 },
  { id: "dex", name: "Dexterity", icon: "🤸", color: AREA_PALETTE[7].light, attribute: "DEX", archetype: "Rogue", description: "Agility and skilled hands: mobility, balance, dance, instruments, drawing, crafts and typing", order: 1 },
  { id: "con", name: "Constitution", icon: "🛡️", color: AREA_PALETTE[4].light, attribute: "CON", archetype: "Barbarian", description: "Health and endurance: cardio, sleep, nutrition, recovery and staying power", order: 2 },
  { id: "int", name: "Intelligence", icon: "🧠", color: AREA_PALETTE[1].light, attribute: "INT", archetype: "Wizard", description: "Academics and memory: study and memory techniques, science, math, history, languages and research", order: 3 },
  { id: "wis", name: "Wisdom", icon: "🦉", color: AREA_PALETTE[5].light, attribute: "WIS", archetype: "Cleric", description: "Awareness and judgment: mindfulness, self-knowledge, health know-how, money sense and the outdoors", order: 4 },
  { id: "cha", name: "Charisma", icon: "🎭", color: AREA_PALETTE[3].light, attribute: "CHA", archetype: "Bard", description: "Presence and influence: conversation, public speaking, persuasion, leadership and performing", order: 5 },
];

/**
 * The D&D 5e skills under each ability, read as real-life skills (the
 * templates, the tree generator and Claude use them). Constitution has no
 * skills in D&D; its entries are this app's.
 */
export const ABILITY_SKILLS: Record<string, { name: string; meaning: string }[]> = {
  str: [{ name: "Athletics", meaning: "strength training, climbing, swimming and sport" }],
  dex: [
    { name: "Acrobatics", meaning: "mobility, balance, yoga and dance" },
    { name: "Sleight of Hand", meaning: "hand skills: instruments, drawing, crafts and typing" },
    { name: "Stealth", meaning: "moving quietly and unseen: hiking, wildlife watching and online privacy" },
  ],
  con: [
    { name: "Endurance", meaning: "cardio, running and cycling" },
    { name: "Vitality", meaning: "sleep, nutrition and recovery" },
    { name: "Concentration", meaning: "holding deep focus under pressure" },
  ],
  int: [
    { name: "Memory", meaning: "memory techniques: spaced repetition, memory palaces and mnemonics" },
    { name: "Arcana", meaning: "science, math and technology" },
    { name: "History", meaning: "history, humanities and current events" },
    { name: "Investigation", meaning: "research and problem solving" },
    { name: "Nature", meaning: "biology, ecology and the natural sciences" },
    { name: "Religion", meaning: "philosophy, religion and mythology" },
  ],
  wis: [
    { name: "Animal Handling", meaning: "pets, animals and plants" },
    { name: "Insight", meaning: "reading people and yourself: empathy and journaling" },
    { name: "Medicine", meaning: "health know-how and first aid" },
    { name: "Perception", meaning: "mindfulness and noticing what others miss" },
    { name: "Survival", meaning: "self-reliance: the outdoors, cooking and money sense" },
  ],
  cha: [
    { name: "Deception", meaning: "acting, improv and a good poker face" },
    { name: "Intimidation", meaning: "presence, assertiveness and holding boundaries" },
    { name: "Performance", meaning: "public speaking, music and the stage" },
    { name: "Persuasion", meaning: "negotiation, sales and leadership" },
  ],
};

/** The life areas from before abilities, and the ability each one became. */
const LEGACY_AREAS: Record<string, string> = {
  body: "con",
  mind: "int",
  craft: "int",
  career: "int",
  social: "cha",
  wealth: "wis",
  money: "wis",
  heart: "wis",
  creativity: "cha",
  adventure: "wis",
  home: "wis",
};

const legacyArea = (id: string): string | undefined => (Object.hasOwn(LEGACY_AREAS, id) ? LEGACY_AREAS[id] : undefined);

/** D&D classes led by two strong abilities (keys sorted), after the single-ability archetypes. */
const CLASS_PAIRS: Record<string, string> = {
  "cha+str": "Paladin",
  "con+str": "Barbarian",
  "str+wis": "Ranger",
  "dex+wis": "Monk",
  "con+wis": "Druid",
  "con+int": "Artificer",
  "cha+con": "Sorcerer",
  "cha+wis": "Warlock",
};

/** An ability score for an ability's level: 10 is an average person, 20 is years of practice, 26 is the top (level 50). */
export function abilityScore(level: number): number {
  return Math.min(30, 10 + Math.floor(Math.max(0, level) / 3));
}

/** The D&D modifier for a score: 10–11 → +0, 14 → +2, 8 → −1. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export const formatModifier = (mod: number) => (mod < 0 ? `−${-mod}` : `+${mod}`);

/** An ability's score from its XP, and how far it is toward the next point (next: null at the top). */
export function scoreProgress(xp: number): { score: number; fraction: number; next: number | null } {
  const score = abilityScore(xp > 0 ? levelForXp(xp) : 0);
  const nextLevel = (score - 9) * 3;
  if (nextLevel > MAX_LEVEL) return { score, fraction: 1, next: null };
  const from = xpForLevel((score - 10) * 3);
  const next = xpForLevel(nextLevel);
  return { score, fraction: clamp((xp - from) / (next - from), 0, 1), next };
}

export interface Rank {
  id: string;
  name: string;
  minLevel: number;
  color: string;
  description: string;
}

export const RANKS: Rank[] = [
  { id: "novice", name: "Novice", minLevel: 1, color: "#8b8d98", description: "Starting from scratch: learning what the skill even is." },
  { id: "apprentice", name: "Apprentice", minLevel: 5, color: "#30a46c", description: "Building the fundamentals with guidance." },
  { id: "journeyman", name: "Journeyman", minLevel: 10, color: "#0090ff", description: "Competent and practising independently." },
  { id: "adept", name: "Adept", minLevel: 18, color: "#8e4ec6", description: "Proficient: handles advanced material with confidence." },
  { id: "expert", name: "Expert", minLevel: 26, color: "#f76b15", description: "Deep, graduate-level expertise." },
  { id: "master", name: "Master", minLevel: 34, color: "#e5484d", description: "Teaches others and works at research level." },
  { id: "grandmaster", name: "Grandmaster", minLevel: 42, color: "#ffb224", description: "At the frontier, creating new knowledge." },
];

// ---- accessors ----------------------------------------------------------------

export const skillsMap = (doc: Y.Doc) => doc.getMap<Skill>("skills");
export const skillXpMap = (doc: Y.Doc) => doc.getMap<Y.Array<XpEntry>>("skillXp");
export const skillAreasMap = (doc: Y.Doc) => doc.getMap<SkillArea>("skillAreas");

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const uniq = (ids: string[]) => [...new Set(ids.filter((x) => typeof x === "string" && x))];

// ---- levels & ranks -------------------------------------------------------------

/** Total XP needed to reach `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  const n = clamp(Math.floor(level), 1, MAX_LEVEL) - 1;
  return Math.round(100 * Math.pow(n, CURVE));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  xp: number;
  /** XP at the start of this level. */
  floor: number;
  /** XP needed for the next level (null at the cap). */
  next: number | null;
  /** 0..1 toward the next level (1 at the cap). */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const next = level < MAX_LEVEL ? xpForLevel(level + 1) : null;
  const fraction = next === null ? 1 : clamp((xp - floor) / (next - floor), 0, 1);
  return { level, xp, floor, next, fraction };
}

export function rankForLevel(level: number): Rank {
  let out = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) out = r;
  return out;
}

/** XP for a practice session (10 XP per minute, capped per log). */
export function practiceXp(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round(Math.min(minutes, MAX_PRACTICE_MINUTES) * XP_PER_MINUTE);
}

// ---- areas ----------------------------------------------------------------------

/** Built-in areas (with any stored overrides) plus custom areas, in display order. */
export function listAreas(doc: Y.Doc, opts: { includeDeleted?: boolean } = {}): SkillArea[] {
  const stored = skillAreasMap(doc);
  const out: SkillArea[] = [];
  for (const def of DEFAULT_AREAS) {
    const o = stored.get(def.id);
    out.push(o ? { ...def, ...o, id: def.id } : def);
  }
  stored.forEach((a, id) => {
    // Edits of the old built-in areas are left behind: their skills moved to abilities.
    if (!DEFAULT_AREAS.some((d) => d.id === id) && !legacyArea(id) && a && typeof a === "object") out.push({ ...a, id });
  });
  return out
    .filter((a) => opts.includeDeleted || !a.deleted)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
}

export function getArea(doc: Y.Doc, id: string): SkillArea | undefined {
  return listAreas(doc, { includeDeleted: true }).find((a) => a.id === id);
}

export function saveArea(doc: Y.Doc, area: SkillArea) {
  doc.transact(() => skillAreasMap(doc).set(area.id, clone(area)), SKILLS_ORIGIN);
}

export function createArea(doc: Y.Doc, input: Partial<SkillArea> & { name: string }): SkillArea {
  const areas = listAreas(doc, { includeDeleted: true });
  const used = new Set(areas.filter((a) => !a.deleted).map((a) => a.color.toLowerCase()));
  const color = input.color ?? AREA_PALETTE.find((p) => !used.has(p.light.toLowerCase()))?.light ?? AREA_PALETTE[areas.length % AREA_PALETTE.length].light;
  const area: SkillArea = {
    id: input.id ?? randomId(8),
    name: input.name.trim() || "New area",
    icon: input.icon || "✨",
    color,
    attribute: input.attribute ?? input.name.trim().slice(0, 3).toUpperCase(),
    archetype: input.archetype,
    description: input.description ?? "",
    order: input.order ?? Math.max(0, ...areas.map((a) => a.order ?? 0)) + 1,
  };
  saveArea(doc, area);
  return area;
}

/** Hide an area; its skills move to `moveTo` (default: the first remaining area). */
export function deleteArea(doc: Y.Doc, id: string, moveTo?: string) {
  doc.transact(() => {
    const remaining = listAreas(doc).filter((a) => a.id !== id);
    const target = moveTo && remaining.some((a) => a.id === moveTo) ? moveTo : remaining[0]?.id;
    if (DEFAULT_AREAS.some((d) => d.id === id)) {
      const cur = getArea(doc, id)!;
      skillAreasMap(doc).set(id, { ...cur, deleted: true });
    } else {
      skillAreasMap(doc).delete(id);
    }
    if (target) {
      for (const s of listSkills(doc, { includeArchived: true })) {
        if (s.category === id) skillsMap(doc).set(s.id, { ...s, category: target, updatedAt: Date.now() });
      }
    }
  }, SKILLS_ORIGIN);
}

/**
 * Find an area by id, name or attribute (case-insensitive), a D&D skill
 * ("Arcana" → Intelligence) or an old life area ("mind" → Intelligence).
 */
export function resolveAreaId(doc: Y.Doc, nameOrId: string | undefined | null): string | undefined {
  if (!nameOrId) return undefined;
  const q = nameOrId.trim().toLowerCase();
  if (!q) return undefined;
  const areas = listAreas(doc);
  const live = (id: string | undefined) => (id && areas.some((a) => a.id === id) ? id : undefined);
  return (
    areas.find((a) => a.id.toLowerCase() === q)?.id ??
    areas.find((a) => a.name.toLowerCase() === q)?.id ??
    areas.find((a) => a.attribute?.toLowerCase() === q)?.id ??
    live(Object.keys(ABILITY_SKILLS).find((id) => ABILITY_SKILLS[id].some((s) => s.name.toLowerCase() === q))) ??
    live(legacyArea(q)) ??
    areas.find((a) => a.name.toLowerCase().split(/\s*&\s*|\s+/).includes(q))?.id
  );
}

/** The area a skill belongs to, or a neutral stand-in when it is unknown. */
export function areaOf(doc: Y.Doc, skill: Pick<Skill, "category">, areas = listAreas(doc)): SkillArea {
  return (
    areas.find((a) => a.id === skill.category) ?? {
      id: skill.category || "other",
      name: skill.category || "Other",
      icon: "✨",
      color: "#8b8d98",
      attribute: "OTH",
      archetype: "Wanderer",
    }
  );
}

// ---- skills ---------------------------------------------------------------------

/** Defensive normalisation (skills may be written by other clients or Claude). */
export function normalizeSkill(raw: Partial<Skill> & { id: string }): Skill {
  const quests = Array.isArray(raw.quests) ? raw.quests.map(normalizeQuest) : [];
  const out: Skill = {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "",
    icon: typeof raw.icon === "string" && raw.icon ? raw.icon : "⭐",
    description: typeof raw.description === "string" ? raw.description : "",
    category: typeof raw.category === "string" ? (legacyArea(raw.category) ?? raw.category) : "",
    parents: Array.isArray(raw.parents) ? uniq(raw.parents).filter((p) => p !== raw.id) : [],
    requiredLevel: clamp(Math.round(Number(raw.requiredLevel) || 1), 1, MAX_LEVEL),
    courseIds: Array.isArray(raw.courseIds) ? uniq(raw.courseIds) : [],
    pageIds: Array.isArray(raw.pageIds) ? uniq(raw.pageIds) : [],
    createdAt: Number(raw.createdAt) || 0,
    updatedAt: Number(raw.updatedAt) || 0,
  };
  if (raw.color) out.color = raw.color;
  if (raw.goalLevel) out.goalLevel = clamp(Math.round(Number(raw.goalLevel)), 1, MAX_LEVEL);
  if (raw.archived) out.archived = true;
  if (raw.pos && Number.isFinite(raw.pos.x) && Number.isFinite(raw.pos.y)) out.pos = { x: raw.pos.x, y: raw.pos.y };
  if (quests.length) out.quests = quests;
  if (typeof raw.pageId === "string" && raw.pageId) out.pageId = raw.pageId;
  return out;
}

// ---- skill pages -------------------------------------------------------------------

export const SKILLS_SYSTEM = "skills";
export const SKILL_TYPE_ID = "skill";
const SKILLS_ROOT_ID = "system-skills";

/** Page ids are derived from skill ids so two devices creating one converge. */
export const skillPageIdFor = (skillId: string) => `skill-${skillId}`;

/** The "Skills" page all skill pages live under. */
export function ensureSkillsRoot(doc: Y.Doc): string {
  const found = findSystemPage(doc, SKILLS_SYSTEM);
  if (found) return found;
  const old = getPage(doc, SKILLS_ROOT_ID);
  if (old) {
    old.set("deletedAt", null);
    return SKILLS_ROOT_ID;
  }
  return createPage(doc, { id: SKILLS_ROOT_ID, title: "Skills", icon: "🌳", system: SKILLS_SYSTEM });
}

type PageState = "none" | "live" | "gone";

/** Whether a skill has a page, and whether that page still counts as the skill. */
function pageState(doc: Y.Doc, skill: Pick<Skill, "pageId">): PageState {
  if (!skill.pageId) return "none";
  const page = getPage(doc, skill.pageId);
  if (!page || page.get("deletedAt") || page.get("typeId") !== SKILL_TYPE_ID) return "gone";
  return "live";
}

/** The page's title and icon are the skill's name and icon. */
function withPage(doc: Y.Doc, skill: Skill): Skill {
  const page = skill.pageId ? getPage(doc, skill.pageId) : undefined;
  if (!page) return skill;
  const title = String(page.get("title") ?? "").trim();
  const icon = String(page.get("icon") ?? "");
  return { ...skill, name: title || skill.name, icon: icon && !icon.startsWith("img:") ? icon : skill.icon };
}

/** Create (or re-link) the page of one skill. Returns its id. */
export function ensureSkillPage(doc: Y.Doc, skillId: string): string | undefined {
  const raw = skillsMap(doc).get(skillId);
  if (!raw || typeof raw !== "object") return undefined;
  const skill = normalizeSkill({ ...raw, id: skillId });
  if (skill.pageId && getPage(doc, skill.pageId)) return skill.pageId;
  const pageId = skillPageIdFor(skill.id);
  doc.transact(() => {
    ensureBuiltinType(doc, SKILL_TYPE_ID);
    if (!getPage(doc, pageId)) {
      createPage(doc, { id: pageId, title: skill.name, icon: skill.icon, typeId: SKILL_TYPE_ID, parentId: ensureSkillsRoot(doc), order: skill.createdAt });
    }
    getPage(doc, pageId)!.set("skillId", skill.id);
    const raw = skillsMap(doc).get(skill.id);
    if (raw) skillsMap(doc).set(skill.id, clone({ ...raw, pageId }));
  }, SKILLS_ORIGIN);
  return pageId;
}

/** Give every active skill made before skill pages existed its page. */
export function ensureSkillPages(doc: Y.Doc) {
  const missing: string[] = [];
  skillsMap(doc).forEach((raw, id) => {
    if (raw && typeof raw === "object" && !raw.archived && !(raw.pageId && getPage(doc, raw.pageId))) missing.push(id);
  });
  if (!missing.length) return;
  doc.transact(() => missing.forEach((id) => ensureSkillPage(doc, id)), SKILLS_ORIGIN);
}

/**
 * The skill a page of type "skill" stands for, creating it if needed (a page
 * given the Skill type by hand, or a duplicate of another skill's page).
 */
export function ensureSkillForPage(doc: Y.Doc, pageId: string): string | undefined {
  const page = getPage(doc, pageId);
  if (!page || page.get("deletedAt") || page.get("typeId") !== SKILL_TYPE_ID) return undefined;
  const linked = page.get("skillId") as string | undefined;
  const skill = linked ? getSkill(doc, linked) : undefined;
  if (skill && skill.pageId === pageId) return skill.id;
  doc.transact(() => {
    if (skill && !skill.pageId) {
      skillsMap(doc).set(skill.id, clone({ ...skillsMap(doc).get(skill.id)!, pageId }));
      return;
    }
    const id = `pg-${pageId}`;
    if (!skillsMap(doc).has(id)) {
      createSkill(doc, { id, pageId, name: String(page.get("title") ?? "") || "New skill", icon: String(page.get("icon") ?? "") || "🌱" });
    }
    page.set("skillId", id);
  }, SKILLS_ORIGIN);
  return (page.get("skillId") as string) || undefined;
}

export function listSkills(doc: Y.Doc, opts: { includeArchived?: boolean } = {}): Skill[] {
  const out: Skill[] = [];
  skillsMap(doc).forEach((raw, id) => {
    if (!raw || typeof raw !== "object") return;
    const s = normalizeSkill({ ...raw, id });
    if (!opts.includeArchived && s.archived) return;
    // Its page is in the trash (or no longer a Skill page).
    if (pageState(doc, s) === "gone") return;
    out.push(withPage(doc, s));
  });
  return out.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** A skill, unless its page is in the trash (or no longer a Skill page). */
export function getSkill(doc: Y.Doc, id: string): Skill | undefined {
  const raw = skillsMap(doc).get(id);
  if (!raw || typeof raw !== "object") return undefined;
  const s = normalizeSkill({ ...raw, id });
  return pageState(doc, s) === "gone" ? undefined : withPage(doc, s);
}

/** Replace a skill's JSON (bumps updatedAt). */
export function saveSkill(doc: Y.Doc, skill: Skill) {
  const next = normalizeSkill({ ...skill, updatedAt: Date.now() });
  doc.transact(() => skillsMap(doc).set(skill.id, clone(next)), SKILLS_ORIGIN);
}

export function updateSkill(doc: Y.Doc, id: string, patch: Partial<Omit<Skill, "id">>): Skill | undefined {
  const cur = getSkill(doc, id);
  if (!cur) return undefined;
  const next = { ...cur, ...patch, id };
  // Explicit undefined in a patch clears optional fields.
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete (next as Record<string, unknown>)[k];
  doc.transact(() => {
    saveSkill(doc, next);
    const page = cur.pageId ? getPage(doc, cur.pageId) : undefined;
    if (page) {
      if (patch.name !== undefined && patch.name !== page.get("title")) page.set("title", patch.name);
      if (patch.icon !== undefined && patch.icon !== page.get("icon")) page.set("icon", patch.icon);
    }
  }, SKILLS_ORIGIN);
  // Un-archiving a skill made before pages gives it one.
  if ("archived" in patch && !patch.archived && !cur.pageId) ensureSkillPage(doc, id);
  return getSkill(doc, id);
}

export interface SkillInput {
  id?: string;
  name: string;
  icon?: string;
  description?: string;
  /** Area id or name; unknown names create a custom area. */
  category?: string;
  color?: string;
  parents?: string[];
  requiredLevel?: number;
  courseIds?: string[];
  pageIds?: string[];
  goalLevel?: number;
  pos?: { x: number; y: number };
  quests?: QuestInput[];
  /** Defaults to now; batches pass increasing values to keep their order. */
  createdAt?: number;
  /** An existing page to be this skill's page (otherwise one is created). */
  pageId?: string;
}

export function createSkill(doc: Y.Doc, input: SkillInput): Skill {
  let skill!: Skill;
  doc.transact(() => {
    let category = resolveAreaId(doc, input.category);
    if (!category && input.category?.trim()) category = createArea(doc, { name: input.category.trim() }).id;
    category ??= listAreas(doc)[0]?.id ?? "mind";
    const now = input.createdAt ?? Date.now();
    const id = input.id ?? randomId(10);
    const existing = new Set(skillsMap(doc).keys());
    skill = normalizeSkill({
      id,
      name: input.name.trim() || "New skill",
      icon: input.icon || "⭐",
      description: input.description ?? "",
      category,
      color: input.color,
      parents: (input.parents ?? []).filter((p) => existing.has(p)),
      requiredLevel: input.requiredLevel ?? 1,
      courseIds: input.courseIds ?? [],
      pageIds: input.pageIds ?? [],
      goalLevel: input.goalLevel,
      pos: input.pos,
      quests: (input.quests ?? []).map((q) => newQuest(q)),
      createdAt: now,
      updatedAt: now,
      pageId: input.pageId,
    });
    skillsMap(doc).set(id, clone(skill));
    // Created together with the skill so no other client ever races to create it.
    if (!skillXpMap(doc).has(id)) skillXpMap(doc).set(id, new Y.Array<XpEntry>());
    if (!input.pageId) skill = { ...skill, pageId: ensureSkillPage(doc, id) };
  }, SKILLS_ORIGIN);
  return skill;
}

/**
 * Delete a skill. One with a page goes to the trash with it (restoring the
 * page brings back its XP and prerequisites); an old page-less skill is
 * removed with its XP log and dropped from other skills' prerequisites.
 */
export function deleteSkill(doc: Y.Doc, id: string) {
  const skill = getSkill(doc, id);
  if (skill?.pageId && getPage(doc, skill.pageId)) {
    trashPage(doc, skill.pageId);
    return;
  }
  doc.transact(() => {
    for (const s of listSkills(doc, { includeArchived: true })) {
      if (s.parents.includes(id)) {
        skillsMap(doc).set(s.id, clone({ ...s, parents: s.parents.filter((p) => p !== id), updatedAt: Date.now() }));
      }
    }
    skillsMap(doc).delete(id);
    skillXpMap(doc).delete(id);
  }, SKILLS_ORIGIN);
}

export function childrenOf(doc: Y.Doc, id: string, skills = listSkills(doc)): Skill[] {
  return skills.filter((s) => s.parents.includes(id));
}

/** Skills without (visible) prerequisites. */
export function roots(doc: Y.Doc, skills = listSkills(doc)): Skill[] {
  const ids = new Set(skills.map((s) => s.id));
  return skills.filter((s) => !s.parents.some((p) => ids.has(p)));
}

/** All transitive prerequisites of a skill. */
export function ancestorsOf(doc: Y.Doc, id: string): Set<string> {
  const out = new Set<string>();
  const stack = [...(getSkill(doc, id)?.parents ?? [])];
  while (stack.length) {
    const p = stack.pop()!;
    if (out.has(p)) continue;
    out.add(p);
    stack.push(...(getSkill(doc, p)?.parents ?? []));
  }
  return out;
}

/** All transitive dependents of a skill. */
export function descendantsOf(doc: Y.Doc, id: string, skills = listSkills(doc, { includeArchived: true })): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const s of skills) {
      if (s.parents.includes(cur) && !out.has(s.id)) {
        out.add(s.id);
        stack.push(s.id);
      }
    }
  }
  return out;
}

/** Can `parentId` become a prerequisite of `childId` without creating a cycle? */
export function canAddParent(doc: Y.Doc, childId: string, parentId: string): boolean {
  if (childId === parentId) return false;
  if (!getSkill(doc, parentId)) return false;
  return !ancestorsOf(doc, parentId).has(childId);
}

/**
 * Set a skill's prerequisites, dropping unknown ids and any that would create
 * a cycle. Returns the accepted parents.
 */
export function setParents(doc: Y.Doc, id: string, parents: string[], requiredLevel?: number): string[] {
  const cur = getSkill(doc, id);
  if (!cur) return [];
  const accepted: string[] = [];
  for (const p of uniq(parents)) if (canAddParent(doc, id, p)) accepted.push(p);
  saveSkill(doc, { ...cur, parents: accepted, requiredLevel: requiredLevel ?? cur.requiredLevel });
  return accepted;
}

// ---- XP log ---------------------------------------------------------------------

function xpLog(doc: Y.Doc, skillId: string, create: boolean): Y.Array<XpEntry> | undefined {
  const map = skillXpMap(doc);
  const found = map.get(skillId);
  if (found || !create) return found;
  let arr: Y.Array<XpEntry> | undefined;
  doc.transact(() => {
    arr = map.get(skillId);
    if (!arr) {
      arr = new Y.Array<XpEntry>();
      map.set(skillId, arr);
    }
  }, SKILLS_ORIGIN);
  return arr;
}

export function normalizeXpEntry(e: Partial<XpEntry>): XpEntry {
  const out: XpEntry = {
    at: Number(e.at) || Date.now(),
    amount: Math.round(clamp(Number(e.amount) || 0, -1_000_000, 1_000_000)),
    note: typeof e.note === "string" ? e.note.slice(0, 500) : "",
    source: XP_SOURCES.includes(e.source as XpSource) ? (e.source as XpSource) : "manual",
  };
  if (e.minutes !== undefined && Number.isFinite(Number(e.minutes))) out.minutes = Math.max(0, Math.round(Number(e.minutes)));
  return out;
}

export function addXp(doc: Y.Doc, skillId: string, entry: Partial<XpEntry> & { amount: number }): XpEntry | null {
  if (!getSkill(doc, skillId)) return null;
  const e = normalizeXpEntry(entry);
  doc.transact(() => xpLog(doc, skillId, true)!.push([e]), SKILLS_ORIGIN);
  return e;
}

/** Log a practice session: 10 XP per minute (capped). */
export function logPractice(doc: Y.Doc, skillId: string, minutes: number, note = ""): XpEntry | null {
  const amount = practiceXp(minutes);
  if (amount <= 0) return null;
  return addXp(doc, skillId, { amount, minutes: Math.round(minutes), note, source: "practice" });
}

/** Remove one logged entry (matched by value). */
export function removeXpEntry(doc: Y.Doc, skillId: string, entry: XpEntry): boolean {
  const arr = xpLog(doc, skillId, false);
  if (!arr) return false;
  const list = arr.toArray();
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e.at === entry.at && e.amount === entry.amount && e.source === entry.source && e.note === entry.note) {
      doc.transact(() => arr.delete(i, 1), SKILLS_ORIGIN);
      return true;
    }
  }
  return false;
}

/** Logged entries, oldest first. */
export function xpEntries(doc: Y.Doc, skillId: string): XpEntry[] {
  const arr = xpLog(doc, skillId, false);
  if (!arr) return [];
  return arr
    .toArray()
    .filter((e) => e && typeof e === "object")
    .map(normalizeXpEntry)
    .sort((a, b) => a.at - b.at);
}

export function loggedXp(doc: Y.Doc, skillId: string): number {
  return Math.max(0, xpEntries(doc, skillId).reduce((sum, e) => sum + e.amount, 0));
}

export interface CourseXp {
  courseId: string;
  title: string;
  xp: number;
  mastered: number;
  skipped: number;
  total: number;
}

/** XP a linked course contributes: 120 per mastered lesson, 40 per skipped. */
export function courseXp(doc: Y.Doc, courseId: string): CourseXp {
  const page = getPage(doc, courseId);
  const out: CourseXp = { courseId, title: "", xp: 0, mastered: 0, skipped: 0, total: 0 };
  if (!page || page.get("deletedAt")) return out;
  out.title = (page.get("title") as string) || "";
  const curriculum = page.get("course") instanceof Y.Map ? getCurriculum(page) : null;
  if (!curriculum) return out;
  for (const { lesson } of allLessons(curriculum)) {
    out.total++;
    const status = getProgress(page, lesson.id).status;
    if (status === "mastered") out.mastered++;
    else if (status === "skipped") out.skipped++;
  }
  out.xp = out.mastered * LESSON_MASTERED_XP + out.skipped * LESSON_SKIPPED_XP;
  return out;
}

export function totalXp(doc: Y.Doc, skillId: string, opts: { courses?: boolean } = {}): number {
  const skill = getSkill(doc, skillId);
  if (!skill) return 0;
  let xp = loggedXp(doc, skillId);
  if (opts.courses !== false) for (const c of skill.courseIds) xp += courseXp(doc, c).xp;
  return xp;
}

export function skillLevel(doc: Y.Doc, skillId: string): number {
  return levelForXp(totalXp(doc, skillId));
}

// ---- streaks --------------------------------------------------------------------

export interface Streak {
  /** Consecutive days up to today (or yesterday, if today has no activity yet). */
  current: number;
  best: number;
  today: boolean;
  lastAt: number | null;
}

const dayNum = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Streak over a set of local-date keys ("YYYY-MM-DD"). */
export function streakFromDays(days: Iterable<string>, now = Date.now()): Omit<Streak, "lastAt"> {
  const nums = [...new Set([...days].map(dayNum))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < nums.length; i++) {
    run = i > 0 && nums[i] === nums[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const set = new Set(nums);
  const today = dayNum(todayKey(new Date(now)));
  let cursor = set.has(today) ? today : today - 1;
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor--;
  }
  return { current, best, today: set.has(today) };
}

/** Practice-day streak for a skill (any positive XP entry counts). */
export function skillStreak(doc: Y.Doc, skillId: string, now = Date.now(), entries = xpEntries(doc, skillId)): Streak {
  const active = entries.filter((e) => e.amount > 0);
  const s = streakFromDays(
    active.map((e) => todayKey(new Date(e.at))),
    now,
  );
  return { ...s, lastAt: active.length ? active[active.length - 1].at : null };
}

// ---- quests ---------------------------------------------------------------------

export interface QuestInput {
  id?: string;
  title: string;
  xp?: number;
  cadence?: QuestCadence;
  target?: number;
}

export function normalizeQuest(q: Partial<Quest>): Quest {
  const cadence: QuestCadence = q.cadence === "weekly" ? "weekly" : "daily";
  return {
    id: typeof q.id === "string" && q.id ? q.id : randomId(8),
    title: typeof q.title === "string" ? q.title : "",
    xp: clamp(Math.round(Number(q.xp) || DEFAULT_QUEST_XP), 1, 10_000),
    cadence,
    target: clamp(Math.round(Number(q.target) || 1), 1, cadence === "daily" ? 20 : 50),
  };
}

function newQuest(q: QuestInput): Quest {
  return normalizeQuest({ ...q, id: q.id ?? randomId(8) });
}

/** Local-date key of the period containing `at` (weeks start on Monday). */
export function periodKey(cadence: QuestCadence, at: number): string {
  const d = new Date(at);
  if (cadence === "weekly") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return todayKey(d);
}

function previousPeriodKey(cadence: QuestCadence, key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() - (cadence === "weekly" ? 7 : 1));
  return todayKey(date);
}

export interface QuestStatus {
  quest: Quest;
  /** Completions in the current period. */
  count: number;
  target: number;
  done: boolean;
  /** Consecutive periods meeting the target (the current one counts once done). */
  streak: number;
  lastAt: number | null;
}

export function questStatus(entries: XpEntry[], quest: Quest, now = Date.now()): QuestStatus {
  const completions = entries.filter((e) => e.source === "quest" && e.note === quest.id && e.amount > 0);
  const perPeriod = new Map<string, number>();
  for (const e of completions) {
    const k = periodKey(quest.cadence, e.at);
    perPeriod.set(k, (perPeriod.get(k) ?? 0) + 1);
  }
  const current = periodKey(quest.cadence, now);
  const count = perPeriod.get(current) ?? 0;
  const done = count >= quest.target;
  let streak = done ? 1 : 0;
  let cursor = previousPeriodKey(quest.cadence, current);
  while ((perPeriod.get(cursor) ?? 0) >= quest.target) {
    streak++;
    cursor = previousPeriodKey(quest.cadence, cursor);
  }
  return {
    quest,
    count,
    target: quest.target,
    done,
    streak,
    lastAt: completions.length ? completions[completions.length - 1].at : null,
  };
}

export function addQuest(doc: Y.Doc, skillId: string, input: QuestInput): Quest | null {
  const skill = getSkill(doc, skillId);
  if (!skill || !input.title.trim()) return null;
  const quest = newQuest({ ...input, title: input.title.trim() });
  saveSkill(doc, { ...skill, quests: [...(skill.quests ?? []), quest] });
  return quest;
}

export function updateQuest(doc: Y.Doc, skillId: string, questId: string, patch: Partial<Omit<Quest, "id">>) {
  const skill = getSkill(doc, skillId);
  if (!skill) return;
  saveSkill(doc, {
    ...skill,
    quests: (skill.quests ?? []).map((q) => (q.id === questId ? normalizeQuest({ ...q, ...patch, id: q.id }) : q)),
  });
}

export function removeQuest(doc: Y.Doc, skillId: string, questId: string) {
  const skill = getSkill(doc, skillId);
  if (!skill) return;
  saveSkill(doc, { ...skill, quests: (skill.quests ?? []).filter((q) => q.id !== questId) });
}

/** Check off a quest for the current period. Returns null if unknown or already complete. */
export function completeQuest(doc: Y.Doc, skillId: string, questId: string, now = Date.now()): XpEntry | null {
  const quest = getSkill(doc, skillId)?.quests?.find((q) => q.id === questId);
  if (!quest) return null;
  if (questStatus(xpEntries(doc, skillId), quest, now).done) return null;
  return addXp(doc, skillId, { amount: quest.xp, note: quest.id, source: "quest", at: now });
}

/** Undo the latest completion of a quest in the current period. */
export function undoQuest(doc: Y.Doc, skillId: string, questId: string, now = Date.now()): boolean {
  const quest = getSkill(doc, skillId)?.quests?.find((q) => q.id === questId);
  if (!quest) return false;
  const current = periodKey(quest.cadence, now);
  const last = [...xpEntries(doc, skillId)]
    .reverse()
    .find((e) => e.source === "quest" && e.note === questId && periodKey(quest.cadence, e.at) === current);
  return last ? removeXpEntry(doc, skillId, last) : false;
}

export interface TodayQuest {
  skill: Skill;
  status: QuestStatus;
}

/** Every quest of every active skill with its status for the current period. */
export function todaysQuests(doc: Y.Doc, now = Date.now()): TodayQuest[] {
  const out: TodayQuest[] = [];
  for (const skill of listSkills(doc)) {
    if (!skill.quests?.length) continue;
    const entries = xpEntries(doc, skill.id);
    for (const q of skill.quests) out.push({ skill, status: questStatus(entries, q, now) });
  }
  // Open quests first, daily before weekly.
  return out.sort(
    (a, b) =>
      Number(a.status.done) - Number(b.status.done) ||
      (a.status.quest.cadence === b.status.quest.cadence ? 0 : a.status.quest.cadence === "daily" ? -1 : 1),
  );
}

// ---- derived stats --------------------------------------------------------------

export interface Requirement {
  parentId: string;
  name: string;
  need: number;
  have: number;
}

export interface SkillStats {
  id: string;
  xp: number;
  loggedXp: number;
  courseXp: number;
  progress: LevelProgress;
  level: number;
  rank: Rank;
  unlocked: boolean;
  /** Unmet prerequisites. */
  missing: Requirement[];
  streak: Streak;
  goalReached: boolean;
  maxed: boolean;
}

/** Stats for every (non-archived) skill in one pass. */
export function computeSkillStats(doc: Y.Doc, now = Date.now(), skills = listSkills(doc)): Map<string, SkillStats> {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const base = new Map<string, Omit<SkillStats, "unlocked" | "missing">>();
  for (const s of skills) {
    const entries = xpEntries(doc, s.id);
    const logged = Math.max(0, entries.reduce((sum, e) => sum + e.amount, 0));
    const course = s.courseIds.reduce((sum, c) => sum + courseXp(doc, c).xp, 0);
    const xp = logged + course;
    const progress = levelProgress(xp);
    base.set(s.id, {
      id: s.id,
      xp,
      loggedXp: logged,
      courseXp: course,
      progress,
      level: progress.level,
      rank: rankForLevel(progress.level),
      streak: skillStreak(doc, s.id, now, entries),
      goalReached: !!s.goalLevel && progress.level >= s.goalLevel,
      maxed: progress.level >= MAX_LEVEL,
    });
  }
  const out = new Map<string, SkillStats>();
  for (const s of skills) {
    const b = base.get(s.id)!;
    const missing: Requirement[] = [];
    for (const p of s.parents) {
      const parent = byId.get(p);
      const pb = base.get(p);
      if (!parent || !pb) continue; // archived or missing prerequisites don't block
      if (pb.level < s.requiredLevel) missing.push({ parentId: p, name: parent.name, need: s.requiredLevel, have: pb.level });
    }
    out.set(s.id, { ...b, unlocked: missing.length === 0, missing });
  }
  return out;
}

/** All prerequisites at or above the required level (roots are always unlocked). */
export function isUnlocked(doc: Y.Doc, skillId: string): boolean {
  const skill = getSkill(doc, skillId);
  if (!skill) return false;
  for (const p of skill.parents) {
    const parent = getSkill(doc, p);
    if (!parent || parent.archived) continue;
    if (skillLevel(doc, p) < skill.requiredLevel) return false;
  }
  return true;
}

export interface AreaStats {
  area: SkillArea;
  xp: number;
  /** 0 when the area has no skills yet. */
  level: number;
  /** Ability score (10 = average) and its modifier, as on a D&D sheet. */
  score: number;
  modifier: number;
  skills: number;
  top: { id: string; name: string; icon: string; level: number } | null;
}

export interface CharacterSheet {
  level: number;
  xp: number;
  progress: LevelProgress;
  rank: Rank;
  /** e.g. "Apprentice Scholar". */
  title: string;
  archetype: string;
  areas: AreaStats[];
  /** Sum of all skill levels. */
  totalLevel: number;
  skills: number;
  /** Rank of the highest-level skill (null with no skills). */
  topRank: Rank | null;
}

export function characterSheet(doc: Y.Doc, now = Date.now(), stats?: Map<string, SkillStats>): CharacterSheet {
  const skills = listSkills(doc);
  const st = stats ?? computeSkillStats(doc, now, skills);
  const areas = listAreas(doc);
  const blank = (area: SkillArea): AreaStats => ({ area, xp: 0, level: 0, score: 10, modifier: 0, skills: 0, top: null });
  const areaStats = new Map<string, AreaStats>(areas.map((a) => [a.id, blank(a)]));
  let xp = 0;
  let totalLevel = 0;
  let topLevel = 0;
  for (const s of skills) {
    const ss = st.get(s.id);
    if (!ss) continue;
    xp += ss.xp;
    totalLevel += ss.level;
    topLevel = Math.max(topLevel, ss.level);
    let a = areaStats.get(s.category);
    if (!a) {
      const area = areaOf(doc, s, areas);
      a = blank(area);
      areaStats.set(area.id, a);
    }
    a.xp += ss.xp;
    a.skills++;
    if (!a.top || ss.level > a.top.level || (ss.level === a.top.level && ss.xp > (st.get(a.top.id)?.xp ?? 0))) {
      a.top = { id: s.id, name: s.name, icon: s.icon, level: ss.level };
    }
  }
  for (const a of areaStats.values()) {
    a.level = a.skills ? levelForXp(a.xp) : 0;
    a.score = abilityScore(a.level);
    a.modifier = abilityModifier(a.score);
  }
  const progress = levelProgress(xp);
  const rank = rankForLevel(progress.level);
  const ranked = [...areaStats.values()].filter((a) => a.xp > 0).sort((a, b) => b.xp - a.xp);
  let archetype = "Adventurer";
  if (ranked.length >= 4 && ranked[3].xp >= ranked[0].xp * 0.6) archetype = "Polymath";
  else if (ranked.length) {
    // Two close abilities make a hybrid class: Strength + Charisma is a Paladin.
    const pair = ranked.length >= 2 && ranked[1].xp >= ranked[0].xp * 0.7 ? [ranked[0].area.id, ranked[1].area.id].sort().join("+") : "";
    archetype = (Object.hasOwn(CLASS_PAIRS, pair) ? CLASS_PAIRS[pair] : "") || ranked[0].area.archetype || ranked[0].area.name;
  }
  return {
    level: progress.level,
    xp,
    progress,
    rank,
    title: `${rank.name} ${archetype}`,
    archetype,
    areas: [...areaStats.values()],
    totalLevel,
    skills: skills.length,
    topRank: skills.length ? rankForLevel(topLevel) : null,
  };
}

// ---- plans (templates, AI, Claude) -----------------------------------------------

export interface SkillPlanItem {
  /** Local key referenced by parentKeys within the plan. */
  key: string;
  name: string;
  icon?: string;
  /** Area id or name. */
  category?: string;
  description?: string;
  /** Keys in this plan, or ids/names of existing skills. */
  parentKeys?: string[];
  requiredLevel?: number;
  goalLevel?: number;
  quests?: QuestInput[];
}

/**
 * Create a batch of skills in one transaction. Parent references resolve to
 * plan keys first, then existing skill ids, then existing skill names.
 * Returns plan key -> new skill id.
 */
export function createSkillsFromPlan(doc: Y.Doc, plan: SkillPlanItem[]): Map<string, string> {
  const ids = new Map<string, string>();
  doc.transact(() => {
    const before = listSkills(doc, { includeArchived: true });
    // Distinct, increasing creation times keep the plan's order (layouts sort by it).
    let t = Math.max(Date.now(), ...before.map((s) => s.createdAt + 1));
    for (const item of plan) {
      if (!item.name?.trim() || ids.has(item.key)) continue;
      const s = createSkill(doc, {
        createdAt: t++,
        name: item.name,
        icon: item.icon,
        category: item.category,
        description: item.description,
        requiredLevel: item.requiredLevel,
        goalLevel: item.goalLevel,
        quests: item.quests,
      });
      ids.set(item.key, s.id);
    }
    const resolve = (ref: string): string | undefined => {
      if (ids.has(ref)) return ids.get(ref);
      if (before.some((s) => s.id === ref)) return ref;
      const lower = ref.trim().toLowerCase();
      return before.find((s) => s.name.trim().toLowerCase() === lower)?.id;
    };
    for (const item of plan) {
      const id = ids.get(item.key);
      if (!id || !item.parentKeys?.length) continue;
      const parents = item.parentKeys.map(resolve).filter((p): p is string => !!p);
      if (parents.length) setParents(doc, id, parents, item.requiredLevel);
    }
  }, SKILLS_ORIGIN);
  return ids;
}

// ---- text summary (for Claude) -----------------------------------------------------

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Compact outline of the whole tree, grouped by ability. */
export function skillTreeSummary(doc: Y.Doc, now = Date.now()): string {
  const skills = listSkills(doc);
  const stats = computeSkillStats(doc, now, skills);
  const sheet = characterSheet(doc, now, stats);
  const lines: string[] = [];
  lines.push(
    `Skill tree: ${skills.length} skill${skills.length === 1 ? "" : "s"} · character level ${sheet.level} (${sheet.title}) · total level ${sheet.totalLevel} · ${fmt(sheet.xp)} XP`,
  );
  if (!skills.length) {
    lines.push("No skills yet.");
    lines.push(`Abilities: ${listAreas(doc).map((a) => `${a.icon} ${a.name} [${a.id}]`).join(", ")}`);
    return lines.join("\n");
  }
  const score = (a: AreaStats) => `${a.area.attribute ?? a.area.name} ${a.score} (${formatModifier(a.modifier)})`;
  lines.push(`Abilities: ${sheet.areas.map(score).join(" · ")}`);
  const byId = new Map(skills.map((s) => [s.id, s]));
  const printed = new Set<string>();
  const describe = (s: Skill): string => {
    const st = stats.get(s.id)!;
    const parts = [`L${st.level} ${st.rank.name}`, `${fmt(st.xp)} XP`];
    if (st.progress.next !== null) parts.push(`${Math.round(st.progress.fraction * 100)}% to L${st.level + 1}`);
    if (st.courseXp) parts.push(`${fmt(st.courseXp)} from courses`);
    if (st.streak.current > 1) parts.push(`${st.streak.current}-day streak`);
    if (s.goalLevel) parts.push(`goal L${s.goalLevel}${st.goalReached ? " ✓" : ""}`);
    if (!st.unlocked) parts.push(`LOCKED: needs ${st.missing.map((m) => `${m.name} L${m.need} (now L${m.have})`).join(", ")}`);
    else if (s.parents.length && s.requiredLevel > 1) parts.push(`unlocked at L${s.requiredLevel} of prerequisites`);
    if (s.pageId) parts.push(`page ${s.pageId}`);
    let line = `${s.icon} ${s.name} [${s.id}]: ${parts.join(", ")}`;
    if (s.quests?.length) {
      const entries = xpEntries(doc, s.id);
      line += ` · quests: ${s.quests
        .map((q) => {
          const qs = questStatus(entries, q, now);
          return `"${q.title}" (${q.target}×/${q.cadence === "daily" ? "day" : "week"}, ${q.xp} XP, ${qs.count}/${q.target} this ${q.cadence === "daily" ? "day" : "week"}${qs.streak > 1 ? `, streak ${qs.streak}` : ""}) [${q.id}]`;
        })
        .join("; ")}`;
    }
    return line;
  };
  const walk = (s: Skill, depth: number, via?: Skill) => {
    const indent = "  ".repeat(depth);
    if (printed.has(s.id)) {
      lines.push(`${indent}- ↳ ${s.icon} ${s.name} (see above)`);
      return;
    }
    printed.add(s.id);
    const others = s.parents.filter((p) => p !== via?.id && byId.has(p)).map((p) => byId.get(p)!.name);
    lines.push(`${indent}- ${describe(s)}${others.length ? ` · also requires ${others.join(", ")}` : ""}`);
    for (const c of childrenOf(doc, s.id, skills)) walk(c, depth + 1, s);
  };
  const areas = listAreas(doc);
  const rootList = roots(doc, skills);
  const groups = new Map<string, Skill[]>();
  for (const r of rootList) {
    const a = areaOf(doc, r, areas).id;
    if (!groups.has(a)) groups.set(a, []);
    groups.get(a)!.push(r);
  }
  const areaOrder = [...areas.map((a) => a.id), ...[...groups.keys()].filter((k) => !areas.some((a) => a.id === k))];
  for (const areaId of areaOrder) {
    const list = groups.get(areaId);
    if (!list?.length) continue;
    const area = areaOf(doc, { category: areaId }, areas);
    const st = sheet.areas.find((a) => a.area.id === area.id);
    lines.push("", `${area.icon} ${area.name}${st ? ` · ${score(st)}, level ${st.level}` : ""} [area ${area.id}]`);
    for (const r of list) walk(r, 0);
  }
  // Skills only reachable through a cycle (should not happen) still get listed.
  for (const s of skills) if (!printed.has(s.id)) walk(s, 0);
  return lines.join("\n");
}

// Data layer for the Learn view: a cached index of the cards written in notes,
// the learner's scheduling state (Y.Doc "learn"/"stats" maps), study settings,
// and the pure functions that turn them into counts and study queues.

import { useSyncExternalStore } from "react";
import * as Y from "yjs";
import { pageCards, siblingKey, type Card } from "../../../shared/flashcards.ts";
import { learnMap, listPages, pagesMap, statsMap, templateSubtree, todayKey } from "../../../shared/model.ts";
import {
  DAY,
  dayNumber,
  endOfDay,
  isNew,
  retrievability,
  startOfDay,
  toCardState,
  type CardState,
} from "../../../shared/srs.ts";

/** Transaction origin for writes made by the Learn view. */
export const LEARN_ORIGIN = "basalt-learn";

type Listener = () => void;

// ---- card index -------------------------------------------------------------------

/**
 * All cards in a workspace, re-parsed lazily per page: a doc update only marks
 * the touched page dirty, so typing in one note never re-parses the others.
 */
export class CardIndex {
  private readonly doc: Y.Doc;
  private readonly byPage = new Map<string, Card[]>();
  private readonly dirty = new Set<string>();
  private everything = true;
  private flat: Card[] | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(doc: Y.Doc) {
    this.doc = doc;
    pagesMap(doc).observeDeep((events) => {
      for (const e of events) {
        if (e.path.length === 0) for (const k of (e as Y.YMapEvent<unknown>).keysChanged) this.dirty.add(k);
        else this.dirty.add(String(e.path[0]));
      }
      this.flat = null;
      this.listeners.forEach((l) => l());
    });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Cards in study order: pages by creation time, then by line. */
  cards(): Card[] {
    if (this.flat) return this.flat;
    if (this.everything) {
      this.byPage.clear();
      pagesMap(this.doc).forEach((_, id) => this.byPage.set(id, pageCards(this.doc, id)));
      this.everything = false;
      this.dirty.clear();
    } else {
      for (const id of this.dirty) {
        if (pagesMap(this.doc).has(id)) this.byPage.set(id, pageCards(this.doc, id));
        else this.byPage.delete(id);
      }
      this.dirty.clear();
    }
    const templates = templateSubtree(this.doc);
    const order = listPages(this.doc)
      .filter((p) => !templates.has(p.id))
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .map((p) => p.id);
    const out: Card[] = [];
    for (const id of order) for (const c of this.byPage.get(id) ?? []) out.push(c);
    this.flat = out;
    return out;
  }
}

const indexes = new WeakMap<Y.Doc, CardIndex>();

export function cardIndex(doc: Y.Doc): CardIndex {
  let idx = indexes.get(doc);
  if (!idx) {
    idx = new CardIndex(doc);
    indexes.set(doc, idx);
  }
  return idx;
}

// ---- learner state --------------------------------------------------------------------

/** Live, parsed view of one learner's card states and daily review counts. */
export class LearnerStore {
  readonly states = new Map<string, CardState>();
  readonly stats = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private statesMap: Y.Map<any> | undefined;
  private statsYMap: Y.Map<number> | undefined;
  private readonly doc: Y.Doc;
  private readonly key: string;

  constructor(doc: Y.Doc, key: string) {
    this.doc = doc;
    this.key = key;
    learnMap(doc).observe((e) => {
      if (e.keysChanged.has(key)) this.bindStates();
    });
    statsMap(doc).observe((e) => {
      if (e.keysChanged.has(key)) this.bindStats();
    });
    this.bindStates();
    this.bindStats();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private onStates = (e: Y.YMapEvent<any>) => {
    for (const k of e.keysChanged) {
      const s = toCardState(this.statesMap?.get(k));
      if (s) this.states.set(k, s);
      else this.states.delete(k);
    }
    this.emit();
  };

  private onStats = (e: Y.YMapEvent<number>) => {
    for (const k of e.keysChanged) {
      const v = this.statsYMap?.get(k);
      if (typeof v === "number") this.stats.set(k, v);
      else this.stats.delete(k);
    }
    this.emit();
  };

  private bindStates() {
    const next = learnMap(this.doc).get(this.key);
    if (next === this.statesMap && next) return;
    this.statesMap?.unobserve(this.onStates);
    this.statesMap = next instanceof Y.Map ? next : undefined;
    this.states.clear();
    this.statesMap?.forEach((v, k) => {
      const s = toCardState(v);
      if (s) this.states.set(k, s);
    });
    this.statesMap?.observe(this.onStates);
    this.emit();
  }

  private bindStats() {
    const next = statsMap(this.doc).get(this.key);
    if (next === this.statsYMap && next) return;
    this.statsYMap?.unobserve(this.onStats);
    this.statsYMap = next instanceof Y.Map ? next : undefined;
    this.stats.clear();
    this.statsYMap?.forEach((v, k) => {
      if (typeof v === "number") this.stats.set(k, v);
    });
    this.statsYMap?.observe(this.onStats);
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Store a review: new card state plus one more review on that day's counter. */
  writeReview(cardId: string, next: CardState, at: number) {
    this.doc.transact(() => {
      const states = ensureChild(learnMap(this.doc), this.key);
      states.set(cardId, next);
      const stats = ensureChild(statsMap(this.doc) as Y.Map<Y.Map<any>>, this.key);
      const day = todayKey(new Date(at));
      stats.set(day, (Number(stats.get(day)) || 0) + 1);
    }, LEARN_ORIGIN);
  }

  /** Revert a review written by writeReview. */
  undoReview(cardId: string, prev: CardState | undefined, at: number) {
    this.doc.transact(() => {
      const states = ensureChild(learnMap(this.doc), this.key);
      if (prev) states.set(cardId, prev);
      else states.delete(cardId);
      const stats = ensureChild(statsMap(this.doc) as Y.Map<Y.Map<any>>, this.key);
      const day = todayKey(new Date(at));
      const n = (Number(stats.get(day)) || 0) - 1;
      if (n > 0) stats.set(day, n);
      else stats.delete(day);
    }, LEARN_ORIGIN);
  }
}

function ensureChild(parent: Y.Map<Y.Map<any>>, key: string): Y.Map<any> {
  const existing = parent.get(key);
  if (existing instanceof Y.Map) return existing;
  const m = new Y.Map<any>();
  parent.set(key, m);
  return m;
}

const stores = new WeakMap<Y.Doc, Map<string, LearnerStore>>();

export function learnerStore(doc: Y.Doc, key: string): LearnerStore {
  let byKey = stores.get(doc);
  if (!byKey) {
    byKey = new Map();
    stores.set(doc, byKey);
  }
  let s = byKey.get(key);
  if (!s) {
    s = new LearnerStore(doc, key);
    byKey.set(key, s);
  }
  return s;
}

// ---- settings (per device) ---------------------------------------------------------------

export type CardOrder = "mixed" | "reviews-first" | "new-first" | "random";

export interface LearnSettings {
  newPerDay: number;
  maxReviews: number;
  order: CardOrder;
}

export const CARD_ORDERS: { id: CardOrder; label: string }[] = [
  { id: "mixed", label: "Mix new cards into reviews" },
  { id: "reviews-first", label: "Reviews first, then new cards" },
  { id: "new-first", label: "New cards first, then reviews" },
  { id: "random", label: "Random" },
];

const SETTINGS_KEY = "basalt:learn:settings";
const DEFAULT_SETTINGS: LearnSettings = { newPerDay: 20, maxReviews: 200, order: "mixed" };

function loadSettings(): LearnSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    const int = (v: unknown, d: number, max: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : d;
    return {
      newPerDay: int(raw.newPerDay, DEFAULT_SETTINGS.newPerDay, 9999),
      maxReviews: int(raw.maxReviews, DEFAULT_SETTINGS.maxReviews, 99999),
      order: CARD_ORDERS.some((o) => o.id === raw.order) ? raw.order : DEFAULT_SETTINGS.order,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = loadSettings();
const settingsListeners = new Set<Listener>();

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== SETTINGS_KEY) return;
    settings = loadSettings();
    settingsListeners.forEach((l) => l());
  });
}

export function getLearnSettings(): LearnSettings {
  return settings;
}

export function updateLearnSettings(patch: Partial<LearnSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode); keep in memory
  }
  settingsListeners.forEach((l) => l());
}

export function useLearnSettings(): LearnSettings {
  return useSyncExternalStore(
    (cb) => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    () => settings,
  );
}

// ---- derived numbers -------------------------------------------------------------------------

export type CardBucket = "new" | "learning" | "review" | "later";

/** Where a card stands today. "learning" includes steps due later today. */
export function bucketOf(state: CardState | undefined, now: number): CardBucket {
  if (isNew(state)) return "new";
  const s = state!;
  if (s.state === "learning" || s.state === "relearning") return s.due < endOfDay(now) ? "learning" : "later";
  return s.due < endOfDay(now) ? "review" : "later";
}

export interface DayUsage {
  /** Cards studied for the first time today. */
  newToday: number;
  /** Previously learned cards reviewed today. */
  reviewedToday: number;
}

export function dayUsage(states: Map<string, CardState>, now: number): DayUsage {
  const today = dayNumber(now);
  const dayStart = startOfDay(now);
  let newToday = 0;
  let reviewedToday = 0;
  for (const s of states.values()) {
    if (s.firstReview != null && dayNumber(s.firstReview) === today) newToday++;
    else if (s.lastReview != null && s.lastReview >= dayStart) reviewedToday++;
  }
  return { newToday, reviewedToday };
}

export interface Counts {
  total: number;
  new: number;
  learning: number;
  /** Learning cards whose step is due right now. */
  learningNow: number;
  review: number;
  learned: number;
}

export function countCards(cards: Card[], states: Map<string, CardState>, now: number): Counts {
  const c: Counts = { total: cards.length, new: 0, learning: 0, learningNow: 0, review: 0, learned: 0 };
  for (const card of cards) {
    const s = states.get(card.id);
    const b = bucketOf(s, now);
    if (b === "new") c.new++;
    else {
      c.learned++;
      if (b === "learning") {
        c.learning++;
        if (s!.due <= now) c.learningNow++;
      } else if (b === "review") c.review++;
    }
  }
  return c;
}

export interface Limits {
  newLeft: number;
  reviewLeft: number;
}

export function limitsFor(s: LearnSettings, usage: DayUsage, extraNew = 0): Limits {
  return {
    newLeft: Math.max(0, s.newPerDay + extraNew - usage.newToday),
    reviewLeft: Math.max(0, s.maxReviews - usage.reviewedToday),
  };
}

/** What a session started now would contain (after daily limits). */
export function studyCounts(counts: Counts, limits: Limits) {
  const review = Math.min(counts.review, limits.reviewLeft);
  const fresh = Math.min(counts.new, limits.newLeft);
  return { review, new: fresh, learning: counts.learning, learningNow: counts.learningNow, total: review + fresh + counts.learningNow };
}

/** Sidebar badge: cards due now (after limits) plus new cards available today. */
export function dueBadgeCount(cards: Card[], states: Map<string, CardState>, s: LearnSettings, now: number): number {
  const counts = countCards(cards, states, now);
  const limits = limitsFor(s, dayUsage(states, now));
  return studyCounts(counts, limits).total;
}

export function averageRetention(cards: Card[], states: Map<string, CardState>, now: number): number | null {
  let sum = 0;
  let n = 0;
  for (const card of cards) {
    const s = states.get(card.id);
    if (!s || s.state === "new") continue;
    sum += retrievability(s, now);
    n++;
  }
  return n ? sum / n : null;
}

/** Consecutive days with reviews, ending today (or yesterday if today has none yet). */
export function streaks(stats: Map<string, number>, now: number): { current: number; best: number } {
  const days = [...stats.entries()]
    .filter(([, v]) => v > 0)
    .map(([k]) => dayFromKey(k))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = NaN;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const set = new Set(days);
  const today = dayNumber(now);
  let cur = 0;
  let d = set.has(today) ? today : today - 1;
  while (set.has(d)) {
    cur++;
    d--;
  }
  return { current: cur, best };
}

export function dayFromKey(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY);
}

/** Reviews due on each of the next `n` days (today includes overdue cards and learning steps). */
export function forecast(cards: Card[], states: Map<string, CardState>, now: number, n = 7): number[] {
  const out = new Array(n).fill(0);
  const today = dayNumber(now);
  for (const card of cards) {
    const s = states.get(card.id);
    if (!s || s.state === "new") continue;
    const i = Math.max(0, dayNumber(s.due) - today);
    if (i < n) out[i]++;
  }
  return out;
}

export interface DeckSummary {
  pageId: string;
  total: number;
  new: number;
  learning: number;
  review: number;
}

export function deckSummaries(cards: Card[], states: Map<string, CardState>, now: number): DeckSummary[] {
  const byPage = new Map<string, DeckSummary>();
  for (const card of cards) {
    let d = byPage.get(card.pageId);
    if (!d) {
      d = { pageId: card.pageId, total: 0, new: 0, learning: 0, review: 0 };
      byPage.set(card.pageId, d);
    }
    d.total++;
    const b = bucketOf(states.get(card.id), now);
    if (b === "new") d.new++;
    else if (b === "learning") d.learning++;
    else if (b === "review") d.review++;
  }
  return [...byPage.values()];
}

// ---- queues ----------------------------------------------------------------------------------

export type QueueKind = "new" | "learning" | "review";

export interface QueueItem {
  card: Card;
  kind: QueueKind;
}

export interface LearningItem {
  card: Card;
  due: number;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Spread siblings (both directions of a card, clozes of one line) so they don't follow each other. */
function spreadSiblings(cards: Card[]): Card[] {
  const rank = new Map<string, number>();
  return cards
    .map((c, i) => {
      const k = siblingKey(c);
      const r = rank.get(k) ?? 0;
      rank.set(k, r + 1);
      return { c, r, i };
    })
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.c);
}

function interleave(reviews: QueueItem[], fresh: QueueItem[]): QueueItem[] {
  if (!reviews.length || !fresh.length) return [...reviews, ...fresh];
  const out: QueueItem[] = [];
  const every = (reviews.length + fresh.length) / fresh.length;
  let r = 0;
  let f = 0;
  for (let i = 0; r < reviews.length || f < fresh.length; i++) {
    const wantNew = f < fresh.length && (r >= reviews.length || i + 1 >= (f + 1) * every);
    if (wantNew) out.push(fresh[f++]);
    else out.push(reviews[r++]);
  }
  return out;
}

export interface Queue {
  main: QueueItem[];
  learning: LearningItem[];
}

export function buildQueue(
  cards: Card[],
  states: Map<string, CardState>,
  s: LearnSettings,
  now: number,
  opts: { deckId?: string; extraNew?: number } = {},
): Queue {
  const scoped = opts.deckId ? cards.filter((c) => c.pageId === opts.deckId) : cards;
  const limits = limitsFor(s, dayUsage(states, now), opts.extraNew);
  const learning: LearningItem[] = [];
  const reviews: { card: Card; due: number }[] = [];
  const fresh: Card[] = [];
  for (const card of scoped) {
    const st = states.get(card.id);
    const b = bucketOf(st, now);
    if (b === "new") fresh.push(card);
    else if (b === "learning") learning.push({ card, due: st!.due });
    else if (b === "review") reviews.push({ card, due: st!.due });
  }
  learning.sort((a, b) => a.due - b.due);
  const random = s.order === "random";
  const reviewItems: QueueItem[] = (random ? shuffle(reviews) : reviews.sort((a, b) => a.due - b.due))
    .slice(0, limits.reviewLeft)
    .map((r) => ({ card: r.card, kind: "review" }));
  const newItems: QueueItem[] = spreadSiblings(fresh)
    .slice(0, limits.newLeft)
    .map((card) => ({ card, kind: "new" }));
  let main: QueueItem[];
  switch (s.order) {
    case "reviews-first":
      main = [...reviewItems, ...newItems];
      break;
    case "new-first":
      main = [...newItems, ...reviewItems];
      break;
    case "random":
      main = shuffle([...reviewItems, ...newItems]);
      break;
    default:
      main = interleave(reviewItems, newItems);
  }
  return { main, learning };
}

/** Cram: every card of the scope, shuffled; answers don't touch the schedule. */
export function buildCramQueue(cards: Card[], deckId?: string): Queue {
  const scoped = deckId ? cards.filter((c) => c.pageId === deckId) : cards;
  return { main: shuffle(scoped).map((card) => ({ card, kind: "review" })), learning: [] };
}

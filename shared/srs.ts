// FSRS (Free Spaced Repetition Scheduler), version 5 formulas with the
// published default weights. Mirrors the reference scheduler (py-fsrs / ts-fsrs):
// short learning steps for new and lapsed cards, then day-based review
// intervals derived from a forgetting curve with a desired retention of 90%.
//
// Pure TypeScript: no DOM, safe for Node (tests, MCP server) and the browser.
// Elapsed days are counted in local calendar days, like Anki's FSRS, so that
// "due today" and the stability update agree.

export type Rating = 1 | 2 | 3 | 4;
export const RATINGS: readonly Rating[] = [1, 2, 3, 4];
export const RATING_LABELS: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

export type CardPhase = "new" | "learning" | "review" | "relearning";

export interface CardState {
  /** When the card is next due (ms epoch). */
  due: number;
  /** Days for retrievability to fall from 100% to 90%. 0 for new cards. */
  stability: number;
  /** 1 (easy) .. 10 (hard). 0 for new cards. */
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardPhase;
  /** Index into the (re)learning steps while learning/relearning. */
  step: number;
  lastReview: number | null;
  /** Interval that was scheduled at the last review, in days (fractional for steps). */
  scheduledDays: number;
  /** When the card was first studied; used for the new-cards-per-day limit. */
  firstReview?: number;
}

export interface SrsParams {
  w: readonly number[];
  desiredRetention: number;
  /** Learning steps for new cards, in ms. */
  learningSteps: readonly number[];
  /** Relearning steps for lapsed cards, in ms. */
  relearningSteps: readonly number[];
  maximumInterval: number;
  fuzz: boolean;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** FSRS-5 default parameters (w0..w18). */
export const FSRS5_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11,
  0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

export const DEFAULT_PARAMS: SrsParams = {
  w: FSRS5_WEIGHTS,
  desiredRetention: 0.9,
  learningSteps: [1 * MINUTE, 10 * MINUTE],
  relearningSteps: [10 * MINUTE],
  maximumInterval: 36500,
  fuzz: true,
};

const DECAY = -0.5;
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81, so that R(S, S) = 90%
const S_MIN = 0.001;

export interface ScheduleOptions {
  /** Seed for interval fuzz; pass something stable per card (e.g. its id) so previews match the result. */
  seed?: string;
  params?: Partial<SrsParams>;
}

// ---- small math helpers ---------------------------------------------------------

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Local calendar day number (days since epoch in local time). */
export function dayNumber(ts: number): number {
  const d = new Date(ts);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
}

/** Start of the next local day after `ts`. */
export function endOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Start of the local day containing `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function forgettingCurve(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / Math.max(stability, S_MIN), DECAY);
}

function initStability(p: SrsParams, g: Rating): number {
  return Math.max(p.w[g - 1], S_MIN);
}

function rawInitDifficulty(p: SrsParams, g: Rating): number {
  return p.w[4] - Math.exp(p.w[5] * (g - 1)) + 1;
}

function initDifficulty(p: SrsParams, g: Rating): number {
  return clamp(rawInitDifficulty(p, g), 1, 10);
}

function nextDifficulty(p: SrsParams, d: number, g: Rating): number {
  const delta = -p.w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // linear damping near the ceiling
  const reverted = p.w[7] * rawInitDifficulty(p, 4) + (1 - p.w[7]) * damped; // mean reversion
  return clamp(reverted, 1, 10);
}

function recallStability(p: SrsParams, d: number, s: number, r: number, g: Rating): number {
  const hardPenalty = g === 2 ? p.w[15] : 1;
  const easyBonus = g === 4 ? p.w[16] : 1;
  return (
    s *
    (1 +
      Math.exp(p.w[8]) *
        (11 - d) *
        Math.pow(s, -p.w[9]) *
        (Math.exp((1 - r) * p.w[10]) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function forgetStability(p: SrsParams, d: number, s: number, r: number): number {
  const longTerm = p.w[11] * Math.pow(d, -p.w[12]) * (Math.pow(s + 1, p.w[13]) - 1) * Math.exp((1 - r) * p.w[14]);
  const shortTerm = s / Math.exp(p.w[17] * p.w[18]);
  return Math.min(longTerm, shortTerm);
}

function shortTermStability(p: SrsParams, s: number, g: Rating): number {
  return s * Math.exp(p.w[17] * (g - 3 + p.w[18]));
}

function nextIntervalDays(p: SrsParams, s: number): number {
  const ivl = (s / FACTOR) * (Math.pow(p.desiredRetention, 1 / DECAY) - 1);
  return clamp(Math.round(ivl), 1, p.maximumInterval);
}

// Deterministic PRNG so the fuzzed interval shown on a button is the one you get.
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function random01(seed: string): number {
  let t = (hash32(seed) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
];

function fuzzInterval(p: SrsParams, days: number, seed: string): number {
  if (!p.fuzz || days < 2.5) return days;
  let delta = 1;
  for (const r of FUZZ_RANGES) delta += r.factor * Math.max(Math.min(days, r.end) - r.start, 0);
  let lo = Math.round(days - delta);
  let hi = Math.round(days + delta);
  lo = Math.max(2, lo);
  hi = Math.min(hi, p.maximumInterval);
  lo = Math.min(lo, hi);
  return Math.min(Math.round(random01(seed) * (hi - lo + 1) + lo - 0.5), p.maximumInterval);
}

// ---- public API ---------------------------------------------------------------------

export function newCardState(now: number): CardState {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    step: 0,
    lastReview: null,
    scheduledDays: 0,
  };
}

function resolveParams(opts?: ScheduleOptions): SrsParams {
  return opts?.params ? { ...DEFAULT_PARAMS, ...opts.params } : DEFAULT_PARAMS;
}

interface Outcome {
  state: CardState;
  /** Interval in days if the card (re)entered review; used for fuzz + ordering. */
  reviewDays?: number;
  /** Interval in ms for (re)learning steps. */
  stepMs?: number;
}

function outcome(p: SrsParams, prev: CardState | undefined, g: Rating, now: number): Outcome {
  const cur: CardState = prev && prev.state !== "new" ? prev : newCardState(now);
  const elapsed = cur.lastReview == null ? 0 : Math.max(0, dayNumber(now) - dayNumber(cur.lastReview));
  const r = cur.lastReview == null ? 1 : forgettingCurve(elapsed, cur.stability);
  const next: CardState = {
    ...cur,
    reps: cur.reps + 1,
    lastReview: now,
    firstReview: cur.firstReview ?? prev?.firstReview ?? now,
  };

  // Memory state update.
  if (cur.state === "new") {
    next.stability = initStability(p, g);
    next.difficulty = initDifficulty(p, g);
  } else {
    if (elapsed < 1) next.stability = shortTermStability(p, cur.stability, g);
    else if (g === 1) next.stability = forgetStability(p, cur.difficulty, cur.stability, r);
    else next.stability = recallStability(p, cur.difficulty, cur.stability, r, g);
    next.stability = Math.max(next.stability, S_MIN);
    next.difficulty = nextDifficulty(p, cur.difficulty, g);
  }

  const toReview = (): Outcome => {
    next.state = "review";
    next.step = 0;
    return { state: next, reviewDays: nextIntervalDays(p, next.stability) };
  };
  const toStep = (step: number, ms: number, phase: CardPhase): Outcome => {
    next.state = phase;
    next.step = step;
    return { state: next, stepMs: ms };
  };

  if (cur.state === "review") {
    if (g === 1) {
      next.lapses = cur.lapses + 1;
      if (p.relearningSteps.length === 0) return toReview();
      return toStep(0, p.relearningSteps[0], "relearning");
    }
    return toReview();
  }

  // new, learning or relearning: walk the steps.
  const phase: CardPhase = cur.state === "relearning" ? "relearning" : "learning";
  const steps = phase === "relearning" ? p.relearningSteps : p.learningSteps;
  const step = cur.state === "new" ? 0 : cur.step;
  if (steps.length === 0 || (step >= steps.length && g !== 1)) return toReview();
  switch (g) {
    case 1:
      return toStep(0, steps[0], phase);
    case 2: {
      let ms = steps[step];
      if (step === 0 && steps.length === 1) ms = steps[0] * 1.5;
      else if (step === 0) ms = (steps[0] + steps[1]) / 2;
      return toStep(step, ms, phase);
    }
    case 3:
      if (step + 1 >= steps.length) return toReview();
      return toStep(step + 1, steps[step + 1], phase);
    default:
      return toReview();
  }
}

/** Compute the next state for every rating at once (keeps Hard < Good < Easy for review intervals). */
export function scheduleAll(state: CardState | undefined, now: number, opts?: ScheduleOptions): Record<Rating, CardState> {
  const p = resolveParams(opts);
  const seedBase =
    opts?.seed ?? `${state?.lastReview ?? 0}:${state?.reps ?? 0}:${state?.stability ?? 0}:${dayNumber(now)}`;
  const outs = {} as Record<Rating, Outcome>;
  for (const g of RATINGS) {
    const o = outcome(p, state, g, now);
    if (o.reviewDays !== undefined) o.reviewDays = fuzzInterval(p, o.reviewDays, `${seedBase}:${o.state.reps}:${g}`);
    outs[g] = o;
  }
  // Button intervals must be monotonic even after fuzz.
  const d = (g: Rating) => outs[g].reviewDays;
  if (d(2) !== undefined && d(3) !== undefined) {
    outs[2].reviewDays = Math.min(d(2)!, d(3)!);
    outs[3].reviewDays = Math.min(Math.max(d(3)!, d(2)! + 1), p.maximumInterval);
  }
  const beforeEasy = d(3) ?? d(2);
  if (d(4) !== undefined && beforeEasy !== undefined) {
    outs[4].reviewDays = Math.min(Math.max(d(4)!, beforeEasy + 1), p.maximumInterval);
  }
  const result = {} as Record<Rating, CardState>;
  for (const g of RATINGS) {
    const o = outs[g];
    const s = o.state;
    if (o.reviewDays !== undefined) {
      s.scheduledDays = o.reviewDays;
      s.due = now + o.reviewDays * DAY;
    } else {
      const ms = o.stepMs ?? 0;
      s.scheduledDays = ms / DAY;
      s.due = now + ms;
    }
    result[g] = s;
  }
  return result;
}

/** Review a card (undefined = never studied) with a rating at time `now`. */
export function schedule(state: CardState | undefined, rating: Rating, now: number, opts?: ScheduleOptions): CardState {
  return scheduleAll(state, now, opts)[rating];
}

/** Per rating: milliseconds from `now` until the card would be due again (for button labels). */
export function previewIntervals(state: CardState | undefined, now: number, opts?: ScheduleOptions): Record<Rating, number> {
  const all = scheduleAll(state, now, opts);
  return { 1: all[1].due - now, 2: all[2].due - now, 3: all[3].due - now, 4: all[4].due - now };
}

/** Probability of recalling the card now (0 for cards never studied). */
export function retrievability(state: CardState | undefined, now: number): number {
  if (!state || state.state === "new" || state.lastReview == null || state.stability <= 0) return 0;
  return forgettingCurve((now - state.lastReview) / DAY, state.stability);
}

/** Compact human interval: "<1m", "10m", "3h", "4d", "1.5mo", "2.1y". */
export function formatInterval(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTE) return "<1m";
  if (ms < HOUR - 30_000) return `${Math.round(ms / MINUTE)}m`;
  if (ms < DAY - 30 * MINUTE) {
    const h = ms / HOUR;
    return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)}h`;
  }
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) {
    const mo = days / 30.4375;
    return `${mo < 10 ? Math.round(mo * 10) / 10 : Math.round(mo)}mo`;
  }
  const y = days / 365.25;
  return `${y < 10 ? Math.round(y * 10) / 10 : Math.round(y)}y`;
}

/** Is a card due at `now`? Review cards are due for the whole calendar day; steps are due by the minute. */
export function isDue(state: CardState | undefined, now: number): boolean {
  if (!state || state.state === "new") return false;
  if (state.state === "review") return state.due < endOfDay(now);
  return state.due <= now;
}

export function isNew(state: CardState | undefined): boolean {
  return !state || state.state === "new";
}

/** Defensive parse of a stored CardState (data may come from other clients/versions). */
export function toCardState(raw: unknown): CardState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, dflt = 0) => (typeof v === "number" && Number.isFinite(v) ? v : dflt);
  const phase = o.state;
  if (phase !== "new" && phase !== "learning" && phase !== "review" && phase !== "relearning") return undefined;
  return {
    due: num(o.due),
    stability: num(o.stability),
    difficulty: num(o.difficulty),
    reps: num(o.reps),
    lapses: num(o.lapses),
    state: phase,
    step: num(o.step),
    lastReview: typeof o.lastReview === "number" ? o.lastReview : null,
    scheduledDays: num(o.scheduledDays),
    ...(typeof o.firstReview === "number" ? { firstReview: o.firstReview } : {}),
  };
}

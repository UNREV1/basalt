import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY,
  DEFAULT_PARAMS,
  MINUTE,
  formatInterval,
  isDue,
  previewIntervals,
  retrievability,
  schedule,
  scheduleAll,
  toCardState,
  type CardState,
  type Rating,
} from "../shared/srs.ts";

// Noon local time keeps calendar-day arithmetic away from midnight edges.
const T0 = new Date(2026, 0, 5, 12, 0, 0).getTime();
const noFuzz = { params: { fuzz: false } };

function days(state: CardState, now: number) {
  return (state.due - now) / DAY;
}

test("new card: learning steps 1m / 10m and graduation", () => {
  const again = schedule(undefined, 1, T0, noFuzz);
  assert.equal(again.state, "learning");
  assert.equal(again.due - T0, 1 * MINUTE);
  assert.equal(again.reps, 1);
  assert.equal(again.firstReview, T0);

  const hard = schedule(undefined, 2, T0, noFuzz);
  assert.equal(hard.state, "learning");
  assert.equal(hard.due - T0, 5.5 * MINUTE, "hard on the first step is the average of the first two steps");

  const good = schedule(undefined, 3, T0, noFuzz);
  assert.equal(good.state, "learning");
  assert.equal(good.step, 1);
  assert.equal(good.due - T0, 10 * MINUTE);

  const easy = schedule(undefined, 4, T0, noFuzz);
  assert.equal(easy.state, "review");
  assert.equal(days(easy, T0), 16, "S0(Easy) = 15.69 days at 90% retention");

  // Good again on the last step graduates to review.
  const t1 = T0 + 10 * MINUTE;
  const grad = schedule(good, 3, t1, noFuzz);
  assert.equal(grad.state, "review");
  assert.ok(days(grad, t1) >= 3 && days(grad, t1) <= 5, `graduating interval ${days(grad, t1)}`);
  assert.equal(grad.reps, 2);
  assert.equal(grad.firstReview, T0, "first review time is kept");
});

test("initial memory state uses the FSRS-5 defaults", () => {
  const w = DEFAULT_PARAMS.w;
  for (const g of [1, 2, 3, 4] as Rating[]) {
    const s = schedule(undefined, g, T0, noFuzz);
    assert.equal(s.stability, w[g - 1]);
    const d0 = Math.min(10, Math.max(1, w[4] - Math.exp(w[5] * (g - 1)) + 1));
    assert.ok(Math.abs(s.difficulty - d0) < 1e-9);
  }
  // Harder first ratings mean higher difficulty.
  assert.ok(schedule(undefined, 1, T0).difficulty > schedule(undefined, 4, T0).difficulty);
});

test("review intervals grow and are ordered Hard < Good < Easy", () => {
  let state = schedule(undefined, 4, T0);
  let now = T0;
  let prevIvl = 0;
  for (let i = 0; i < 6; i++) {
    now = state.due;
    const all = scheduleAll(state, now, { seed: "card-x" });
    const h = days(all[2], now);
    const g = days(all[3], now);
    const e = days(all[4], now);
    assert.ok(h < g && g < e, `ordering at rep ${i}: ${h} ${g} ${e}`);
    assert.ok(g > prevIvl, "good intervals keep growing");
    prevIvl = g;
    state = all[3];
    assert.equal(state.state, "review");
  }
  assert.ok(prevIvl > 60, `after 6 good reviews the interval is long (${prevIvl})`);
});

test("lapse: review -> relearning (10m) -> review with lower stability", () => {
  const learned = schedule(undefined, 4, T0, noFuzz);
  const now = learned.due;
  const lapse = schedule(learned, 1, now, noFuzz);
  assert.equal(lapse.state, "relearning");
  assert.equal(lapse.lapses, 1);
  assert.equal(lapse.due - now, 10 * MINUTE);
  assert.ok(lapse.stability < learned.stability);
  assert.ok(lapse.difficulty > learned.difficulty);

  const hard = schedule(lapse, 2, now + 10 * MINUTE, noFuzz);
  assert.equal(hard.state, "relearning");
  assert.equal(hard.due - (now + 10 * MINUTE), 15 * MINUTE, "single relearning step: hard = 1.5x");

  const back = schedule(lapse, 3, now + 10 * MINUTE, noFuzz);
  assert.equal(back.state, "review");
  assert.ok(days(back, now + 10 * MINUTE) >= 1);
});

test("max interval is respected", () => {
  const huge: CardState = {
    due: T0,
    stability: 1e6,
    difficulty: 1,
    reps: 30,
    lapses: 0,
    state: "review",
    step: 0,
    lastReview: T0 - 36500 * DAY,
    scheduledDays: 36500,
  };
  const all = scheduleAll(huge, T0);
  for (const g of [2, 3, 4] as Rating[]) assert.ok(days(all[g], T0) <= 36500);
});

test("fuzz is deterministic for a seed and stays within range", () => {
  const learned = schedule(undefined, 4, T0, noFuzz);
  const now = learned.due;
  const a = previewIntervals(learned, now, { seed: "abc" });
  const b = previewIntervals(learned, now, { seed: "abc" });
  assert.deepEqual(a, b);
  const plain = days(schedule(learned, 3, now, noFuzz), now);
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const d = days(schedule(learned, 3, now, { seed: `s${i}` }), now);
    seen.add(d);
    assert.ok(Math.abs(d - plain) <= Math.max(2, plain * 0.1 + 2), `fuzzed ${d} vs ${plain}`);
    assert.ok(Number.isInteger(d));
  }
  assert.ok(seen.size > 1, "fuzz actually spreads intervals");
});

test("previewIntervals matches schedule for every rating", () => {
  const s = schedule(undefined, 3, T0);
  const now = T0 + 10 * MINUTE;
  const p = previewIntervals(s, now, { seed: "k" });
  for (const g of [1, 2, 3, 4] as Rating[]) assert.equal(p[g], schedule(s, g, now, { seed: "k" }).due - now);
});

test("retrievability decays from 1 and is 0.9 after S days", () => {
  const s = schedule(undefined, 4, T0, noFuzz);
  assert.equal(retrievability(undefined, T0), 0);
  assert.ok(Math.abs(retrievability(s, T0) - 1) < 1e-9);
  const r = retrievability(s, T0 + s.stability * DAY);
  assert.ok(Math.abs(r - 0.9) < 1e-9, `R(S) = ${r}`);
  assert.ok(retrievability(s, T0 + 100 * DAY) < 0.9);
});

test("isDue: review cards are due for the whole day, steps by the minute", () => {
  const learning = schedule(undefined, 3, T0, noFuzz);
  assert.equal(isDue(learning, T0 + 5 * MINUTE), false);
  assert.equal(isDue(learning, T0 + 10 * MINUTE), true);
  const review = schedule(undefined, 4, T0, noFuzz);
  const dueDayMorning = new Date(review.due);
  dueDayMorning.setHours(6, 0, 0, 0);
  assert.equal(isDue(review, dueDayMorning.getTime()), true);
  assert.equal(isDue(review, review.due - 2 * DAY), false);
  assert.equal(isDue(undefined, T0), false);
});

test("formatInterval", () => {
  assert.equal(formatInterval(30_000), "<1m");
  assert.equal(formatInterval(MINUTE), "1m");
  assert.equal(formatInterval(10 * MINUTE), "10m");
  assert.equal(formatInterval(5.5 * MINUTE), "6m");
  assert.equal(formatInterval(3 * 3600_000), "3h");
  assert.equal(formatInterval(DAY), "1d");
  assert.equal(formatInterval(DAY - 60_000), "1d", "no \"24h\"");
  assert.equal(formatInterval(59.9 * MINUTE), "1h", "no \"60m\"");
  assert.equal(formatInterval(16 * DAY), "16d");
  assert.equal(formatInterval(45 * DAY), "1.5mo");
  assert.equal(formatInterval(800 * DAY), "2.2y");
});

test("toCardState validates stored data", () => {
  const s = schedule(undefined, 3, T0);
  assert.deepEqual(toCardState(JSON.parse(JSON.stringify(s))), s);
  assert.equal(toCardState(null), undefined);
  assert.equal(toCardState({ state: "weird" }), undefined);
  assert.equal(toCardState({ state: "review", due: "x" })?.due, 0);
});

test("a long simulated history keeps state within bounds", () => {
  let state: CardState | undefined;
  let now = T0;
  const ratings: Rating[] = [3, 3, 1, 2, 3, 4, 1, 1, 3, 3, 2, 4, 3];
  for (const [i, g] of ratings.entries()) {
    state = schedule(state, g, now, { seed: `sim${i}` });
    assert.ok(state.difficulty >= 1 && state.difficulty <= 10);
    assert.ok(state.stability > 0 && Number.isFinite(state.stability));
    assert.ok(state.due > now);
    now = state.due;
  }
  assert.equal(state!.reps, ratings.length);
  assert.equal(state!.lapses, 2, "two Again presses while in review");
});

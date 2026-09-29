// Interactive lessons, "learn by doing" (like Brilliant): a lesson is a short
// run of steps, a little explanation and then something to do, with instant
// feedback. Plain JSON, shared by the lesson player, the built-in course
// library, AI generation and the MCP server (Claude Code writes lessons too).
//
// A course page's course map holds them under "steps": lessonId -> LessonContent.

import * as Y from "yjs";
import { courseMap } from "./course.ts";
import { validExpr } from "./expr.ts";

/**
 * The learning loop every lesson walks through (shown as chips in the player):
 * subjects go preview → understand → explain → recall → apply (then spaced
 * review later); skills go preview → understand → practice → reflect (then
 * practice again, slightly beyond the current level).
 */
export const PHASES = ["preview", "understand", "explain", "recall", "apply", "practice", "reflect"] as const;
export type Phase = (typeof PHASES)[number];
export const SUBJECT_LOOP: Phase[] = ["preview", "understand", "explain", "recall", "apply"];
export const SKILL_LOOP: Phase[] = ["preview", "understand", "practice", "reflect"];
export const PHASE_LABEL: Record<Phase, string> = {
  preview: "Preview",
  understand: "Understand",
  explain: "Explain",
  recall: "Recall",
  apply: "Apply",
  practice: "Practice",
  reflect: "Reflect",
};

/**
 * Any step can show a picture above its text: an inline SVG diagram
 * ("<svg …>…</svg>", sanitized before display) or an https image URL,
 * and says which phase of the learning loop it belongs to.
 */
export interface Visual {
  figure?: string;
  caption?: string;
  phase?: Phase;
}

/** A few short paragraphs of markdown (math in $…$). */
export interface ExplainStep extends Visual {
  type: "explain";
  title?: string;
  body: string;
}

/** A slider the learner plays with; optionally a live graph y = plot(x, v) and a computed readout. */
export interface Widget {
  min: number;
  max: number;
  /** Slider increment (default: a hundredth of the range). */
  step?: number;
  /** Where the slider starts (default: min). */
  start?: number;
  /** What the slider controls, e.g. "Angle" (shown next to its value). */
  label?: string;
  unit?: string;
  /** y as an expression of x and the slider value v, e.g. "v*x^2" or "sin(x + v)". */
  plot?: string;
  /** x range of the graph (default 0..10). */
  xMin?: number;
  xMax?: number;
  /** A number computed from v, e.g. "v^2 * 9.81 / 2", shown as "<readoutLabel> = …". */
  readout?: string;
  readoutLabel?: string;
}

/** Explore freely with a slider (no right answer): "play with it" before the explanation. */
export interface ExploreStep extends Visual, Widget {
  type: "explore";
  title?: string;
  body: string;
}

/** Move the slider to the right value (within `tolerance`). */
export interface SliderStep extends Visual, Widget {
  type: "slider";
  prompt: string;
  answer: number;
  tolerance?: number;
  explain: string;
  hint?: string;
}

/** Pick one option, or all that apply when more than one is correct. */
export interface ChoiceStep extends Visual {
  type: "choice";
  prompt: string;
  options: string[];
  /** Indexes of the correct options. */
  answer: number[];
  /** Why the answer is right (shown after answering). */
  explain: string;
  hint?: string;
}

/** Type an answer. Numbers compare numerically (within `tolerance`), text ignores case and spacing. */
export interface InputStep extends Visual {
  type: "input";
  prompt: string;
  answers: string[];
  tolerance?: number;
  placeholder?: string;
  explain: string;
  hint?: string;
}

/** Put items in order. `items` is the correct order; the player shuffles it. */
export interface OrderStep extends Visual {
  type: "order";
  prompt: string;
  items: string[];
  explain: string;
  hint?: string;
}

/** Match each left item to its right item. The player shuffles the right side. */
export interface MatchStep extends Visual {
  type: "match";
  prompt: string;
  pairs: { left: string; right: string }[];
  explain: string;
  hint?: string;
}

/**
 * Explain it in your own words (the Feynman technique): the learner writes an
 * explanation for a beginner, then compares it with a model answer and ticks
 * the key points they covered. Gaps show what to go back to.
 */
export interface TeachStep extends Visual {
  type: "teach";
  prompt: string;
  keyPoints: string[];
  model: string;
}

/**
 * Deliberate practice for a physical or hands-on skill: a concrete task, a
 * timer, what to focus on, then honest feedback and what to change next time.
 */
export interface PracticeStep extends Visual {
  type: "practice";
  prompt: string;
  minutes: number;
  /** What to pay attention to while practising (also the self-check afterwards). */
  focus: string[];
  /** How to know it went well, e.g. "10 catches in a row". */
  goal?: string;
}

/** Think first, then tap to reveal. */
export interface RevealStep extends Visual {
  type: "reveal";
  prompt: string;
  body: string;
}

export type LessonStep =
  | ExplainStep
  | ExploreStep
  | ChoiceStep
  | InputStep
  | SliderStep
  | OrderStep
  | MatchStep
  | RevealStep
  | TeachStep
  | PracticeStep;
export type InteractiveStep = ChoiceStep | InputStep | SliderStep | OrderStep | MatchStep;

export const STEP_TYPES = ["explain", "explore", "choice", "input", "slider", "order", "match", "reveal", "teach", "practice"] as const;

export interface LessonContent {
  steps: LessonStep[];
  /** Who wrote it: the built-in library, the in-app AI, or Claude through the MCP server. */
  source: "library" | "ai" | "claude";
  at: number;
}

export const isInteractive = (s: LessonStep): s is InteractiveStep =>
  s.type === "choice" || s.type === "input" || s.type === "slider" || s.type === "order" || s.type === "match";

// ---- normalising (content may come from AI, Claude or other clients) ----------

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const opt = (v: unknown): string | undefined => str(v) || undefined;

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

/** An inline SVG diagram or an https image; anything else is dropped. */
export function normalizeFigure(v: unknown): string | undefined {
  const f = str(v);
  if (!f || f.length > 100_000) return undefined;
  if (/^<svg[\s>]/i.test(f) && /<\/svg>$/i.test(f)) return f;
  if (/^https:\/\/[^\s"'<>]+$/i.test(f)) return f;
  return undefined;
}

function visual(r: Record<string, unknown>): Visual {
  const figure = normalizeFigure(r.figure);
  const caption = figure ? opt(r.caption) : undefined;
  const phase = PHASES.includes(r.phase as Phase) ? (r.phase as Phase) : undefined;
  return { ...(figure ? { figure } : {}), ...(caption ? { caption } : {}), ...(phase ? { phase } : {}) };
}

/** A slider widget's settings, or null when unusable (bad range, or a plot/readout that doesn't parse). */
function widget(r: Record<string, unknown>): Widget | null {
  const min = num(r.min);
  const max = num(r.max);
  if (min === undefined || max === undefined || !(max > min)) return null;
  const out: Widget = { min, max };
  const step = num(r.step);
  if (step !== undefined && step > 0 && step <= max - min) out.step = step;
  const start = num(r.start);
  if (start !== undefined && start >= min && start <= max) out.start = start;
  for (const k of ["label", "unit", "readoutLabel"] as const) if (opt(r[k])) out[k] = opt(r[k]);
  const plot = opt(r.plot);
  if (plot) {
    if (!validExpr(plot, ["x", "v"])) return null;
    out.plot = plot;
    const xMin = num(r.xMin);
    const xMax = num(r.xMax);
    if (xMin !== undefined && xMax !== undefined && xMax > xMin) Object.assign(out, { xMin, xMax });
  }
  const readout = opt(r.readout);
  if (readout) {
    if (!validExpr(readout, ["v"])) return null;
    out.readout = readout;
  }
  return out;
}

/** One step in any shape (typed, or the flat shape AI output uses), or null when unusable. */
export function normalizeStep(raw: unknown): LessonStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const step = normalizeCore(r);
  return step ? { ...step, ...visual(r) } : null;
}

function normalizeCore(r: Record<string, unknown>): LessonStep | null {
  const explain = str(r.explain);
  const hint = opt(r.hint);
  switch (r.type) {
    case "explain": {
      const body = str(r.body);
      return body ? { type: "explain", body, ...(opt(r.title) ? { title: opt(r.title) } : {}) } : null;
    }
    case "explore": {
      const body = str(r.body);
      const w = widget(r);
      return body && w ? { type: "explore", body, ...w, ...(opt(r.title) ? { title: opt(r.title) } : {}) } : null;
    }
    case "slider": {
      const prompt = str(r.prompt);
      const w = widget(r);
      const answer = num(Array.isArray(r.answer) ? r.answer[0] : r.answer) ?? num(r.value);
      if (!prompt || !w || answer === undefined || answer < w.min || answer > w.max) return null;
      const tol = num(r.tolerance);
      return { type: "slider", prompt, ...w, answer, ...(tol !== undefined && tol > 0 ? { tolerance: tol } : {}), explain, ...(hint ? { hint } : {}) };
    }
    case "teach": {
      const prompt = str(r.prompt);
      const keyPoints = strs(r.keyPoints);
      const model = str(r.model) || str(r.body);
      return prompt && keyPoints.length && model ? { type: "teach", prompt, keyPoints, model } : null;
    }
    case "practice": {
      const prompt = str(r.prompt);
      const focus = strs(r.focus).length ? strs(r.focus) : strs(r.items);
      const minutes = Math.round(num(r.minutes) ?? 0);
      if (!prompt || minutes < 1 || minutes > 120) return null;
      const goal = opt(r.goal);
      return { type: "practice", prompt, minutes, focus, ...(goal ? { goal } : {}) };
    }
    case "reveal": {
      const prompt = str(r.prompt);
      const body = str(r.body);
      return prompt && body ? { type: "reveal", prompt, body } : null;
    }
    case "choice": {
      const prompt = str(r.prompt);
      const options = strs(r.options);
      const raw = Array.isArray(r.answer) ? r.answer : [r.answer];
      const answer = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < options.length))].sort((a, b) => a - b);
      if (!prompt || options.length < 2 || !answer.length || answer.length === options.length) return null;
      return { type: "choice", prompt, options, answer, explain, ...(hint ? { hint } : {}) };
    }
    case "input": {
      const prompt = str(r.prompt);
      const answers = strs(r.answers);
      if (!prompt || !answers.length) return null;
      const tol = Number(r.tolerance);
      const placeholder = opt(r.placeholder);
      return {
        type: "input",
        prompt,
        answers,
        ...(Number.isFinite(tol) && tol > 0 ? { tolerance: tol } : {}),
        ...(placeholder ? { placeholder } : {}),
        explain,
        ...(hint ? { hint } : {}),
      };
    }
    case "order": {
      const prompt = str(r.prompt);
      const items = strs(r.items);
      if (!prompt || items.length < 2 || new Set(items).size !== items.length) return null;
      return { type: "order", prompt, items, explain, ...(hint ? { hint } : {}) };
    }
    case "match": {
      const prompt = str(r.prompt);
      const pairs = (Array.isArray(r.pairs) ? r.pairs : [])
        .map((p) => ({ left: str((p as Record<string, unknown>)?.left), right: str((p as Record<string, unknown>)?.right) }))
        .filter((p) => p.left && p.right);
      if (!prompt || pairs.length < 2 || new Set(pairs.map((p) => p.right)).size !== pairs.length) return null;
      return { type: "match", prompt, pairs, explain, ...(hint ? { hint } : {}) };
    }
    default:
      return null;
  }
}

export function normalizeSteps(raw: unknown): LessonStep[] {
  return (Array.isArray(raw) ? raw : []).map(normalizeStep).filter((s): s is LessonStep => !!s);
}

/** Problems with a lesson, for tests and for telling Claude what to fix. Empty = fine. */
export function lessonProblems(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  list.forEach((s, i) => {
    if (!normalizeStep(s)) out.push(`step ${i + 1} (${(s as { type?: string })?.type ?? "?"}) is incomplete or invalid`);
    else if (isInteractive(s as LessonStep) && !str((s as { explain?: unknown }).explain)) out.push(`step ${i + 1} has no explanation`);
  });
  const steps = normalizeSteps(list);
  if (steps.length < 3) out.push("a lesson needs at least 3 steps");
  if (!steps.some(isInteractive)) out.push("a lesson needs at least one interactive step (choice, input, slider, order or match)");
  return out;
}

// ---- checking answers -------------------------------------------------------------

/** "1,000", "50%", "3/4", " 2.5 " → number; null when it isn't one. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/,/g, "").replace(/\s+/g, "").replace(/%$/, "");
  if (!t) return null;
  const frac = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
  if (frac) {
    const d = Number(frac[2]);
    return d ? Number(frac[1]) / d : null;
  }
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? Number(t) : null;
}

const loose = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!?,;:'"`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");

export function checkInput(step: InputStep, text: string): boolean {
  if (!text.trim()) return false;
  const n = parseNumber(text);
  return step.answers.some((a) => {
    const target = parseNumber(a);
    if (target !== null && n !== null) return Math.abs(n - target) <= (step.tolerance ?? Math.max(1e-9, Math.abs(target) * 1e-9));
    return loose(a) === loose(text);
  });
}

export function checkChoice(step: ChoiceStep, selected: number[]): boolean {
  const s = [...new Set(selected)].sort((a, b) => a - b);
  return s.length === step.answer.length && s.every((v, i) => v === step.answer[i]);
}

/** `order` lists item indexes in the order the learner placed them. */
export function checkOrder(step: OrderStep, order: number[]): boolean {
  return order.length === step.items.length && order.every((v, i) => v === i);
}

/** `chosen[i]` is the pair index whose right side was matched to left side i. */
export function checkMatch(step: MatchStep, chosen: number[]): boolean {
  return chosen.length === step.pairs.length && chosen.every((v, i) => v === i);
}

/** Close enough to the answer: within `tolerance`, or 2% of the slider's range. */
export function checkSlider(step: SliderStep, value: number): boolean {
  return Math.abs(value - step.answer) <= (step.tolerance ?? (step.max - step.min) / 50) + 1e-9;
}

// ---- scoring --------------------------------------------------------------------------

/** 3 stars at 90%+ right first time, 2 at 60%+, else 1 (finishing always earns one). */
export function starsFor(firstTry: number, total: number): 1 | 2 | 3 {
  if (!total) return 3;
  const f = firstTry / total;
  return f >= 0.9 ? 3 : f >= 0.6 ? 2 : 1;
}

// ---- storage in a course page ------------------------------------------------------------

function stepsMap(page: Y.Map<any>, create: boolean): Y.Map<LessonContent> | undefined {
  const course = courseMap(page);
  if (!course) return undefined;
  let map = course.get("steps") as Y.Map<LessonContent> | undefined;
  if (!map && create) {
    map = new Y.Map<LessonContent>();
    course.set("steps", map);
  }
  return map;
}

export function getLessonContent(page: Y.Map<any>, lessonId: string): LessonContent | undefined {
  const c = stepsMap(page, false)?.get(lessonId);
  if (!c) return undefined;
  const steps = normalizeSteps(c.steps);
  return steps.length ? { ...c, steps } : undefined;
}

export function setLessonContent(page: Y.Map<any>, lessonId: string, steps: LessonStep[], source: LessonContent["source"]) {
  const clean = normalizeSteps(steps);
  const run = () => stepsMap(page, true)!.set(lessonId, { steps: clean, source, at: Date.now() });
  if (page.doc) page.doc.transact(run);
  else run();
}

// ---- AI output schema (structured outputs need one flat object shape) ----------------------

export const STEPS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type", "title", "body", "prompt", "options", "answer", "answers", "value", "tolerance", "items", "pairs", "explain", "hint",
          "figure", "caption", "min", "max", "step", "start", "label", "unit", "plot", "xMin", "xMax", "readout", "readoutLabel",
          "phase", "keyPoints", "model", "minutes", "focus", "goal",
        ],
        properties: {
          type: { type: "string", enum: [...STEP_TYPES] },
          title: { type: "string" },
          body: { type: "string" },
          prompt: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "array", items: { type: "integer" } },
          answers: { type: "array", items: { type: "string" } },
          value: { type: "number" },
          tolerance: { type: "number" },
          items: { type: "array", items: { type: "string" } },
          pairs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["left", "right"],
              properties: { left: { type: "string" }, right: { type: "string" } },
            },
          },
          explain: { type: "string" },
          hint: { type: "string" },
          figure: { type: "string" },
          caption: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          step: { type: "number" },
          start: { type: "number" },
          label: { type: "string" },
          unit: { type: "string" },
          plot: { type: "string" },
          xMin: { type: "number" },
          xMax: { type: "number" },
          readout: { type: "string" },
          readoutLabel: { type: "string" },
          phase: { type: "string", enum: [...PHASES] },
          keyPoints: { type: "array", items: { type: "string" } },
          model: { type: "string" },
          minutes: { type: "number" },
          focus: { type: "array", items: { type: "string" } },
          goal: { type: "string" },
        },
      },
    },
  },
} as const;

/** How to write a good interactive lesson: for the in-app AI and for Claude over MCP. */
export const LESSON_STYLE = `Write it like a Brilliant.org lesson: active learning, learning by doing, not reading.

Every lesson walks the learning loop, and each step says its "phase":
- Subjects (knowledge): preview → understand → explain → recall → apply.
  - preview: where this fits in the big picture and what they'll be able to do, then activate prior knowledge: a prediction or "what do you already know?" question before any teaching.
  - understand: the core ideas, why they're true and how they work (not just facts), in small increments, each followed by something to do.
  - explain: one "teach" step: the learner explains the key idea in their own words to a beginner (Feynman technique); give 3–5 keyPoints and a short plain-language model answer.
  - recall: 1–2 questions on the lesson's key ideas answered from memory, no hints.
  - apply: an unfamiliar problem or real situation that uses the ideas (mix in an earlier lesson's idea when there is one).
- Skills (doing: sports, instruments, drawing, languages, coding practice): preview → understand → practice → reflect.
  - preview: a clear, specific goal for this session; understand: just enough technique to start, the correct form and how an expert does it, common mistakes; practice: one or two "practice" steps with a concrete task, minutes (5–20), focus points and a goal ("10 catches in a row"), slow and correct first, then faster; reflect: questions that check they can spot and fix mistakes, and what to change next time.

Style:
- 9 to 15 steps, about 5–10 minutes (practice time extra). At least half the steps are interactive (choice, input, slider, order, match), and the learner does something before being told.
- Not just text: at least two visuals per lesson. "figure" puts a diagram above any step: an inline SVG ("<svg viewBox=…>…</svg>", simple shapes and labels, text ≥ 14px, stroke/fill "currentColor" or a few clear colors so it reads in light and dark mode) or an https image URL (e.g. Wikimedia Commons) with a "caption". "explore" gives a slider to play with; "slider" asks the learner to find a value. Both can draw a live graph: "plot" is y as an expression of x and the slider value v (e.g. "v*x^2", "sin(x)*v"; + - * / ^ and sin cos tan sqrt abs ln log exp), and "readout" computes a number from v.
- Explanations ("explain") are short: 1–3 short paragraphs, concrete examples, one idea per step. Markdown; math in $…$.
- Every interactive step has "explain": why the answer is right, and the misconception behind the likely wrong answers. Add a "hint" that nudges without giving it away.
- choice: 2–5 options, plausible distractors, "answer" lists the indexes of every correct option (several = select all that apply).
- input: short exact answers (a number, a word). List every acceptable form in "answers"; set "tolerance" for rounded numbers.
- slider: "min", "max", "step", the right value in "answer" (or "value"), and a "tolerance".
- order: "items" in the correct order (the app shuffles them). match: 3–5 "pairs" of left/right.
- teach: "prompt", "keyPoints", "model". practice: "prompt" (the task), "minutes", "focus" (what to pay attention to), "goal".
- reveal: a question to think about, then the answer in "body". Use sparingly.
- Mastery before moving on: the learner must master every question, every key point of the teach step and every practice before the lesson counts, and a skill's mastery check later asks one question from each lesson. So every objective and every detail that matters gets its own question, and each question tests exactly one idea that the lesson teaches before it.
- Be accurate. No filler, no "In this lesson we will…".`;

// Lesson steps: how each kind is shown and answered. The player keeps each
// step's answer; these components render it and report changes.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  checkChoice,
  checkInput,
  checkMatch,
  checkOrder,
  checkSlider,
  type ChoiceStep,
  type InputStep,
  type InteractiveStep,
  type LessonStep,
  type MatchStep,
  type OrderStep,
  type PracticeStep,
  type SliderStep,
  type TeachStep,
} from "../../../shared/lesson.ts";
import { Icon } from "../../components/ui.tsx";
import { renderInlineMarkdown } from "../../lib/render-markdown.ts";
import { Markdown } from "../tutor/ai-ui.tsx";
import { WidgetView } from "./widgets.tsx";

export function Inline({ md }: { md: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(md) }} />;
}

// ---- answers -----------------------------------------------------------------------------

export type Answer =
  | { kind: "choice"; selected: number[] }
  | { kind: "input"; text: string }
  | { kind: "slider"; value: number }
  | { kind: "order"; order: number[] }
  | { kind: "match"; chosen: number[]; rightOrder: number[] };

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Never start already solved.
  if (n > 1 && a.every((v, i) => v === i)) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

export function initialAnswer(step: InteractiveStep): Answer {
  switch (step.type) {
    case "choice":
      return { kind: "choice", selected: [] };
    case "input":
      return { kind: "input", text: "" };
    case "slider":
      return { kind: "slider", value: step.start ?? step.min };
    case "order":
      return { kind: "order", order: shuffled(step.items.length) };
    case "match":
      return { kind: "match", chosen: step.pairs.map(() => -1), rightOrder: shuffled(step.pairs.length) };
  }
}

export function isAnswered(a: Answer): boolean {
  switch (a.kind) {
    case "choice":
      return a.selected.length > 0;
    case "input":
      return a.text.trim().length > 0;
    case "match":
      return a.chosen.every((c) => c >= 0);
    default:
      return true;
  }
}

export function isRight(step: InteractiveStep, a: Answer): boolean {
  if (step.type === "choice" && a.kind === "choice") return checkChoice(step, a.selected);
  if (step.type === "input" && a.kind === "input") return checkInput(step, a.text);
  if (step.type === "slider" && a.kind === "slider") return checkSlider(step, a.value);
  if (step.type === "order" && a.kind === "order") return checkOrder(step, a.order);
  if (step.type === "match" && a.kind === "match") return checkMatch(step, a.chosen);
  return false;
}

/** The learner's answer and the right one, as text (for the error log). */
export function answerTexts(step: InteractiveStep, a: Answer): { given: string; correct: string } {
  switch (step.type) {
    case "choice":
      return {
        given: a.kind === "choice" ? a.selected.map((i) => step.options[i]).join(" + ") : "",
        correct: step.answer.map((i) => step.options[i]).join(" + "),
      };
    case "input":
      return { given: a.kind === "input" ? a.text : "", correct: step.answers[0] };
    case "slider":
      return { given: a.kind === "slider" ? String(a.value) : "", correct: String(step.answer) };
    case "order":
      return { given: a.kind === "order" ? a.order.map((i) => step.items[i]).join(" → ") : "", correct: step.items.join(" → ") };
    case "match":
      return {
        given: a.kind === "match" ? step.pairs.map((p, i) => `${p.left}: ${step.pairs[a.chosen[i]]?.right ?? "?"}`).join("; ") : "",
        correct: step.pairs.map((p) => `${p.left}: ${p.right}`).join("; "),
      };
  }
}

/** The right answer, spelled out, when the learner asks to see it. */
export function solved(step: InteractiveStep, a: Answer): Answer {
  switch (step.type) {
    case "choice":
      return { kind: "choice", selected: step.answer };
    case "input":
      return { kind: "input", text: step.answers[0] };
    case "slider":
      return { kind: "slider", value: step.answer };
    case "order":
      return { kind: "order", order: step.items.map((_, i) => i) };
    case "match":
      return { kind: "match", chosen: step.pairs.map((_, i) => i), rightOrder: a.kind === "match" ? a.rightOrder : step.pairs.map((_, i) => i) };
  }
}

// ---- interactive steps ----------------------------------------------------------------------

export interface AnswerProps<S, A extends Answer> {
  step: S;
  answer: A;
  setAnswer: (a: A) => void;
  /** No more changes (answered right, or the answer is shown). */
  locked: boolean;
  /** After checking: mark what's right and wrong. */
  checked: boolean;
}

export function ChoiceAnswer({ step, answer, setAnswer, locked, checked }: AnswerProps<ChoiceStep, Extract<Answer, { kind: "choice" }>>) {
  const multi = step.answer.length > 1;
  const toggle = (i: number) => {
    if (locked) return;
    if (!multi) return setAnswer({ kind: "choice", selected: [i] });
    const has = answer.selected.includes(i);
    setAnswer({ kind: "choice", selected: has ? answer.selected.filter((x) => x !== i) : [...answer.selected, i] });
  };
  return (
    <div className="lp-options" role={multi ? "group" : "radiogroup"} aria-label={multi ? "Select all that apply" : "Choose one"}>
      {multi && <div className="lp-multi-note">Select all that apply</div>}
      {step.options.map((o, i) => {
        const sel = answer.selected.includes(i);
        const correct = step.answer.includes(i);
        const mark = checked && locked ? (correct ? " right" : sel ? " wrong" : "") : checked && sel ? " wrong" : "";
        return (
          <button
            key={i}
            className={`lp-option${sel ? " selected" : ""}${mark}`}
            role={multi ? "checkbox" : "radio"}
            aria-checked={sel}
            disabled={locked}
            onClick={() => toggle(i)}
          >
            <span className="lp-option-key" aria-hidden>
              {multi ? sel ? <Icon name="check" size={12} stroke={3} /> : null : i + 1}
            </span>
            <span className="lp-option-text">
              <Inline md={o} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function InputAnswer({ step, answer, setAnswer, locked, checked, onSubmit }: AnswerProps<InputStep, Extract<Answer, { kind: "input" }>> & { onSubmit: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!locked) ref.current?.focus();
  }, [locked]);
  return (
    <input
      ref={ref}
      className={`input lp-input${checked ? (locked ? " right" : " wrong") : ""}`}
      value={answer.text}
      placeholder={step.placeholder || "Your answer"}
      disabled={locked}
      onChange={(e) => setAnswer({ kind: "input", text: e.target.value })}
      onKeyDown={(e) => e.key === "Enter" && answer.text.trim() && onSubmit()}
      aria-label="Your answer"
      autoComplete="off"
      spellCheck={false}
    />
  );
}

export function SliderAnswer({ step, answer, setAnswer, locked, checked }: AnswerProps<SliderStep, Extract<Answer, { kind: "slider" }>>) {
  return (
    <WidgetView
      w={step}
      value={answer.value}
      disabled={locked}
      target={checked && locked ? step.answer : undefined}
      onChange={(v) => setAnswer({ kind: "slider", value: v })}
    />
  );
}

export function OrderAnswer({ step, answer, setAnswer, locked, checked }: AnswerProps<OrderStep, Extract<Answer, { kind: "order" }>>) {
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (locked || to < 0 || to >= answer.order.length || from === to) return;
    const order = [...answer.order];
    const [x] = order.splice(from, 1);
    order.splice(to, 0, x);
    setAnswer({ kind: "order", order });
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      move(i, i - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(i, i + 1);
    }
  };
  return (
    <ol className="lp-order" aria-label="Put these in order (use the arrows, or drag)">
      {answer.order.map((item, i) => {
        const mark = checked ? (item === i ? " right" : " wrong") : "";
        return (
          <li
            key={item}
            className={`lp-order-item${mark}${dragging === i ? " dragging" : ""}`}
            draggable={!locked}
            onDragStart={() => setDragging(i)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragging !== null && dragging !== i) {
                move(dragging, i);
                setDragging(i);
              }
            }}
            tabIndex={locked ? -1 : 0}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="lp-order-num">{i + 1}</span>
            <span className="grow">
              <Inline md={step.items[item]} />
            </span>
            {!locked && (
              <span className="lp-order-moves">
                <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <Icon name="up" size={14} />
                </button>
                <button className="icon-btn" aria-label="Move down" disabled={i === answer.order.length - 1} onClick={() => move(i, i + 1)}>
                  <Icon name="down" size={14} />
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const PAIR_COLORS = 5;

export function MatchAnswer({ step, answer, setAnswer, locked, checked }: AnswerProps<MatchStep, Extract<Answer, { kind: "match" }>>) {
  const [left, setLeft] = useState<number | null>(null);
  const pairOf = (rightIndex: number) => answer.chosen.indexOf(rightIndex);
  const pickRight = (r: number) => {
    if (locked) return;
    const chosen = [...answer.chosen];
    const target = left ?? chosen.findIndex((c) => c === -1);
    if (target < 0) return;
    const prev = chosen.indexOf(r);
    if (prev >= 0) chosen[prev] = -1;
    chosen[target] = r;
    setAnswer({ ...answer, chosen });
    setLeft(null);
  };
  const pickLeft = (i: number) => {
    if (locked) return;
    if (answer.chosen[i] >= 0) {
      const chosen = [...answer.chosen];
      chosen[i] = -1;
      setAnswer({ ...answer, chosen });
    }
    setLeft(i);
  };
  return (
    <div className="lp-match">
      <div className="lp-match-col" aria-label="Items">
        {step.pairs.map((p, i) => {
          const c = answer.chosen[i];
          const mark = checked && c >= 0 ? (c === i ? " right" : " wrong") : "";
          return (
            <button
              key={i}
              className={`lp-match-item${left === i ? " active" : ""}${c >= 0 ? ` paired c${i % PAIR_COLORS}` : ""}${mark}`}
              disabled={locked}
              onClick={() => pickLeft(i)}
            >
              <Inline md={p.left} />
            </button>
          );
        })}
      </div>
      <div className="lp-match-col" aria-label="Matches">
        {answer.rightOrder.map((r) => {
          const owner = pairOf(r);
          return (
            <button
              key={r}
              className={`lp-match-item${owner >= 0 ? ` paired c${owner % PAIR_COLORS}` : ""}`}
              disabled={locked}
              onClick={() => pickRight(r)}
            >
              <Inline md={step.pairs[r].right} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---- explain it in your own words, and practice ----------------------------------------------

export interface TeachState {
  text: string;
  compared: boolean;
  covered: number[];
}

export function TeachView({ step, state, setState }: { step: TeachStep; state: TeachState; setState: (s: TeachState) => void }) {
  return (
    <div className="lp-teach">
      <textarea
        className="textarea lp-teach-text"
        placeholder="Explain it as if to a friend who has never heard of it. Plain words, no jargon."
        value={state.text}
        disabled={state.compared}
        onChange={(e) => setState({ ...state, text: e.target.value })}
        rows={6}
        aria-label="Your explanation"
      />
      {state.compared && (
        <div className="lp-teach-compare">
          <div className="lp-teach-model">
            <div className="lp-mini-head">A clear explanation</div>
            <Markdown md={step.model} />
          </div>
          <div className="lp-teach-points" role="group" aria-label="Which key points did you cover?">
            <div className="lp-mini-head">Tick what your explanation covered</div>
            {step.keyPoints.map((k, i) => {
              const on = state.covered.includes(i);
              return (
                <button
                  key={i}
                  className={`lp-check${on ? " on" : ""}`}
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setState({ ...state, covered: on ? state.covered.filter((x) => x !== i) : [...state.covered, i] })}
                >
                  <span className="lp-check-box">{on && <Icon name="check" size={12} stroke={3} />}</span>
                  <Inline md={k} />
                </button>
              );
            })}
            <p className="lp-teach-note">Anything you missed or fumbled is a gap: it’s worth going back to.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export interface PracticeState {
  /** Seconds practised with the timer. */
  seconds: number;
  running: boolean;
  done: boolean;
  rating: number;
  change: string;
  focusHit: number[];
}

export function PracticeView({ step, state, setState }: { step: PracticeStep; state: PracticeState; setState: (s: PracticeState) => void }) {
  const total = step.minutes * 60;
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (!state.running) return;
    const t = window.setInterval(() => {
      const s = latest.current;
      const seconds = s.seconds + 1;
      setState({ ...s, seconds, running: seconds < total });
    }, 1000);
    return () => window.clearInterval(t);
  }, [state.running, total, setState]);
  const left = Math.max(0, total - state.seconds);
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <div className="lp-practice">
      {step.goal && (
        <div className="lp-practice-goal">
          <Icon name="target" size={15} /> Goal: <Inline md={step.goal} />
        </div>
      )}
      {step.focus.length > 0 && (
        <div className="lp-practice-focus">
          <div className="lp-mini-head">{state.done ? "What went well? Tick what you managed" : "Focus on"}</div>
          {step.focus.map((f, i) => {
            const on = state.focusHit.includes(i);
            return state.done ? (
              <button
                key={i}
                className={`lp-check${on ? " on" : ""}`}
                role="checkbox"
                aria-checked={on}
                onClick={() => setState({ ...state, focusHit: on ? state.focusHit.filter((x) => x !== i) : [...state.focusHit, i] })}
              >
                <span className="lp-check-box">{on && <Icon name="check" size={12} stroke={3} />}</span>
                <Inline md={f} />
              </button>
            ) : (
              <div key={i} className="lp-focus-item">
                • <Inline md={f} />
              </div>
            );
          })}
        </div>
      )}
      {!state.done ? (
        <div className="lp-timer">
          <div className={`lp-timer-face${state.running ? " running" : ""}`} aria-live="off">
            {mm}
          </div>
          <div className="lp-timer-bar">
            <span style={{ width: `${Math.min(100, (state.seconds / total) * 100)}%` }} />
          </div>
          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
            <button className="btn" onClick={() => setState({ ...state, running: !state.running })}>
              <Icon name={state.running ? "pause" : "play"} size={14} /> {state.running ? "Pause" : state.seconds ? "Resume" : "Start timer"}
            </button>
            <button className="btn btn-primary" onClick={() => setState({ ...state, running: false, done: true })}>
              I’ve practised
            </button>
          </div>
          <p className="lp-teach-note">Slow and correct first, then speed up. Put the app down and go do it.</p>
        </div>
      ) : (
        <div className="lp-practice-feedback">
          <div className="lp-mini-head">How did it go?</div>
          <div className="lp-rating" role="radiogroup" aria-label="How did it go?">
            {["Rough", "Hard", "Okay", "Good", "Great"].map((label, i) => (
              <button
                key={label}
                role="radio"
                aria-checked={state.rating === i + 1}
                className={`lp-rating-btn${state.rating === i + 1 ? " on" : ""}`}
                onClick={() => setState({ ...state, rating: i + 1 })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="lp-mini-head" htmlFor="lp-change">
            What will you change next time?
          </label>
          <input
            id="lp-change"
            className="input"
            placeholder="e.g. throw lower, slow down on the second rep"
            value={state.change}
            onChange={(e) => setState({ ...state, change: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export const isAnswerStep = (s: LessonStep): s is InteractiveStep =>
  s.type === "choice" || s.type === "input" || s.type === "slider" || s.type === "order" || s.type === "match";

// Quiz runner and results. Pure presentation over question data: grading of
// short answers is injected, so the same component serves lesson quizzes,
// the placement test and mock data in tests.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { renderInlineMarkdown } from "../../lib/render-markdown.ts";
import { aiErrorMessage } from "../../lib/ai.ts";
import { Markdown, ProgressRing } from "../tutor/ai-ui.tsx";
import type { Grade, QuizQuestion } from "./prompts.ts";

export const MASTERY_THRESHOLD = 0.8;

export interface AnswerRecord {
  index: number;
  /** Chosen option (multiple choice); -1 = "I don't know". */
  choice?: number;
  text?: string;
  score: number;
  feedback?: string;
}

export interface QuizResult {
  score: number;
  answers: AnswerRecord[];
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function Inline({ md }: { md: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(md) }} />;
}

export interface QuizRunnerProps {
  questions: QuizQuestion[];
  /** Grades a short answer (usually via Claude). */
  gradeShort?: (q: QuizQuestion, answer: string, signal: AbortSignal) => Promise<Grade>;
  onFinish: (result: QuizResult) => void;
  onQuit?: () => void;
  /**
   * "learn" reveals the answer and explanation after each question;
   * "diagnostic" moves straight on and offers "I don't know" (placement test).
   */
  mode?: "learn" | "diagnostic";
  title?: string;
}

export function QuizRunner({ questions, gradeShort, onFinish, onQuit, mode = "learn", title = "Quiz" }: QuizRunnerProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [choice, setChoice] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const q = questions[index];
  const last = index === questions.length - 1;
  const current = answers[index];

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>(checked ? ".co-quiz-next" : ".co-quiz-focus")?.focus({ preventScroll: true });
  }, [index, checked]);

  const record = (a: AnswerRecord) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = a;
      return next;
    });
  };

  const advance = (all: AnswerRecord[]) => {
    if (last) {
      const score = all.reduce((s, a) => s + (a?.score ?? 0), 0) / questions.length;
      onFinish({ score, answers: all });
      return;
    }
    setIndex(index + 1);
    setChoice(null);
    setText("");
    setChecked(false);
    setGradeError(null);
  };

  const submitMc = (pick: number) => {
    const a: AnswerRecord = { index, choice: pick, score: pick === q.answer ? 1 : 0 };
    if (mode === "diagnostic") {
      const all = [...answers];
      all[index] = a;
      setAnswers(all);
      advance(all);
      return;
    }
    record(a);
    setChecked(true);
  };

  const submitShort = async () => {
    if (!gradeShort) {
      setGradeError("Grading is unavailable. Grade yourself against the model answer.");
      setChecked(true);
      return;
    }
    setGrading(true);
    setGradeError(null);
    abort.current = new AbortController();
    try {
      const g = await gradeShort(q, text, abort.current.signal);
      record({ index, text, score: g.score, feedback: g.feedback });
      setChecked(true);
    } catch (err) {
      if (abort.current.signal.aborted) return;
      setGradeError(aiErrorMessage(err));
      setChecked(true);
    } finally {
      setGrading(false);
    }
  };

  const selfGrade = (score: number) => {
    record({ index, text, score, feedback: "Self-graded against the model answer." });
    setGradeError(null);
  };

  const onKey = (e: KeyboardEvent) => {
    if (q.kind !== "mc" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
    const n = "1234".indexOf(e.key) !== -1 ? Number(e.key) - 1 : "abcd".indexOf(e.key.toLowerCase());
    if (!checked && n >= 0 && n < q.options.length) {
      setChoice(n);
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (!checked && choice !== null) submitMc(choice);
      else if (checked) advance(answers);
      e.preventDefault();
    }
  };

  const answeredScore = current?.score;

  return (
    <div className="co-quiz" ref={rootRef} onKeyDown={onKey}>
      <div className="co-quiz-head">
        <span className="co-quiz-title">{title}</span>
        <span className="co-quiz-count">
          {index + 1} / {questions.length}
        </span>
        <span className="spacer" />
        {onQuit && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onQuit}>
            Quit
          </button>
        )}
      </div>
      <div className="co-quiz-dots" aria-hidden>
        {questions.map((_, i) => {
          const a = answers[i];
          const cls =
            i === index
              ? "current"
              : a && mode === "learn"
                ? a.score >= 0.99
                  ? "right"
                  : a.score > 0
                    ? "partial"
                    : "wrong"
                : a
                  ? "answered"
                  : "";
          return <span key={i} className={cls} />;
        })}
      </div>

      <div className="co-quiz-question" key={index}>
        <div className="co-quiz-kind">{q.kind === "mc" ? "Multiple choice" : "Short answer"}</div>
        <Markdown md={q.question} className="co-quiz-prompt" />

        {q.kind === "mc" ? (
          <div className="co-options" role="radiogroup" aria-label="Options">
            {q.options.map((opt, i) => {
              const state = checked
                ? i === q.answer
                  ? "correct"
                  : i === choice
                    ? "incorrect"
                    : "dim"
                : i === choice
                  ? "selected"
                  : "";
              return (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={choice === i}
                  className={`co-option ${state}${i === 0 ? " co-quiz-focus" : ""}`}
                  disabled={checked}
                  onClick={() => (mode === "diagnostic" ? submitMc(i) : setChoice(i))}
                >
                  <span className="co-option-letter">{LETTERS[i]}</span>
                  <span className="co-option-text">
                    <Inline md={opt} />
                  </span>
                  {checked && i === q.answer && <span className="co-option-mark">✓</span>}
                  {checked && i === choice && i !== q.answer && <span className="co-option-mark">✕</span>}
                </button>
              );
            })}
            {mode === "diagnostic" && (
              <button type="button" className="co-option dontknow" onClick={() => submitMc(-1)}>
                <span className="co-option-letter">?</span>
                <span className="co-option-text">I don't know yet</span>
              </button>
            )}
          </div>
        ) : (
          <div className="co-short">
            <textarea
              className="textarea co-quiz-focus"
              rows={4}
              value={text}
              disabled={checked || grading}
              placeholder="Answer in a few sentences. Use $…$ for math."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && !checked) void submitShort();
              }}
            />
          </div>
        )}

        {checked && mode === "learn" && (
          <div
            className={`co-feedback ${
              answeredScore === undefined ? "neutral" : answeredScore >= 0.99 ? "right" : answeredScore > 0 ? "partial" : "wrong"
            }`}
          >
            <div className="co-feedback-head">
              {answeredScore === undefined
                ? "Compare with the model answer"
                : answeredScore >= 0.99
                  ? "Correct"
                  : answeredScore > 0
                    ? `Partly right · ${Math.round(answeredScore * 100)}%`
                    : "Not quite"}
            </div>
            {current?.feedback && <Markdown md={current.feedback} />}
            {gradeError && (
              <div className="co-selfgrade">
                <span className="muted small">{gradeError}</span>
                <div className="row wrap">
                  <span className="small">How did you do?</span>
                  <button type="button" className="btn btn-sm" onClick={() => selfGrade(1)}>
                    Got it
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => selfGrade(0.5)}>
                    Partly
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => selfGrade(0)}>
                    Missed it
                  </button>
                </div>
              </div>
            )}
            {q.kind === "mc" ? (
              <Markdown md={q.explanation} />
            ) : (
              <details className="co-model" open={answeredScore !== undefined && answeredScore < 0.99}>
                <summary>Model answer</summary>
                <Markdown md={q.modelAnswer || q.explanation} />
              </details>
            )}
          </div>
        )}
      </div>

      {mode === "learn" && (
        <div className="co-quiz-foot">
          <span className="faint small co-quiz-keys">
            {q.kind === "mc" ? (
              <>
                <span className="kbd">1</span>–<span className="kbd">4</span> choose · <span className="kbd">Enter</span>{" "}
                {checked ? "next" : "check"}
              </>
            ) : checked ? null : (
              <>
                <span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> submit
              </>
            )}
          </span>
          <span className="spacer" />
          {!checked ? (
            q.kind === "mc" ? (
              <button type="button" className="btn btn-primary" disabled={choice === null} onClick={() => choice !== null && submitMc(choice)}>
                Check answer
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!text.trim() || grading} onClick={() => void submitShort()}>
                {grading ? (
                  <>
                    <span className="spinner" /> Grading…
                  </>
                ) : (
                  "Submit answer"
                )}
              </button>
            )
          ) : (
            <button
              type="button"
              className="btn btn-primary co-quiz-next"
              disabled={current === undefined}
              onClick={() => advance(answers)}
            >
              {last ? "See results" : "Next question →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function QuizResults({
  questions,
  result,
  children,
  actions,
}: {
  questions: QuizQuestion[];
  result: QuizResult;
  /** Extra content under the summary (e.g. the remedial explanation). */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const passed = result.score >= MASTERY_THRESHOLD;
  const correct = result.answers.filter((a) => a && a.score >= 0.99).length;
  const missed = questions.map((q, i) => ({ q, a: result.answers[i] })).filter(({ a }) => !a || a.score < 0.99);
  const weakObjectives = [...new Set(missed.map(({ q }) => q.objective).filter(Boolean))];
  return (
    <div className={`co-results ${passed ? "passed" : "failed"}`}>
      <div className="co-results-head">
        <ProgressRing value={result.score} size={76} stroke={7} />
        <div className="grow">
          <div className="co-results-title">{passed ? "Mastered! 🎉" : "Not quite there yet"}</div>
          <div className="muted">
            {correct} of {questions.length} fully correct · you need {Math.round(MASTERY_THRESHOLD * 100)}% to master a lesson.
          </div>
        </div>
      </div>
      {!passed && weakObjectives.length > 0 && (
        <div className="co-weak">
          <div className="co-weak-title">Focus on</div>
          <ul>
            {weakObjectives.map((o) => (
              <li key={o}>
                <Inline md={o} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {actions && <div className="co-results-actions">{actions}</div>}
      {children}
      <details className="co-review" open={!passed}>
        <summary>Review answers</summary>
        <ol className="co-review-list">
          {questions.map((q, i) => {
            const a = result.answers[i];
            const s = a?.score ?? 0;
            return (
              <li key={i} className={s >= 0.99 ? "right" : s > 0 ? "partial" : "wrong"}>
                <div className="co-review-q">
                  <span className="co-review-mark" aria-hidden>
                    {s >= 0.99 ? "✓" : s > 0 ? "◐" : "✕"}
                  </span>
                  <Markdown md={q.question} />
                </div>
                <div className="co-review-a">
                  {q.kind === "mc" ? (
                    <>
                      <div>
                        <span className="faint">Your answer: </span>
                        {a?.choice === undefined || a.choice < 0 ? <em>I don't know</em> : <Inline md={q.options[a.choice] ?? ""} />}
                      </div>
                      {s < 0.99 && (
                        <div>
                          <span className="faint">Correct: </span>
                          <Inline md={q.options[q.answer] ?? ""} />
                        </div>
                      )}
                      <Markdown md={q.explanation} className="co-review-exp" />
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="faint">Your answer: </span>
                        {a?.text || <em>blank</em>}
                      </div>
                      {a?.feedback && <Markdown md={a.feedback} className="co-review-exp" />}
                      {s < 0.99 && q.modelAnswer && (
                        <details className="co-model">
                          <summary>Model answer</summary>
                          <Markdown md={q.modelAnswer} className="co-review-exp" />
                        </details>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}

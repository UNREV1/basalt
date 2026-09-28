// Placement test: a short diagnostic across the first five levels. Lessons
// below the demonstrated level can then be marked as skipped in one click.

import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import type { Curriculum } from "../../../shared/course.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Dots, ErrorNote, NoKeyPanel, ProgressBar } from "../tutor/ai-ui.tsx";
import { skipBelow, startPlacement } from "./generate.ts";
import { cancelJob, clearJob, jobKeys, useJob } from "./jobs.ts";
import { lessonRefs, progressReader } from "./model.ts";
import { PLACEMENT_LEVELS, PLACEMENT_PER_LEVEL, type PlacementQuestion, type QuizQuestion } from "./prompts.ts";
import { QuizRunner, type QuizResult } from "./Quiz.tsx";

/** A level counts as known with at least this share of its questions right. */
const PASS_SHARE = 2 / 3;

export interface PlacementOutcome {
  perLevel: { correct: number; total: number }[];
  /** Index of the first level the learner hasn't demonstrated. */
  placedLevel: number;
}

export function scorePlacement(questions: PlacementQuestion[], result: QuizResult): PlacementOutcome {
  const perLevel = Array.from({ length: PLACEMENT_LEVELS }, () => ({ correct: 0, total: 0 }));
  questions.forEach((q, i) => {
    const s = perLevel[q.level];
    if (!s) return;
    s.total++;
    if ((result.answers[i]?.score ?? 0) >= 1) s.correct++;
  });
  let placedLevel = 0;
  while (placedLevel < PLACEMENT_LEVELS && perLevel[placedLevel].total > 0 && perLevel[placedLevel].correct / perLevel[placedLevel].total >= PASS_SHARE) {
    placedLevel++;
  }
  return { perLevel, placedLevel };
}

export function Placement({
  ws,
  page,
  pageId,
  curriculum,
  hasKey,
  courseTitle,
  onDone,
}: {
  ws: Workspace;
  page: Y.Map<any>;
  pageId: string;
  curriculum: Curriculum;
  hasKey: boolean;
  courseTitle: string;
  onDone: () => void;
}) {
  const key = jobKeys.placement(pageId);
  const job = useJob(key);
  const questions = job?.status === "done" ? (job.data as PlacementQuestion[]) : null;
  const [phase, setPhase] = useState<"intro" | "taking" | "results">("intro");
  const [outcome, setOutcome] = useState<PlacementOutcome | null>(null);
  const [applied, setApplied] = useState<number | null>(null);
  const waiting = useRef(false);

  useEffect(() => {
    if (waiting.current && questions) {
      waiting.current = false;
      setPhase("taking");
    }
  }, [questions]);

  const begin = () => {
    if (questions) {
      setPhase("taking");
      return;
    }
    waiting.current = true;
    clearJob(key);
    void startPlacement(ws, pageId);
  };

  const asQuiz: QuizQuestion[] = (questions ?? []).map((q) => ({
    kind: "mc",
    question: q.question,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation,
    modelAnswer: "",
    objective: curriculum.levels[q.level]?.name ?? "",
  }));

  const toSkip = outcome
    ? lessonRefs(curriculum).filter((r) => r.levelIndex < outcome.placedLevel && progressReader(page)(r.lesson.id).status === "not-started").length
    : 0;

  return (
    <section className="co-placement">
      <div className="co-crumbs">
        <button type="button" className="btn btn-ghost btn-sm co-back" onClick={onDone}>
          ← Roadmap
        </button>
      </div>
      {phase === "taking" && questions ? (
        <QuizRunner
          title="Placement test"
          mode="diagnostic"
          questions={asQuiz}
          onQuit={() => setPhase("intro")}
          onFinish={(r) => {
            setOutcome(scorePlacement(questions, r));
            setPhase("results");
            // A retake should get fresh questions.
            clearJob(key);
          }}
        />
      ) : phase === "results" && outcome ? (
        <div className="co-placement-card">
          <div className="co-placement-icon" aria-hidden>
            🧭
          </div>
          <h2 className="co-placement-title">
            {outcome.placedLevel === 0
              ? "Start from the Foundations"
              : outcome.placedLevel >= PLACEMENT_LEVELS
                ? `You placed into ${curriculum.levels[PLACEMENT_LEVELS]?.name ?? "the final level"}`
                : `You placed into ${curriculum.levels[outcome.placedLevel].name}`}
          </h2>
          <p className="muted">
            {outcome.placedLevel === 0
              ? "The Foundations level will give you a solid base. Nothing is skipped."
              : `You showed you're comfortable with ${curriculum.levels
                  .slice(0, outcome.placedLevel)
                  .map((l) => l.name)
                  .join(", ")}. You can skip those lessons and revisit any of them later.`}
          </p>
          <div className="co-placement-levels">
            {outcome.perLevel.map((s, i) => (
              <div key={i} className={`co-placement-level${i < outcome.placedLevel ? " known" : ""}`}>
                <span className="co-placement-name">{curriculum.levels[i]?.name}</span>
                <ProgressBar value={s.total ? s.correct / s.total : 0} tone={i < outcome.placedLevel ? "success" : "accent"} />
                <span className="co-num">
                  {s.correct}/{s.total}
                </span>
              </div>
            ))}
          </div>
          <div className="co-placement-actions">
            {applied !== null ? (
              <>
                <span className="co-applied">✓ Skipped {applied} lessons.</span>
                <button type="button" className="btn btn-primary" onClick={onDone}>
                  Go to roadmap →
                </button>
              </>
            ) : (
              <>
                {toSkip > 0 && (
                  <button type="button" className="btn btn-primary" onClick={() => setApplied(skipBelow(page, outcome.placedLevel))}>
                    Skip {toSkip} lessons I know
                  </button>
                )}
                <button type="button" className={toSkip > 0 ? "btn" : "btn btn-primary"} onClick={onDone}>
                  {toSkip > 0 ? "Keep everything" : "Back to roadmap"}
                </button>
                <button type="button" className="btn btn-ghost" disabled={!hasKey} onClick={begin}>
                  Retake
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="co-placement-card">
          <div className="co-placement-icon" aria-hidden>
            🧭
          </div>
          <h2 className="co-placement-title">Placement test</h2>
          <p className="muted">
            {PLACEMENT_LEVELS * PLACEMENT_PER_LEVEL} quick multiple-choice questions, from the Foundations up to Graduate
            level. Answer honestly and choose “I don't know yet” rather than guessing; the test only decides which lessons
            you can skip. It takes about five minutes.
          </p>
          {job?.status === "running" ? (
            <div className="co-gen-bar" role="status">
              <Dots />
              <span className="grow">Writing your placement test…</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  waiting.current = false;
                  cancelJob(key);
                }}
              >
                Cancel
              </button>
            </div>
          ) : hasKey ? (
            <div className="co-placement-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={begin}>
                Begin →
              </button>
            </div>
          ) : (
            <NoKeyPanel
              ws={ws}
              compact
              title="Connect Claude to take the placement test"
              claudePrompt={`Give me a placement test for my Basalt course “${courseTitle}” and mark the lessons I already know as skipped.`}
            />
          )}
          {job?.status === "error" && <ErrorNote message={job.error ?? "Couldn't create the test."} onRetry={begin} />}
        </div>
      )}
    </section>
  );
}

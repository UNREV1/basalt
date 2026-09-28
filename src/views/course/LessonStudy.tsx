// Study mode for one lesson: objectives, the lesson itself (streamed while
// Claude writes it, then read live from its page), the mastery quiz with
// remediation, and navigation to neighbouring lessons.

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type * as Y from "yjs";
import type { LessonProgress } from "../../../shared/course.ts";
import { getPage } from "../../../shared/model.ts";
import { Menu, Modal, type Anchor, type MenuItem } from "../../components/ui.tsx";
import { useApp } from "../../lib/hooks.ts";
import { renderInlineMarkdown } from "../../lib/render-markdown.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Dots, ErrorNote, formatCount, Markdown, NoKeyPanel, wordCount } from "../tutor/ai-ui.tsx";
import { gradeShortAnswer, lessonMarkdown, startLesson, startQuiz, startRemedial } from "./generate.ts";
import { cancelJob, clearJob, jobKeys, useJob } from "./jobs.ts";
import { pageAlive, progressReader, writeProgress, type LessonRef } from "./model.ts";
import type { MissedItem, QuizQuestion } from "./prompts.ts";
import { MASTERY_THRESHOLD, QuizResults, QuizRunner, type QuizResult } from "./Quiz.tsx";
import { StatusBadge } from "./Roadmap.tsx";

/** Markdown of a lesson page, kept in sync with edits (debounced). */
export function useLessonMarkdown(ws: Workspace, lessonPageId: string | undefined): string {
  const [md, setMd] = useState(() => lessonMarkdown(ws, lessonPageId));
  useEffect(() => {
    setMd(lessonMarkdown(ws, lessonPageId));
    if (!pageAlive(ws.doc, lessonPageId)) return;
    const page = getPage(ws.doc, lessonPageId)!;
    const fragment = page.get("content") as Y.XmlFragment;
    let timer = 0;
    const update = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setMd(lessonMarkdown(ws, lessonPageId)), 250);
    };
    fragment.observeDeep(update);
    page.observe(update);
    return () => {
      clearTimeout(timer);
      fragment.unobserveDeep(update);
      page.unobserve(update);
    };
  }, [ws, lessonPageId]);
  return md;
}

export interface LessonStudyProps {
  ws: Workspace;
  page: Y.Map<any>;
  pageId: string;
  refs: LessonRef[];
  lessonRef: LessonRef;
  progress: LessonProgress;
  hasKey: boolean;
  courseTitle: string;
  onBack: () => void;
  onOpenLesson: (lessonId: string) => void;
  onAskTutor: () => void;
}

export function LessonStudy(props: LessonStudyProps) {
  const { ws, page, pageId, lessonRef: ref, progress, hasKey } = props;
  const app = useApp();
  const lessonId = ref.lesson.id;
  const lessonPageId = pageAlive(ws.doc, progress.lessonPageId) ? progress.lessonPageId : undefined;
  const md = useLessonMarkdown(ws, lessonPageId);
  const job = useJob(jobKeys.lesson(pageId, lessonId));
  const writing = job?.status === "running";
  const [menu, setMenu] = useState<{ anchor: Anchor; items: MenuItem[] } | null>(null);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const prev = props.refs[ref.index - 1];
  const next = props.refs[ref.index + 1];
  const words = wordCount(md);

  const openWiki = (title: string) => {
    const target = props.refs.find((r) => r.lesson.title.toLowerCase() === title.toLowerCase());
    if (target) props.onOpenLesson(target.lesson.id);
  };

  const write = () => {
    clearJob(jobKeys.lesson(pageId, lessonId));
    void startLesson(ws, pageId, lessonId);
  };

  const showMenu = (e: MouseEvent) => {
    const items: MenuItem[] = [];
    if (lessonPageId) items.push({ label: "Open as page", icon: "↗", onClick: () => app.openPage(lessonPageId) });
    if (lessonPageId && hasKey) items.push({ label: "Rewrite lesson", icon: "↻", onClick: () => setConfirmRewrite(true) });
    items.push({ label: "", separator: true });
    if (progress.status !== "mastered") items.push({ label: "Mark as mastered", icon: "✓", onClick: () => writeProgress(page, lessonId, { status: "mastered" }) });
    if (progress.status !== "skipped") items.push({ label: "Skip — I know this", icon: "↷", onClick: () => writeProgress(page, lessonId, { status: "skipped" }) });
    if (progress.status !== "not-started" || progress.quizzes.length)
      items.push({
        label: "Reset progress",
        icon: "↺",
        danger: true,
        onClick: () => writeProgress(page, lessonId, { status: lessonPageId ? "in-progress" : "not-started", mastery: 0, quizzes: [] }),
      });
    setMenu({ anchor: (e.currentTarget as HTMLElement).getBoundingClientRect(), items });
  };

  const claudePrompt = `Teach me the lesson “${ref.lesson.title}” from my Basalt course “${props.courseTitle}”, and write it into the lesson page.`;

  return (
    <article className="co-study">
      <nav className="co-crumbs" aria-label="Breadcrumb">
        <button type="button" className="btn btn-ghost btn-sm co-back" onClick={props.onBack}>
          ← Roadmap
        </button>
        <span className="co-crumb-sep">/</span>
        <span className="ellipsis">{ref.level.name}</span>
        <span className="co-crumb-sep">/</span>
        <span className="ellipsis">{ref.module.title}</span>
      </nav>

      <header className="co-study-head">
        <div className="co-study-kicker">
          Lesson {ref.index + 1} of {props.refs.length}
        </div>
        <h2 className="co-study-title" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(ref.lesson.title) }} />
        <div className="co-study-meta">
          <StatusBadge progress={progress} />
          {words > 0 && <span className="muted small">{Math.max(1, Math.round(words / 220))} min read</span>}
          <span className="spacer" />
          {lessonPageId && (
            <button type="button" className="btn btn-sm" onClick={() => app.openPage(lessonPageId)}>
              Open as page ↗
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={props.onAskTutor}>
            💬 Tutor
          </button>
          <button type="button" className="icon-btn" aria-label="Lesson options" onClick={showMenu}>
            ⋯
          </button>
        </div>
      </header>

      {/* Written lessons list their objectives themselves. */}
      {ref.lesson.objectives.length > 0 && !md.trim() && !writing && (
        <section className="co-objectives">
          <div className="co-objectives-title">By the end of this lesson you'll be able to</div>
          <ul>
            {ref.lesson.objectives.map((o, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(o) }} />
            ))}
          </ul>
        </section>
      )}

      <div ref={contentRef} className="co-study-content">
        {writing ? (
          <>
            <div className="co-gen-bar" role="status">
              <Dots />
              <span className="grow">
                {job.text ? `Writing your lesson… ${formatCount(wordCount(job.text))} words` : "Planning the lesson…"}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => cancelJob(jobKeys.lesson(pageId, lessonId))}>
                Cancel
              </button>
            </div>
            {job.text ? <Markdown md={job.text} streaming onWikiLink={openWiki} /> : <LessonSkeleton />}
          </>
        ) : md.trim() ? (
          <>
            {job?.status === "error" && <ErrorNote message={`Couldn't rewrite the lesson: ${job.error}`} onRetry={write} />}
            <Markdown md={md} onWikiLink={openWiki} />
          </>
        ) : (
          <div className="co-start">
            {job?.status === "error" && <ErrorNote message={job.error ?? "Something went wrong."} onRetry={write} />}
            {job?.status === "cancelled" && <div className="muted small">Cancelled. Start again whenever you're ready.</div>}
            {hasKey ? (
              <div className="co-start-card">
                <div className="co-start-icon" aria-hidden>
                  📘
                </div>
                <div className="co-start-title">Ready when you are</div>
                <p className="muted">
                  Claude will write this lesson for you: intuition first, precise definitions, worked examples, practice
                  questions with solutions, and flashcards for spaced repetition.
                </p>
                <div className="co-start-actions">
                  <button type="button" className="btn btn-primary btn-lg" onClick={write}>
                    Start lesson →
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => writeProgress(page, lessonId, { status: "skipped" })}>
                    I already know this
                  </button>
                </div>
              </div>
            ) : (
              <NoKeyPanel ws={ws} title="Connect Claude to write this lesson" claudePrompt={claudePrompt} />
            )}
          </div>
        )}
      </div>

      {!writing && md.trim() && (
        <QuizPanel
          ws={ws}
          page={page}
          pageId={pageId}
          lessonRef={ref}
          progress={progress}
          hasKey={hasKey}
          courseTitle={props.courseTitle}
          contentRef={contentRef}
          onNext={next ? () => props.onOpenLesson(next.lesson.id) : undefined}
          onAskTutor={props.onAskTutor}
        />
      )}

      <nav className="co-study-nav" aria-label="Lessons">
        {prev ? (
          <button type="button" className="co-navbtn" onClick={() => props.onOpenLesson(prev.lesson.id)}>
            <span className="faint small">← Previous</span>
            <span className="ellipsis">{prev.lesson.title}</span>
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button type="button" className="co-navbtn right" onClick={() => props.onOpenLesson(next.lesson.id)}>
            <span className="faint small">Next →</span>
            <span className="ellipsis">{next.lesson.title}</span>
          </button>
        )}
      </nav>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      {confirmRewrite && (
        <Modal
          title="Rewrite this lesson?"
          onClose={() => setConfirmRewrite(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirmRewrite(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setConfirmRewrite(false);
                  write();
                }}
              >
                Rewrite
              </button>
            </>
          }
        >
          <p className="muted" style={{ margin: 0 }}>
            Claude will write a fresh version and replace the lesson page's content, including any notes you added there.
            Your quiz history is kept.
          </p>
        </Modal>
      )}
    </article>
  );
}

function LessonSkeleton() {
  return (
    <div className="co-skeleton" aria-hidden>
      {[92, 100, 76, 0, 60, 100, 88, 94, 40].map((w, i) => (w ? <span key={i} style={{ width: `${w}%` }} /> : <br key={i} />))}
    </div>
  );
}

// ---- quiz --------------------------------------------------------------------------

/** Question sets that were already answered, so "Retake" asks new questions. */
const TAKEN = new WeakSet<object>();

function QuizPanel({
  ws,
  page,
  pageId,
  lessonRef: ref,
  progress,
  hasKey,
  courseTitle,
  contentRef,
  onNext,
  onAskTutor,
}: {
  ws: Workspace;
  page: Y.Map<any>;
  pageId: string;
  lessonRef: LessonRef;
  progress: LessonProgress;
  hasKey: boolean;
  courseTitle: string;
  contentRef: RefObject<HTMLDivElement | null>;
  onNext?: () => void;
  onAskTutor: () => void;
}) {
  const lessonId = ref.lesson.id;
  const quizKey = jobKeys.quiz(pageId, lessonId);
  const remedialKey = jobKeys.remedial(pageId, lessonId);
  const quizJob = useJob(quizKey);
  const remedialJob = useJob(remedialKey);
  const questions = quizJob?.status === "done" ? (quizJob.data as QuizQuestion[]) : null;
  const [phase, setPhase] = useState<"idle" | "taking" | "results">("idle");
  const [result, setResult] = useState<QuizResult | null>(null);
  const [resultQuestions, setResultQuestions] = useState<QuizQuestion[] | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Questions arriving (or already cached and untaken) start the quiz.
  const pending = useRef(false);
  useEffect(() => {
    if (pending.current && questions && !TAKEN.has(questions)) {
      pending.current = false;
      setPhase("taking");
      panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [questions]);

  const start = () => {
    setResult(null);
    if (questions && !TAKEN.has(questions)) {
      setPhase("taking");
      return;
    }
    pending.current = true;
    const avoid = [...(questions ?? []), ...(resultQuestions ?? [])].map((q) => q.question).slice(0, 16);
    clearJob(quizKey);
    void startQuiz(ws, pageId, lessonId, avoid);
  };

  const finish = (r: QuizResult) => {
    if (!questions) return;
    TAKEN.add(questions);
    setResult(r);
    setResultQuestions(questions);
    setPhase("results");
    const p = progressReader(page)(lessonId);
    writeProgress(page, lessonId, {
      quizzes: [...p.quizzes, { at: Date.now(), score: r.score }],
      mastery: Math.max(p.mastery, r.score),
      status: r.score >= MASTERY_THRESHOLD || p.status === "mastered" ? "mastered" : "in-progress",
    });
    clearJob(remedialKey);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const explainDifferently = () => {
    if (!result || !resultQuestions) return;
    const missed: MissedItem[] = resultQuestions
      .map((q, i) => ({ q, a: result.answers[i] }))
      .filter(({ a }) => !a || a.score < 0.99)
      .map(({ q, a }) => ({
        question: q.question,
        learnerAnswer:
          q.kind === "mc" ? (a?.choice !== undefined && a.choice >= 0 ? q.options[a.choice] : "I don't know") : a?.text || "(blank)",
        correctAnswer: q.kind === "mc" ? q.options[q.answer] : q.modelAnswer,
        explanation: a?.feedback ? `${q.explanation} Grader feedback: ${a.feedback}` : q.explanation,
        objective: q.objective,
      }));
    void startRemedial(ws, pageId, lessonId, missed);
  };

  const readAnotherAngle = () => {
    const headings = contentRef.current?.querySelectorAll("h2");
    const target = headings && [...headings].reverse().find((h) => /another angle/i.test(h.textContent ?? ""));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const attempts = progress.quizzes.length;
  const loading = quizJob?.status === "running";

  return (
    <section ref={panelRef} className="co-quizpanel" aria-label="Mastery quiz">
      {phase === "taking" && questions ? (
        <QuizRunner
          title="Mastery quiz"
          questions={questions}
          gradeShort={(q, answer, signal) => gradeShortAnswer(page, q, answer, signal)}
          onFinish={finish}
          onQuit={() => setPhase("idle")}
        />
      ) : phase === "results" && result && resultQuestions ? (
        <QuizResults
          questions={resultQuestions}
          result={result}
          actions={
            result.score >= MASTERY_THRESHOLD ? (
              <>
                {onNext && (
                  <button type="button" className="btn btn-primary" onClick={onNext}>
                    Next lesson →
                  </button>
                )}
                <button type="button" className="btn" disabled={!hasKey || loading} onClick={start}>
                  Retake quiz
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!hasKey || remedialJob?.status === "running" || remedialJob?.status === "done"}
                  onClick={explainDifferently}
                >
                  ✨ Explain it differently
                </button>
                <button type="button" className="btn" disabled={!hasKey || loading} onClick={start}>
                  {loading ? "Preparing…" : "Retake quiz"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={onAskTutor}>
                  💬 Work through it with the tutor
                </button>
              </>
            )
          }
        >
          {remedialJob?.status === "running" && (
            <div className="co-remedial">
              <div className="co-gen-bar" role="status">
                <Dots />
                <span className="grow">Finding another way to explain it…</span>
                <button type="button" className="btn btn-sm" onClick={() => cancelJob(remedialKey)}>
                  Cancel
                </button>
              </div>
              {remedialJob.text && <Markdown md={remedialJob.text} streaming />}
            </div>
          )}
          {remedialJob?.status === "done" && (
            <div className="co-remedial-done">
              <span>✓ Added a new explanation to the lesson under “Another angle”.</span>
              <button type="button" className="btn btn-sm" onClick={readAnotherAngle}>
                Read it
              </button>
            </div>
          )}
          {remedialJob?.status === "error" && <ErrorNote message={remedialJob.error ?? "Something went wrong."} onRetry={explainDifferently} />}
          {loading && (
            <div className="co-gen-bar" role="status">
              <Dots /> <span className="grow">Writing fresh questions…</span>
            </div>
          )}
        </QuizResults>
      ) : (
        <div className="co-quizcard">
          <div className="co-quizcard-icon" aria-hidden>
            {progress.status === "mastered" ? "🏆" : "✅"}
          </div>
          <div className="grow">
            <div className="co-quizcard-title">{progress.status === "mastered" ? "You've mastered this lesson" : "Check your mastery"}</div>
            <div className="muted small">
              6–8 questions · about 5 minutes · score {Math.round(MASTERY_THRESHOLD * 100)}% to master
              {attempts > 0 && ` · best ${Math.round(progress.mastery * 100)}% after ${attempts} attempt${attempts === 1 ? "" : "s"}`}
            </div>
          </div>
          {loading ? (
            <div className="row">
              <span className="spinner" />
              <span className="muted small">Writing questions…</span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  pending.current = false;
                  cancelJob(quizKey);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" disabled={!hasKey} onClick={start}>
              {attempts ? "Retake quiz" : "Start quiz"}
            </button>
          )}
        </div>
      )}
      {phase === "idle" && quizJob?.status === "error" && <ErrorNote message={quizJob.error ?? "Couldn't create the quiz."} onRetry={start} />}
      {!hasKey && phase === "idle" && (
        <NoKeyPanel
          ws={ws}
          compact
          title="Connect Claude to take quizzes"
          lead="Quizzes are written and graded by Claude."
          claudePrompt={`Quiz me on the lesson “${ref.lesson.title}” from my Basalt course “${courseTitle}”.`}
        />
      )}
    </section>
  );
}

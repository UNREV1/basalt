// The lesson player: full screen, one step at a time, like Brilliant. Every
// question gets instant feedback and an explanation; misses go to the error
// log (with why they happened); finishing a lesson earns XP in its skill,
// schedules spaced reviews, and lets Claude write the next lessons ahead.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurriculum, getProgress, allLessons, setProgress } from "../../../shared/course.ts";
import {
  explainMistake,
  logMistake,
  MISTAKE_WHY,
  recordReview,
  reviewSession,
  scheduleReview,
  type MistakeWhy,
} from "../../../shared/learning.ts";
import {
  getLessonContent,
  PHASE_LABEL,
  SKILL_LOOP,
  starsFor,
  SUBJECT_LOOP,
  type LessonStep,
  type Phase,
} from "../../../shared/lesson.ts";
import { isAspect, masteryCheck, masteryRound, PRACTICE_MASTERED, recordAttempt } from "../../../shared/mastery.ts";
import { displayTitle, getPage, pageMeta } from "../../../shared/model.ts";
import {
  abilityModifier,
  abilityScore,
  addXp,
  areaOf,
  computeSkillStats,
  formatModifier,
  getSkill,
  needsMasteryCheck,
  updateSkill,
  LESSON_MASTERED_XP,
  levelForXp,
  listSkills,
  logPractice,
  skillDone,
  totalXp,
  type Skill,
} from "../../../shared/skills.ts";
import { Icon } from "../../components/ui.tsx";
import type { Workspace } from "../../lib/workspace.ts";
import { TUTOR_ORIGIN } from "../course/model.ts";
import { Markdown } from "../tutor/ai-ui.tsx";
import { keepAhead } from "./plan.ts";
import { closePlayer, openCheck, openLesson, touchSession, usePlayer, type PlayerTarget } from "./player.ts";
import {
  answerTexts,
  ChoiceAnswer,
  initialAnswer,
  Inline,
  InputAnswer,
  isAnswered,
  isAnswerStep,
  isRight,
  MatchAnswer,
  OrderAnswer,
  PracticeView,
  SliderAnswer,
  solved,
  TeachView,
  type Answer,
  type PracticeState,
  type TeachState,
} from "./steps.tsx";
import { Figure, WidgetView } from "./widgets.tsx";
import "./lessons.css";

export function PlayerHost({ ws }: { ws: Workspace }) {
  const target = usePlayer();
  if (!target) return null;
  return <Player key={target.nonce} ws={ws} target={target} />;
}

interface SessionStep {
  step: LessonStep;
  courseId: string;
  lessonId: string;
  /** Its step number in its lesson, when it's something to master (see shared/mastery.ts). */
  index?: number;
  lessonTitle?: string;
}

interface Session {
  /** A whole lesson, a round of what it still needs mastered, a skill's mastery check, or a review. */
  kind: "lesson" | "round" | "check" | "review";
  title: string;
  subtitle: string;
  loop: Phase[] | null;
  steps: SessionStep[];
  review: boolean;
  skillId?: string;
}

/** Bonus XP for passing a skill's mastery check. */
const MASTERY_CHECK_XP = 50;

function buildSession(ws: Workspace, target: PlayerTarget): Session | null {
  if (target.mode === "check") {
    const skill = getSkill(ws.doc, target.skillId);
    const items = skill ? masteryCheck(ws.doc, skill.courseIds) : [];
    if (!skill || !items.length) return null;
    return {
      kind: "check",
      title: `Mastery check: ${skill.name}`,
      subtitle: `One question from each of its ${items.length} lesson${items.length === 1 ? "" : "s"}. Get every one right to master it`,
      loop: null,
      review: false,
      skillId: skill.id,
      steps: items.map((it) => ({ step: it.step, courseId: it.courseId, lessonId: it.lessonId, index: it.index, lessonTitle: it.lessonTitle })),
    };
  }
  if (target.mode === "review") {
    const items = reviewSession(ws.doc);
    if (!items.length) return null;
    return {
      kind: "review",
      title: "Review",
      subtitle: `${items.length} question${items.length === 1 ? "" : "s"} from lessons due for review`,
      loop: null,
      review: true,
      steps: items.map((it) => ({ step: { ...it.step, phase: "recall" as const }, courseId: it.courseId, lessonId: it.lessonId })),
    };
  }
  const page = getPage(ws.doc, target.courseId);
  const content = page ? getLessonContent(page, target.lessonId) : undefined;
  const c = page ? getCurriculum(page) : null;
  const ref = c ? allLessons(c).find((l) => l.lesson.id === target.lessonId) : undefined;
  if (!page || !content || !ref) return null;
  // Something still to master from before: a round of just that, each after its explanation.
  const toMaster = getProgress(page, target.lessonId).toMaster ?? [];
  const round = toMaster.length ? masteryRound(content.steps, toMaster) : [];
  if (round.some((r) => r.index !== undefined)) {
    const n = round.filter((r) => r.index !== undefined).length;
    return {
      kind: "round",
      title: ref.lesson.title,
      subtitle: `Master what you missed: ${n} to go`,
      loop: null,
      review: false,
      steps: round.map((r) => ({ step: r.step, courseId: target.courseId, lessonId: target.lessonId, index: r.index })),
    };
  }
  const skillLike = content.steps.some((s) => s.type === "practice");
  const hasPhases = content.steps.some((s) => s.phase);
  return {
    kind: "lesson",
    title: ref.lesson.title,
    subtitle: displayTitle(pageMeta(page)) || c!.topic,
    loop: hasPhases ? (skillLike ? SKILL_LOOP : SUBJECT_LOOP) : null,
    review: false,
    steps: content.steps.map((step, index) => ({ step, courseId: target.courseId, lessonId: target.lessonId, index })),
  };
}

type Status = "idle" | "right" | "wrong" | "shown";

const PRAISE = ["Correct!", "Exactly.", "Nice work.", "Spot on.", "That's it."];

function Player({ ws, target }: { ws: Workspace; target: PlayerTarget }) {
  const session = useMemo(() => buildSession(ws, target), [ws, target]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [attempts, setAttempts] = useState<Record<number, number>>({});
  const [firstTry, setFirstTry] = useState<Record<number, boolean>>({});
  const [missAt, setMissAt] = useState<Record<number, number>>({});
  const [why, setWhy] = useState<Record<number, MistakeWhy>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [teach, setTeach] = useState<Record<number, TeachState>>({});
  const [practice, setPractice] = useState<Record<number, PracticeState>>({});
  const [finished, setFinished] = useState<Result | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    touchSession();
    const prev = document.activeElement as HTMLElement | null;
    return () => prev?.focus?.();
  }, []);

  const total = session?.steps.length ?? 0;
  const cur = session?.steps[i];
  const step = cur?.step;
  const st: Status = status[i] ?? "idle";
  const answer = step && isAnswerStep(step) ? (answers[i] ?? initialAnswer(step)) : undefined;
  const setAnswer = (a: Answer) => {
    setAnswers((m) => ({ ...m, [i]: a }));
    if (st === "wrong") setStatus((m) => ({ ...m, [i]: "idle" }));
  };
  const teachState = teach[i] ?? { text: "", compared: false, covered: [] };
  const practiceState = practice[i] ?? { seconds: 0, running: false, done: false, rating: 0, change: "", focusHit: [] };
  const setTeachState = useCallback((s: TeachState) => setTeach((m) => ({ ...m, [i]: s })), [i]);
  const setPracticeState = useCallback((s: PracticeState) => setPractice((m) => ({ ...m, [i]: s })), [i]);

  const check = () => {
    if (!step || !isAnswerStep(step) || !answer || !isAnswered(answer)) return;
    const n = (attempts[i] ?? 0) + 1;
    setAttempts((m) => ({ ...m, [i]: n }));
    if (isRight(step, answer)) {
      setStatus((m) => ({ ...m, [i]: "right" }));
      if (n === 1) setFirstTry((m) => ({ ...m, [i]: true }));
      return;
    }
    if (n === 1) {
      // The error log: what was asked, what they said, and (next) why.
      const page = getPage(ws.doc, cur!.courseId);
      const at = Date.now();
      if (page) logMistake(page, { lessonId: cur!.lessonId, prompt: step.prompt, ...answerTexts(step, answer), at });
      setMissAt((m) => ({ ...m, [i]: at }));
    }
    if (n >= 2) show();
    else setStatus((m) => ({ ...m, [i]: "wrong" }));
  };
  const show = () => {
    if (!step || !isAnswerStep(step) || !answer) return;
    setAnswers((m) => ({ ...m, [i]: solved(step, answer) }));
    setStatus((m) => ({ ...m, [i]: "shown" }));
  };
  const noteWhy = (w: MistakeWhy) => {
    setWhy((m) => ({ ...m, [i]: w }));
    const page = cur ? getPage(ws.doc, cur.courseId) : undefined;
    if (page && step && isAnswerStep(step) && missAt[i]) explainMistake(page, missAt[i], step.prompt, w);
  };

  const next = () => {
    touchSession();
    if (i < total - 1) {
      setI(i + 1);
      bodyRef.current?.scrollTo({ top: 0 });
      return;
    }
    setFinished(finish(ws, target, session!, { firstTry, practice, teach }));
  };

  // What the big button does right now.
  let primary: { label: string; run: () => void; disabled?: boolean } = { label: "Continue", run: next };
  let secondary: { label: string; run: () => void } | null = null;
  if (step) {
    if (isAnswerStep(step)) {
      if (st === "idle") primary = { label: "Check", run: check, disabled: !answer || !isAnswered(answer) };
      else if (st === "wrong") {
        primary = { label: "Try again", run: () => setStatus((m) => ({ ...m, [i]: "idle" })) };
        secondary = { label: "Show answer", run: show };
      }
    } else if (step.type === "reveal" && !revealed[i]) {
      primary = { label: "Show answer", run: () => setRevealed((m) => ({ ...m, [i]: true })) };
    } else if (step.type === "teach" && !teachState.compared) {
      primary = { label: "Compare", run: () => setTeachState({ ...teachState, compared: true }), disabled: teachState.text.trim().length < 15 };
      secondary = { label: "I can't explain it yet", run: () => setTeachState({ ...teachState, compared: true }) };
    } else if (step.type === "practice" && !practiceState.done) {
      primary = { label: "Continue", run: next, disabled: true };
      secondary = { label: "Practise later", run: next };
    }
  }

  // Keyboard: Enter for the big button, number keys for options.
  useEffect(() => {
    if (finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closePlayer();
        return;
      }
      const t = e.target as HTMLElement;
      const typing = t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range");
      if (e.key === "Enter" && !typing && !e.defaultPrevented && !(t.tagName === "BUTTON" && t.closest(".lp-body"))) {
        if (!primary.disabled) {
          e.preventDefault();
          primary.run();
        }
      }
      if (!typing && step?.type === "choice" && st !== "right" && st !== "shown" && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key) - 1;
        if (n < step.options.length && answer?.kind === "choice") {
          const multi = step.answer.length > 1;
          const sel = multi ? (answer.selected.includes(n) ? answer.selected.filter((x) => x !== n) : [...answer.selected, n]) : [n];
          setAnswer({ kind: "choice", selected: sel });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!session) {
    return (
      <PlayerFrame onClose={closePlayer} progress={0} counter="">
        <div className="lp-empty">
          <h2>{target.mode === "review" ? "Nothing to review right now" : target.mode === "check" ? "Nothing to check yet" : "This lesson isn’t written yet"}</h2>
          <p>
            {target.mode === "review"
              ? "Lessons come back for review 1 day, 3 days, a week and a month after you finish them."
              : target.mode === "check"
                ? "The mastery check asks a question from each of the skill's lessons, once they're written."
                : "Claude writes lessons ahead of you; check back in a minute."}
          </p>
          <button className="btn btn-primary" onClick={closePlayer}>
            Back
          </button>
        </div>
      </PlayerFrame>
    );
  }

  if (finished) {
    return (
      <PlayerFrame onClose={closePlayer} progress={1} counter="">
        <Completion ws={ws} target={target} session={session} result={finished} />
      </PlayerFrame>
    );
  }

  const phase = step?.phase;
  return (
    <PlayerFrame
      onClose={closePlayer}
      progress={(i + (st === "right" || st === "shown" ? 1 : 0)) / total}
      counter={`${i + 1} / ${total}`}
      loop={session.loop}
      phase={phase}
    >
      <div className="lp-body" ref={bodyRef}>
        <div className="lp-column" key={i}>
          {i === 0 && (
            <div className="lp-lesson-head">
              <span>{session.subtitle}</span>
              <h1>{session.title}</h1>
            </div>
          )}
          {step && <Figure step={step} />}
          {step && <StepBody step={step} index={i} answer={answer} setAnswer={setAnswer} status={st} check={check} revealed={!!revealed[i]} teach={teachState} setTeach={setTeachState} practice={practiceState} setPractice={setPracticeState} />}
        </div>
      </div>
      <FeedbackBar
        step={step}
        status={st}
        attempts={attempts[i] ?? 0}
        why={why[i]}
        onWhy={missAt[i] ? noteWhy : undefined}
        primary={primary}
        secondary={secondary}
      />
    </PlayerFrame>
  );
}

function PlayerFrame({
  children,
  onClose,
  progress,
  counter,
  loop,
  phase,
}: {
  children: ReactNode;
  onClose: () => void;
  progress: number;
  counter: string;
  loop?: Phase[] | null;
  phase?: Phase;
}) {
  return (
    <div className="lp-root" role="dialog" aria-modal="true" aria-label="Lesson">
      <div className="lp-top">
        <button className="icon-btn lp-close" aria-label="Close lesson" onClick={onClose}>
          <Icon name="x" size={18} />
        </button>
        <div className="lp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.max(2, progress * 100)}%` }} />
        </div>
        <span className="lp-counter">{counter}</span>
      </div>
      {loop && (
        <div className="lp-loop" aria-label="Learning loop">
          {loop.map((p, n) => {
            const at = phase ? loop.indexOf(phase) : -1;
            return (
              <span key={p} className={`lp-loop-chip${p === phase ? " on" : n < at ? " done" : ""}`}>
                {PHASE_LABEL[p]}
              </span>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}

function StepBody({
  step,
  answer,
  setAnswer,
  status,
  check,
  revealed,
  teach,
  setTeach,
  practice,
  setPractice,
}: {
  step: LessonStep;
  index: number;
  answer: Answer | undefined;
  setAnswer: (a: Answer) => void;
  status: Status;
  check: () => void;
  revealed: boolean;
  teach: TeachState;
  setTeach: (s: TeachState) => void;
  practice: PracticeState;
  setPractice: (s: PracticeState) => void;
}) {
  const locked = status === "right" || status === "shown";
  const checked = status !== "idle";
  const [explore, setExplore] = useState(step.type === "explore" ? (step.start ?? step.min) : 0);
  switch (step.type) {
    case "explain":
      return (
        <div className="lp-text">
          {step.title && <h2>{step.title}</h2>}
          <Markdown md={step.body} />
        </div>
      );
    case "explore":
      return (
        <div className="lp-text">
          {step.title && <h2>{step.title}</h2>}
          <Markdown md={step.body} />
          <WidgetView w={step} value={explore} onChange={setExplore} />
        </div>
      );
    case "reveal":
      return (
        <div className="lp-text">
          <div className="lp-prompt">
            <Markdown md={step.prompt} />
          </div>
          {revealed ? (
            <div className="lp-revealed">
              <Markdown md={step.body} />
            </div>
          ) : (
            <p className="lp-think">Think about it first, then reveal the answer.</p>
          )}
        </div>
      );
    case "teach":
      return (
        <div className="lp-text">
          <div className="lp-kicker">Explain it in your own words</div>
          <div className="lp-prompt">
            <Markdown md={step.prompt} />
          </div>
          <TeachView step={step} state={teach} setState={setTeach} />
        </div>
      );
    case "practice":
      return (
        <div className="lp-text">
          <div className="lp-kicker">Practice · {step.minutes} min</div>
          <div className="lp-prompt">
            <Markdown md={step.prompt} />
          </div>
          <PracticeView step={step} state={practice} setState={setPractice} />
        </div>
      );
    default: {
      if (!answer) return null;
      return (
        <div className="lp-text">
          <div className="lp-prompt">
            <Markdown md={step.prompt} />
          </div>
          {step.type === "choice" && answer.kind === "choice" && <ChoiceAnswer step={step} answer={answer} setAnswer={setAnswer} locked={locked} checked={checked} />}
          {step.type === "input" && answer.kind === "input" && (
            <InputAnswer step={step} answer={answer} setAnswer={setAnswer} locked={locked} checked={checked} onSubmit={check} />
          )}
          {step.type === "slider" && answer.kind === "slider" && <SliderAnswer step={step} answer={answer} setAnswer={setAnswer} locked={locked} checked={checked} />}
          {step.type === "order" && answer.kind === "order" && <OrderAnswer step={step} answer={answer} setAnswer={setAnswer} locked={locked} checked={checked} />}
          {step.type === "match" && answer.kind === "match" && <MatchAnswer step={step} answer={answer} setAnswer={setAnswer} locked={locked} checked={checked} />}
        </div>
      );
    }
  }
}

function FeedbackBar({
  step,
  status,
  attempts,
  why,
  onWhy,
  primary,
  secondary,
}: {
  step: LessonStep | undefined;
  status: Status;
  attempts: number;
  why?: MistakeWhy;
  onWhy?: (w: MistakeWhy) => void;
  primary: { label: string; run: () => void; disabled?: boolean };
  secondary: { label: string; run: () => void } | null;
}) {
  const interactive = step && isAnswerStep(step);
  const tone = !interactive || status === "idle" ? "" : status === "right" ? " right" : status === "wrong" ? " wrong" : " shown";
  const praise = useMemo(() => PRAISE[Math.floor(Math.random() * PRAISE.length)], [status]);
  return (
    <div className={`lp-bottom${tone}`}>
      <div className="lp-bottom-inner">
        {interactive && status !== "idle" && (
          <div className="lp-feedback" role="status" aria-live="polite">
            <div className="lp-feedback-title">
              <Icon name={status === "right" ? "check" : status === "wrong" ? "x" : "eye"} size={18} stroke={2.6} />
              {status === "right" ? praise : status === "wrong" ? "Not quite." : "Here’s the answer."}
            </div>
            {status === "wrong" && (
              <div className="lp-feedback-text">
                {attempts === 1 && step.hint ? (
                  <>
                    <strong>Hint:</strong> <Inline md={step.hint} />
                  </>
                ) : (
                  "Have another look, then try again."
                )}
              </div>
            )}
            {(status === "right" || status === "shown") && step.explain && (
              <div className="lp-feedback-text">
                <Markdown md={step.explain} />
              </div>
            )}
            {status === "shown" && onWhy && (
              <div className="lp-why" role="radiogroup" aria-label="Why did you miss it?">
                <span>Why did you miss it?</span>
                {(Object.keys(MISTAKE_WHY) as MistakeWhy[]).map((w) => (
                  <button key={w} role="radio" aria-checked={why === w} className={`lp-why-chip${why === w ? " on" : ""}`} onClick={() => onWhy(w)}>
                    {MISTAKE_WHY[w]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="lp-actions">
          {secondary && (
            <button className="btn lp-secondary" onClick={secondary.run}>
              {secondary.label}
            </button>
          )}
          <button className="btn btn-primary lp-primary" disabled={primary.disabled} onClick={primary.run}>
            {primary.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- finishing ------------------------------------------------------------------------------------

interface Result {
  right: number;
  total: number;
  stars: 1 | 2 | 3;
  firstTime: boolean;
  skill: Skill | null;
  xpBefore: number;
  gained: number;
  practiceMinutes: number;
  minutesLearning: number;
  reviewed?: { right: number; total: number };
  /** Skills this lesson unlocked, and ones it finished learning (a lesson can complete a skill). */
  unlocked?: Skill[];
  learnt?: Skill[];
  /** A lesson: how many of its aspects are still to master (0: mastered). */
  toMaster?: number;
  /** Every lesson of this skill is mastered now: its mastery check is next. */
  checkReady?: Skill;
  /** The mastery check: passed, or the lessons it sent back to master (and where to start). */
  check?: { passed: boolean; missed: string[]; first?: { courseId: string; lessonId: string } };
}

function finish(
  ws: Workspace,
  target: PlayerTarget,
  session: Session,
  s: { firstTry: Record<number, boolean>; practice: Record<number, PracticeState>; teach: Record<number, TeachState> },
): Result {
  const doc = ws.doc;
  const answerIdx = session.steps.map((x, n) => (isAnswerStep(x.step) ? n : -1)).filter((n) => n >= 0);
  const right = answerIdx.filter((n) => s.firstTry[n]).length;
  const minutesLearning = touchSession();
  // Every aspect mastered? A question right first time, every key point covered, practice done and gone well.
  const gotIt = (n: number): boolean => {
    const step = session.steps[n].step;
    if (isAnswerStep(step)) return !!s.firstTry[n];
    if (step.type === "teach") {
      const t = s.teach[n];
      return !!t && t.compared && t.text.trim().length >= 15 && t.covered.length >= step.keyPoints.length;
    }
    if (step.type === "practice") {
      const p = s.practice[n];
      return !!p && p.done && p.rating >= PRACTICE_MASTERED && p.focusHit.length >= step.focus.length;
    }
    return true;
  };
  const aspectIdx = session.steps.map((x, n) => (x.index !== undefined && isAspect(x.step) ? n : -1)).filter((n) => n >= 0);
  if (target.mode === "review") {
    // Right first time: the next, longer interval. Wrong: back to tomorrow.
    let gained = 0;
    for (const n of answerIdx) {
      const { courseId, lessonId } = session.steps[n];
      const page = getPage(doc, courseId);
      if (!page) continue;
      recordReview(page, lessonId, !!s.firstTry[n]);
      const skill = listSkills(doc).find((k) => k.courseIds.includes(courseId));
      if (skill && s.firstTry[n]) {
        addXp(doc, skill.id, { amount: 10, source: "quiz", note: "Review" });
        gained += 10;
      }
    }
    return { right, total: answerIdx.length, stars: starsFor(right, answerIdx.length), firstTime: false, skill: null, xpBefore: 0, gained, practiceMinutes: 0, minutesLearning, reviewed: { right, total: answerIdx.length } };
  }
  // For the unlock moment: which skills were open, and learnt, before this counted.
  const statsBefore = computeSkillStats(doc);
  const skillsBefore = listSkills(doc);
  const learntBefore = new Set(skillsBefore.filter((k) => skillDone(doc, skillsBefore, k, statsBefore)).map((k) => k.id));
  const opened = () => {
    const statsAfter = computeSkillStats(doc);
    const skillsAfter = listSkills(doc);
    return {
      unlocked: skillsAfter.filter((k) => statsBefore.get(k.id)?.unlocked === false && statsAfter.get(k.id)?.unlocked),
      learnt: skillsAfter.filter((k) => !learntBefore.has(k.id) && skillDone(doc, skillsAfter, k, statsAfter)),
    };
  };

  if (target.mode === "check") {
    // One question from every lesson: all right, and the skill is mastered. A miss sends its lesson back.
    const skill = getSkill(doc, target.skillId) ?? null;
    const xpBefore = skill ? totalXp(doc, skill.id) : 0;
    const missed: string[] = [];
    let first: { courseId: string; lessonId: string } | undefined;
    doc.transact(() => {
      for (const n of aspectIdx) {
        if (gotIt(n)) continue;
        const x = session.steps[n];
        const page = getPage(doc, x.courseId);
        if (!page) continue;
        // A lesson you'd mastered goes back on the list for what you missed; one you hadn't
        // taken yet (testing out) you still take whole.
        const was = getProgress(page, x.lessonId).status;
        if (was === "mastered" || was === "skipped") recordAttempt(page, x.lessonId, [{ key: String(x.index), mastered: false }], { whole: false });
        first ??= { courseId: x.courseId, lessonId: x.lessonId };
        if (x.lessonTitle && !missed.includes(x.lessonTitle)) missed.push(x.lessonTitle);
      }
    }, TUTOR_ORIGIN);
    const passed = aspectIdx.length > 0 && aspectIdx.every(gotIt);
    if (skill && passed) {
      // Testing out: passed before every lesson was done, so the rest count as known already.
      doc.transact(() => {
        for (const courseId of skill.courseIds) {
          const page = getPage(doc, courseId);
          const c = page ? getCurriculum(page) : null;
          if (!page || !c) continue;
          for (const { lesson } of allLessons(c)) {
            const p = getProgress(page, lesson.id);
            if (p.status !== "mastered" && p.status !== "skipped") setProgress(page, lesson.id, { status: "skipped", toMaster: [] });
          }
        }
      }, TUTOR_ORIGIN);
      updateSkill(doc, skill.id, { masteredAt: Date.now() });
      addXp(doc, skill.id, { amount: MASTERY_CHECK_XP, source: "quiz", note: `Mastery check · ${skill.name}` });
    }
    const got = aspectIdx.filter(gotIt).length;
    return {
      right: got,
      total: aspectIdx.length,
      stars: starsFor(got, aspectIdx.length),
      firstTime: false,
      skill,
      xpBefore,
      gained: skill ? totalXp(doc, skill.id) - xpBefore : 0,
      practiceMinutes: 0,
      minutesLearning,
      check: { passed, missed, first },
      ...opened(),
    };
  }

  const page = getPage(doc, target.courseId)!;
  const score = answerIdx.length ? right / answerIdx.length : 1;
  const skill = listSkills(doc).find((k) => k.courseIds.includes(target.courseId)) ?? null;
  const xpBefore = skill ? totalXp(doc, skill.id) : 0;
  const outcomes = aspectIdx.map((n) => ({ key: String(session.steps[n].index), mastered: gotIt(n) }));
  let attempt!: ReturnType<typeof recordAttempt>;
  doc.transact(() => {
    attempt = recordAttempt(page, target.lessonId, outcomes, { whole: session.kind === "lesson", score });
  }, TUTOR_ORIGIN);
  if (attempt.firstTime) scheduleReview(page, target.lessonId);
  // Practice time: the timer if they used it, otherwise the planned minutes they said they practised.
  let practiceMinutes = 0;
  for (const [n, p] of Object.entries(s.practice)) {
    const step = session.steps[Number(n)]?.step;
    if (p.done && step?.type === "practice") practiceMinutes += p.seconds >= 60 ? Math.round(p.seconds / 60) : step.minutes;
  }
  if (skill && practiceMinutes) logPractice(doc, skill.id, practiceMinutes, `Practice · ${session.title}`);
  // Keep the next lessons (and the path) ready before the learner gets there.
  keepAhead(ws, target.courseId);
  const gained = skill ? totalXp(doc, skill.id) - xpBefore : attempt.firstTime ? LESSON_MASTERED_XP : 0;
  const now = skill ? getSkill(doc, skill.id) : undefined;
  return {
    right,
    total: answerIdx.length,
    stars: starsFor(right, answerIdx.length),
    firstTime: attempt.firstTime,
    skill,
    xpBefore,
    gained,
    practiceMinutes,
    minutesLearning,
    toMaster: attempt.toMaster.length,
    checkReady: now && needsMasteryCheck(doc, now) ? now : undefined,
    ...opened(),
  };
}

function Completion({ ws, target, session, result }: { ws: Workspace; target: PlayerTarget; session: Session; result: Result }) {
  const [roll, setRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState<number | null>(null);
  const [bonus, setBonus] = useState(0);
  const doc = ws.doc;
  const skill = result.skill;

  const rollD20 = () => {
    if (!skill || roll !== null || rolling !== null) return;
    let n = 0;
    const final = 1 + Math.floor(Math.random() * 20);
    const tick = () => {
      n++;
      if (n < 14) {
        setRolling(1 + Math.floor(Math.random() * 20));
        window.setTimeout(tick, 40 + n * 12);
      } else {
        setRolling(null);
        setRoll(final);
        const amount = final === 20 ? 40 : final;
        addXp(doc, skill.id, { amount, source: "lesson", note: `d20 bonus · ${session.title}` });
        setBonus(amount);
      }
    };
    tick();
  };

  const xpNow = skill ? totalXp(doc, skill.id) : 0;
  const levelBefore = levelForXp(result.xpBefore);
  const levelNow = levelForXp(xpNow);
  const area = skill ? areaOf(doc, skill) : null;
  // The ability's score from all its skills.
  const abilityXp = (extra: number) =>
    skill ? listSkills(doc).filter((k) => k.category === skill.category).reduce((sum, k) => sum + totalXp(doc, k.id), 0) - extra : 0;
  const scoreNow = abilityScore(levelForXp(abilityXp(0)));
  const scoreBefore = abilityScore(levelForXp(abilityXp(xpNow - result.xpBefore)));

  // The next lesson in the course, if there is one.
  const nextLesson = useMemo(() => {
    if (target.mode !== "lesson") return null;
    const page = getPage(doc, target.courseId);
    const c = page ? getCurriculum(page) : null;
    if (!page || !c) return null;
    const list = allLessons(c).map((l) => l.lesson);
    const at = list.findIndex((l) => l.id === target.lessonId);
    const n = list.slice(at + 1).find((l) => getProgress(page, l.id).status !== "mastered");
    return n ? { id: n.id, title: n.title, ready: !!getLessonContent(page, n.id) } : null;
  }, [doc, target]);

  const toMaster = result.toMaster ?? 0;
  const them = (n: number) => (n === 1 ? "it" : "them");
  const heading = result.reviewed
    ? "Review done"
    : result.check
      ? result.check.passed
        ? `${skill?.name ?? "Skill"} mastered`
        : "Not mastered yet"
      : toMaster
        ? "Almost there"
        : "Lesson mastered";
  const summary = result.reviewed
    ? `${result.right} of ${result.total} right on the first try. The ones you missed come back tomorrow; the rest move to a longer gap.`
    : result.check
      ? result.check.passed
        ? `All ${result.total} right: you've mastered every lesson of ${skill?.name ?? "it"}, and what comes next is open.`
        : `${result.right} of ${result.total} right. Still to master: ${result.check.missed.join(", ")}. Master ${them(result.check.missed.length)}, then take the check again.`
      : toMaster
        ? `${result.total ? `${result.right} of ${result.total} right first time. ` : ""}To master this lesson, get the ${toMaster === 1 ? "one" : toMaster} you missed right too: ${toMaster === 1 ? "it comes" : "they come"} back next, after the part that explains ${them(toMaster)}.`
        : result.checkReady
          ? `Every lesson of ${result.checkReady.name} mastered. Last step before moving on: the mastery check, one question from each lesson.`
          : result.total
            ? `${result.right} of ${result.total} right on the first try, and every part of it mastered.`
            : `Every part of “${session.title}” mastered.`;
  const breakDue = result.minutesLearning >= 25;
  return (
    <div className="lp-body">
      <div className="lp-column lp-done">
        <div className="lp-stars" aria-label={`${result.stars} of 3 stars`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={n <= result.stars ? "on" : ""}>
              <Icon name="star" size={40} stroke={n <= result.stars ? 0 : 1.6} />
            </span>
          ))}
        </div>
        <h1>{heading}</h1>
        <p className="lp-done-sub">{summary}</p>

        {!result.reviewed && skill && area && (
          <div className="lp-reward">
            <div className="lp-reward-row">
              <Icon name="bolt" size={16} />
              <span className="grow">
                {result.check ? "Mastery check" : result.firstTime ? "Lesson mastered" : toMaster ? "Lesson" : "Replay"} · {skill.icon} {skill.name}
              </span>
              <strong>+{Math.max(0, result.gained)} XP</strong>
            </div>
            {result.practiceMinutes > 0 && (
              <div className="lp-reward-row sub">
                <span className="grow">Including {result.practiceMinutes} min of practice</span>
              </div>
            )}
            {result.firstTime && (
              <div className="lp-reward-row">
                <Icon name="dice" size={16} />
                <span className="grow">
                  {roll === null ? (rolling !== null ? "Rolling…" : "Roll a d20 for bonus XP") : roll === 20 ? "Natural 20! Critical: double bonus" : roll === 1 ? "Natural 1. Better luck next time" : `You rolled ${roll}`}
                </span>
                {roll === null ? (
                  <button className={`btn btn-sm lp-d20${rolling !== null ? " rolling" : ""}`} onClick={rollD20} disabled={rolling !== null}>
                    {rolling ?? "d20"}
                  </button>
                ) : (
                  <strong>+{bonus} XP</strong>
                )}
              </div>
            )}
            <div className="lp-level">
              <span>
                {skill.name} · level {levelNow}
                {levelNow > levelBefore && <em> up from {levelBefore}!</em>}
              </span>
              <span>
                {area.attribute ?? area.name} {scoreNow} ({formatModifier(abilityModifier(scoreNow))})
                {scoreNow > scoreBefore && <em> +1 {area.attribute ?? area.name}!</em>}
              </span>
            </div>
          </div>
        )}
        {result.reviewed && result.gained > 0 && (
          <div className="lp-reward">
            <div className="lp-reward-row">
              <Icon name="bolt" size={16} />
              <span className="grow">Remembered</span>
              <strong>+{result.gained} XP</strong>
            </div>
          </div>
        )}

        {!!(result.learnt?.length || result.unlocked?.length) && (
          <div className="lp-unlocks" role="status">
            {result.learnt?.map((k) => (
              <div key={`l-${k.id}`} className="lp-unlock learnt">
                <Icon name="check" size={15} stroke={2.6} />
                <span className="grow">
                  <strong>Learnt:</strong> {k.name}
                </span>
              </div>
            ))}
            {result.unlocked?.map((k) => (
              <div key={`u-${k.id}`} className="lp-unlock">
                <Icon name="unlock" size={15} />
                <span className="grow">
                  <strong>Unlocked:</strong> {k.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {breakDue && (
          <div className="lp-break">
            <Icon name="clock" size={16} /> You’ve been learning for {Math.round(result.minutesLearning)} minutes. A 5-minute break now helps it stick.
          </div>
        )}

        <div className="lp-done-actions">
          {toMaster > 0 && target.mode === "lesson" && (
            <button className="btn btn-primary" onClick={() => openLesson(target.courseId, target.lessonId)}>
              Master the {toMaster === 1 ? "one" : toMaster} you missed
            </button>
          )}
          {result.check && !result.check.passed && result.check.first && (
            <button className="btn btn-primary" onClick={() => openLesson(result.check!.first!.courseId, result.check!.first!.lessonId)}>
              Master what you missed
            </button>
          )}
          {result.checkReady && (
            <button className="btn btn-primary" onClick={() => openCheck(result.checkReady!.id)}>
              Take the mastery check
            </button>
          )}
          {!toMaster && !result.checkReady && nextLesson?.ready && (
            <button className="btn btn-primary" onClick={() => openLesson((target as { courseId: string }).courseId, nextLesson.id)}>
              Next: {nextLesson.title}
            </button>
          )}
          {!toMaster && !result.checkReady && nextLesson && !nextLesson.ready && <p className="lp-done-sub">Claude is preparing “{nextLesson.title}”.</p>}
          <button className={`btn${nextLesson?.ready || toMaster || result.checkReady || result.check?.first ? "" : " btn-primary"}`} onClick={closePlayer}>
            {target.mode === "lesson" ? "Back to the course" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

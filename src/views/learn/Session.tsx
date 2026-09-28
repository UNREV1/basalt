// A focused review session: one card at a time, reveal, rate, undo, and a
// summary at the end. Cram sessions reuse the same UI but never write state.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "../../../shared/flashcards.ts";
import { defaultIcon, displayTitle, type PageMeta } from "../../../shared/model.ts";
import {
  MINUTE,
  RATING_LABELS,
  endOfDay,
  formatInterval,
  previewIntervals,
  schedule,
  type CardState,
  type Rating,
} from "../../../shared/srs.ts";
import { cardFaces } from "./faces.ts";
import { IconCheck, IconPause, IconPencil, IconShuffle, IconUndo, IconX } from "./icons.tsx";
import type { LearnerStore, LearningItem, Queue, QueueItem, QueueKind } from "./store.ts";

/** Show learning cards up to this far ahead when nothing else is left. */
const LEARN_AHEAD = 20 * MINUTE;
/** Per-card time is capped so a card left open doesn't skew stats. */
const MAX_CARD_MS = 60_000;

interface AnswerLog {
  card: Card;
  rating: Rating;
  ms: number;
  kind: QueueKind;
}

interface SessionState {
  main: QueueItem[];
  learning: LearningItem[];
  current: QueueItem | null;
  revealed: boolean;
  shownAt: number;
  finished: number;
  total: number;
  log: AnswerLog[];
  lastId?: string;
  ended: boolean;
}

interface UndoEntry {
  before: SessionState;
  write?: { cardId: string; prev: CardState | undefined; at: number };
}

function pickNext(s: SessionState, now: number): SessionState {
  const learning = [...s.learning].sort((a, b) => a.due - b.due);
  const take = (i: number): SessionState => {
    const [l] = learning.splice(i, 1);
    return { ...s, learning, current: { card: l.card, kind: "learning" }, revealed: false, shownAt: now };
  };
  // Don't show the card that was just answered again right away if anything else is waiting.
  const others = s.main.length > 0 || learning.length > 1;
  let i = learning.findIndex((l) => l.due <= now && !(others && l.card.id === s.lastId));
  if (i >= 0) return take(i);
  if (s.main.length) {
    const [head, ...rest] = s.main;
    return { ...s, main: rest, learning, current: head, revealed: false, shownAt: now };
  }
  i = learning.findIndex((l) => l.due <= now + LEARN_AHEAD);
  if (i >= 0) return take(i);
  return { ...s, learning, current: null, revealed: false };
}

export interface SessionProps {
  store: LearnerStore;
  queue: Queue;
  cram: boolean;
  /** Title shown in the header: deck name or "All decks". */
  scopeLabel: string;
  pageIndex: Map<string, PageMeta>;
  /** Evaluated when the summary renders, so it reflects the answers just given. */
  outlook: () => SessionOutlook;
  onOpenPage: (pageId: string) => void;
  onExit: () => void;
  onRestart: (opts: { cram?: boolean; extraNew?: number }) => void;
}

export interface SessionOutlook {
  /** Reviews due tomorrow. */
  dueTomorrow: number;
  /** Would a new session have anything in it? */
  moreAvailable: boolean;
  /** New cards remain but today's new-card limit is used up. */
  newLimitHit: boolean;
}

export function Session(props: SessionProps) {
  const { store, cram } = props;
  const [state, setState] = useState<SessionState>(() => {
    const now = Date.now();
    const unique = new Set([...props.queue.main.map((q) => q.card.id), ...props.queue.learning.map((l) => l.card.id)]);
    return pickNext(
      {
        main: props.queue.main,
        learning: props.queue.learning,
        current: null,
        revealed: false,
        shownAt: now,
        finished: 0,
        total: unique.size,
        log: [],
        ended: false,
      },
      now,
    );
  });
  // Latest state for event handlers; updated eagerly so a double tap can't rate one card twice.
  const stateRef = useRef(state);
  stateRef.current = state;
  const commit = (next: SessionState) => {
    stateRef.current = next;
    setState(next);
  };
  const history = useRef<UndoEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  // Learning steps become due while the summary/session is open.
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const current = state.current;
  const faces = useMemo(() => (current ? cardFaces(current.card) : null), [current]);
  const previews = useMemo(() => {
    if (!current || !state.revealed || cram) return null;
    return previewIntervals(store.states.get(current.card.id), Date.now(), { seed: current.card.id });
  }, [current, state.revealed, cram, store]);

  const reveal = () => {
    const s = stateRef.current;
    if (s.current && !s.revealed) commit({ ...s, revealed: true });
  };

  const answer = (rating: Rating) => {
    const s = stateRef.current;
    if (!s.current || !s.revealed) return;
    const now = Date.now();
    const item = s.current;
    const ms = Math.min(MAX_CARD_MS, Math.max(0, now - s.shownAt));
    const log = [...s.log, { card: item.card, rating, ms, kind: item.kind }];
    let next: SessionState;
    let write: UndoEntry["write"];
    if (cram) {
      const main = [...s.main];
      let finished = s.finished;
      if (rating === 1) main.splice(Math.min(3, main.length), 0, item);
      else if (rating === 2) main.splice(Math.min(8, main.length), 0, item);
      else finished++;
      next = { ...s, main, finished, log, lastId: item.card.id, current: null };
    } else {
      const prev = store.states.get(item.card.id);
      const updated = schedule(prev, rating, now, { seed: item.card.id });
      store.writeReview(item.card.id, updated, now);
      write = { cardId: item.card.id, prev, at: now };
      const again = (updated.state === "learning" || updated.state === "relearning") && updated.due < endOfDay(now);
      next = {
        ...s,
        learning: again ? [...s.learning, { card: item.card, due: updated.due }] : s.learning,
        finished: again ? s.finished : s.finished + 1,
        log,
        lastId: item.card.id,
        current: null,
      };
    }
    history.current.push({ before: s, write });
    setCanUndo(true);
    commit(pickNext(next, now));
  };

  const undo = () => {
    const entry = history.current.pop();
    if (!entry) return;
    if (entry.write) store.undoReview(entry.write.cardId, entry.write.prev, entry.write.at);
    commit({ ...entry.before, revealed: false, shownAt: Date.now(), ended: false });
    setCanUndo(history.current.length > 0);
  };

  const end = () => {
    const s = stateRef.current;
    if (!s.log.length) props.onExit();
    else commit({ ...s, ended: true });
  };

  const resume = () => {
    const s = stateRef.current;
    // A paused session keeps its current card; a finished one picks up learning cards that came due.
    if (s.current) commit({ ...s, ended: false, revealed: false, shownAt: Date.now() });
    else commit(pickNext({ ...s, ended: false }, Date.now()));
  };

  const done = state.ended || !current;
  const pendingLearning = state.learning.length + (current?.kind === "learning" ? 1 : 0);

  // Keyboard: Space/Enter reveal (then Good), 1-4 rate, Ctrl/Cmd+Z undo, E edit, Esc end.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (done) {
      if (e.key === "Escape") props.onExit();
      return;
    }
    if (e.key === " " || e.key === "Enter") {
      if ((e.target as HTMLElement | null)?.tagName === "BUTTON" && e.key === "Enter") return;
      e.preventDefault();
      if (state.revealed) answer(3);
      else reveal();
    } else if (state.revealed && ["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      answer(Number(e.key) as Rating);
    } else if (e.key === "e" || e.key === "E") {
      if (current) props.onOpenPage(current.card.pageId);
    } else if (e.key === "Escape") {
      end();
    }
  };
  useEffect(() => {
    const fn = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // Keep the revealed answer in view on small screens.
  const backRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.revealed) backRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.revealed]);

  const count = (k: QueueKind) =>
    state.main.filter((q) => q.kind === k).length + (current?.kind === k && !done ? 1 : 0);
  const progress = state.total ? Math.min(1, state.finished / state.total) : 1;

  if (done) {
    return (
      <Summary
        state={state}
        canUndo={canUndo}
        onUndo={undo}
        pendingLearning={pendingLearning}
        nextLearningDue={state.learning.length ? Math.min(...state.learning.map((l) => l.due)) : null}
        now={clock}
        {...props}
        onResume={resume}
      />
    );
  }

  const page = props.pageIndex.get(current!.card.pageId);
  const card = current!.card;
  const kindLabel = cram ? "Cram" : current!.kind === "new" ? "New" : current!.kind === "learning" ? "Learning" : "Review";

  return (
    <div className="learn-session">
      <div className="learn-session-top">
        <button className="icon-btn" onClick={end} aria-label="End session" title="End session (Esc)">
          <IconX />
        </button>
        <div className="learn-session-scope ellipsis">
          {cram && <IconShuffle size={14} />}
          {props.scopeLabel}
        </div>
        <div
          className="learn-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={state.total}
          aria-valuenow={state.finished}
          aria-label="Session progress"
        >
          <div className="learn-progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>
        {cram ? (
          <div className="learn-counts" aria-label="Cards left">
            <span className="learn-count">{state.main.length + 1} left</span>
          </div>
        ) : (
          <div className="learn-counts">
            <span className={`learn-count c-new${current!.kind === "new" ? " active" : ""}`} title="New">
              <i />
              {count("new")}
            </span>
            <span className={`learn-count c-learning${current!.kind === "learning" ? " active" : ""}`} title="Learning">
              <i />
              {state.learning.length + (current!.kind === "learning" ? 1 : 0)}
            </span>
            <span className={`learn-count c-review${current!.kind === "review" ? " active" : ""}`} title="To review">
              <i />
              {count("review")}
            </span>
          </div>
        )}
        <button
          className="icon-btn"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo last answer"
          title="Undo last answer (Ctrl/⌘ Z)"
        >
          <IconUndo />
        </button>
      </div>

      <div className="learn-stage" key={`${card.id}:${state.log.length}`}>
        <div className="learn-card-meta">
          <span className={`learn-kind k-${cram ? "cram" : current!.kind}`}>{kindLabel}</span>
          {card.context && <span className="learn-context ellipsis">{card.context}</span>}
        </div>
        <div
          className={`learn-face learn-front${faces!.replaceOnReveal && state.revealed ? " is-hidden" : ""}`}
          dangerouslySetInnerHTML={{ __html: faces!.front }}
        />
        {state.revealed && (
          <div ref={backRef} className="learn-answer">
            {!faces!.replaceOnReveal && <hr className="learn-divider" />}
            <div
              className={`learn-face ${faces!.replaceOnReveal ? "learn-front" : "learn-back"}`}
              dangerouslySetInnerHTML={{ __html: faces!.back }}
            />
          </div>
        )}
        <div className="learn-source">
          <button className="learn-chip" onClick={() => props.onOpenPage(card.pageId)} title="Open source page">
            <span>{page?.icon || defaultIcon(page?.kind ?? "doc")}</span>
            <span className="ellipsis">{page ? displayTitle(page) : "Unknown page"}</span>
          </button>
          <button className="btn btn-ghost btn-sm learn-edit" onClick={() => props.onOpenPage(card.pageId)} title="Edit card (E)">
            <IconPencil size={14} /> Edit
          </button>
        </div>
      </div>

      <div className="learn-actions">
        {!state.revealed ? (
          <button className="learn-show" onClick={reveal} autoFocus>
            Show answer
            <span className="kbd learn-key">Space</span>
          </button>
        ) : (
          <div className="learn-ratings" role="group" aria-label="How well did you remember?">
            {([1, 2, 3, 4] as Rating[]).map((g) => (
              <button key={g} className={`learn-rate r-${g}`} onClick={() => answer(g)}>
                <span className="learn-rate-ivl">
                  {cram ? (g === 1 ? "soon" : g === 2 ? "later" : "done") : previews ? formatInterval(previews[g]) : ""}
                </span>
                <span className="learn-rate-label">{RATING_LABELS[g]}</span>
                <span className="kbd learn-key">{g}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- summary ------------------------------------------------------------------------------

const RATING_CLASS: Record<Rating, string> = { 1: "r-1", 2: "r-2", 3: "r-3", 4: "r-4" };

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function Summary(
  props: SessionProps & {
    state: SessionState;
    canUndo: boolean;
    onUndo: () => void;
    onResume: () => void;
    pendingLearning: number;
    nextLearningDue: number | null;
    now: number;
  },
) {
  const { state, cram } = props;
  const log = state.log;
  const time = log.reduce((a, l) => a + l.ms, 0);
  const counts: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const l of log) counts[l.rating]++;
  const unique = new Set(log.map((l) => l.card.id)).size;
  const newLearned = new Set(log.filter((l) => l.kind === "new").map((l) => l.card.id)).size;
  const correct = log.length ? Math.round(((log.length - counts[1]) / log.length) * 100) : 0;
  const missed: Card[] = [];
  const seen = new Set<string>();
  for (const l of log) {
    if (l.rating === 1 && !seen.has(l.card.id)) {
      seen.add(l.card.id);
      missed.push(l.card);
    }
  }
  const outlook = props.outlook();
  const learningReady = props.nextLearningDue !== null && props.nextLearningDue <= props.now + LEARN_AHEAD;
  const leftInQueue = state.main.length + (state.current ? 1 : 0);
  const finishedAll = !state.ended || (leftInQueue === 0 && !learningReady);

  return (
    <div className="learn-summary">
      <div className={`learn-summary-badge${finishedAll ? "" : " paused"}`} aria-hidden>
        {finishedAll ? <IconCheck size={28} /> : <IconPause size={26} />}
      </div>
      <h2>{finishedAll ? (cram ? "Cram session complete" : "Session complete") : "Session paused"}</h2>
      <p className="muted">
        {log.length
          ? `You went through ${unique} card${unique === 1 ? "" : "s"} in ${formatDuration(time)}.`
          : "Nothing was reviewed."}
        {cram && " Cramming doesn’t change your schedule."}
      </p>

      {log.length > 0 && (
        <>
          <div className="learn-summary-stats">
            <div>
              <span className="learn-stat-value">{log.length}</span>
              <span className="learn-stat-label">Answers</span>
            </div>
            <div>
              <span className="learn-stat-value">{correct}%</span>
              <span className="learn-stat-label">Remembered</span>
            </div>
            {cram ? (
              <div>
                <span className="learn-stat-value">{leftInQueue}</span>
                <span className="learn-stat-label">Still to cram</span>
              </div>
            ) : (
              <div>
                <span className="learn-stat-value">{newLearned}</span>
                <span className="learn-stat-label">New cards</span>
              </div>
            )}
            <div>
              <span className="learn-stat-value">{log.length ? formatDuration(time / log.length) : "–"}</span>
              <span className="learn-stat-label">Per answer</span>
            </div>
          </div>

          <div className="learn-dist" aria-label="Answers by rating">
            <div className="learn-dist-bar">
              {([1, 2, 3, 4] as Rating[])
                .filter((g) => counts[g] > 0)
                .map((g) => (
                  <span
                    key={g}
                    className={`learn-dist-seg ${RATING_CLASS[g]}`}
                    style={{ flexGrow: counts[g] }}
                    title={`${RATING_LABELS[g]}: ${counts[g]}`}
                  />
                ))}
            </div>
            <div className="learn-dist-legend">
              {([1, 2, 3, 4] as Rating[]).map((g) => (
                <span key={g} className="learn-dist-key">
                  <i className={RATING_CLASS[g]} />
                  {RATING_LABELS[g]} <strong>{counts[g]}</strong>
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="learn-summary-next">
        {!cram && props.pendingLearning > 0 && props.nextLearningDue !== null && (
          <div>
            {props.pendingLearning} card{props.pendingLearning === 1 ? " is" : "s are"} still in learning
            {learningReady
              ? " and ready now."
              : ` — next one ${formatInterval(Math.max(0, props.nextLearningDue - props.now))} from now.`}
          </div>
        )}
        {!cram && (
          <div>
            {outlook.dueTomorrow
              ? `${outlook.dueTomorrow} review${outlook.dueTomorrow === 1 ? "" : "s"} due tomorrow.`
              : "Nothing is due tomorrow yet."}
          </div>
        )}
      </div>

      {missed.length > 0 && (
        <div className="learn-missed">
          <div className="learn-section-label">Worth another look</div>
          {missed.slice(0, 6).map((c) => {
            const f = cardFaces(c);
            return (
              <button key={c.id} className="learn-missed-row" onClick={() => props.onOpenPage(c.pageId)} title="Open source page">
                <span className="learn-missed-front" dangerouslySetInnerHTML={{ __html: f.replaceOnReveal ? f.back : f.front }} />
                {!f.replaceOnReveal && <span className="learn-missed-back" dangerouslySetInnerHTML={{ __html: f.back }} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="learn-summary-actions">
        {props.canUndo && (
          <button className="btn" onClick={props.onUndo} title="Undo last answer (Ctrl/⌘ Z)">
            <IconUndo size={14} /> Undo
          </button>
        )}
        {(leftInQueue > 0 || learningReady) && (
          <button className="btn" onClick={props.onResume}>
            Continue ({leftInQueue + (learningReady ? props.pendingLearning : 0)})
          </button>
        )}
        {!cram && leftInQueue === 0 && !learningReady && outlook.moreAvailable && (
          <button className="btn" onClick={() => props.onRestart({})}>
            Study more
          </button>
        )}
        {!cram && leftInQueue === 0 && !learningReady && outlook.newLimitHit && !outlook.moreAvailable && (
          <button className="btn" onClick={() => props.onRestart({ extraNew: 10 })}>
            Learn 10 more new cards
          </button>
        )}
        <button className="btn btn-primary" onClick={props.onExit} autoFocus>
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

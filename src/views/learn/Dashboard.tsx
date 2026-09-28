// Study dashboard: today's numbers, activity, forecast and decks.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Card } from "../../../shared/flashcards.ts";
import { defaultIcon, displayTitle, type PageMeta } from "../../../shared/model.ts";
import { dayNumber, endOfDay, formatInterval, retrievability, type CardState } from "../../../shared/srs.ts";
import { ForecastChart, ReviewHeatmap } from "./charts.tsx";
import { cardFaces } from "./faces.ts";
import {
  IconChevronLeft,
  IconFlame,
  IconMore,
  IconOpen,
  IconPlay,
  IconShuffle,
  IconSliders,
  IconSparkles,
} from "./icons.tsx";
import {
  averageRetention,
  bucketOf,
  countCards,
  dayUsage,
  deckSummaries,
  forecast,
  limitsFor,
  streaks,
  studyCounts,
  type DeckSummary,
  type LearnSettings,
} from "./store.ts";
import { SyntaxGuide } from "./SyntaxGuide.tsx";

export interface DashboardProps {
  cards: Card[];
  states: Map<string, CardState>;
  stats: Map<string, number>;
  now: number;
  settings: LearnSettings;
  extraNew: number;
  deckId?: string;
  pageIndex: Map<string, PageMeta>;
  onDeck: (pageId: string | undefined) => void;
  onStudy: (opts: { deckId?: string; cram?: boolean }) => void;
  onOpenPage: (pageId: string) => void;
  onGenerate: (pageId?: string) => void;
  onSettings: () => void;
  onExample: () => void;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/** "tomorrow", "on Friday", "in 12d" */
function relativeDay(ts: number, now: number): string {
  const days = dayNumber(ts) - dayNumber(now);
  if (days <= 0) return `in ${formatInterval(ts - now)}`;
  if (days === 1) return "tomorrow";
  if (days < 7) return `on ${new Date(ts).toLocaleDateString(undefined, { weekday: "long" })}`;
  return `in ${formatInterval(ts - now)}`;
}

function estimateMinutes(review: number, fresh: number, learning: number): number {
  // Typical answer times: ~8 s per review, ~20 s per new card (it comes back a couple of times).
  return Math.max(1, Math.round((review * 8 + fresh * 20 + learning * 8) / 60));
}

export function Dashboard(props: DashboardProps) {
  const { cards, states, stats, now, settings, deckId, pageIndex } = props;
  const deck = deckId ? pageIndex.get(deckId) : undefined;
  const scoped = useMemo(() => (deckId ? cards.filter((c) => c.pageId === deckId) : cards), [cards, deckId]);

  const data = useMemo(() => {
    const counts = countCards(scoped, states, now);
    const limits = limitsFor(settings, dayUsage(states, now), props.extraNew);
    const study = studyCounts(counts, limits);
    let nextDue: number | null = null;
    for (const c of scoped) {
      const s = states.get(c.id);
      if (s && s.state !== "new" && s.due > now && (nextDue === null || s.due < nextDue)) nextDue = s.due;
    }
    return {
      counts,
      limits,
      study,
      nextDue,
      retention: averageRetention(scoped, states, now),
      streak: streaks(stats, now),
      forecast: forecast(scoped, states, now, 7),
      decks: deckId ? [] : deckSummaries(cards, states, now),
    };
  }, [scoped, cards, states, stats, now, settings, props.extraNew, deckId]);

  const { counts, study } = data;
  const empty = cards.length === 0;

  let subtitle: string;
  if (!scoped.length) subtitle = deck ? "This page has no flashcards yet." : "Spaced repetition for the cards in your notes.";
  else if (study.total > 0)
    subtitle = `${plural(study.total, "card")} to study now · about ${estimateMinutes(study.review, study.new, study.learningNow)} min`;
  else if (data.nextDue !== null)
    subtitle =
      data.nextDue < endOfDay(now) && counts.learning > 0
        ? `All caught up. Cards in learning return in ${formatInterval(data.nextDue - now)}.`
        : `All caught up. Next review ${relativeDay(data.nextDue, now)}.`;
  else subtitle = "All caught up.";

  const studyLabel = deck ? "Study deck" : "Study all";

  return (
    <div className="page-column learn-dashboard">
      <header className="view-header learn-header">
        <div className="learn-title grow">
          {deck && (
            <button className="learn-backlink" onClick={() => props.onDeck(undefined)}>
              <IconChevronLeft size={14} /> All decks
            </button>
          )}
          <h1 className="ellipsis">
            {deck ? (
              <>
                <span className="learn-title-icon">{deck.icon || defaultIcon(deck.kind)}</span>
                {displayTitle(deck)}
              </>
            ) : (
              "Learn"
            )}
          </h1>
          <p className="learn-subtitle">{subtitle}</p>
        </div>
        <div className="learn-header-actions">
          <button className="btn btn-ghost" onClick={() => props.onGenerate(deckId)} title="Generate cards from a page with Claude">
            <IconSparkles /> <span className="learn-hide-sm">Generate</span>
          </button>
          <button className="icon-btn learn-icon-lg" onClick={props.onSettings} title="Study settings" aria-label="Study settings">
            <IconSliders />
          </button>
          {!empty && (
            <button
              className="btn btn-primary btn-lg learn-study-btn"
              disabled={study.total === 0}
              onClick={() => props.onStudy({ deckId })}
            >
              <IconPlay size={14} /> {studyLabel}
              {study.total > 0 && <span className="learn-btn-count">{study.total}</span>}
            </button>
          )}
        </div>
      </header>

      {empty ? (
        <EmptyState onExample={props.onExample} onGenerate={() => props.onGenerate()} />
      ) : !scoped.length ? (
        <div className="learn-deck-empty card">
          <p>
            Add cards to this page by writing lines like <code>Question :: Answer</code> or{" "}
            <code>{"The {{c1::answer}} in context"}</code>.
          </p>
          <div className="row wrap">
            <button className="btn" onClick={() => deckId && props.onOpenPage(deckId)}>
              <IconOpen size={14} /> Open page
            </button>
            <button className="btn" onClick={() => props.onGenerate(deckId)}>
              <IconSparkles size={14} /> Generate with Claude
            </button>
          </div>
          <SyntaxGuide compact />
        </div>
      ) : (
        <>
          <section className="learn-stats" aria-label="Today">
            <Stat
              label="Due now"
              value={study.review + study.learningNow}
              tone="due"
              sub={
                counts.review > study.review
                  ? `+${(counts.review - study.review).toLocaleString()} over daily limit`
                  : counts.learning
                    ? `${counts.learning} in learning`
                    : "reviews for today"
              }
            />
            <Stat
              label="New today"
              value={study.new}
              tone="new"
              sub={counts.new > study.new ? `${counts.new.toLocaleString()} unseen in total` : plural(counts.new, "unseen card")}
            />
            <Stat label="Learned" value={counts.learned} sub={`of ${plural(counts.total, "card")}`} />
            <Stat
              label="Streak"
              value={data.streak.current}
              unit={data.streak.current === 1 ? "day" : "days"}
              icon={data.streak.current > 0 ? <IconFlame size={16} /> : undefined}
              sub={data.streak.best > data.streak.current ? `best ${data.streak.best}` : data.streak.current ? "personal best" : "starts today"}
            />
            <Stat
              label="Retention"
              value={data.retention === null ? "–" : `${Math.round(data.retention * 100)}%`}
              sub="recall estimate"
            />
          </section>

          <section className="learn-charts">
            <div className="card learn-chart-card">
              <div className="learn-card-title">
                Activity
                <span className="faint small">last 120 days{deck ? " · all decks" : ""}</span>
              </div>
              <ReviewHeatmap stats={stats} now={now} />
            </div>
            <div className="card learn-chart-card">
              <div className="learn-card-title">
                Upcoming reviews
                <span className="faint small">next 7 days</span>
              </div>
              <ForecastChart values={data.forecast} now={now} />
            </div>
          </section>

          {deck ? (
            <CardList cards={scoped} states={states} now={now} onOpen={() => props.onOpenPage(deck.id)} onCram={() => props.onStudy({ deckId, cram: true })} />
          ) : (
            <DeckList
              decks={data.decks}
              pageIndex={pageIndex}
              limits={data.limits}
              onDeck={props.onDeck}
              onStudy={props.onStudy}
              onOpenPage={props.onOpenPage}
              onGenerate={props.onGenerate}
            />
          )}

          <details className="learn-howto">
            <summary>How to write flashcards</summary>
            <SyntaxGuide compact />
          </details>
        </>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: number | string; sub?: string; tone?: "due" | "new"; unit?: string; icon?: ReactNode }) {
  return (
    <div className={`learn-stat${props.tone ? ` tone-${props.tone}` : ""}`}>
      <span className="learn-stat-label">
        {props.tone && <i className="learn-dot" />}
        {props.label}
      </span>
      <span className="learn-stat-value">
        {typeof props.value === "number" ? props.value.toLocaleString() : props.value}
        {props.unit && <span className="learn-stat-unit">{props.unit}</span>}
        {props.icon && <span className="learn-stat-icon">{props.icon}</span>}
      </span>
      {props.sub && <span className="learn-stat-sub">{props.sub}</span>}
    </div>
  );
}

// ---- decks ---------------------------------------------------------------------------------------

function DeckList(props: {
  decks: DeckSummary[];
  pageIndex: Map<string, PageMeta>;
  limits: { newLeft: number; reviewLeft: number };
  onDeck: (id: string) => void;
  onStudy: (opts: { deckId?: string; cram?: boolean }) => void;
  onOpenPage: (id: string) => void;
  onGenerate: (id?: string) => void;
}) {
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const decks = useMemo(
    () =>
      props.decks
        .filter((d) => props.pageIndex.has(d.pageId))
        .sort((a, b) => {
          const wa = a.review + a.learning + (a.new ? 1 : 0);
          const wb = b.review + b.learning + (b.new ? 1 : 0);
          if ((wa > 0) !== (wb > 0)) return wa > 0 ? -1 : 1;
          return displayTitle(props.pageIndex.get(a.pageId)!).localeCompare(displayTitle(props.pageIndex.get(b.pageId)!));
        }),
    [props.decks, props.pageIndex],
  );

  return (
    <section className="learn-decks">
      <div className="learn-section-head">
        <h2>Decks</h2>
        <span className="faint">{decks.length}</span>
      </div>
      <div className="learn-deck-list">
        {decks.map((d) => {
          const page = props.pageIndex.get(d.pageId)!;
          const learned = d.total - d.new;
          const studyable = d.review + d.learning + Math.min(d.new, props.limits.newLeft) > 0;
          return (
            <div className="learn-deck" key={d.pageId}>
              <button className="learn-deck-main" onClick={() => props.onDeck(d.pageId)} title="Show deck details">
                <span className="learn-deck-icon">{page.icon || defaultIcon(page.kind)}</span>
                <span className="learn-deck-text">
                  <span className="learn-deck-title ellipsis">{displayTitle(page)}</span>
                  <span className="learn-deck-meta">
                    <span className="learn-meter" aria-hidden>
                      <span style={{ width: `${d.total ? (learned / d.total) * 100 : 0}%` }} />
                    </span>
                    {plural(d.total, "card")} · {d.total ? Math.round((learned / d.total) * 100) : 0}% learned
                  </span>
                </span>
              </button>
              <div className="learn-deck-counts">
                <Pill tone="new" n={d.new} label="new" />
                <Pill tone="learning" n={d.learning} label="learning" />
                <Pill tone="due" n={d.review} label="due" />
              </div>
              <div className="learn-deck-actions">
                {studyable ? (
                  <button className="btn btn-sm learn-deck-study" onClick={() => props.onStudy({ deckId: d.pageId })}>
                    Study
                  </button>
                ) : (
                  <button className="btn btn-sm btn-ghost" onClick={() => props.onStudy({ deckId: d.pageId, cram: true })} title="Review every card without changing the schedule">
                    Cram
                  </button>
                )}
                <button
                  className="icon-btn"
                  aria-label="More actions"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({ id: d.pageId, x: r.right, y: r.bottom + 4 });
                  }}
                >
                  <IconMore />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {menu && (
        <DeckMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Open page", icon: <IconOpen size={14} />, run: () => props.onOpenPage(menu.id) },
            { label: "Cram all cards", icon: <IconShuffle size={14} />, run: () => props.onStudy({ deckId: menu.id, cram: true }) },
            { label: "Generate more cards", icon: <IconSparkles size={14} />, run: () => props.onGenerate(menu.id) },
          ]}
        />
      )}
    </section>
  );
}

function Pill({ tone, n, label }: { tone: "new" | "learning" | "due"; n: number; label: string }) {
  return (
    <span className={`learn-pill p-${tone}${n ? "" : " zero"}`} title={`${n} ${label}`}>
      <i />
      {n.toLocaleString()}
      <span className="learn-pill-label">{label}</span>
    </span>
  );
}

function DeckMenu(props: {
  x: number;
  y: number;
  onClose: () => void;
  items: { label: string; icon: ReactNode; run: () => void }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: props.x - 200, top: props.y });
  useEffect(() => {
    const el = ref.current;
    if (el) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setPos({
        left: Math.max(8, Math.min(props.x - w, window.innerWidth - w - 8)),
        top: props.y + h > window.innerHeight - 8 ? Math.max(8, props.y - h - 40) : props.y,
      });
    }
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && ref.current?.contains(e.target as Node)) return;
      props.onClose();
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", props.onClose);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", props.onClose);
    };
  }, [props]);
  return (
    <div className="menu" ref={ref} style={pos} role="menu">
      {props.items.map((it) => (
        <button
          key={it.label}
          className="menu-item"
          role="menuitem"
          onClick={() => {
            props.onClose();
            it.run();
          }}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---- cards of one deck -------------------------------------------------------------------------

function CardList(props: { cards: Card[]; states: Map<string, CardState>; now: number; onOpen: () => void; onCram: () => void }) {
  const [limit, setLimit] = useState(50);
  const rows = props.cards.slice(0, limit);
  return (
    <section className="learn-decks">
      <div className="learn-section-head">
        <h2>Cards</h2>
        <span className="faint">{props.cards.length}</span>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={props.onCram} title="Review every card without changing the schedule">
          <IconShuffle size={14} /> Cram
        </button>
        <button className="btn btn-ghost btn-sm" onClick={props.onOpen}>
          <IconOpen size={14} /> Open page
        </button>
      </div>
      <div className="learn-card-list">
        {rows.map((c) => (
          <CardRow key={c.id} card={c} state={props.states.get(c.id)} now={props.now} />
        ))}
      </div>
      {props.cards.length > limit && (
        <button className="btn btn-ghost learn-more" onClick={() => setLimit((l) => l + 200)}>
          Show {Math.min(200, props.cards.length - limit)} more
        </button>
      )}
    </section>
  );
}

function CardRow({ card, state, now }: { card: Card; state: CardState | undefined; now: number }) {
  const faces = useMemo(() => cardFaces(card), [card]);
  const bucket = bucketOf(state, now);
  let status: string;
  let tone: string;
  if (bucket === "new") {
    status = "New";
    tone = "new";
  } else if (bucket === "learning") {
    status = "Learning";
    tone = "learning";
  } else if (bucket === "review") {
    status = "Due";
    tone = "due";
  } else {
    status = dayNumber(state!.due) - dayNumber(now) === 1 ? "tomorrow" : `in ${formatInterval(state!.due - now)}`;
    tone = "later";
  }
  const r = state && state.state !== "new" ? retrievability(state, now) : null;
  return (
    <div className="learn-card-row">
      <div className="learn-card-row-text">
        <span className="learn-card-row-front" dangerouslySetInnerHTML={{ __html: faces.replaceOnReveal ? faces.back : faces.front }} />
        {!faces.replaceOnReveal && <span className="learn-card-row-back" dangerouslySetInnerHTML={{ __html: faces.back }} />}
      </div>
      <span className="learn-card-row-kind faint small">{card.kind === "cloze" ? `Cloze ${card.clozeIndex}` : card.kind === "reverse" ? "Reverse" : "Basic"}</span>
      <span className={`learn-status s-${tone}`} title={r !== null ? `Estimated recall ${Math.round(r * 100)}%` : undefined}>
        {status}
      </span>
    </div>
  );
}

// ---- empty state ---------------------------------------------------------------------------------

function EmptyState({ onExample, onGenerate }: { onExample: () => void; onGenerate: () => void }) {
  return (
    <div className="learn-empty">
      <div className="learn-empty-art" aria-hidden>
        <div className="learn-empty-card c1">
          <span>Capital of France?</span>
        </div>
        <div className="learn-empty-card c2">
          <span>
            The <b>[…]</b> makes ATP
          </span>
        </div>
        <div className="learn-empty-card c3">
          <span>Bonjour ⇄ Hello</span>
        </div>
      </div>
      <h2>Turn your notes into flashcards</h2>
      <p className="learn-empty-lead">
        Write a card on any line of any page, like <code>Capital of France :: Paris</code>. Basalt gathers them into decks
        and schedules each review right before you’d forget, using the FSRS algorithm.
      </p>
      <div className="learn-empty-actions">
        <button className="btn btn-primary btn-lg" onClick={onExample}>
          Try an example deck
        </button>
        <button className="btn btn-lg" onClick={onGenerate}>
          <IconSparkles /> Generate from a page
        </button>
      </div>
      <div className="learn-empty-guide">
        <div className="learn-section-label">The syntax</div>
        <SyntaxGuide />
      </div>
    </div>
  );
}

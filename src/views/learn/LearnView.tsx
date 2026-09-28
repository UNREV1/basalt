// Learn: spaced-repetition flashcards written inside notes, scheduled with FSRS.
// Dashboard -> review session -> summary. Cards are parsed live from pages;
// review state lives in the workspace Y.Doc under the learner's key.

import { useEffect, useMemo, useState } from "react";
import { createPage, displayTitle } from "../../../shared/model.ts";
import { aiAvailable } from "../../lib/ai.ts";
import { useApp, usePageIndex } from "../../lib/hooks.ts";
import { appendMarkdown } from "../../lib/markdown.ts";
import { learnerKey, useSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Dashboard } from "./Dashboard.tsx";
import { GenerateCards } from "./GenerateCards.tsx";
import { IconSparkles, IconX } from "./icons.tsx";
import { Session } from "./Session.tsx";
import { SettingsModal } from "./SettingsModal.tsx";
import {
  buildCramQueue,
  buildQueue,
  cardIndex,
  countCards,
  dayUsage,
  forecast,
  learnerStore,
  limitsFor,
  studyCounts,
  useLearnSettings,
  type CardIndex,
  type LearnerStore,
  type Queue,
} from "./store.ts";
import { SAMPLE_DECK_MD, SAMPLE_DECK_TITLE } from "./SyntaxGuide.tsx";
import "./learn.css";

type Mode =
  | { name: "dashboard" }
  | { name: "session"; id: number; deckId?: string; cram: boolean; queue: Queue };

/** Re-render soon after cards or review state change (throttled), and as time passes. */
function useLiveTick(index: CardIndex, store: LearnerStore, paused: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (paused) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        setTick((t) => t + 1);
      }, 250);
    };
    const offIndex = index.subscribe(bump);
    const offStore = store.subscribe(bump);
    const clock = setInterval(bump, 30_000);
    setTick((t) => t + 1);
    return () => {
      offIndex();
      offStore();
      clearInterval(clock);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [index, store, paused]);
  return tick;
}

export default function LearnView(props: { ws: Workspace; deckPageId?: string }) {
  const { ws } = props;
  const app = useApp();
  const identity = useSettings().identity;
  const key = learnerKey(identity);
  const settings = useLearnSettings();
  const index = cardIndex(ws.doc);
  const store = learnerStore(ws.doc, key);
  const pageIndex = usePageIndex(ws);

  const [mode, setMode] = useState<Mode>({ name: "dashboard" });
  const [deckId, setDeckId] = useState(props.deckPageId);
  const [extraNew, setExtraNew] = useState(0);
  const [generate, setGenerate] = useState<{ pageId?: string } | null>(null);
  const [aiHint, setAiHint] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => setDeckId(props.deckPageId), [props.deckPageId]);

  // A running session keeps its own snapshot; don't re-derive the dashboard underneath it.
  const tick = useLiveTick(index, store, mode.name === "session");
  // `tick` is the invalidation signal for both memos.
  const now = useMemo(() => Date.now(), [tick]);
  const cards = useMemo(() => index.cards(), [index, tick]);

  // Deck page trashed or gone: fall back to all decks.
  const deck = deckId ? pageIndex.get(deckId) : undefined;
  useEffect(() => {
    if (deckId && pageIndex.size && (!deck || deck.deletedAt)) setDeckId(undefined);
  }, [deckId, deck, pageIndex]);

  function startSession(opts: { deckId?: string; cram?: boolean; extraNew?: number }) {
    const t = Date.now();
    const all = index.cards();
    const extra = extraNew + (opts.extraNew ?? 0);
    if (opts.extraNew) setExtraNew(extra);
    const queue = opts.cram ? buildCramQueue(all, opts.deckId) : buildQueue(all, store.states, settings, t, { deckId: opts.deckId, extraNew: extra });
    if (!queue.main.length && !queue.learning.length) {
      app.toast(opts.cram ? "This deck has no cards yet" : "Nothing to study right now");
      return;
    }
    setMode({ name: "session", id: t, deckId: opts.deckId, cram: !!opts.cram, queue });
  }

  function openGenerate(pageId?: string) {
    if (!aiAvailable()) setAiHint(true);
    else setGenerate({ pageId });
  }

  function createExample() {
    const id = createPage(ws.doc, { title: SAMPLE_DECK_TITLE, icon: "🧠", createdBy: identity.name });
    appendMarkdown(ws, id, SAMPLE_DECK_MD);
    app.toast("Example deck created. Press Study to begin");
  }

  if (mode.name === "session") {
    const sessionDeck = mode.deckId ? pageIndex.get(mode.deckId) : undefined;
    const outlook = () => {
      const all = index.cards();
      const scoped = mode.deckId ? all.filter((c) => c.pageId === mode.deckId) : all;
      const t = Date.now();
      const counts = countCards(scoped, store.states, t);
      const limits = limitsFor(settings, dayUsage(store.states, t), extraNew);
      return {
        dueTomorrow: forecast(scoped, store.states, t, 2)[1],
        moreAvailable: studyCounts(counts, limits).total > 0,
        newLimitHit: counts.new > 0 && limits.newLeft === 0,
      };
    };
    return (
      <Session
        key={mode.id}
        store={store}
        queue={mode.queue}
        cram={mode.cram}
        scopeLabel={sessionDeck ? displayTitle(sessionDeck) : "All decks"}
        pageIndex={pageIndex}
        outlook={outlook}
        onOpenPage={app.openPage}
        onExit={() => setMode({ name: "dashboard" })}
        onRestart={(opts) => startSession({ deckId: mode.deckId, cram: mode.cram, ...opts })}
      />
    );
  }

  return (
    <>
      <Dashboard
        cards={cards}
        states={store.states}
        stats={store.stats}
        now={now}
        settings={settings}
        extraNew={extraNew}
        deckId={deck ? deckId : undefined}
        pageIndex={pageIndex}
        onDeck={setDeckId}
        onStudy={startSession}
        onOpenPage={app.openPage}
        onGenerate={openGenerate}
        onSettings={() => setSettingsOpen(true)}
        onExample={createExample}
      />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {generate && <GenerateCards ws={ws} initialPageId={generate.pageId} onClose={() => setGenerate(null)} />}
      {aiHint && <AiHint onClose={() => setAiHint(false)} />}
    </>
  );
}

function AiHint({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal learn-modal-narrow" role="dialog" aria-label="Generate cards with Claude">
        <div className="modal-header">
          <IconSparkles /> Generate cards with Claude
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <p className="learn-hint-text">
            Claude can read one of your pages and draft atomic flashcards for you to review before they’re added. This is
            optional and uses your own Anthropic API key, which stays on this device.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Not now
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent("basalt:open-settings", { detail: { tab: "ai" } }));
            }}
          >
            Add an API key
          </button>
        </div>
      </div>
    </div>
  );
}

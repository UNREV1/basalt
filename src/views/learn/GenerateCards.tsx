// "Generate cards from a page" with Claude: pick a page, generate atomic
// cards, review/edit them, then append them to the page as `front :: back`.

import { useEffect, useMemo, useRef, useState } from "react";
import { cardToLine, pageCards, pageCardSource, parseFlashcards } from "../../../shared/flashcards.ts";
import { displayTitle, defaultIcon, type PageMeta } from "../../../shared/model.ts";
import { aiErrorMessage, generateJson } from "../../lib/ai.ts";
import { usePages, useApp } from "../../lib/hooks.ts";
import { appendMarkdown, pageToMarkdown } from "../../lib/markdown.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { cardFaces } from "./faces.ts";
import { IconChevronLeft, IconSparkles, IconX } from "./icons.tsx";

interface Draft {
  key: number;
  kind: "basic" | "cloze";
  front: string;
  back: string;
  keep: boolean;
}

interface GeneratedCards {
  cards: { kind: "basic" | "cloze"; front: string; back: string }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["basic", "cloze"] },
          front: { type: "string" },
          back: { type: "string" },
        },
        required: ["kind", "front", "back"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
  additionalProperties: false,
};

const SYSTEM = `You write spaced-repetition flashcards from a user's notes, following SuperMemo's "20 rules of formulating knowledge" and Andy Matuschak's guidance on writing good prompts.

Rules:
1. Minimum information principle: every card tests exactly ONE atomic fact, idea or relationship. Split anything compound into several cards.
2. Unambiguous: the front must have exactly one correct answer, and be answerable months later without the notes. Include the necessary context in the question itself (e.g. "In TCP, what …" rather than "What does it do?").
3. Short answers: ideally 1–8 words, never more than one sentence.
4. Prefer understanding over trivia: ask about definitions, causes, mechanisms, consequences, contrasts and applications ("why", "how", "what is the difference between"). Avoid yes/no questions and questions whose wording gives the answer away.
5. No sets or enumerations on a single card. If a list matters, use a cloze card with one cloze number per item, or several focused cards.
6. Cloze cards (kind "cloze"): the front is one short sentence with deletions in Anki syntax {{c1::answer}} (optionally {{c1::answer::hint}}); use c1, c2, … for separately tested parts; "back" must be an empty string. Use cloze for definitions, key terms in context and short lists.
7. Basic cards (kind "basic"): a question in "front", the answer in "back".
8. Write in the same language as the notes. Use Markdown only for **bold**, *italic* and \`code\`. Write math as LaTeX between single dollar signs, e.g. $E = mc^2$. Never use line breaks, never use the sequence "::" except inside cloze markup, never use {{ }} in basic cards.
9. Only use information stated in or directly implied by the notes. Never invent facts. Skip meta-information about the document itself.
10. Prioritize what is most worth remembering long-term; skip trivial details and examples that don't generalize.
11. Do not duplicate cards the notes already contain.`;

type Step = "pick" | "working" | "review";

function lastHeadingIsFlashcards(source: string): boolean {
  const headings = source.split("\n").filter((l) => /^#{1,6}\s/.test(l));
  const last = headings[headings.length - 1];
  return !!last && /^#{1,6}\s+flash\s*cards\s*$/i.test(last.trim());
}

export function GenerateCards({ ws, initialPageId, onClose }: { ws: Workspace; initialPageId?: string; onClose: () => void }) {
  const app = useApp();
  const pages = usePages(ws);
  const [step, setStep] = useState<Step>("pick");
  const [pageId, setPageId] = useState<string | undefined>(initialPageId);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState("");
  const [amount, setAmount] = useState<"auto" | "10" | "20" | "40">("auto");
  const [allowCloze, setAllowCloze] = useState(true);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages
      .filter((p) => (p.kind === "doc" || p.kind === "notebook") && !p.system)
      .filter((p) => !q || displayTitle(p).toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 60);
  }, [pages, query]);

  const page: PageMeta | undefined = pages.find((p) => p.id === pageId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => abortRef.current?.abort(), []);

  function close() {
    abortRef.current?.abort();
    onClose();
  }

  async function generate() {
    if (!page) return;
    // Notebooks keep their prose in markdown cells rather than in the rich-text body.
    const md = (page.kind === "doc" ? pageToMarkdown(ws, page.id) : pageCardSource(ws.doc, page.id)).trim();
    if (md.replace(/\s+/g, "").length < 20) {
      setError("This page doesn't have enough text to make cards from yet.");
      return;
    }
    const existing = pageCards(ws.doc, page.id);
    const target = amount === "auto" ? "Write as many cards as the content deserves: roughly 1 card per key idea, between 3 and 40." : `Write about ${amount} cards.`;
    const prompt = [
      `Notes titled "${displayTitle(page)}":`,
      "<notes>",
      md.slice(0, 120_000),
      "</notes>",
      existing.length
        ? `Cards that already exist for these notes (do not repeat them):\n${existing
            .slice(0, 200)
            .map((c) => `- ${c.front.replace(/\n/g, " ")}`)
            .join("\n")}`
        : "",
      focus.trim() ? `Focus on: ${focus.trim()}` : "",
      target,
      allowCloze ? "Use cloze cards where they fit better than questions." : 'Only write basic cards (kind "basic").',
    ]
      .filter(Boolean)
      .join("\n\n");

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    setProgress(0);
    setStep("working");
    try {
      const res = await generateJson<GeneratedCards>({
        system: SYSTEM,
        prompt,
        schema: SCHEMA,
        effort: "medium",
        maxTokens: 16000,
        signal: ctrl.signal,
        onProgress: setProgress,
      });
      const cleaned: Draft[] = [];
      let key = 0;
      for (const c of res.cards ?? []) {
        const front = (c.front ?? "").replace(/\s+/g, " ").trim();
        const back = (c.back ?? "").replace(/\s+/g, " ").trim();
        const isCloze = c.kind === "cloze" && /\{\{.+?\}\}/.test(front);
        if (!front || (!isCloze && !back)) continue;
        cleaned.push({ key: key++, kind: isCloze ? "cloze" : "basic", front, back: isCloze ? "" : back, keep: true });
      }
      if (!cleaned.length) {
        setError("Claude didn't find anything worth turning into cards. Try another page or add a focus.");
        setStep("pick");
        return;
      }
      setDrafts(cleaned);
      setStep("review");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(aiErrorMessage(err));
      setStep("pick");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }

  function add() {
    if (!page) return;
    const lines = drafts
      .filter((d) => d.keep && d.front.trim())
      .map((d) => cardToLine(d.front, d.kind === "cloze" ? "" : d.back))
      .filter((l) => parseFlashcards(l, page.id).length > 0);
    if (!lines.length) return;
    const heading = lastHeadingIsFlashcards(pageCardSource(ws.doc, page.id)) ? "" : "## Flashcards\n\n";
    appendMarkdown(ws, page.id, heading + lines.map(escapeForMarkdown).join("\n\n"));
    app.toast(`Added ${lines.length} card${lines.length === 1 ? "" : "s"} to “${displayTitle(page)}”`);
    onClose();
  }

  const kept = drafts.filter((d) => d.keep).length;
  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && step !== "working" && close()}>
      <div className="modal learn-gen" role="dialog" aria-label="Generate flashcards">
        <div className="modal-header">
          {step === "review" && (
            <button className="icon-btn" onClick={() => setStep("pick")} aria-label="Back">
              <IconChevronLeft />
            </button>
          )}
          <IconSparkles />
          {step === "review" ? `Review ${drafts.length} cards` : "Generate cards with Claude"}
          <span className="spacer" />
          <button className="icon-btn" onClick={close} aria-label="Close">
            <IconX />
          </button>
        </div>

        {step === "pick" && (
          <>
            <div className="modal-body">
              <p className="muted learn-gen-lead">
                Claude reads a page and drafts atomic question–answer and cloze cards. You review them before anything is
                added to the page.
              </p>
              <div className="learn-field">
                <span className="learn-field-label">Page</span>
                <input
                  className="input"
                  placeholder="Search pages…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus={!initialPageId}
                />
                <div className="learn-gen-pages" role="listbox" aria-label="Pages">
                  {candidates.map((p) => (
                    <button
                      key={p.id}
                      role="option"
                      aria-selected={p.id === pageId}
                      className={`learn-gen-page${p.id === pageId ? " selected" : ""}`}
                      onClick={() => setPageId(p.id)}
                    >
                      <span className="learn-deck-icon">{p.icon || defaultIcon(p.kind)}</span>
                      <span className="ellipsis grow">{displayTitle(p)}</span>
                      <span className="faint small">{new Date(p.updatedAt).toLocaleDateString()}</span>
                    </button>
                  ))}
                  {!candidates.length && <div className="faint small learn-gen-none">No pages match.</div>}
                </div>
              </div>
              <label className="learn-field">
                <span className="learn-field-label">Focus (optional)</span>
                <input
                  className="input"
                  placeholder="e.g. only the section on enzymes, or key dates"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                />
              </label>
              <div className="row wrap learn-gen-options">
                <label className="row">
                  <span className="learn-field-label">Cards</span>
                  <select className="select" value={amount} onChange={(e) => setAmount(e.target.value as typeof amount)}>
                    <option value="auto">As many as needed</option>
                    <option value="10">About 10</option>
                    <option value="20">About 20</option>
                    <option value="40">About 40</option>
                  </select>
                </label>
                <label className="row learn-check">
                  <input type="checkbox" checked={allowCloze} onChange={(e) => setAllowCloze(e.target.checked)} />
                  Allow cloze cards
                </label>
              </div>
              {error && <div className="learn-error">{error}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!page} onClick={generate}>
                <IconSparkles /> Generate
              </button>
            </div>
          </>
        )}

        {step === "working" && (
          <div className="modal-body learn-gen-working">
            <div className="spinner" />
            <div>
              <div>Reading “{page ? displayTitle(page) : ""}” and writing cards…</div>
              <div className="faint small">{progress > 0 ? `${progress.toLocaleString()} characters so far` : "Thinking it through"}</div>
            </div>
            <span className="spacer" />
            <button className="btn" onClick={() => { abortRef.current?.abort(); setStep("pick"); }}>
              Cancel
            </button>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="modal-body learn-gen-review">
              <div className="row small muted">
                <span>
                  {kept} of {drafts.length} selected · they’ll be added under a “Flashcards” heading at the end of “
                  {page ? displayTitle(page) : ""}”.
                </span>
                <span className="spacer" />
                <button className="btn btn-ghost btn-sm" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, keep: kept < ds.length })))}>
                  {kept < drafts.length ? "Select all" : "Select none"}
                </button>
              </div>
              {drafts.map((d) => (
                <DraftRow key={d.key} draft={d} onChange={(patch) => update(d.key, patch)} />
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={close}>
                Discard
              </button>
              <button className="btn btn-primary" disabled={!kept} onClick={add}>
                Add {kept} card{kept === 1 ? "" : "s"} to page
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DraftRow({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const preview = useMemo(() => {
    const card = parseFlashcards(cardToLine(draft.front, draft.kind === "cloze" ? "" : draft.back), "draft")[0];
    return card ? cardFaces(card) : null;
  }, [draft.front, draft.back, draft.kind]);
  return (
    <div className={`learn-draft${draft.keep ? "" : " off"}`}>
      <input
        type="checkbox"
        className="learn-draft-check"
        checked={draft.keep}
        onChange={(e) => onChange({ keep: e.target.checked })}
        aria-label="Keep this card"
      />
      <div className="learn-draft-fields">
        <textarea
          className="textarea learn-draft-front"
          rows={1}
          value={draft.front}
          onChange={(e) => onChange({ front: e.target.value })}
          aria-label={draft.kind === "cloze" ? "Cloze text" : "Question"}
        />
        {draft.kind === "basic" ? (
          <textarea
            className="textarea learn-draft-back"
            rows={1}
            value={draft.back}
            onChange={(e) => onChange({ back: e.target.value })}
            aria-label="Answer"
          />
        ) : (
          preview && (
            <div className="learn-draft-cloze small muted">
              <span className="badge">Cloze</span> <span dangerouslySetInnerHTML={{ __html: preview.front }} />
            </div>
          )
        )}
        {!preview && draft.keep && <div className="learn-error small">This card can’t be parsed; edit it or uncheck it.</div>}
      </div>
    </div>
  );
}

/**
 * appendMarkdown parses markdown, which would eat LaTeX escapes like \{ or \, :
 * double backslashes before ASCII punctuation inside $math$ so they survive.
 */
function escapeForMarkdown(line: string): string {
  return line.replace(/\$[^$\n]+\$/g, (m) => m.replace(/\\(?=[!-/:-@[-`{-~])/g, "\\\\"));
}

// Teaching the inline flashcard syntax: examples, and a sample deck to try.

import { cardFaces } from "./faces.ts";
import { parseFlashcards } from "../../../shared/flashcards.ts";

export const SAMPLE_DECK_TITLE = "Flashcards: a quick tour";

/** Markdown for the example deck. Blank lines keep each card in its own block. */
export const SAMPLE_DECK_MD = `Every line with \`::\` or \`{{…}}\` in any page becomes a flashcard. Edit this page and the deck updates instantly.

## Basic cards

Who discovered the forgetting curve? :: Hermann Ebbinghaus, in 1885

What does FSRS stand for? :: Free Spaced Repetition Scheduler

What is the *testing effect*? :: Retrieving an answer from memory strengthens it more than re-reading does

## Both directions

Bonjour ::: Hello

Merci beaucoup ::: Thank you very much

## Cloze deletions

The {{c1::hippocampus}} is essential for forming new {{c2::long-term}} memories.

Spaced repetition exploits the {{spacing effect}}: reviews spread over time beat cramming.

The derivative of $x^2$ is {{c1::$2x$::a function of x}}.

## Multi-line cards

What are the two ingredients of effective studying?

?

- **Active recall**: produce the answer before you see it
- **Spacing**: review at growing intervals, right before you'd forget

## Math works too

Euler's identity :: $e^{i\\pi} + 1 = 0$
`;

const EXAMPLES: { syntax: string; note: string }[] = [
  { syntax: "Capital of France :: Paris", note: "Basic card" },
  { syntax: "Bonjour ::: Hello", note: "Two cards, one per direction" },
  { syntax: "The {{c1::mitochondria}} makes {{c2::ATP}}", note: "Cloze: one card per number" },
  { syntax: "{{Canberra}} is the capital of Australia", note: "Cloze without numbers" },
  { syntax: "{{c1::Mitosis::cell division}} splits one nucleus", note: "Cloze with a hint" },
  { syntax: "Question lines\n?\nAnswer lines", note: "Multi-line card (use ?? for both directions)" },
];

function Preview({ syntax }: { syntax: string }) {
  const card = parseFlashcards(syntax, "preview")[0];
  if (!card) return null;
  const faces = cardFaces(card);
  return (
    <div className="learn-syntax-preview">
      <span className="learn-syntax-front" dangerouslySetInnerHTML={{ __html: faces.front }} />
      {!faces.replaceOnReveal && (
        <>
          <span className="learn-syntax-arrow" aria-hidden>
            →
          </span>
          <span className="learn-syntax-back" dangerouslySetInnerHTML={{ __html: faces.back }} />
        </>
      )}
    </div>
  );
}

export function SyntaxGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`learn-syntax${compact ? " compact" : ""}`}>
      <div className="learn-syntax-rows">
        {EXAMPLES.map((ex) => (
          <div className="learn-syntax-row" key={ex.syntax}>
            <pre className="learn-syntax-code">{ex.syntax}</pre>
            <div className="learn-syntax-result">
              <span className="learn-syntax-note">{ex.note}</span>
              <Preview syntax={ex.syntax} />
            </div>
          </div>
        ))}
      </div>
      <ul className="learn-syntax-tips">
        <li>
          Write cards anywhere in your pages: in lists, under headings, next to your notes. Each page with cards is a
          deck.
        </li>
        <li>
          Start a multi-line question after a heading or an empty line; the answer ends at the next empty line.
        </li>
        <li>
          Fixing the answer keeps a card's review history; changing the question starts it fresh. Math like{" "}
          <code>$e^{"{i\\pi}"}$</code> renders everywhere.
        </li>
        <li>
          <code>std::vector</code>, <code>`code`</code> and code blocks are never mistaken for cards.
        </li>
      </ul>
    </div>
  );
}

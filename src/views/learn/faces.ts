// Card faces -> sanitized HTML (markdown + KaTeX via the shared renderer).

import { renderCloze, type Card } from "../../../shared/flashcards.ts";
import { renderInlineMarkdown, renderMarkdown } from "../../lib/render-markdown.ts";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** [[Title]] / [[Title|alias]] -> a styled span (links aren't navigable mid-review). */
function wikilinks(md: string): string {
  return md.replace(/\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g, (_, title: string, alias?: string) => {
    const label = (alias ?? title).replace(/#.*$/, "").trim();
    return `<span class="learn-wikilink">${escapeHtml(label)}</span>`;
  });
}

export function renderFace(md: string): string {
  const src = wikilinks(md);
  return src.includes("\n") ? renderMarkdown(src) : renderInlineMarkdown(src);
}

export interface Faces {
  front: string;
  /** For cloze cards the full text with the answer highlighted; otherwise the back. */
  back: string;
  /** Cloze cards replace the front with the back on reveal instead of showing both. */
  replaceOnReveal: boolean;
}

export function cardFaces(card: Card): Faces {
  if (card.kind === "cloze" && card.clozeIndex) {
    return {
      front: renderFace(renderCloze(card.front, card.clozeIndex, false, { format: "html" })),
      back: renderFace(renderCloze(card.front, card.clozeIndex, true, { format: "html" })),
      replaceOnReveal: true,
    };
  }
  return { front: renderFace(card.front), back: renderFace(card.back), replaceOnReveal: false };
}

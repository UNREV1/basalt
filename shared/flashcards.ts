// Flashcards written inline in notes (Obsidian Spaced Repetition / Anki style).
//
// Syntax, one card source per line:
//   Front :: Back                basic card
//   Front ::: Back               bidirectional: a forward and a reverse card
//   The {{c1::answer}} ...       Anki cloze; {{c1::answer::hint}} shows [hint]
//   The {{answer}} ...           plain cloze; each {{...}} group is its own card
// Multi-line cards: a line that is exactly `?` (or `??` for bidirectional)
// separates question lines above it from answer lines below it:
//   What are the two stages of photosynthesis?
//   ?
//   - Light-dependent reactions
//   - Calvin cycle
// The question starts after the previous empty line, heading, horizontal rule
// or card line; the answer runs until the next one of those.
//
// Rules that keep false positives down:
//   - `::` between two word characters (`std::vector`) is not a separator.
//   - Anything inside `inline code`, $math$, [[links]] or {{clozes}} is never a separator.
//   - `{{ x }}` with spaces on both sides is template syntax, not a cloze.
//   - Lines inside ``` fences and lines over 1000 characters are ignored.
//
// Card ids hash the page, kind and normalized front (for clozes: the text
// around the deletions), so editing an answer, formatting or capitalization
// keeps a card's review history.

import * as Y from "yjs";
import { displayTitle, getPage, pageMeta, pagesMap, PAGE_LINK_NODE, templateSubtree } from "./model.ts";

export type CardKind = "basic" | "reverse" | "cloze";

export interface Card {
  id: string;
  pageId: string;
  kind: CardKind;
  /** Markdown. For cloze cards: the whole line including cloze markup (see renderCloze). */
  front: string;
  /** Markdown. For cloze cards: the hidden answer(s) of this cloze number. */
  back: string;
  clozeIndex?: number;
  /** 0-based line in the page text where the card starts. */
  line: number;
  /** Nearest heading above the card, when the source text has markdown headings. */
  context?: string;
}

export const MAX_CARD_LINE = 1000;

// ---- hashing ----------------------------------------------------------------------

/** 48 bits of FNV-1a 64 over UTF-16 code units, base36 (<= 10 chars). */
export function shortHash(input: string): string {
  // 64-bit FNV-1a with four 16-bit limbs (h0 = least significant).
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (let i = 0; i < input.length; i++) {
    h0 ^= input.charCodeAt(i);
    // multiply by the FNV prime 2^40 + 0x1b3
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3;
    const t2 = h2 * 0x1b3 + (h0 << 8);
    const t3 = h3 * 0x1b3 + (h1 << 8);
    const c1 = t1 + (t0 >>> 16);
    const c2 = t2 + (c1 >>> 16);
    h0 = t0 & 0xffff;
    h1 = c1 & 0xffff;
    h2 = c2 & 0xffff;
    h3 = (t3 + (c2 >>> 16)) & 0xffff;
  }
  const n = h2 * 2 ** 32 + h1 * 2 ** 16 + h0;
  return n.toString(36).padStart(10, "0");
}

const LIST_MARKER = /^\s*(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d{1,9}[.)]\s+|>\s?)/;

function stripListMarker(line: string): string {
  return line.replace(LIST_MARKER, "");
}

/** Normalization used for card ids: whitespace, list markers, emphasis marks and case don't matter. */
export function normalizeFront(front: string): string {
  return front
    .split("\n")
    .map(stripListMarker)
    .join(" ")
    .replace(/[*_~`=]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cardId(pageId: string, kind: CardKind, front: string, clozeIndex?: number): string {
  return shortHash(`${pageId}\u0001${kind}\u0001${normalizeFront(front)}${clozeIndex ? `\u0001${clozeIndex}` : ""}`);
}

// ---- line scanning -------------------------------------------------------------------

/** Length of the protected span (code, math, link) starting at i, or 0. */
function protectedSpan(line: string, i: number): number {
  const c = line[i];
  if (c === "`") {
    let run = 1;
    while (line[i + run] === "`") run++;
    const fence = "`".repeat(run);
    const end = line.indexOf(fence, i + run);
    return end === -1 ? 0 : end + run - i;
  }
  if (c === "$" && line[i - 1] !== "\\") {
    const dbl = line[i + 1] === "$";
    const open = dbl ? 2 : 1;
    if (!dbl && (line[i + 1] === " " || line[i + 1] === undefined)) return 0;
    const end = line.indexOf(dbl ? "$$" : "$", i + open);
    return end === -1 ? 0 : end + open - i;
  }
  if (c === "[" && line[i + 1] === "[") {
    const end = line.indexOf("]]", i + 2);
    return end === -1 ? 0 : end + 2 - i;
  }
  return 0;
}

export interface ClozeSpan {
  start: number;
  end: number;
  /** Cloze number: explicit cN, or assigned in order after the line's highest explicit number. */
  index: number;
  answer: string;
  hint?: string;
}

/** Find the end of a {{...}} group starting at i (index of the closing "}}"), or -1. */
function clozeEnd(line: string, i: number): number {
  let depth = 0;
  for (let j = i + 2; j < line.length; j++) {
    const c = line[j];
    if (c === "{") depth++;
    else if (c === "}") {
      if (depth === 0 && line[j + 1] === "}") return j;
      depth = Math.max(0, depth - 1);
    }
  }
  return -1;
}

/** Split on "::" at brace depth 0. */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") depth = Math.max(0, depth - 1);
    else if (c === ":" && s[i + 1] === ":" && depth === 0) {
      parts.push(s.slice(last, i));
      last = i + 2;
      i++;
    }
  }
  parts.push(s.slice(last));
  return parts;
}

/** All cloze deletions on a line, with their card numbers. */
export function findClozes(line: string): ClozeSpan[] {
  const raw: { start: number; end: number; explicit?: number; answer: string; hint?: string }[] = [];
  for (let i = 0; i < line.length; ) {
    const skip = protectedSpan(line, i);
    if (skip && line[i] !== "$") {
      i += skip;
      continue;
    }
    if (line[i] === "{" && line[i + 1] === "{") {
      const close = clozeEnd(line, i);
      if (close === -1) break;
      const content = line.slice(i + 2, close);
      const m = /^c(\d{1,3})::([\s\S]*)$/.exec(content);
      let explicit: number | undefined;
      let body = content;
      let ok = true;
      if (m) {
        explicit = Number(m[1]);
        body = m[2];
        if (explicit < 1) ok = false;
      } else if (/^\s/.test(content) && /\s$/.test(content)) {
        ok = false; // `{{ name }}` is template syntax
      }
      const [answer, ...rest] = splitTopLevel(body);
      const hint = rest.length ? rest.join("::").trim() : undefined;
      if (ok && answer.trim()) raw.push({ start: i, end: close + 2, explicit, answer: answer.trim(), hint: hint || undefined });
      i = close + 2;
      continue;
    }
    i++; // math is not skipped: clozes may sit inside $...$ and "$" is often currency
  }
  let next = Math.max(0, ...raw.map((r) => r.explicit ?? 0)) + 1;
  return raw.map((r) => ({
    start: r.start,
    end: r.end,
    index: r.explicit ?? next++,
    answer: r.answer,
    ...(r.hint ? { hint: r.hint } : {}),
  }));
}

/** Position and kind of the first front/back separator on a line. */
export function findSeparator(line: string): { index: number; length: 2 | 3 } | null {
  const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c);
  for (let i = 0; i < line.length; ) {
    if (line[i] === "{" && line[i + 1] === "{") {
      const close = clozeEnd(line, i);
      if (close !== -1) {
        i = close + 2;
        continue;
      }
    }
    const skip = protectedSpan(line, i);
    if (skip) {
      i += skip;
      continue;
    }
    if (line[i] === ":") {
      let run = 1;
      while (line[i + run] === ":") run++;
      if ((run === 2 || run === 3) && !(isWord(line[i - 1]) && isWord(line[i + run]))) {
        return { index: i, length: run };
      }
      i += run;
      continue;
    }
    i++;
  }
  return null;
}

/** A cloze line with every deletion reduced to its number: `The {{c1}} of {{c2}}`. */
export function clozeTemplate(front: string): string {
  let out = "";
  let last = 0;
  for (const c of findClozes(front)) {
    out += `${front.slice(last, c.start)}{{c${c.index}}}`;
    last = c.end;
  }
  return out + front.slice(last);
}

// ---- rendering helpers -----------------------------------------------------------------

export interface RenderClozeOptions {
  /** "markdown" (default): hidden part as \[…\], revealed as **answer**. "html": <span>/<mark> with classes. */
  format?: "markdown" | "html";
}

/**
 * Render a cloze line for one card: the given cloze number is hidden as […]
 * (or [hint]) or, when revealed, highlighted; other clozes show their answer.
 */
export function renderCloze(front: string, index: number, reveal: boolean, opts: RenderClozeOptions = {}): string {
  const html = opts.format === "html";
  let out = "";
  let last = 0;
  for (const c of findClozes(front)) {
    out += front.slice(last, c.start);
    if (c.index !== index) out += c.answer;
    else if (reveal) out += html ? `<mark class="cloze-answer">${c.answer}</mark>` : `**${c.answer}**`;
    else {
      const label = c.hint ? c.hint : "…";
      out += html ? `<span class="cloze-blank">[${label}]</span>` : `\\[${label}\\]`;
    }
    last = c.end;
  }
  return out + front.slice(last);
}

// ---- parsing ------------------------------------------------------------------------------

const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const HR = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s{0,3}(```|~~~)/;

function isCardLine(line: string): boolean {
  if (line.length > MAX_CARD_LINE) return false;
  const body = stripListMarker(line);
  return !!findSeparator(body) || findClozes(body).length > 0;
}

/** Parse all flashcards from page text (one line per block; markdown-ish lines are fine). */
export function parseFlashcards(text: string, pageId: string): Card[] {
  const lines = text.split(/\r?\n/);
  const n = lines.length;
  const inCode: boolean[] = new Array(n).fill(false);
  let fenced = false;
  for (let i = 0; i < n; i++) {
    if (FENCE.test(lines[i])) {
      inCode[i] = true;
      fenced = !fenced;
    } else inCode[i] = fenced;
  }
  const context: (string | undefined)[] = new Array(n);
  let heading: string | undefined;
  for (let i = 0; i < n; i++) {
    context[i] = heading;
    const m = !inCode[i] && HEADING.exec(lines[i]);
    if (m) heading = m[2].replace(/#+\s*$/, "").trim() || heading;
  }
  const isSep = (i: number) => !inCode[i] && /^\s*\?\??\s*$/.test(lines[i]);
  const cardLine: boolean[] = lines.map((l, i) => !inCode[i] && !isSep(i) && !HEADING.test(l) && isCardLine(l));
  const boundary = (i: number) =>
    inCode[i] ||
    lines[i].trim() === "" ||
    lines[i].length > MAX_CARD_LINE ||
    HEADING.test(lines[i]) ||
    HR.test(lines[i]) ||
    isSep(i) ||
    cardLine[i];

  const cards: Card[] = [];
  const seen = new Set<string>();
  const push = (card: Omit<Card, "id">) => {
    // Cloze ids ignore the hidden text, so fixing an answer keeps the history.
    const keyFront = card.kind === "cloze" ? clozeTemplate(card.front) : card.front;
    const primary = cardId(pageId, card.kind, keyFront, card.clozeIndex);
    // Same question twice on a page (e.g. under different headings): tell them apart by the answer.
    const fallback = cardId(pageId, card.kind, `${card.front}\u0002${card.back}\u0002${card.context ?? ""}`, card.clozeIndex);
    if (seen.has(fallback)) return; // exact duplicate
    const id = seen.has(primary) ? fallback : primary;
    seen.add(primary);
    seen.add(fallback);
    const c: Card = { id, ...card };
    if (c.context === undefined) delete c.context;
    cards.push(c);
  };
  const consumed: boolean[] = new Array(n).fill(false);

  // Multi-line cards first so their lines aren't also read as single-line cards.
  const multi: { line: number; front: string; back: string; both: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    if (!isSep(i)) continue;
    let qs = i;
    while (qs - 1 >= 0 && !boundary(qs - 1) && !consumed[qs - 1]) qs--;
    let ae = i + 1;
    while (ae < n && !boundary(ae)) ae++;
    const question = lines.slice(qs, i).map((l) => l.trimEnd());
    const answer = lines.slice(i + 1, ae).map((l) => l.trimEnd());
    if (!question.length || !answer.length) continue;
    for (let k = qs; k < ae; k++) consumed[k] = true;
    multi.push({ line: qs, front: question.join("\n"), back: answer.join("\n"), both: lines[i].trim() === "??" });
    i = ae - 1;
  }
  const multiAt = new Map(multi.map((m) => [m.line, m]));

  for (let i = 0; i < n; i++) {
    const m = multiAt.get(i);
    if (m) {
      push({ pageId, kind: "basic", front: m.front, back: m.back, line: i, context: context[i] });
      if (m.both) push({ pageId, kind: "reverse", front: m.back, back: m.front, line: i, context: context[i] });
      continue;
    }
    if (consumed[i] || !cardLine[i]) continue;
    const body = stripListMarker(lines[i]).trim();
    const clozes = findClozes(body);
    if (clozes.length) {
      const indices = [...new Set(clozes.map((c) => c.index))].sort((a, b) => a - b);
      for (const idx of indices) {
        const answers = clozes.filter((c) => c.index === idx).map((c) => c.answer);
        push({ pageId, kind: "cloze", front: body, back: answers.join(", "), clozeIndex: idx, line: i, context: context[i] });
      }
      continue;
    }
    const sep = findSeparator(body)!;
    const front = body.slice(0, sep.index).trim();
    const back = body.slice(sep.index + sep.length).trim();
    if (!front || !back) continue;
    push({ pageId, kind: "basic", front, back, line: i, context: context[i] });
    if (sep.length === 3) push({ pageId, kind: "reverse", front: back, back: front, line: i, context: context[i] });
  }
  return cards;
}

// ---- reading cards out of a workspace -------------------------------------------------------

type Delta = { insert: unknown; attributes?: Record<string, any> }[];

function wrap(text: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : text;
}

function deltaToMarkdown(delta: Delta): string {
  let out = "";
  for (const op of delta) {
    if (typeof op.insert !== "string") continue;
    let t = op.insert;
    const a = op.attributes ?? {};
    if (a.code) {
      const ticks = t.includes("`") ? "``" : "`";
      out += `${ticks}${t}${ticks}`;
      continue;
    }
    if (a.bold) t = wrap(t, "**");
    if (a.italic) t = wrap(t, "*");
    if (a.strike) t = wrap(t, "~~");
    if (a.link?.href) t = `[${t}](${a.link.href})`;
    out += t;
  }
  return out;
}

function inlineMarkdown(node: Y.XmlElement, resolveTitle: (id: string) => string): string {
  let out = "";
  for (const child of node.toArray() as (Y.XmlElement | Y.XmlText)[]) {
    if (child instanceof Y.XmlText) out += deltaToMarkdown(child.toDelta() as Delta);
    else if (child.nodeName === PAGE_LINK_NODE) {
      const id = child.getAttribute("pageId") as string | undefined;
      out += `[[${id ? resolveTitle(id) : ""}]]`;
    } else if (child.nodeName === "inlineMath") out += `$${child.getAttribute("latex") ?? ""}$`;
    else if (child.nodeName === "hardBreak") out += "\n";
    else out += inlineMarkdown(child, resolveTitle);
  }
  return out;
}

const LIST_PREFIX: Record<string, string> = {
  bulletListItem: "- ",
  numberedListItem: "1. ",
  toggleListItem: "- ",
  quote: "> ",
};

/**
 * Markdown-ish text of a BlockNote fragment for card parsing: one line per
 * block, empty paragraphs kept as blank lines, headings as `#`, code blocks
 * fenced, list items with markers, inline formatting as markdown.
 */
export function fragmentToCardSource(fragment: Y.XmlFragment | undefined, resolveTitle: (id: string) => string = (id) => id): string {
  if (!fragment) return "";
  const lines: string[] = [];
  const walkGroup = (group: Y.XmlElement | Y.XmlFragment, depth: number) => {
    for (const container of group.toArray()) {
      if (!(container instanceof Y.XmlElement)) continue;
      if (container.nodeName !== "blockContainer") {
        walkGroup(container, depth);
        continue;
      }
      for (const child of container.toArray()) {
        if (!(child instanceof Y.XmlElement)) continue;
        if (child.nodeName === "blockGroup") {
          walkGroup(child, depth + 1);
          continue;
        }
        const type = child.nodeName;
        if (type === "codeBlock") {
          lines.push("```", ...codeText(child).split("\n"), "```");
        } else if (type === "math") {
          lines.push(`$$${child.getAttribute("latex") ?? ""}$$`);
        } else if (type === "heading") {
          const level = Number(child.getAttribute("level") ?? 1) || 1;
          lines.push(`${"#".repeat(Math.min(6, level))} ${inlineMarkdown(child, resolveTitle)}`);
        } else if (type === "checkListItem") {
          const checked = child.getAttribute("checked") as unknown;
          lines.push(`${"  ".repeat(depth)}- [${checked === true || checked === "true" ? "x" : " "}] ${inlineMarkdown(child, resolveTitle)}`);
        } else if (type in LIST_PREFIX) {
          const indent = type === "quote" ? "" : "  ".repeat(depth);
          const text = inlineMarkdown(child, resolveTitle);
          const [first, ...rest] = text.split("\n");
          lines.push(`${indent}${LIST_PREFIX[type]}${first}`, ...rest);
        } else if (type === "paragraph") {
          lines.push(...inlineMarkdown(child, resolveTitle).split("\n"));
        } else {
          lines.push(""); // tables, media and custom blocks separate cards but hold none
        }
      }
    }
  };
  walkGroup(fragment, 0);
  return lines.join("\n");
}

function codeText(node: Y.XmlElement): string {
  let out = "";
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlText)) continue;
    for (const op of child.toDelta() as Delta) if (typeof op.insert === "string") out += op.insert;
  }
  return out;
}

/** Text of everything on a page that can hold cards (rich text, notebook markdown cells). */
export function pageCardSource(doc: Y.Doc, pageId: string): string {
  const page = getPage(doc, pageId);
  if (!page) return "";
  const titleOf = (id: string) => {
    const p = getPage(doc, id);
    return p ? displayTitle(pageMeta(p)) : id;
  };
  const parts = [fragmentToCardSource(page.get("content") as Y.XmlFragment | undefined, titleOf)];
  const cells = page.get("cells");
  if (cells instanceof Y.Array) {
    for (const cell of cells.toArray()) {
      if (!(cell instanceof Y.Map) || cell.get("type") !== "markdown") continue;
      const src = cell.get("source");
      const text = src instanceof Y.Text ? src.toString() : typeof src === "string" ? src : "";
      if (text.trim()) parts.push("", text);
    }
  }
  return parts.join("\n");
}

/** Cards on one page (empty for deleted pages). */
export function pageCards(doc: Y.Doc, pageId: string): Card[] {
  const page = getPage(doc, pageId);
  if (!page || page.get("deletedAt")) return [];
  return parseFlashcards(pageCardSource(doc, pageId), pageId);
}

/** Every card in the workspace (non-deleted pages). */
export function collectCards(doc: Y.Doc): Card[] {
  const out: Card[] = [];
  const templates = templateSubtree(doc);
  pagesMap(doc).forEach((page, id) => {
    if (page.get("deletedAt") || templates.has(id)) return;
    for (const c of pageCards(doc, id)) out.push(c);
  });
  return out;
}

/** Siblings (forward/reverse, clozes of one line) share a key; used to spread them apart. */
export function siblingKey(card: Card): string {
  return `${card.pageId}:${card.line}`;
}

/** Format a card back into note syntax (for AI-generated cards). */
export function cardToLine(front: string, back: string): string {
  const oneLine = (s: string) => s.replace(/\s*\n+\s*/g, " ").trim();
  const f = oneLine(front);
  const b = oneLine(back);
  if (!b) return f; // cloze
  // A basic card must not look like a cloze or contain a second separator in its front.
  const unbrace = (s: string) => s.replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");
  return `${unbrace(f).replace(/(^|[^:]):{2,3}(?!:)/g, "$1:")} :: ${unbrace(b)}`;
}

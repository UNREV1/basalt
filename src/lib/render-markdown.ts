// Markdown -> sanitized HTML with KaTeX math ($inline$ and $$block$$).
// Used for chat answers, notebook markdown cells and flashcards.

import { marked } from "marked";
import DOMPurify from "dompurify";
import katex from "katex";
import "katex/dist/katex.min.css";

const MATH_BLOCK = /\$\$([\s\S]+?)\$\$/g;
const MATH_INLINE = /(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g;

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false, output: "html" });
  } catch {
    return tex;
  }
}

/** Render markdown (GFM) with math to safe HTML. */
export function renderMarkdown(md: string): string {
  // Protect math from the markdown parser by swapping in placeholders.
  const math: string[] = [];
  const stash = (html: string) => `\u0000M${math.push(html) - 1}\u0000`;
  let src = md.replace(MATH_BLOCK, (_, tex) => stash(renderMath(tex.trim(), true)));
  src = src.replace(MATH_INLINE, (_, pre, tex) => pre + stash(renderMath(tex, false)));
  const html = marked.parse(src, { gfm: true, breaks: false, async: false }) as string;
  const withMath = html.replace(/\u0000M(\d+)\u0000/g, (_, i) => math[Number(i)]);
  return DOMPurify.sanitize(withMath, { ADD_ATTR: ["target"] });
}

/** Render only inline markdown (no paragraphs), e.g. for flashcard faces. */
export function renderInlineMarkdown(md: string): string {
  const math: string[] = [];
  const stash = (html: string) => `\u0000M${math.push(html) - 1}\u0000`;
  let src = md.replace(MATH_BLOCK, (_, tex) => stash(renderMath(tex.trim(), true)));
  src = src.replace(MATH_INLINE, (_, pre, tex) => pre + stash(renderMath(tex, false)));
  const html = marked.parseInline(src, { gfm: true, async: false }) as string;
  const withMath = html.replace(/\u0000M(\d+)\u0000/g, (_, i) => math[Number(i)]);
  return DOMPurify.sanitize(withMath);
}

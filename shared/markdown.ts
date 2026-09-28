// Environment-independent helpers that convert between BlockNote blocks with
// [[page links]] and plain markdown text. The actual markdown parser/serializer
// comes from a BlockNote editor (browser: headless editor, Node: server-util).

/** Matches [[Title]], [[Title|alias]] and [[Title#heading]]. */
export const WIKILINK_RE = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g;

type Inline = { type: string; text?: string; styles?: Record<string, unknown>; props?: Record<string, string>; content?: unknown };
type AnyBlock = { type: string; content?: unknown; children?: AnyBlock[]; [k: string]: unknown };

export type LinkResolver = (title: string) => { id: string; title: string } | null;

function mapInline(content: unknown, fn: (items: Inline[]) => Inline[]): unknown {
  if (Array.isArray(content)) {
    return fn(
      content.map((item: Inline) =>
        item.type === "link" && Array.isArray(item.content) ? { ...item, content: fn(item.content as Inline[]) } : item,
      ),
    );
  }
  if (content && typeof content === "object" && (content as { type?: string }).type === "tableContent") {
    const table = content as { rows: { cells: unknown[] }[] };
    return {
      ...table,
      rows: table.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => {
          if (Array.isArray(cell)) return fn(cell as Inline[]);
          if (cell && typeof cell === "object" && Array.isArray((cell as { content?: unknown }).content)) {
            return { ...(cell as object), content: fn((cell as { content: Inline[] }).content) };
          }
          return cell;
        }),
      })),
    };
  }
  return content;
}

function mapBlocks<T extends AnyBlock>(blocks: T[], fn: (items: Inline[]) => Inline[]): T[] {
  return blocks.map((b) => ({
    ...b,
    // Code is literal: never turn [[x]] or $x$ inside it into links or math.
    content: b.type === "codeBlock" ? b.content : mapInline(b.content, fn),
    children: b.children ? mapBlocks(b.children, fn) : b.children,
  }));
}

/** A paragraph that is only `![[Title]]` (an Obsidian embed). */
const EMBED_LINE_RE = /^\s*!\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]\s*$/;
/** [[links]], and ![[embeds]] inside text (which become plain links). */
const LINK_OR_EMBED_RE = new RegExp(`!?${WIKILINK_RE.source}`, "g");

/** `![[Title]]` paragraphs become embed blocks where the title resolves. */
function embedBlocks<T extends AnyBlock>(blocks: T[], resolve: LinkResolver): T[] {
  return blocks.map((b) => {
    if (b.type === "paragraph") {
      const m = plainText(b.content)?.match(EMBED_LINE_RE);
      const target = m ? resolve(m[1].trim()) : null;
      if (target) return { ...b, type: "embed", props: { pageId: target.id }, content: undefined } as T;
    }
    return { ...b, children: b.children ? embedBlocks(b.children, resolve) : b.children };
  });
}

/** Turn [[Title]] text into pageLink inline content where the title resolves. */
export function linkifyBlocks<T extends AnyBlock>(blocks: T[], resolve: LinkResolver): T[] {
  return mapBlocks(embedBlocks(blocks, resolve), (items) => {
    const out: Inline[] = [];
    for (const item of items) {
      if (item.type !== "text" || !item.text || !item.text.includes("[[")) {
        out.push(item);
        continue;
      }
      let last = 0;
      const text = item.text;
      for (const m of text.matchAll(LINK_OR_EMBED_RE)) {
        const target = resolve(m[1].trim());
        if (!target) continue;
        if (m.index! > last) out.push({ ...item, text: text.slice(last, m.index) });
        out.push({ type: "pageLink", props: { pageId: target.id, title: target.title } });
        last = m.index! + m[0].length;
      }
      if (last < text.length) out.push({ ...item, text: text.slice(last) });
    }
    return out;
  });
}

const DISPLAY_MATH_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;
const INLINE_MATH_RE = /(^|[^\\$\w])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?![\w$])/g;

function plainText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  let s = "";
  for (const item of content as Inline[]) {
    if (item.type !== "text") return null;
    s += item.text ?? "";
  }
  return s;
}

/**
 * Turn `$$…$$` paragraphs into math blocks and `$…$` spans into inline math,
 * so LaTeX from markdown (lessons, imports, Claude) renders as equations.
 */
export function mathifyBlocks<T extends AnyBlock>(blocks: T[]): T[] {
  const withBlocks = blocks.map((b) => {
    if (b.type === "paragraph") {
      const m = plainText(b.content)?.match(DISPLAY_MATH_RE);
      if (m) return { ...b, type: "math", props: { latex: m[1].trim() }, content: undefined } as T;
    }
    return { ...b, children: b.children ? mathifyBlocks(b.children) : b.children };
  });
  return mapBlocks(withBlocks, (items) => {
    const out: Inline[] = [];
    for (const item of items) {
      if (item.type !== "text" || !item.text || !item.text.includes("$") || item.styles?.code) {
        out.push(item);
        continue;
      }
      const text = item.text;
      let last = 0;
      for (const m of text.matchAll(INLINE_MATH_RE)) {
        const start = m.index! + m[1].length;
        if (start > last) out.push({ ...item, text: text.slice(last, start) });
        out.push({ type: "inlineMath", props: { latex: m[2] } });
        last = m.index! + m[0].length;
      }
      if (last < text.length) out.push({ ...item, text: text.slice(last) });
    }
    return out;
  });
}

/** Inverse of mathifyBlocks for markdown export. */
export function unmathBlocks<T extends AnyBlock>(blocks: T[]): T[] {
  const noBlocks = blocks.map((b) => {
    if (b.type === "math") {
      const latex = (b.props as { latex?: string } | undefined)?.latex ?? "";
      return { ...b, type: "paragraph", props: {}, content: [{ type: "text", text: `$$${latex}$$`, styles: {} }] } as T;
    }
    return { ...b, children: b.children ? unmathBlocks(b.children) : b.children };
  });
  return mapBlocks(noBlocks, (items) =>
    items.map((item) =>
      item.type === "inlineMath" ? { type: "text", text: `$${item.props?.latex ?? ""}$`, styles: {} } : item,
    ),
  );
}

/** Replace page links with literal [[Title]] text and embeds with ![[Title]] (for markdown export). */
export function unlinkBlocks<T extends AnyBlock>(blocks: T[], titleOf: (id: string) => string | undefined): T[] {
  const unembed = (bs: T[]): T[] =>
    bs.map((b) => {
      if (b.type === "embed") {
        const id = (b.props as { pageId?: string } | undefined)?.pageId ?? "";
        return { ...b, type: "paragraph", props: {}, content: [{ type: "text", text: `![[${titleOf(id) || "Untitled"}]]`, styles: {} }] } as T;
      }
      return { ...b, children: b.children ? unembed(b.children as T[]) : b.children };
    });
  return mapBlocks(unembed(blocks), (items) =>
    items.map((item) => {
      if (item.type !== "pageLink") return item;
      const title = titleOf(item.props?.pageId ?? "") || item.props?.title || "Untitled";
      return { type: "text", text: `[[${title}]]`, styles: {} };
    }),
  );
}

// LaTeX survives markdown parsing only if the parser never sees it as
// markdown: `$x_i + y_i$` would become emphasis and `\{` / `\\` would lose
// their backslashes. protectMath escapes, inside math spans, exactly the
// characters BlockNote's parser unescapes, so raw LaTeX reaches mathifyBlocks.
// The serializer writes text verbatim except that newlines become hard breaks
// (`\` + newline), which restoreMath removes from exported display math.

const MATH_BLOCK_SPAN = /\$\$([\s\S]+?)\$\$/g;
const MATH_INLINE_SPAN = /(^|[^\\$])\$([^\s$](?:[^$\n]*?[^\s$])?)\$(?!\d)/g;
const PARSER_ESCAPABLE = /[!#()*+\-.>[\\\]_`{|}~]/g;

/** Apply `fn` to the parts of `md` outside fenced and inline code. */
function outsideCode(md: string, fn: (text: string) => string): string {
  const out: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (buf.length) {
      const parts = buf.join("\n").split(/(`+[^`\n]*?`+)/g);
      out.push(parts.map((p, i) => (i % 2 === 1 ? p : fn(p))).join(""));
    }
    buf = [];
  };
  for (const line of md.split("\n")) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    if (m) {
      flush();
      fence = m[1];
      out.push(line);
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.join("\n");
}

const escapeTex = (tex: string) => tex.replace(PARSER_ESCAPABLE, (c) => `\\${c}`);

/** Prepare markdown containing LaTeX for the markdown parser. */
export function protectMath(md: string): string {
  return outsideCode(md, (text) =>
    text
      // A blank line would split a display equation across paragraphs.
      .replace(MATH_BLOCK_SPAN, (_, tex: string) => `$$${escapeTex(tex.trim().replace(/\n\s*\n/g, "\n"))}$$`)
      .replace(MATH_INLINE_SPAN, (_, pre: string, tex: string) => `${pre}$${escapeTex(tex)}$`),
  );
}

/** Undo serializer artifacts inside display math of exported markdown. */
export function restoreMath(md: string): string {
  return outsideCode(md, (text) => text.replace(MATH_BLOCK_SPAN, (_, tex: string) => `$$${tex.replace(/\\\n/g, "\n")}$$`));
}

/** Undo markdown escaping of wikilink brackets introduced by serializers. */
export function fixWikilinkEscapes(md: string): string {
  return md.replace(/\\\[\\\[/g, "[[").replace(/\\\]\\\]/g, "]]").replace(/\\\[\[/g, "[[").replace(/\]\\\]/g, "]]");
}

/** Make a string safe to use as a file name. */
export function safeFileName(name: string): string {
  return (name.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim() || "Untitled").slice(0, 120);
}

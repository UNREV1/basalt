// Obsidian-compatible vault import/export and markdown helpers shared by the
// Node tools (MCP server, vault CLI) and the browser (Settings → Import/Export).
//
// Nothing here touches the DOM or the file system: markdown parsing and
// serialization are delegated to a BlockConverter (a headless BlockNote editor
// in the browser, @blocknote/server-util in Node), and files are passed in and
// out as plain { path, data } records.

import * as Y from "yjs";
import {
  DEFAULT_TYPE_ID,
  SELECT_COLORS,
  createPage,
  displayTitle,
  getPage,
  getType,
  listPages,
  listTypes,
  metaMap,
  pageMeta,
  pagesMap,
  saveType,
  type ObjectType,
  type PageMeta,
  type PropDef,
} from "./model.ts";
import {
  fixWikilinkEscapes,
  linkifyBlocks,
  mathifyBlocks,
  protectMath,
  restoreMath,
  safeFileName,
  unlinkBlocks,
  unmathBlocks,
  type LinkResolver,
} from "./markdown.ts";
import { allLessons, courseMap, getCurriculum, getProgress } from "./course.ts";
import {
  excalidrawBaseName,
  isExcalidrawFileName,
  parseExcalidrawFile,
  readSceneFromBoard,
  sceneToExcalidrawJson,
  writeSceneToBoard,
} from "./excalidraw-md.ts";

// ---- markdown conversion ---------------------------------------------------------

/** The BlockNote operations the vault logic needs; sync or async. */
export interface BlockConverter {
  parseMarkdown(md: string): unknown[] | Promise<unknown[]>;
  blocksToMarkdown(blocks: unknown[]): string | Promise<string>;
  fragmentToBlocks(fragment: Y.XmlFragment): unknown[];
  blocksToFragment(blocks: unknown[], fragment: Y.XmlFragment): void;
}

type AnyBlock = { type: string; props?: Record<string, any>; content?: unknown; children?: AnyBlock[]; [k: string]: unknown };

/** Normalize a [[link]] target: drop extension .md, leading ./ or /, surrounding space. */
export function normalizeLinkTarget(target: string): string {
  let t = target.trim().replace(/\\/g, "/");
  try {
    if (/%[0-9a-f]{2}/i.test(t)) t = decodeURIComponent(t);
  } catch {
    // keep as is
  }
  return t
    .replace(/^\.?\//, "")
    .replace(/\.(md|markdown)$/i, "")
    .trim();
}

/** Resolve [[Title]] (also [[folder/Title]] and [[Title.md]]) to live pages, case-insensitively. */
export function pageTitleResolver(doc: Y.Doc): LinkResolver {
  const byTitle = new Map<string, { id: string; title: string }>();
  const pages = listPages(doc).sort((a, b) => a.createdAt - b.createdAt);
  for (const p of pages) {
    const key = displayTitle(p).toLowerCase();
    if (!byTitle.has(key)) byTitle.set(key, { id: p.id, title: displayTitle(p) });
  }
  return (raw) => {
    const t = normalizeLinkTarget(raw).toLowerCase();
    return byTitle.get(t) ?? byTitle.get(t.split("/").pop() ?? t) ?? byTitle.get(t.replace(/\.excalidraw$/, "")) ?? null;
  };
}

/** Title lookup used when turning page links back into [[Title]] text. */
export function pageTitleOf(doc: Y.Doc): (id: string) => string | undefined {
  return (id) => {
    const p = getPage(doc, id);
    return p ? displayTitle(pageMeta(p)) : undefined;
  };
}

function mapInlineText(content: unknown, fn: (text: string) => string): unknown {
  const mapItems = (items: any[]): any[] =>
    items.map((it) => {
      if (it && it.type === "text" && typeof it.text === "string") return { ...it, text: fn(it.text) };
      if (it && it.type === "link" && Array.isArray(it.content)) return { ...it, content: mapItems(it.content) };
      return it;
    });
  if (Array.isArray(content)) return mapItems(content);
  if (content && typeof content === "object" && (content as any).type === "tableContent") {
    const table = content as { rows: { cells: any[] }[] };
    return {
      ...table,
      rows: table.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) =>
          Array.isArray(cell)
            ? mapItems(cell)
            : cell && Array.isArray(cell.content)
              ? { ...cell, content: mapItems(cell.content) }
              : cell,
        ),
      })),
    };
  }
  return content;
}

/**
 * The markdown parser turns soft line breaks into "\n " (newline + space).
 * Drop the stray space so text round-trips cleanly and line-based tools
 * (flashcards, memory files) see the lines as written.
 */
function cleanParsedBlocks(blocks: AnyBlock[]): AnyBlock[] {
  return blocks.map((b) => ({
    ...b,
    content: b.type === "codeBlock" ? b.content : mapInlineText(b.content, (t) => t.replace(/\n /g, "\n")),
    children: b.children ? cleanParsedBlocks(b.children) : b.children,
  }));
}

/** Apply `fn` to the parts of a markdown document outside fenced code blocks. */
export function mapOutsideCode(md: string, fn: (text: string) => string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (buf.length) out.push(fn(buf.join("\n")));
    buf = [];
  };
  for (const line of lines) {
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

/** Make serializer output read like hand-written markdown. */
export function tidyMarkdown(md: string): string {
  const tidy = mapOutsideCode(md, (text) =>
    text
      // Hard breaks between plain lines: a bare newline reads the same in Obsidian
      // and to Claude. Indented/quoted continuations keep the backslash, which
      // the parser needs to keep them inside their list item or quote.
      .replace(/\\\n(?=[^\s>])/g, "\n")
      .replace(/^(\s*)\* (?!\*)/gm, "$1- ") // "-" bullets, as people (and Obsidian) write them
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n"),
  );
  return tidy.replace(/^\s+|\s+$/g, "") + "\n";
}

function fallbackBlocks(md: string): AnyBlock[] {
  return md
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p, styles: {} }] }));
}

/**
 * Run a block transform without letting it touch code blocks: `[[x]]` or `$`
 * inside code must stay literal (and inline nodes are invalid there).
 */
function outsideCodeBlocks(blocks: AnyBlock[], fn: (blocks: AnyBlock[]) => AnyBlock[]): AnyBlock[] {
  const stash: unknown[] = [];
  const hide = (bs: AnyBlock[]): AnyBlock[] =>
    bs.map((b) => {
      const children = b.children ? hide(b.children) : b.children;
      if (b.type !== "codeBlock") return { ...b, children };
      stash.push(b.content);
      return { ...b, content: { type: "codeStash", index: stash.length - 1 }, children };
    });
  const show = (bs: AnyBlock[]): AnyBlock[] =>
    bs.map((b) => {
      const children = b.children ? show(b.children) : b.children;
      const c = b.content as { type?: string; index?: number } | undefined;
      return c && c.type === "codeStash" ? { ...b, content: stash[c.index!], children } : { ...b, children };
    });
  return show(fn(hide(blocks)));
}

/** Markdown -> BlockNote blocks with [[links]] resolved and $math$ recognized. */
export async function markdownToBlocks(conv: BlockConverter, md: string, resolve: LinkResolver): Promise<any[]> {
  let parsed: AnyBlock[];
  try {
    parsed = (await conv.parseMarkdown(protectMath(md))) as AnyBlock[];
  } catch {
    parsed = fallbackBlocks(md);
  }
  return outsideCodeBlocks(cleanParsedBlocks(parsed), (bs) => mathifyBlocks(linkifyBlocks(bs as any[], resolve)));
}

/** BlockNote blocks -> markdown with page links as [[Title]] and math as $…$. */
export async function blocksToMarkdown(
  conv: BlockConverter,
  blocks: unknown[],
  titleOf: (id: string) => string | undefined,
): Promise<string> {
  const md = await conv.blocksToMarkdown(unmathBlocks(unlinkBlocks(blocks as any[], titleOf)) as unknown[]);
  return tidyMarkdown(restoreMath(fixWikilinkEscapes(md)));
}

export async function fragmentToMarkdown(
  conv: BlockConverter,
  doc: Y.Doc,
  fragment: Y.XmlFragment | undefined,
  titleOf: (id: string) => string | undefined = pageTitleOf(doc),
): Promise<string> {
  if (!fragment) return "";
  const blocks = conv.fragmentToBlocks(fragment);
  if (!blocks.length) return "";
  const md = await blocksToMarkdown(conv, blocks, titleOf);
  return md.trim() ? md : "";
}

function isEmptyParagraph(b: any): boolean {
  return b && b.type === "paragraph" && (!Array.isArray(b.content) || b.content.length === 0) && !b.children?.length;
}

export type WriteMode = "replace" | "append" | "prepend";

/**
 * Write markdown into a page's rich-text content. Append/prepend keep the
 * existing blocks (and their ids) so collaborators' cursors stay put.
 */
export async function writePageMarkdown(
  conv: BlockConverter,
  doc: Y.Doc,
  pageId: string,
  md: string,
  opts: { mode?: WriteMode; origin?: unknown; resolve?: LinkResolver } = {},
) {
  const page = getPage(doc, pageId);
  if (!page) throw new Error(`Page ${pageId} not found`);
  const mode = opts.mode ?? "replace";
  const incoming = md.trim() ? await markdownToBlocks(conv, md, opts.resolve ?? pageTitleResolver(doc)) : [];
  let fragment = page.get("content") as Y.XmlFragment | undefined;
  doc.transact(() => {
    if (!(fragment instanceof Y.XmlFragment)) {
      fragment = new Y.XmlFragment();
      page.set("content", fragment);
    }
    let blocks: unknown[] = incoming;
    if (mode !== "replace") {
      const existing = (conv.fragmentToBlocks(fragment) as any[]).filter((b, i, arr) => !(i === arr.length - 1 && isEmptyParagraph(b)));
      blocks = mode === "append" ? [...existing, ...incoming] : [...incoming, ...existing];
    }
    conv.blocksToFragment(blocks, fragment);
    page.set("updatedAt", Date.now());
  }, opts.origin ?? null);
}

// ---- YAML frontmatter ---------------------------------------------------------------

const PLAIN_SCALAR = /^[A-Za-z0-9_./@+()-][A-Za-z0-9 _./@+()'!?&-]*$/;
/** Plain scalars YAML would read as numbers (these must be quoted to stay strings). */
const YAML_NUMBER = /^[-+]?(\d[\d_]*(\.\d*)?([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?|0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : JSON.stringify(String(v));
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  if (ISO_DATE.test(s)) return s;
  if (
    PLAIN_SCALAR.test(s) &&
    !/\s$/.test(s) &&
    !/^(true|false|yes|no|on|off|null|~)$/i.test(s) &&
    !YAML_NUMBER.test(s)
  ) {
    return s;
  }
  return JSON.stringify(s);
}

/** Serialize flat frontmatter (Obsidian "properties" style). */
export function toYaml(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    const k = /^[A-Za-z0-9_-][A-Za-z0-9 _-]*$/.test(key) && !/\s$/.test(key) ? key : JSON.stringify(key);
    if (Array.isArray(value)) {
      if (!value.length) lines.push(`${k}: []`);
      else {
        lines.push(`${k}:`);
        for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
      }
    } else {
      lines.push(`${k}: ${yamlScalar(value)}`);
    }
  }
  return lines.join("\n");
}

function parseYamlScalar(raw: string): unknown {
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, s.endsWith('"') ? -1 : undefined);
    }
  }
  if (s.startsWith("'")) return s.slice(1, s.endsWith("'") ? -1 : undefined).replace(/''/g, "'");
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    const items: string[] = [];
    let cur = "";
    let quote: string | null = null;
    for (const ch of inner) {
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
      } else if (ch === ",") {
        items.push(cur);
        cur = "";
      } else cur += ch;
    }
    items.push(cur);
    return items.map((i) => parseYamlScalar(i)).filter((i) => i !== null && i !== "");
  }
  if (s.startsWith("{")) {
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }
  s = s.replace(/\s+#.*$/, "");
  if (/^(true|yes|on)$/i.test(s)) return true;
  if (/^(false|no|off)$/i.test(s)) return false;
  if (/^(null|~)$/i.test(s)) return null;
  if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/** Parse the flat YAML Obsidian uses for properties (scalars, lists, block text). */
export function parseYaml(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#") || /^\s/.test(line)) continue;
    const m = line.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*))?$/);
    if (!m) continue;
    const key = String(parseYamlScalar(m[1]));
    const rest = (m[2] ?? "").trim();
    if (rest === "|" || rest === ">" || /^[|>][+-]?$/.test(rest)) {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim());
      out[key] = block.join(rest.startsWith(">") ? " " : "\n").trim();
      continue;
    }
    if (rest) {
      out[key] = parseYamlScalar(rest);
      continue;
    }
    const list: unknown[] = [];
    const nested: Record<string, unknown> = {};
    while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || /^-\s/.test(lines[i + 1]) || !lines[i + 1].trim())) {
      const next = lines[++i].trim();
      if (!next) continue;
      if (next.startsWith("- ") || next === "-") list.push(parseYamlScalar(next.slice(1)));
      else {
        const kv = next.match(/^([^:]+?)\s*:\s*(.*)$/);
        if (kv) nested[kv[1]] = parseYamlScalar(kv[2]);
      }
    }
    out[key] = list.length ? list : Object.keys(nested).length ? nested : null;
  }
  return out;
}

/** Split `---` frontmatter from a markdown document. */
export function splitFrontmatter(text: string): { data: Record<string, unknown>; body: string; hasFrontmatter: boolean } {
  const src = text.replace(/^﻿/, "");
  const m = src.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
  if (!m) return { data: {}, body: src, hasFrontmatter: false };
  let data: Record<string, unknown> = {};
  try {
    data = parseYaml(m[1]);
  } catch {
    data = {};
  }
  return { data, body: src.slice(m[0].length), hasFrontmatter: true };
}

// ---- typed properties ---------------------------------------------------------------

export interface PropEntry {
  def: PropDef;
  value: unknown;
}

/** A page's property values paired with their definitions (type order first, then extras). */
export function pagePropEntries(doc: Y.Doc, page: Y.Map<any>): PropEntry[] {
  const props = (page.get("props") as Y.Map<any> | undefined)?.toJSON() ?? {};
  const type = getType(doc, page.get("typeId") ?? DEFAULT_TYPE_ID);
  const out: PropEntry[] = [];
  const seen = new Set<string>();
  for (const def of type?.props ?? []) {
    if (props[def.id] === undefined || props[def.id] === null || props[def.id] === "") continue;
    out.push({ def, value: props[def.id] });
    seen.add(def.id);
  }
  for (const [id, value] of Object.entries(props)) {
    if (seen.has(id) || value === undefined || value === null || value === "") continue;
    out.push({ def: { id, name: id, kind: "text" }, value });
  }
  return out;
}

function optionName(def: PropDef, id: unknown): string {
  return def.options?.find((o) => o.id === id)?.name ?? String(id);
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateString(v: unknown): string {
  if (typeof v === "number") return localDateKey(new Date(v));
  return String(v);
}

/** Property value as plain JSON for frontmatter (option names instead of ids). */
export function propExportValue(def: PropDef, value: unknown, linkOf: (pageId: string) => string): unknown {
  switch (def.kind) {
    case "select":
      return optionName(def, value);
    case "multi":
      return (Array.isArray(value) ? value : [value]).map((v) => optionName(def, v));
    case "checkbox":
      return !!value;
    case "number":
      return typeof value === "number" ? value : Number(value);
    case "date":
      return dateString(value);
    case "page":
      return (Array.isArray(value) ? value : [value]).map((id) => `[[${linkOf(String(id))}]]`).join(", ");
    default:
      return value;
  }
}

/** Property value as short human text (for Claude). */
export function propDisplayValue(def: PropDef, value: unknown, titleOf: (pageId: string) => string): string {
  const v = propExportValue(def, value, titleOf);
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export interface CoercedProps {
  props: Record<string, unknown>;
  /** Input keys that match no property of the type. */
  unknown: string[];
  errors: string[];
  /** The type with newly created select options, if any (caller saves it). */
  updatedType: ObjectType | null;
}

function findDef(type: ObjectType | undefined, key: string): PropDef | undefined {
  const k = key.trim().toLowerCase();
  return type?.props.find((p) => p.id.toLowerCase() === k || p.name.toLowerCase() === k);
}

/**
 * Convert user-facing property input ({ "Status": "In progress", tags: ["a"] })
 * into stored values keyed by prop id. Unknown select options are created
 * when `createOptions` is set.
 */
export function coerceProps(
  doc: Y.Doc,
  typeId: string,
  input: Record<string, unknown>,
  opts: {
    /** Add unknown values as new options of multi-select properties (tags). */
    createOptions?: boolean;
    /** Also add unknown values to single-select properties (default: reject them). */
    createSelectOptions?: boolean;
    resolvePage?: (ref: string) => string | null;
  } = {},
): CoercedProps {
  const base = getType(doc, typeId);
  let type: ObjectType | undefined = base ? JSON.parse(JSON.stringify(base)) : undefined;
  let changed = false;
  const out: CoercedProps = { props: {}, unknown: [], errors: [], updatedType: null };
  const optionId = (def: PropDef, raw: unknown): string | null => {
    const name = String(raw).trim();
    if (!name) return null;
    const found = def.options?.find((o) => o.id === name || o.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const mayCreate = def.kind === "select" ? opts.createSelectOptions || !def.options?.length : opts.createOptions;
    if (!mayCreate) {
      out.errors.push(`"${name}" is not an option of ${def.name} (options: ${(def.options ?? []).map((o) => o.name).join(", ") || "none"})`);
      return null;
    }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || `opt${(def.options?.length ?? 0) + 1}`;
    const unique = def.options?.some((o) => o.id === id) ? `${id}-${(def.options?.length ?? 0) + 1}` : id;
    def.options = [...(def.options ?? []), { id: unique, name, color: SELECT_COLORS[(def.options?.length ?? 0) % SELECT_COLORS.length] }];
    changed = true;
    return unique;
  };
  for (const [key, raw] of Object.entries(input)) {
    const def = findDef(type, key);
    if (!def) {
      out.unknown.push(key);
      continue;
    }
    if (raw === null || raw === undefined || raw === "") {
      out.props[def.id] = null;
      continue;
    }
    switch (def.kind) {
      case "select": {
        const id = optionId(def, Array.isArray(raw) ? raw[0] : raw);
        if (id) out.props[def.id] = id;
        break;
      }
      case "multi": {
        const list = Array.isArray(raw) ? raw : String(raw).split(",");
        const ids = list.map((v) => optionId(def, typeof v === "string" ? v.replace(/^#/, "") : v)).filter((v): v is string => !!v);
        out.props[def.id] = [...new Set(ids)];
        break;
      }
      case "number": {
        const n = typeof raw === "number" ? raw : Number(String(raw).trim());
        if (Number.isFinite(n)) out.props[def.id] = n;
        else out.errors.push(`${def.name} must be a number`);
        break;
      }
      case "checkbox":
        out.props[def.id] = typeof raw === "boolean" ? raw : /^(true|yes|y|1|x|done|on)$/i.test(String(raw).trim());
        break;
      case "date": {
        // Stored like the app does: a local calendar day "YYYY-MM-DD".
        const s = String(raw).trim();
        const d = typeof raw === "number" ? new Date(raw < 1e12 ? raw * 1000 : raw) : new Date(s);
        if (typeof raw !== "number" && /^\d{4}-\d{2}-\d{2}/.test(s)) out.props[def.id] = s.slice(0, 10);
        else if (!Number.isNaN(d.getTime())) out.props[def.id] = localDateKey(d);
        else out.errors.push(`${def.name} must be a date (YYYY-MM-DD)`);
        break;
      }
      case "page": {
        const refs = (Array.isArray(raw) ? raw : String(raw).split(",")).map((r) => String(r).replace(/^\s*\[\[|\]\]\s*$/g, "").trim());
        const ids = refs.map((r) => opts.resolvePage?.(r) ?? null).filter((v): v is string => !!v);
        if (ids.length) out.props[def.id] = ids[0];
        else out.errors.push(`${def.name}: no page found for ${refs.join(", ")}`);
        break;
      }
      default:
        out.props[def.id] = Array.isArray(raw) ? raw.join(", ") : typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    }
  }
  if (changed && type) out.updatedType = type;
  return out;
}

/** Apply coerced props to a page (null deletes), saving new select options. Call inside a transaction. */
export function applyProps(doc: Y.Doc, page: Y.Map<any>, coerced: CoercedProps) {
  if (coerced.updatedType) saveType(doc, coerced.updatedType);
  let props = page.get("props") as Y.Map<any> | undefined;
  if (!(props instanceof Y.Map)) {
    props = new Y.Map();
    page.set("props", props);
  }
  for (const [id, v] of Object.entries(coerced.props)) {
    if (v === null || v === undefined) props.delete(id);
    else props.set(id, v);
  }
}

// ---- export ---------------------------------------------------------------------------

export type VaultData = string | Uint8Array;

export interface VaultExportOptions {
  /** Write CLAUDE.md at the vault root (default true). */
  claudeMd?: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
  /** Yield to the event loop every N pages (lets a browser paint progress). */
  yieldEvery?: number;
}

interface Entry {
  meta: PageMeta;
  base: string;
  ext: string;
  /** Vault-relative path of the page's file. */
  path: string;
  /** What goes inside [[…]] to reach this file from anywhere in the vault. */
  target: string;
  hasChildren: boolean;
}

interface CachedBody {
  sig: string;
  body: string;
  attachments: { path: string; data: Uint8Array }[];
  links: string[];
}

export const ATTACHMENTS_DIR = "_attachments";
const MANIFEST_NAME = ".basalt-vault.json";
export const VAULT_MANIFEST = MANIFEST_NAME;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
};

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeDataUrl(url: string): { mime: string; bytes: Uint8Array } | null {
  const m = url.match(/^data:([^;,]+)?(;[^,]*)?,(.*)$/s);
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  try {
    const bytes = (m[2] ?? "").includes("base64") ? base64ToBytes(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
    return { mime, bytes };
  } catch {
    return null;
  }
}

function fence(code: string, lang = ""): string {
  const longest = Math.max(2, ...[...code.matchAll(/`{3,}/g)].map((m) => m[0].length));
  const f = "`".repeat(longest + 1);
  return `${f}${lang}\n${code.replace(/\n$/, "")}\n${f}`;
}

function iso(ts: number): string | undefined {
  return ts ? new Date(ts).toISOString() : undefined;
}

function tableCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Builds an Obsidian vault from a workspace. Keeps a per-page cache so repeated
 * builds (watch mode) only re-render pages that changed.
 */
export class VaultExporter {
  private cache = new Map<string, CachedBody>();
  private dirty = new Set<string>();
  private allDirty = true;
  private readonly doc: Y.Doc;
  private readonly conv: BlockConverter;
  private readonly opts: VaultExportOptions;

  constructor(doc: Y.Doc, conv: BlockConverter, opts: VaultExportOptions = {}) {
    this.doc = doc;
    this.conv = conv;
    this.opts = opts;
  }

  /** Mark pages as changed (no argument: everything). */
  invalidate(pageIds?: Iterable<string>) {
    if (!pageIds) {
      this.allDirty = true;
      return;
    }
    for (const id of pageIds) this.dirty.add(id);
  }

  /** Page layout: vault paths and link targets for every live page. */
  layout(): Map<string, Entry> {
    const pages = listPages(this.doc);
    const live = new Set(pages.map((p) => p.id));
    const byParent = new Map<string | null, PageMeta[]>();
    for (const p of pages) {
      const parent = p.parentId && live.has(p.parentId) && p.parentId !== p.id ? p.parentId : null;
      if (!byParent.has(parent)) byParent.set(parent, []);
      byParent.get(parent)!.push(p);
    }
    const entries = new Map<string, Entry>();
    const visited = new Set<string>();
    const place = (parentId: string | null, dir: string) => {
      const used = new Set<string>(dir ? [] : ["claude", ATTACHMENTS_DIR.toLowerCase()]);
      const kids = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
      for (const meta of kids) {
        if (visited.has(meta.id)) continue;
        visited.add(meta.id);
        let base = safeFileName(displayTitle(meta)).replace(/^\.+/, "") || "Untitled";
        if (used.has(base.toLowerCase())) {
          let n = 2;
          while (used.has(`${base} (${n})`.toLowerCase())) n++;
          base = `${base} (${n})`;
        }
        used.add(base.toLowerCase());
        const ext = meta.kind === "board" ? ".excalidraw" : ".md";
        const hasChildren = (byParent.get(meta.id) ?? []).length > 0;
        const folder = dir ? `${dir}/${base}` : base;
        const path = hasChildren ? `${folder}/${base}${ext}` : `${folder}${ext}`;
        entries.set(meta.id, { meta, base, ext, path, target: "", hasChildren });
        if (hasChildren) place(meta.id, folder);
      }
    };
    place(null, "");
    // Link targets: bare file names where unique (Obsidian's default), else paths.
    const counts = new Map<string, number>();
    const nameOf = (e: Entry) => (e.ext === ".md" ? e.base : e.base + e.ext).toLowerCase();
    for (const e of entries.values()) counts.set(nameOf(e), (counts.get(nameOf(e)) ?? 0) + 1);
    for (const e of entries.values()) {
      const unique = counts.get(nameOf(e)) === 1;
      e.target = unique ? (e.ext === ".md" ? e.base : e.base + e.ext) : e.ext === ".md" ? e.path.slice(0, -3) : e.path;
    }
    return entries;
  }

  private linkText(entries: Map<string, Entry>, id: string): string | undefined {
    const e = entries.get(id);
    if (!e) {
      const p = getPage(this.doc, id);
      return p ? displayTitle(pageMeta(p)) : undefined;
    }
    const title = displayTitle(e.meta).replace(/[|\]\[]/g, "-");
    return e.target === title ? e.target : `${e.target}|${title}`;
  }

  private async fragmentBody(
    entries: Map<string, Entry>,
    entry: Entry,
    fragment: Y.XmlFragment | undefined,
  ): Promise<Omit<CachedBody, "sig">> {
    if (!fragment || fragment.length === 0) return { body: "", attachments: [], links: [] };
    const attachments: { path: string; data: Uint8Array }[] = [];
    const tokens = new Map<string, string>();
    const usedNames = new Set<string>();
    const extract = (blocks: AnyBlock[]): AnyBlock[] =>
      blocks.map((b) => {
        let next = b;
        const url = b.props?.url;
        if (typeof url === "string" && url.startsWith("data:")) {
          const decoded = decodeDataUrl(url);
          if (decoded) {
            const ext = MIME_EXT[decoded.mime] ?? "bin";
            let name = safeFileName(String(b.props?.name || `${b.type === "image" ? "image" : "file"}-${attachments.length + 1}`)).replace(/\.[a-z0-9]+$/i, "");
            while (usedNames.has(name.toLowerCase())) name = `${name}-${attachments.length + 1}`;
            usedNames.add(name.toLowerCase());
            const path = `${ATTACHMENTS_DIR}/${entry.meta.id}/${name}.${ext}`;
            const token = `basalt-attachment-${attachments.length}`;
            attachments.push({ path, data: decoded.bytes });
            tokens.set(token, path);
            next = { ...b, props: { ...b.props, url: token } };
          }
        }
        return next.children?.length ? { ...next, children: extract(next.children) } : next;
      });
    const blocks = extract(this.conv.fragmentToBlocks(fragment) as AnyBlock[]);
    let md = await blocksToMarkdown(this.conv, blocks, (id) => this.linkText(entries, id));
    for (const [token, path] of tokens) {
      md = md
        .replace(new RegExp(`!\\[[^\\]\\n]*\\]\\(<?${token}>?\\)`, "g"), `![[${path}]]`)
        .replace(new RegExp(`\\[([^\\]\\n]*)\\]\\(<?${token}>?\\)`, "g"), (_m, label: string) => `[[${path}${label ? `|${label}` : ""}]]`)
        .replaceAll(token, encodeURI(path));
    }
    return { body: md.trim() ? md : "", attachments, links: linksIn(fragment) };
  }

  private frontmatter(entries: Map<string, Entry>, entry: Entry, page: Y.Map<any>): string {
    const m = entry.meta;
    const data: Record<string, unknown> = { id: m.id };
    if (m.kind !== "doc") data.kind = m.kind;
    if (m.typeId && m.typeId !== DEFAULT_TYPE_ID) data.type = m.typeId;
    if (m.icon) data.icon = m.icon;
    if (displayTitle(m) !== entry.base) data.title = displayTitle(m);
    if (m.system) data.system = m.system;
    data.created = iso(m.createdAt);
    data.updated = iso(m.updatedAt);
    const reserved = new Set(Object.keys(data).concat(["kind", "type", "title", "icon", "system", "aliases"]));
    for (const { def, value } of pagePropEntries(this.doc, page)) {
      let key = def.name.toLowerCase() === "tags" ? "tags" : def.name;
      if (reserved.has(key.toLowerCase())) key = `${def.name} (property)`;
      data[key] = propExportValue(def, value, (id) => this.linkText(entries, id) ?? id);
    }
    return `---\n${toYaml(data)}\n---\n`;
  }

  private courseOutline(entries: Map<string, Entry>, page: Y.Map<any>): string {
    const course = courseMap(page);
    const curriculum = getCurriculum(page);
    const lines: string[] = [];
    const topic = course?.get("topic");
    const goal = course?.get("goal");
    const start = course?.get("startLevel");
    if (topic) lines.push(`**Topic:** ${topic}  `);
    if (goal) lines.push(`**Goal:** ${goal}  `);
    if (start) lines.push(`**Starting level:** ${start}  `);
    if (!curriculum) {
      lines.push("", "_No curriculum yet._");
      return lines.join("\n").replace(/ {2}$/gm, "");
    }
    const lessons = allLessons(curriculum);
    const mastered = lessons.filter((l) => getProgress(page, l.lesson.id).status === "mastered").length;
    lines.push(`**Progress:** ${mastered}/${lessons.length} lessons mastered`);
    if (curriculum.overview) lines.push("", curriculum.overview);
    for (const level of curriculum.levels) {
      lines.push("", `## ${level.name}`);
      if (level.summary) lines.push("", level.summary);
      for (const mod of level.modules) {
        lines.push("", `### ${mod.title}`);
        if (mod.summary) lines.push("", mod.summary);
        lines.push("");
        for (const lesson of mod.lessons) {
          const p = getProgress(page, lesson.id);
          const box = p.status === "mastered" ? "[x]" : p.status === "skipped" ? "[-]" : "[ ]";
          const bits: string[] = [];
          if (p.status === "in-progress") bits.push("in progress");
          if (p.status === "skipped") bits.push("skipped");
          if (p.quizzes.length) bits.push(`best quiz ${Math.round(p.mastery * 100)}%`);
          const link = p.lessonPageId && entries.has(p.lessonPageId) ? ` → [[${this.linkText(entries, p.lessonPageId)}]]` : "";
          lines.push(`- ${box} ${lesson.title}${bits.length ? ` _(${bits.join(", ")})_` : ""}${link}`);
          for (const o of lesson.objectives) lines.push(`    - ${o}`);
        }
      }
    }
    return lines.join("\n").replace(/ {2}$/gm, "");
  }

  private notebookCells(page: Y.Map<any>): string {
    const cells = page.get("cells");
    if (!(cells instanceof Y.Array) || cells.length === 0) return "";
    const parts: string[] = [];
    for (const cell of cells.toArray() as any[]) {
      const get = (k: string) => (cell instanceof Y.Map ? cell.get(k) : cell?.[k]);
      const src = get("source");
      const source = src instanceof Y.Text ? src.toString() : typeof src === "string" ? src : "";
      const type = String(get("type") ?? "code");
      if (type === "markdown" || type === "md" || type === "text") {
        if (source.trim()) parts.push(source.trim());
        continue;
      }
      parts.push(fence(source, String(get("lang") ?? "")));
      const out = notebookOutputText(get("outputs"));
      if (out) parts.push(out.split("\n").map((l) => `> ${l}`.trimEnd()).join("\n"));
    }
    return parts.join("\n\n");
  }

  private databaseTable(entries: Map<string, Entry>, page: Y.Map<any>): string {
    const view = page.get("view");
    const viewType = view instanceof Y.Map ? (view.get("typeId") as string | undefined) : undefined;
    const pages = listPages(this.doc);
    const id = page.get("id");
    const rows = pages.filter((p) => p.parentId === id || (viewType && viewType !== DEFAULT_TYPE_ID && p.typeId === viewType && p.id !== id));
    if (!rows.length) return "";
    const type = viewType ? getType(this.doc, viewType) : undefined;
    const defs: PropDef[] = type?.props ?? [];
    if (!type) {
      const seen = new Set<string>();
      for (const r of rows) for (const d of getType(this.doc, r.typeId)?.props ?? []) if (!seen.has(d.id)) (seen.add(d.id), defs.push(d));
    }
    const head = `| Name | ${defs.map((d) => tableCell(d.name)).join(" | ")} |`.replace("|  |", "|");
    const sep = `| --- | ${defs.map(() => "---").join(" | ")} |`.replace("|  |", "|");
    const body = rows
      .sort((a, b) => a.order - b.order)
      .map((r) => {
        const rp = getPage(this.doc, r.id);
        const props = (rp?.get("props") as Y.Map<any> | undefined)?.toJSON() ?? {};
        const cells = defs.map((d) =>
          props[d.id] === undefined || props[d.id] === null
            ? ""
            : tableCell(propDisplayValue(d, props[d.id], (pid) => this.linkText(entries, pid) ?? pid)),
        );
        const link = this.linkText(entries, r.id) ?? displayTitle(r);
        return `| [[${link.replace("|", "\\|")}]] | ${cells.join(" | ")} |`.replace("|  |", "|");
      });
    return [head, sep, ...body].join("\n");
  }

  private paintNote(page: Y.Map<any>): string {
    const layers = page.get("layers");
    const strokes = page.get("strokes");
    const nLayers = layers instanceof Y.Array ? layers.length : 0;
    const nStrokes = strokes instanceof Y.Map ? strokes.size : 0;
    return `> [!info] Basalt painting\n> This page is a layered painting (${nLayers} layer${nLayers === 1 ? "" : "s"}, ${nStrokes} stroke${nStrokes === 1 ? "" : "s"}). Open it in Basalt to view or edit it; paintings are not exported as files.`;
  }

  private async renderPage(entries: Map<string, Entry>, entry: Entry): Promise<CachedBody> {
    const page = getPage(this.doc, entry.meta.id)!;
    const fragment = page.get("content") as Y.XmlFragment | undefined;
    const sig = entry.base;
    if (entry.meta.kind === "board") {
      // Only the whiteboard shapes: painted layers have no place in an .excalidraw file.
      const scene = readSceneFromBoard(page);
      return { sig, body: sceneToExcalidrawJson(scene), attachments: [], links: [] };
    }
    const rendered = await this.fragmentBody(entries, entry, fragment);
    return { sig, ...rendered };
  }

  /** Link targets a cached body depends on, to notice renames of linked pages. */
  private linkSignature(entries: Map<string, Entry>, links: string[]): string {
    return links.map((id) => `${id}=${this.linkText(entries, id) ?? ""}`).join("\n");
  }

  private async cachedBody(entries: Map<string, Entry>, entry: Entry): Promise<CachedBody> {
    const id = entry.meta.id;
    let cached = this.cache.get(id);
    if (cached && cached.sig !== `${entry.base}\n${this.linkSignature(entries, cached.links)}`) cached = undefined;
    if (!cached) {
      const rendered = await this.renderPage(entries, entry);
      cached = { ...rendered, sig: `${entry.base}\n${this.linkSignature(entries, rendered.links)}` };
      this.cache.set(id, cached);
    }
    return cached;
  }

  /** The file text for a page (frontmatter + body), given its rendered rich text. */
  private composeFile(entries: Map<string, Entry>, entry: Entry, richText: string): string {
    const page = getPage(this.doc, entry.meta.id)!;
    if (entry.meta.kind === "board") return richText;
    const parts: string[] = [];
    if (entry.meta.kind === "course") parts.push(this.courseOutline(entries, page));
    if (entry.meta.kind === "paint") parts.push(this.paintNote(page));
    if (richText.trim()) parts.push(richText.trim());
    if (entry.meta.kind === "notebook") parts.push(this.notebookCells(page));
    if (entry.meta.kind === "database") parts.push(this.databaseTable(entries, page));
    const body = parts.filter(Boolean).join("\n\n");
    return `${this.frontmatter(entries, entry, page)}${body ? `\n${body}\n` : ""}`;
  }

  /** Build the complete vault as path -> file data. */
  async build(): Promise<Map<string, VaultData>> {
    const entries = this.layout();
    const files = new Map<string, VaultData>();
    if (this.allDirty) {
      this.cache.clear();
      this.allDirty = false;
    }
    for (const id of this.dirty) this.cache.delete(id);
    this.dirty.clear();
    for (const id of [...this.cache.keys()]) if (!entries.has(id)) this.cache.delete(id);
    const total = entries.size;
    let done = 0;
    for (const entry of entries.values()) {
      const cached = await this.cachedBody(entries, entry);
      files.set(entry.path, this.composeFile(entries, entry, cached.body));
      for (const a of cached.attachments) files.set(a.path, a.data);
      done++;
      this.opts.onProgress?.(done, total, displayTitle(entry.meta));
      if (this.opts.yieldEvery && done % this.opts.yieldEvery === 0) await tick();
    }
    if (this.opts.claudeMd !== false) files.set("CLAUDE.md", buildClaudeMd(this.doc, entries));
    return files;
  }

  /** One page as a self-contained file: images stay inline as data URLs. */
  async pageFile(pageId: string): Promise<{ name: string; data: string; mime: string }> {
    const entries = this.layout();
    const entry = entries.get(pageId);
    if (!entry) throw new Error("Page not found (it may be in the trash)");
    const name = `${entry.base}${entry.ext}`;
    if (entry.meta.kind === "board") {
      const page = getPage(this.doc, pageId)!;
      return { name, data: sceneToExcalidrawJson(readSceneFromBoard(page)), mime: "application/json" };
    }
    const page = getPage(this.doc, pageId)!;
    const rich = await fragmentToMarkdown(this.conv, this.doc, page.get("content") as Y.XmlFragment, (id) => this.linkText(entries, id));
    return { name, data: this.composeFile(entries, entry, rich), mime: "text/markdown" };
  }
}

function linksIn(fragment: Y.XmlFragment): string[] {
  const ids = new Set<string>();
  for (const el of fragment.createTreeWalker((n) => n instanceof Y.XmlElement && n.nodeName === "pageLink")) {
    const id = (el as Y.XmlElement).getAttribute("pageId");
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

/** Best-effort plain text of notebook cell outputs (the notebook view owns the exact shape). */
export function notebookOutputText(outputs: unknown): string {
  const list = outputs instanceof Y.Array ? outputs.toArray() : Array.isArray(outputs) ? outputs : outputs == null ? [] : [outputs];
  const parts: string[] = [];
  for (const raw of list) {
    const o = raw instanceof Y.Map ? raw.toJSON() : raw;
    if (o == null) continue;
    if (typeof o === "string" || typeof o === "number" || typeof o === "boolean") {
      parts.push(String(o));
      continue;
    }
    if (typeof o !== "object") continue;
    const rec = o as Record<string, any>;
    const mime = String(rec.mime ?? rec.mimeType ?? rec.type ?? "");
    if (rec.type === "error") {
      parts.push(`${rec.ename ?? "Error"}: ${rec.message ?? rec.evalue ?? ""}`.trim());
      continue;
    }
    if (rec.type === "display" && typeof rec.text !== "string") {
      parts.push(rec.png ? "[image output]" : rec.html ? "[HTML output]" : "");
      continue;
    }
    if (mime.startsWith("image/") || rec.type === "image") {
      parts.push("[image output]");
      continue;
    }
    const text =
      rec.text ??
      rec.value ??
      rec.data?.["text/plain"] ??
      (rec.error || rec.ename ? `${rec.ename ?? "Error"}: ${rec.evalue ?? rec.message ?? rec.error}` : undefined) ??
      rec.message;
    if (typeof text === "string") parts.push(text.replace(/\n$/, ""));
    else if (Array.isArray(text)) parts.push(text.join(""));
    else parts.push(JSON.stringify(rec).slice(0, 2000));
  }
  return parts.join("\n").trim();
}

/** Guide for Claude Code (or any agent) opening the exported folder. */
export function buildClaudeMd(doc: Y.Doc, entries?: Map<string, Entry>): string {
  const name = metaMap(doc).get("name") || "Basalt workspace";
  const pages = listPages(doc);
  const byKind = new Map<string, number>();
  for (const p of pages) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  const memory = pages.find((p) => p.system === "claude-memory");
  const journal = pages.find((p) => p.system === "journal");
  const pathOf = (id?: string) => (id && entries?.get(id) ? entries.get(id)!.path : null);
  const types = listTypes(doc).filter((t) => t.props.length);
  const lines = [
    `# ${name} — Basalt vault`,
    "",
    `This folder is an Obsidian-compatible export of the Basalt workspace "${name}" (${pages.length} pages: ${[...byKind].map(([k, n]) => `${n} ${k}`).join(", ")}).`,
    "It is a one-way mirror: edits made here are **not** synced back. To change the workspace, use the Basalt MCP server tools (`create_note`, `update_note`, `memory_*`, …) or re-import with `npm run vault -- import`.",
    "",
    "## Layout",
    "",
    "- Every page is a file named after its title. A page with sub-pages becomes a folder holding a same-named note plus the sub-pages (`Projects/Projects.md`, `Projects/Roadmap.md`).",
    "- YAML frontmatter carries `id` (stable Basalt page id — use it with the MCP tools), `kind` (omitted for plain docs), `type` (object type id), `icon`, `created`, `updated` and the page's typed properties by name.",
    "- `[[Wiki links]]` point to other pages by file name (a folder path is used when a name is not unique).",
    "- Whiteboards are `.excalidraw` JSON files (Excalidraw scene with embedded images).",
    "- Notebooks: code cells as fenced code blocks, their outputs as `>` quotes below each cell.",
    "- Courses: the curriculum outline with progress (`[x]` mastered); lessons are sub-pages.",
    "- Databases: a table of their entries. Paintings are placeholders (open them in Basalt).",
    `- \`${ATTACHMENTS_DIR}/<page id>/\` holds images and files embedded in pages.`,
    "- Flashcards are lines of the form `Front :: Back` inside any note.",
  ];
  const special: string[] = [];
  if (memory) special.push(`- Claude's long-term memory: \`${pathOf(memory.id) ?? "Claude Memory.md"}\` and its sub-pages (the \`/memories\` directory of the MCP memory tools).`);
  if (journal) special.push(`- Daily notes: \`${pathOf(journal.id) ?? "Journal.md"}\` and its sub-pages (one per day, titled YYYY-MM-DD).`);
  if (special.length) lines.push("", "## Special pages", "", ...special);
  if (types.length) {
    lines.push("", "## Object types", "");
    for (const t of types) lines.push(`- ${t.icon} **${t.name}** (\`type: ${t.id}\`): ${t.props.map((p) => `${p.name} (${p.kind})`).join(", ")}`);
  }
  lines.push("", "## Tips", "", "- Search with `grep -ri` or ripgrep; titles are file names.", "- Read `id` from frontmatter to address a page precisely through the MCP tools.", "");
  return lines.join("\n");
}

/** Export a single page as one self-contained file (images stay inline). */
export function exportPageFile(doc: Y.Doc, conv: BlockConverter, pageId: string) {
  return new VaultExporter(doc, conv, { claudeMd: false }).pageFile(pageId);
}

// ---- import -----------------------------------------------------------------------------

export interface VaultSourceFile {
  /** Vault-relative path with forward slashes, e.g. "Projects/Plan.md". */
  path: string;
  size: number;
  /** Last modification time (ms), used when frontmatter has no dates. */
  mtime?: number;
  read(): Promise<Uint8Array>;
}

export interface VaultImportOptions {
  /** Put imported top-level pages under this page (default: workspace root). */
  parentId?: string | null;
  /** Create a container page with this title for the whole import. */
  containerTitle?: string;
  createdBy?: string;
  /** Transaction origin for all writes. */
  origin?: unknown;
  /** Largest image embedded as a data URL (bytes, default 2 MB). */
  maxEmbedBytes?: number;
  /** Custom image encoder (the browser downscales). Receives files up to 25 MB. */
  imageToDataUrl?: (file: VaultSourceFile, mime: string) => Promise<string>;
  exclude?: (path: string) => boolean;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface VaultImportResult {
  rootId: string | null;
  pages: number;
  notes: number;
  boards: number;
  folders: number;
  images: number;
  links: number;
  skipped: string[];
  warnings: string[];
}

const NOTE_RE = /\.(md|markdown)$/i;
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function baseOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function noteTitleFromPath(path: string): string {
  const name = baseOf(path);
  return isExcalidrawFileName(name) ? excalidrawBaseName(name) : name.replace(NOTE_RE, "");
}

function joinPath(dir: string, rel: string): string {
  const parts = (dir ? dir.split("/") : []).concat(rel.split("/"));
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function parseDate(v: unknown): number | null {
  if (typeof v === "number" && v > 0) return v < 1e12 ? v * 1000 : v;
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v.trim());
  return Number.isNaN(t) ? null : t;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RESERVED_FM = new Set(["id", "kind", "type", "icon", "created", "updated", "title", "system", "aliases", "cssclasses", "cssclass", "excalidraw-plugin", "publish", "position"]);

interface NoteSource {
  file: VaultSourceFile;
  kind: "doc" | "board";
  title: string;
  text: string;
  fm: Record<string, unknown>;
  body: string;
  pageId?: string;
}

/**
 * Import an Obsidian vault (or loose markdown / Excalidraw files) into the
 * workspace. Folders become parent pages, `[[links]]` are resolved after all
 * pages exist, frontmatter maps onto typed properties, `![[image]]` embeds
 * become image blocks and Excalidraw drawings become whiteboards.
 */
export async function importVault(
  doc: Y.Doc,
  conv: BlockConverter,
  input: VaultSourceFile[],
  opts: VaultImportOptions = {},
): Promise<VaultImportResult> {
  const origin = opts.origin ?? "import";
  const createdBy = opts.createdBy ?? "";
  const maxEmbed = opts.maxEmbedBytes ?? 2 * 1024 * 1024;
  const result: VaultImportResult = { rootId: null, pages: 0, notes: 0, boards: 0, folders: 0, images: 0, links: 0, skipped: [], warnings: [] };
  const files = input
    .map((f) => ({ ...f, path: f.path.replace(/\\/g, "/").replace(/^\.?\/+/, "") }))
    .filter((f) => f.path && !f.path.split("/").some((seg) => seg.startsWith(".") || seg === "node_modules"))
    .filter((f) => !opts.exclude?.(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const byPath = new Map(files.map((f) => [f.path.toLowerCase(), f]));
  const byName = new Map<string, VaultSourceFile[]>();
  for (const f of files) {
    const k = baseOf(f.path).toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(f);
  }

  // 1. Read notes and drawings.
  const decoder = new TextDecoder();
  const notes: NoteSource[] = [];
  const total = files.length;
  let progress = 0;
  for (const f of files) {
    const name = baseOf(f.path);
    if (isExcalidrawFileName(name) || NOTE_RE.test(name)) {
      const text = decoder.decode(await f.read());
      const board = isExcalidrawFileName(name) || /^excalidraw-plugin\s*:/m.test(text.slice(0, 500));
      const { data, body }: { data: Record<string, unknown>; body: string } =
        board && text.trimStart().startsWith("{") ? { data: {}, body: "" } : splitFrontmatter(text);
      const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : noteTitleFromPath(f.path);
      notes.push({ file: f, kind: board ? "board" : "doc", title, text, fm: data, body });
    } else if (!IMAGE_RE.test(name)) {
      result.skipped.push(f.path);
    }
    opts.onProgress?.(++progress, total * 2, `Reading ${name}`);
  }

  // 2. Pages for folders and files.
  let rootParent: string | null = opts.parentId ?? null;
  if (opts.containerTitle) {
    rootParent = createPage(doc, { title: opts.containerTitle, icon: "📥", parentId: rootParent, createdBy });
    result.rootId = rootParent;
    result.pages++;
  }
  const folderNote = (dir: string): NoteSource | undefined => {
    const name = baseOf(dir).toLowerCase();
    const inside = notes.find((n) => dirOf(n.file.path) === dir && noteTitleFromPath(n.file.path).toLowerCase() === name);
    if (inside) return inside;
    const parent = dirOf(dir);
    return notes.find((n) => dirOf(n.file.path) === parent && noteTitleFromPath(n.file.path).toLowerCase() === name && n.kind === "doc");
  };
  const dirsWithContent = new Set<string>();
  for (const n of notes) for (let d = dirOf(n.file.path); d; d = dirOf(d)) dirsWithContent.add(d);
  const dirPages = new Map<string, string | null>();
  const folderNoteDirs = new Map<NoteSource, string>();
  for (const d of dirsWithContent) {
    const fn = folderNote(d);
    if (fn && !folderNoteDirs.has(fn)) folderNoteDirs.set(fn, d);
  }
  const typeIds = new Set(listTypes(doc).map((t) => t.id));
  const types = listTypes(doc);
  const pickType = (fm: Record<string, unknown>): string => {
    const raw = typeof fm.type === "string" ? fm.type.trim().toLowerCase() : "";
    if (raw) {
      const t = types.find((t) => t.id.toLowerCase() === raw || t.name.toLowerCase() === raw);
      if (t) return t.id;
    }
    const keys = Object.keys(fm).filter((k) => !RESERVED_FM.has(k.toLowerCase())).map((k) => k.toLowerCase());
    if (!keys.length) return DEFAULT_TYPE_ID;
    let best = DEFAULT_TYPE_ID;
    let bestScore = 0;
    for (const t of types) {
      if (t.id === "memory" || t.id === DEFAULT_TYPE_ID) continue;
      const score = t.props.filter((p) => keys.includes(p.name.toLowerCase()) || keys.includes(p.id.toLowerCase())).length;
      if (score > bestScore) (best = t.id), (bestScore = score);
    }
    return best;
  };
  const ensureDir = (dir: string): string | null => {
    if (!dir) return rootParent;
    if (dirPages.has(dir)) return dirPages.get(dir)!;
    const fn = folderNote(dir);
    if (fn && folderNoteDirs.get(fn) === dir) {
      const id = ensureNote(fn);
      dirPages.set(dir, id);
      return id;
    }
    const parent = ensureDir(dirOf(dir));
    const id = createPage(doc, { title: baseOf(dir), icon: "📁", parentId: parent, createdBy });
    result.folders++;
    result.pages++;
    dirPages.set(dir, id);
    return id;
  };
  const ensureNote = (n: NoteSource): string => {
    if (n.pageId) return n.pageId;
    const ownDir = folderNoteDirs.get(n);
    const parent = ownDir !== undefined ? ensureDir(dirOf(ownDir)) : ensureDir(dirOf(n.file.path));
    const fmId = typeof n.fm.id === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(n.fm.id) && !pagesMap(doc).has(n.fm.id) ? n.fm.id : undefined;
    const typeId = n.kind === "doc" ? pickType(n.fm) : DEFAULT_TYPE_ID;
    const icon = typeof n.fm.icon === "string" ? n.fm.icon.slice(0, 16) : "";
    n.pageId = createPage(doc, {
      id: fmId,
      title: n.title,
      kind: n.kind,
      parentId: parent,
      typeId: typeIds.has(typeId) ? typeId : DEFAULT_TYPE_ID,
      icon,
      createdBy,
    });
    result.pages++;
    if (n.kind === "board") result.boards++;
    else result.notes++;
    return n.pageId;
  };
  for (const n of notes) ensureNote(n);

  // 3. Link resolution over imported files first, then existing pages.
  const targets = new Map<string, string>();
  const addTarget = (key: string, id: string) => {
    const k = key.trim().toLowerCase();
    if (k && !targets.has(k)) targets.set(k, id);
  };
  for (const n of notes) {
    const p = n.file.path;
    const noExt = p.replace(/\.(md|markdown)$/i, "");
    addTarget(noExt, n.pageId!);
    addTarget(p, n.pageId!);
    addTarget(baseOf(noExt), n.pageId!);
    addTarget(n.title, n.pageId!);
    if (n.kind === "board") {
      addTarget(excalidrawBaseName(p), n.pageId!);
      addTarget(joinPath(dirOf(p), excalidrawBaseName(p)), n.pageId!);
    }
    const aliases = n.fm.aliases;
    for (const a of Array.isArray(aliases) ? aliases : typeof aliases === "string" ? [aliases] : []) addTarget(String(a), n.pageId!);
  }
  for (const [dir, id] of dirPages) if (id) (addTarget(dir, id), addTarget(baseOf(dir), id));
  const existing = pageTitleResolver(doc);
  const resolve: LinkResolver = (raw) => {
    const t = normalizeLinkTarget(raw).toLowerCase();
    const id = targets.get(t) ?? targets.get(t.split("/").pop() ?? t) ?? targets.get(t.replace(/\.excalidraw$/, ""));
    if (id) {
      const p = getPage(doc, id);
      return { id, title: p ? displayTitle(pageMeta(p)) : raw };
    }
    return existing(raw);
  };
  const resolvePageId = (ref: string) => resolve(ref)?.id ?? null;

  const findFile = (fromDir: string, target: string): VaultSourceFile | undefined => {
    const clean = normalizeLinkTarget(target.split("|")[0]).replace(/\.(md|markdown)$/i, "") || target;
    const withExt = target.trim();
    return (
      byPath.get(joinPath(fromDir, withExt).toLowerCase()) ??
      byPath.get(withExt.replace(/^\.?\//, "").toLowerCase()) ??
      byName.get(baseOf(withExt).toLowerCase())?.[0] ??
      byName.get(baseOf(clean).toLowerCase())?.[0]
    );
  };
  const embedCache = new Map<string, string | null>();
  const imageDataUrl = async (f: VaultSourceFile): Promise<string | null> => {
    if (embedCache.has(f.path)) return embedCache.get(f.path)!;
    const ext = (baseOf(f.path).split(".").pop() ?? "").toLowerCase();
    const mime = EXT_MIME[ext] ?? "application/octet-stream";
    let url: string | null = null;
    try {
      if (opts.imageToDataUrl && f.size <= 25 * 1024 * 1024) {
        const u = await opts.imageToDataUrl(f, mime);
        url = u.length <= maxEmbed * 1.37 + 64 ? u : null;
      } else if (f.size <= maxEmbed) {
        url = `data:${mime};base64,${bytesToBase64(await f.read())}`;
      }
    } catch {
      url = null;
    }
    embedCache.set(f.path, url);
    if (url) result.images++;
    return url;
  };
  const sizeLabel = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

  const preprocess = async (n: NoteSource): Promise<string> => {
    const dir = dirOf(n.file.path);
    const embeds: { match: string; replacement: string }[] = [];
    const scan = n.body;
    const tasks: Promise<void>[] = [];
    mapOutsideCode(scan, (text) => {
      for (const m of text.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g)) {
        const target = m[1].trim();
        tasks.push(
          (async () => {
            if (IMAGE_RE.test(target)) {
              const f = findFile(dir, target);
              if (!f) embeds.push({ match: m[0], replacement: `*(missing image: ${target})*` });
              else {
                const url = await imageDataUrl(f);
                embeds.push({
                  match: m[0],
                  replacement: url ? `![${baseOf(f.path)}](${url})` : `*📎 ${baseOf(f.path)} (${sizeLabel(f.size)}, not embedded: too large)*`,
                });
                if (!url) result.warnings.push(`${n.file.path}: image ${baseOf(f.path)} is too large to embed`);
              }
            } else if (/\.[a-z0-9]{2,5}$/i.test(target) && !isExcalidrawFileName(target) && !NOTE_RE.test(target)) {
              embeds.push({ match: m[0], replacement: `*📎 ${target} (attachment not imported)*` });
            } else {
              // A note or drawing: on a line of its own it becomes an embed
              // block (linkifyBlocks); inside text, a link.
              embeds.push({ match: m[0], replacement: `![[${target}${m[2] ? `|${m[2]}` : ""}]]` });
            }
          })(),
        );
      }
      for (const m of text.matchAll(/!\[([^\]\n]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g)) {
        const url = m[2];
        if (/^(https?:|data:|blob:)/i.test(url)) continue;
        tasks.push(
          (async () => {
            let decoded = url;
            try {
              decoded = decodeURIComponent(url);
            } catch {
              // keep raw
            }
            const f = findFile(dir, decoded);
            if (!f || !IMAGE_RE.test(f.path)) return;
            const data = await imageDataUrl(f);
            embeds.push({ match: m[0], replacement: data ? `![${m[1] || baseOf(f.path)}](${data})` : `*📎 ${baseOf(f.path)} (not embedded: too large)*` });
          })(),
        );
      }
      return text;
    });
    await Promise.all(tasks);
    if (!embeds.length) return n.body;
    const map = new Map(embeds.map((e) => [e.match, e.replacement]));
    return mapOutsideCode(n.body, (text) => {
      let out = text;
      for (const [match, rep] of map) out = out.split(match).join(rep);
      return out;
    });
  };

  // 4. Content, properties and drawings.
  const unknownKeys = new Map<string, number>();
  let bytesSinceBreath = 0;
  for (const n of notes) {
    const page = getPage(doc, n.pageId!)!;
    try {
      if (n.kind === "board") {
        const scene = parseExcalidrawFile(baseOf(n.file.path), n.text);
        if (!scene) {
          result.warnings.push(`${n.file.path}: no Excalidraw scene found`);
        } else {
          const files: Record<string, any> = { ...scene.files };
          for (const [fileId, target] of Object.entries(scene.embedded ?? {})) {
            if (files[fileId]) continue;
            if (/^https?:/i.test(target)) continue;
            const f = findFile(dirOf(n.file.path), target);
            if (!f || !IMAGE_RE.test(f.path)) {
              result.warnings.push(`${n.file.path}: embedded file ${target} not found`);
              continue;
            }
            const url = await imageDataUrl(f);
            if (!url) continue;
            const ext = (baseOf(f.path).split(".").pop() ?? "").toLowerCase();
            files[fileId] = { id: fileId, mimeType: EXT_MIME[ext] ?? "image/png", dataURL: url, created: f.mtime ?? Date.now() };
          }
          writeSceneToBoard(page, { elements: scene.elements, files }, { origin });
          bytesSinceBreath += n.text.length + Object.values(files).reduce((s, f) => s + (f.dataURL?.length ?? 0), 0);
        }
      } else {
        const md = await preprocess(n);
        const blocks = md.trim() ? await markdownToBlocks(conv, md, resolve) : [];
        result.links += countLinks(blocks);
        const typeId = page.get("typeId") ?? DEFAULT_TYPE_ID;
        const propInput: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(n.fm)) if (!RESERVED_FM.has(k.toLowerCase())) propInput[k] = v;
        const coerced = coerceProps(doc, typeId, propInput, { createOptions: true, createSelectOptions: true, resolvePage: resolvePageId });
        for (const k of coerced.unknown) unknownKeys.set(k, (unknownKeys.get(k) ?? 0) + 1);
        for (const e of coerced.errors) result.warnings.push(`${n.file.path}: ${e}`);
        doc.transact(() => {
          conv.blocksToFragment(blocks, page.get("content") as Y.XmlFragment);
          applyProps(doc, page, coerced);
        }, origin);
        bytesSinceBreath += md.length;
      }
      const created = parseDate(n.fm.created) ?? n.file.mtime ?? null;
      const updated = parseDate(n.fm.updated) ?? n.file.mtime ?? null;
      doc.transact(() => {
        if (created) page.set("createdAt", created);
        page.set("updatedAt", updated ?? Date.now());
      }, origin);
    } catch (err) {
      result.warnings.push(`${n.file.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    opts.onProgress?.(++progress, total * 2, n.title);
    // Let sync providers flush between pages so one import never becomes a single giant update.
    if (bytesSinceBreath > 4 * 1024 * 1024) {
      bytesSinceBreath = 0;
      await pause(120);
    } else await tick();
  }
  if (unknownKeys.size) {
    const keys = [...unknownKeys].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k);
    result.warnings.push(`Frontmatter fields without a matching property were skipped: ${keys.join(", ")}`);
  }
  const imagesUsed = new Set([...embedCache.keys()]);
  for (const f of files) if (IMAGE_RE.test(f.path) && !imagesUsed.has(f.path)) result.skipped.push(f.path);
  opts.onProgress?.(total * 2, total * 2, "Done");
  return result;
}

function countLinks(blocks: any[]): number {
  let n = 0;
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const it of items as any[]) {
      if (it?.type === "pageLink") n++;
      if (it?.type === "link") walk(it.content);
    }
  };
  for (const b of blocks) {
    walk(b.content);
    if (b.content?.type === "tableContent") for (const r of b.content.rows) for (const c of r.cells) walk(Array.isArray(c) ? c : c?.content);
    if (b.children) n += countLinks(b.children);
  }
  return n;
}

/** Stable text for manifests: which files an export wrote. */
export interface VaultManifest {
  workspace: string;
  exportedAt: string;
  files: string[];
}

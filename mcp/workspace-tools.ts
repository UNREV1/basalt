// The workspace tools: everything Claude can do in a Basalt workspace (notes,
// memory, courses, flashcards, the skill tree). Pure Y.Doc code, so the same
// tools serve the MCP server (Claude Desktop / Claude Code, mcp/basalt-mcp.ts)
// and the in-app assistant (src/assistant/), each registering them through its
// own `tool` function.

import * as Y from "yjs";
import { z } from "zod";
import {
  DEFAULT_TYPE_ID,
  createPage,
  displayTitle,
  getPage,
  getType,
  listPages,
  listTypes,
  metaMap,
  movePage,
  openDailyNote,
  pageMeta,
  trashPage,
  updatePage,
  type PageKind,
  type PageMeta,
} from "../shared/model.ts";
import {
  allLessons,
  getCurriculum,
  getProgress,
  initCourse,
  setCurriculum,
  setProgress,
  type Curriculum,
} from "../shared/course.ts";
import { LESSON_STYLE, PHASES, STEP_TYPES, lessonProblems, setLessonContent } from "../shared/lesson.ts";
import { courseAhead, learnerStats } from "../shared/learning.ts";
import { WIKILINK_RE } from "../shared/markdown.ts";
import {
  applyProps,
  coerceProps,
  fragmentToMarkdown,
  mapOutsideCode,
  pageTitleResolver,
  writePageMarkdown,
  type BlockConverter,
} from "../shared/vault.ts";
import { MemoryStore } from "./memory.ts";
import {
  ToolError,
  backlinksOf,
  boardSummary,
  childPages,
  courseOutline,
  isDescendantOf,
  fmtTime,
  notebookMarkdown,
  pageHeader,
  hasPaintStrokes,
  paintSummary,
  ref,
  resolvePage,
  searchPages,
  typeName,
} from "./ops.ts";
import { LEVELS_HINT } from "./prompts.ts";
import { registerSkillTools, type ToolFn } from "./skill-tools.ts";

export type { ToolFn };

export interface WorkspaceToolContext {
  doc: Y.Doc;
  /** Markdown <-> BlockNote converter (Node or browser). */
  conv: BlockConverter;
  /** Name recorded as page author. */
  agent: string;
  /** Transaction origin for all writes. */
  origin: unknown;
  /** Report what the agent is doing, and on which page. */
  presence: (pageId: string | undefined, activity: string) => void;
}

type Args = Record<string, any>;

const PROP_VALUE = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
const PROPS = z
  .record(z.string(), PROP_VALUE)
  .describe('Typed properties by name (or id), e.g. {"Status": "In progress", "Due": "2026-10-01", "Tags": ["ml", "papers"]}. null clears a property.');

const LESSON = z.object({
  id: z.string().optional().describe("Stable id; omit for new lessons (keep existing ids when updating)"),
  title: z.string(),
  objectives: z.array(z.string()).default([]).describe("Concrete, testable learning objectives"),
});
const MODULE = z.object({
  id: z.string().optional(),
  title: z.string(),
  summary: z.string().default(""),
  lessons: z.array(LESSON).min(1),
});
const LEVEL = z.object({
  id: z.string().optional(),
  name: z.string().describe(LEVELS_HINT),
  summary: z.string().default(""),
  modules: z.array(MODULE).min(1),
});
/** One interactive lesson step (flat: each type uses its own fields; see shared/lesson.ts). */
const STEP = z.object({
  type: z.enum(STEP_TYPES),
  title: z.string().optional().describe("explain: optional heading"),
  body: z.string().optional().describe("explain / reveal: markdown ($math$ allowed)"),
  prompt: z.string().optional().describe("choice / input / order / match / reveal: the question"),
  options: z.array(z.string()).optional().describe("choice: 2–5 options"),
  answer: z
    .union([z.array(z.number().int()), z.number()])
    .optional()
    .describe("choice: indexes of every correct option (several = select all that apply); slider: the right value"),
  answers: z.array(z.string()).optional().describe("input: every accepted answer"),
  tolerance: z.number().optional().describe("input / slider: allowed numeric error"),
  placeholder: z.string().optional(),
  items: z.array(z.string()).optional().describe("order: the items in the CORRECT order (the app shuffles them)"),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).optional().describe("match: 3–5 correct pairs"),
  explain: z.string().optional().describe("interactive steps: why the answer is right"),
  hint: z.string().optional(),
  figure: z.string().optional().describe('any step: an inline SVG diagram ("<svg viewBox=…>…</svg>") or an https image URL, shown above the text'),
  caption: z.string().optional(),
  min: z.number().optional().describe("explore / slider: slider range"),
  max: z.number().optional(),
  step: z.number().optional(),
  start: z.number().optional(),
  label: z.string().optional().describe("explore / slider: what the slider controls"),
  unit: z.string().optional(),
  plot: z.string().optional().describe('explore / slider: live graph, y in terms of x and slider value v, e.g. "v*x^2"'),
  xMin: z.number().optional(),
  xMax: z.number().optional(),
  readout: z.string().optional().describe('explore / slider: a number computed from v, e.g. "v^2/2"'),
  readoutLabel: z.string().optional(),
  phase: z.enum(PHASES).optional().describe("Which part of the learning loop this step is"),
  keyPoints: z.array(z.string()).optional().describe("teach: 3–5 points a good explanation covers"),
  model: z.string().optional().describe("teach: a short plain-language model explanation"),
  minutes: z.number().optional().describe("practice: how long to practise"),
  focus: z.array(z.string()).optional().describe("practice: what to pay attention to"),
  goal: z.string().optional().describe('practice: how to know it went well, e.g. "10 catches in a row"'),
});

const CURRICULUM = z.object({
  overview: z.string().default("").describe("2-4 sentences: what the learner will be able to do at the end"),
  levels: z.array(LEVEL).min(1),
});

/** create_note's `kind` → page kind. */
const NOTE_KINDS: Record<string, PageKind> = { page: "doc", canvas: "board", database: "database", notebook: "notebook" };

/** Plain [[targets]] in markdown outside code, for reporting unresolved links. */
function wikilinkTargets(md: string): string[] {
  const out = new Set<string>();
  mapOutsideCode(md, (text) => {
    for (const m of text.replace(/`[^`\n]*`/g, "").matchAll(WIKILINK_RE)) out.add(m[1].trim());
    return text;
  });
  return [...out];
}

function resolveType(doc: Y.Doc, ref: string): string {
  const r = ref.trim().toLowerCase();
  const t = listTypes(doc).find((t) => t.id.toLowerCase() === r || t.name.toLowerCase() === r);
  if (!t) throw new ToolError(`Unknown type "${ref}". Available types: ${listTypes(doc).map((t) => `${t.name} (${t.id})`).join(", ")}.`);
  return t.id;
}

function findLesson(page: Y.Map<any>, lessonRef: string) {
  const c = getCurriculum(page);
  if (!c) throw new ToolError("This course has no curriculum yet. Create one with create_course or update_course.");
  const lessons = allLessons(c);
  const r = lessonRef.trim().toLowerCase();
  const hit = lessons.find((l) => l.lesson.id === lessonRef.trim()) ?? lessons.find((l) => l.lesson.title.toLowerCase() === r);
  if (!hit) {
    throw new ToolError(`No lesson "${lessonRef}" in this course. Call get_course to see lesson ids.`);
  }
  return hit;
}

export function registerWorkspaceTools(tool: ToolFn, ctx: WorkspaceToolContext) {
  const { doc, conv, agent, origin, presence } = ctx;
  const memory = new MemoryStore(doc, conv, { origin, agent });
  memory.onTouch = (pageId, activity) => presence(pageId, activity);

  const tx = <T>(fn: () => T): T => {
    let out!: T;
    doc.transact(() => {
      out = fn();
    }, origin);
    return out;
  };

  const readMarkdown = (meta: PageMeta) => {
    const page = getPage(doc, meta.id)!;
    return fragmentToMarkdown(conv, doc, page.get("content") as Y.XmlFragment);
  };

  const linkReport = (md: string): string => {
    const resolve = pageTitleResolver(doc);
    const missing = wikilinkTargets(md).filter((t) => !resolve(t));
    return missing.length
      ? `\nUnresolved links (no page with that title yet, left as text): ${missing.map((t) => `[[${t}]]`).join(", ")}. Create those pages and re-save to link them.`
      : "";
  };

  // ---- notes -----------------------------------------------------------------------

  tool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Full-text search (BM25 over titles and content, including whiteboard text, notebook code and course outlines) across the Basalt workspace. Returns the best matches with ids and highlighted snippets. Use read_note with an id to read a result.",
      input: {
        query: z.string().min(1).describe("Keywords or a phrase"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
      },
      readOnly: true,
    },
    ({ query, limit }) => {
      const hits = searchPages(doc, query, { limit: limit ?? 10 });
      if (!hits.length) return `No notes match "${query}". Try other keywords or list_notes to browse.`;
      return [
        `${hits.length} result${hits.length === 1 ? "" : "s"} for "${query}":`,
        ...hits.map(
          (h, i) =>
            `${i + 1}. ${h.meta.icon ? `${h.meta.icon} ` : ""}**${displayTitle(h.meta)}** (id: ${h.meta.id}${h.meta.kind !== "doc" ? `, ${h.meta.kind}` : ""}${h.meta.typeId !== DEFAULT_TYPE_ID ? `, ${typeName(doc, h.meta.typeId)}` : ""})${h.meta.parentId ? ` in ${displayTitle(pageMeta(getPage(doc, h.meta.parentId) ?? new Y.Map()))}` : ""}\n   ${h.snippet || "(no text)"}`,
        ),
      ].join("\n");
    },
  );

  tool(
    "list_notes",
    {
      title: "List notes",
      description:
        "Outline of the workspace page tree with ids, kinds (doc, board, notebook, database, course, paint) and object types. Without parent_id, lists from the root. Use depth to see deeper levels.",
      input: {
        parent_id: z.string().optional().describe("Page id or title to list below (default: workspace root)"),
        depth: z.number().int().min(1).max(8).optional().describe("Levels to show (default 2)"),
      },
      readOnly: true,
    },
    ({ parent_id, depth }) => {
      const maxDepth = depth ?? 2;
      const start = parent_id ? resolvePage(doc, parent_id) : null;
      const lines: string[] = [];
      let truncated = false;
      const walk = (pid: string | null, level: number) => {
        for (const p of childPages(doc, pid)) {
          if (lines.length >= 400) {
            truncated = true;
            return;
          }
          const kids = childPages(doc, p.id).length;
          const bits = [`id: ${p.id}`];
          if (p.kind !== "doc") bits.push(p.kind);
          if (p.typeId !== DEFAULT_TYPE_ID) bits.push(`type: ${typeName(doc, p.typeId)}`);
          if (p.system) bits.push(`system: ${p.system}`);
          const more = kids && level >= maxDepth ? ` · ${kids} sub-page${kids === 1 ? "" : "s"}` : "";
          lines.push(`${"  ".repeat(level - 1)}- ${p.icon ? `${p.icon} ` : ""}${displayTitle(p)} (${bits.join(", ")})${more}`);
          if (level < maxDepth) walk(p.id, level + 1);
        }
      };
      walk(start?.id ?? null, 1);
      const total = listPages(doc).length;
      const head = start
        ? `Sub-pages of ${ref(start)}:`
        : `Workspace "${metaMap(doc).get("name") ?? "Basalt"}" — ${total} page${total === 1 ? "" : "s"}:`;
      if (!lines.length) return `${head}\n(none)`;
      return `${head}\n${lines.join("\n")}${truncated ? "\n… (truncated; pass parent_id to list a subtree)" : ""}`;
    },
  );

  tool(
    "recent_notes",
    {
      title: "Recently updated notes",
      description: "Pages most recently edited (by anyone), newest first. Useful to catch up on what changed in the workspace.",
      input: { limit: z.number().int().min(1).max(50).optional().describe("How many (default 15)") },
      readOnly: true,
    },
    ({ limit }) => {
      const pages = listPages(doc)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, limit ?? 15);
      if (!pages.length) return "The workspace is empty.";
      return pages.map((p) => `- ${fmtTime(p.updatedAt)} · ${p.icon ? `${p.icon} ` : ""}${displayTitle(p)} (id: ${p.id}${p.kind !== "doc" ? `, ${p.kind}` : ""})`).join("\n");
    },
  );

  tool(
    "read_note",
    {
      title: "Read note",
      description:
        "Read a page: a header (title, id, kind, type, properties, parent, sub-pages, backlinks, dates) followed by its content as markdown. Links to other pages appear as [[Title]]. Works for every page kind (whiteboards show their text, notebooks their cells, courses their outline and progress).",
      input: { id_or_title: z.string().describe("Page id, exact title, or Parent/Child path") },
      readOnly: true,
    },
    async ({ id_or_title }) => {
      const meta = resolvePage(doc, id_or_title);
      const page = getPage(doc, meta.id)!;
      presence(meta.id, `Reading “${displayTitle(meta)}”`);
      const parts = [pageHeader(doc, meta)];
      if (meta.kind === "board") parts.push(boardSummary(page));
      if (meta.kind === "notebook") parts.push(notebookMarkdown(page));
      if (meta.kind === "course") parts.push(courseOutline(doc, page));
      if (meta.kind === "paint" || hasPaintStrokes(page)) parts.push(paintSummary(page));
      if (meta.kind === "database") {
        const rows = childPages(doc, meta.id);
        parts.push(rows.length ? `Entries (${rows.length}):\n${rows.map((r) => `- ${ref(r)}`).join("\n")}` : "No entries yet.");
      }
      const md = await readMarkdown(meta);
      if (md.trim()) parts.push(md.trim());
      else if (meta.kind === "doc") parts.push("_(empty page)_");
      return parts.join("\n\n---\n\n");
    },
  );

  tool(
    "create_note",
    {
      title: "Create note",
      description:
        "Create a new page from markdown. [[Title]] links become real page links when a page with that title exists (case-insensitive); `![[Title]]` alone on a line embeds that page (shown live inside this one). Supports headings, lists, checklists, tables, code, quotes, images by URL, LaTeX ($…$ inline, $$…$$ display) and flashcard lines `Front :: Back`. Optionally nest it under a parent page and give it an object type with properties. kind canvas/database/notebook makes an empty whiteboard, database or code notebook instead (markdown is ignored); to put one inside a page, create it under that page and add `![[Its title]]` to the page.",
      input: {
        title: z.string().min(1),
        markdown: z.string().optional().describe("Page content (markdown)"),
        kind: z
          .enum(["page", "canvas", "database", "notebook"])
          .optional()
          .describe("Default page. For a database, `type` is the type of the objects it collects (e.g. Task)"),
        parent_id_or_title: z.string().optional().describe("Parent page id or title (default: workspace root)"),
        type: z.string().optional().describe("Object type id or name, e.g. Task, Note, Book, Person (see list_types)"),
        props: PROPS.optional(),
        icon: z.string().optional().describe("An emoji"),
      },
    },
    async ({ title, markdown, kind, parent_id_or_title, type, props, icon }) => {
      const parent = parent_id_or_title ? resolvePage(doc, parent_id_or_title) : null;
      const pageKind = NOTE_KINDS[kind ?? "page"] ?? "doc";
      const itemType = type ? resolveType(doc, type) : DEFAULT_TYPE_ID;
      // A database's `type` is what it collects; the page itself stays a plain page.
      const typeId = pageKind === "database" ? DEFAULT_TYPE_ID : itemType;
      const coerced = props ? coerceProps(doc, typeId, props, { createOptions: true, resolvePage: (r) => resolvePage(doc, r).id }) : null;
      if (coerced?.unknown.length) {
        const t = getType(doc, typeId);
        throw new ToolError(
          `Unknown properties for type ${t?.name ?? typeId}: ${coerced.unknown.join(", ")}. ${t?.props.length ? `Its properties are: ${t.props.map((p) => `${p.name} (${p.kind})`).join(", ")}.` : "It has no properties; choose a type with list_types."}`,
        );
      }
      if (coerced?.errors.length) throw new ToolError(coerced.errors.join("\n"));
      const duplicate = listPages(doc).find((p) => displayTitle(p).toLowerCase() === title.trim().toLowerCase());
      const id = tx(() => {
        const id = createPage(doc, { title: title.trim(), kind: pageKind, parentId: parent?.id ?? null, typeId, icon: icon ?? "", createdBy: agent });
        if (coerced) applyProps(doc, getPage(doc, id)!, coerced);
        if (pageKind === "database" && type) (getPage(doc, id)!.get("view") as Y.Map<unknown>).set("typeId", itemType);
        return id;
      });
      presence(id, `Writing “${title.trim()}”`);
      const withText = pageKind === "doc" && !!markdown?.trim();
      if (withText) await writePageMarkdown(conv, doc, id, markdown!, { mode: "replace", origin });
      const meta = pageMeta(getPage(doc, id)!);
      const embedHint = pageKind === "doc" ? "" : `\nTo show it inside another page, add a line \`![[${displayTitle(meta)}]]\` to that page.`;
      return `Created ${ref(meta)}${parent ? ` under ${ref(parent)}` : ""}.${duplicate ? `\nNote: another page is already titled "${displayTitle(duplicate)}" (id: ${duplicate.id}); use ids to tell them apart.` : ""}${withText ? linkReport(markdown!) : ""}${embedHint}`;
    },
  );

  tool(
    "update_note",
    {
      title: "Update note content",
      description:
        'Write markdown into an existing page. mode "append" adds to the end and "prepend" to the start (existing content is preserved exactly); "replace" rewrites the whole content. Prefer append/prepend for additions — replace discards formatting that markdown cannot express.',
      input: {
        id_or_title: z.string(),
        markdown: z.string(),
        mode: z.enum(["replace", "append", "prepend"]).describe("How to combine with the existing content"),
      },
    },
    async ({ id_or_title, markdown, mode }) => {
      const meta = resolvePage(doc, id_or_title);
      presence(meta.id, `Editing “${displayTitle(meta)}”`);
      await writePageMarkdown(conv, doc, meta.id, markdown, { mode, origin });
      const verb = mode === "replace" ? "Replaced the content of" : mode === "append" ? "Appended to" : "Prepended to";
      return `${verb} ${ref(meta)}.${linkReport(markdown)}`;
    },
  );

  tool(
    "update_note_meta",
    {
      title: "Update note metadata",
      description:
        'Rename a page, move it under another parent ("root" for the top level), change its icon, object type or typed properties. Only the fields you pass change.',
      input: {
        id_or_title: z.string(),
        title: z.string().optional(),
        parent: z.string().optional().describe('New parent id or title, or "root"'),
        icon: z.string().optional().describe('Emoji, or "" to remove'),
        type: z.string().optional().describe("Object type id or name"),
        props: PROPS.optional(),
      },
    },
    ({ id_or_title, title, parent, icon, type, props }) => {
      const meta = resolvePage(doc, id_or_title);
      const typeId = type ? resolveType(doc, type) : meta.typeId;
      let newParent: string | null | undefined;
      if (parent !== undefined) {
        newParent = /^(root|\/|)$/i.test(parent.trim()) ? null : resolvePage(doc, parent).id;
        if (newParent === meta.id) throw new ToolError("A page cannot be its own parent.");
        if (newParent && isDescendantOf(doc, newParent, meta.id)) throw new ToolError("Cannot move a page inside its own sub-page.");
      }
      const coerced = props ? coerceProps(doc, typeId, props, { createOptions: true, resolvePage: (r) => resolvePage(doc, r).id }) : null;
      if (coerced?.unknown.length) {
        const t = getType(doc, typeId);
        throw new ToolError(`Unknown properties for type ${t?.name ?? typeId}: ${coerced.unknown.join(", ")}. Its properties are: ${(t?.props ?? []).map((p) => p.name).join(", ") || "none"}.`);
      }
      if (coerced?.errors.length) throw new ToolError(coerced.errors.join("\n"));
      tx(() => {
        const patch: Partial<PageMeta> = {};
        if (title !== undefined && title.trim()) patch.title = title.trim();
        if (icon !== undefined) patch.icon = icon;
        if (type !== undefined) patch.typeId = typeId;
        if (Object.keys(patch).length) updatePage(doc, meta.id, patch);
        if (newParent !== undefined && newParent !== meta.parentId) movePage(doc, meta.id, newParent);
        if (coerced) applyProps(doc, getPage(doc, meta.id)!, coerced);
        getPage(doc, meta.id)!.set("updatedAt", Date.now());
      });
      presence(meta.id, `Editing “${displayTitle(meta)}”`);
      const after = pageMeta(getPage(doc, meta.id)!);
      return `Updated ${ref(after)}.\n${pageHeader(doc, after)}`;
    },
  );

  tool(
    "trash_note",
    {
      title: "Move note to trash",
      description: "Move a page and its sub-pages to the trash (the user can restore them from the app).",
      input: { id_or_title: z.string() },
      destructive: true,
    },
    ({ id_or_title }) => {
      const meta = resolvePage(doc, id_or_title);
      if (meta.system) throw new ToolError(`"${displayTitle(meta)}" is a system page and cannot be trashed.`);
      const kids = childPages(doc, meta.id).length;
      tx(() => trashPage(doc, meta.id));
      return `Moved ${ref(meta)}${kids ? ` and its ${kids} sub-page(s)` : ""} to the trash.`;
    },
  );

  tool(
    "get_backlinks",
    {
      title: "Get backlinks",
      description: "Pages that link to this page with [[links]], plus pages that mention its title without linking.",
      input: { id_or_title: z.string() },
      readOnly: true,
    },
    ({ id_or_title }) => {
      const meta = resolvePage(doc, id_or_title);
      const linked = backlinksOf(doc, meta.id);
      const title = displayTitle(meta);
      const linkedIds = new Set(linked.map((l) => l.id));
      const mentions =
        title.length >= 3
          ? searchPages(doc, `"${title}"`, { limit: 50, filter: (p) => p.id !== meta.id && !linkedIds.has(p.id) }).filter((h) =>
              h.text.toLowerCase().includes(title.toLowerCase()),
            )
          : [];
      const out = [`Backlinks to ${ref(meta)}:`];
      out.push(linked.length ? linked.map((l) => `- ${ref(l)}`).join("\n") : "(no pages link here)");
      if (mentions.length) out.push("", "Unlinked mentions:", ...mentions.slice(0, 20).map((h) => `- ${ref(h.meta)}: ${h.snippet}`));
      return out.join("\n");
    },
  );

  tool(
    "daily_note",
    {
      title: "Daily note",
      description: "Open today's journal page (created on demand under Journal, titled YYYY-MM-DD) and optionally append markdown to it. Returns the page content.",
      input: { append_markdown: z.string().optional().describe("Markdown to add at the end of today's note") },
    },
    async ({ append_markdown }) => {
      const id = tx(() => openDailyNote(doc, agent));
      presence(id, "Writing in the journal");
      if (append_markdown?.trim()) await writePageMarkdown(conv, doc, id, append_markdown, { mode: "append", origin });
      const meta = pageMeta(getPage(doc, id)!);
      const md = await readMarkdown(meta);
      return `${append_markdown?.trim() ? "Appended to" : "Today's note:"} ${ref(meta)}\n\n${md.trim() || "_(empty)_"}`;
    },
  );

  tool(
    "list_types",
    {
      title: "List object types",
      description: "Object types (like Task, Note, Book, Person, Memory) with their typed properties and select options. Use them with create_note / update_note_meta.",
      input: {},
      readOnly: true,
    },
    () => {
      const types = listTypes(doc);
      if (!types.length) return "No object types defined.";
      return types
        .map((t) => {
          const count = listPages(doc).filter((p) => p.typeId === t.id).length;
          const props = t.props.map((p) => `  - ${p.name} (${p.kind}${p.options?.length ? `: ${p.options.map((o) => o.name).join(" | ")}` : ""})`);
          return [`- ${t.icon} ${t.name} (id: ${t.id}, ${count} object${count === 1 ? "" : "s"})`, ...props].join("\n");
        })
        .join("\n");
    },
  );

  // ---- memory -------------------------------------------------------------------------

  const PATH = z.string().describe("Path like /memories/preferences.md (folders: /memories/projects/)");

  tool(
    "memory_view",
    {
      title: "View memory",
      description:
        "Your long-term memory directory (/memories), stored in the user's Basalt workspace. Without a path (or with a folder path) lists memory files; with a file path shows its content with line numbers. Call this at the start of every conversation.",
      input: {
        path: z.string().optional().describe("Default /memories"),
        view_range: z.tuple([z.number().int(), z.number().int()]).optional().describe("[start, end] line range (1-based, end -1 = to the end)"),
      },
      readOnly: true,
    },
    ({ path, view_range }) => memory.view(path, view_range as [number, number] | undefined),
  );

  tool(
    "memory_create",
    {
      title: "Create memory file",
      description: "Create (or overwrite) a memory file with markdown content. Missing folders are created. Keep one topic per file.",
      input: { path: PATH, content: z.string() },
    },
    ({ path, content }) => memory.create(path, content),
  );

  tool(
    "memory_str_replace",
    {
      title: "Edit memory file",
      description: "Replace text in a memory file. old_str must appear exactly once (copy it from memory_view output, without the line-number prefix).",
      input: { path: PATH, old_str: z.string(), new_str: z.string() },
    },
    ({ path, old_str, new_str }) => memory.strReplace(path, old_str, new_str),
  );

  tool(
    "memory_insert",
    {
      title: "Insert into memory file",
      description: "Insert text after the given line number of a memory file (0 inserts at the top).",
      input: { path: PATH, insert_line: z.number().int().min(0), insert_text: z.string() },
    },
    ({ path, insert_line, insert_text }) => memory.insert(path, insert_line, insert_text),
  );

  tool(
    "memory_delete",
    {
      title: "Delete memory file",
      description: "Delete a memory file or folder (it goes to the Basalt trash).",
      input: { path: PATH },
      destructive: true,
    },
    ({ path }) => memory.delete(path),
  );

  tool(
    "memory_rename",
    {
      title: "Rename memory file",
      description: "Rename or move a memory file or folder. Fails if the destination exists.",
      input: { old_path: PATH, new_path: PATH },
    },
    ({ old_path, new_path }) => memory.rename(old_path, new_path),
  );

  tool(
    "remember",
    {
      title: "Remember a fact",
      description:
        'Quickly save one durable fact as a dated bullet in a memory topic file (default /memories/general.md). Use topics like "preferences", "projects/basalt", "people/alice", "learning".',
      input: {
        fact: z.string().min(1).describe("One self-contained fact, e.g. 'Prefers concise answers with code first'"),
        topic: z.string().optional().describe('Topic file name or path (default "general")'),
      },
    },
    ({ fact, topic }) => memory.remember(fact, topic),
  );

  tool(
    "recall",
    {
      title: "Recall from memory",
      description: "Search only your memory files and return the matching lines, most relevant files first.",
      input: { query: z.string().min(1), limit: z.number().int().min(1).max(20).optional() },
      readOnly: true,
    },
    ({ query, limit }) => memory.recall(query, limit ?? 5),
  );

  // ---- learning -------------------------------------------------------------------------

  const requireCourse = (r: string) => {
    const meta = resolvePage(doc, r);
    if (meta.kind !== "course") throw new ToolError(`${ref(meta)} is a ${meta.kind} page, not a course.`);
    return { meta, page: getPage(doc, meta.id)! };
  };

  tool(
    "create_course",
    {
      title: "Create course",
      description:
        "Create a course page with a leveled curriculum (levels → modules → lessons with objectives). Returns the outline with lesson ids. Then write the first lessons with write_interactive_lesson, and link the course to the D&D skill it trains with link_to_skill (add_skills first if the skill doesn't exist). Keep lessons short (5–8 minutes each); for a long path use the levels Foundations, Beginner, Intermediate, Advanced, Graduate, PhD / Research frontier, and it's fine to start with the first level or two and extend_course later as the learner progresses.",
      input: {
        topic: z.string().min(1),
        goal: z.string().optional().describe("What the learner wants to achieve"),
        start_level: z.string().optional().describe("The learner's current level, e.g. 'Complete beginner'"),
        curriculum: CURRICULUM,
        parent: z.string().optional().describe("Parent page id or title (default: root)"),
      },
    },
    ({ topic, goal, start_level, curriculum, parent }) => {
      const parentMeta = parent ? resolvePage(doc, parent) : null;
      const existing = listPages(doc).find((p) => p.kind === "course" && displayTitle(p).toLowerCase() === topic.trim().toLowerCase());
      if (existing) throw new ToolError(`A course on "${topic}" already exists: ${ref(existing)}. Use get_course to continue it or update_course to revise its curriculum.`);
      const id = tx(() => {
        const id = createPage(doc, { title: topic.trim(), kind: "course", icon: "🎓", parentId: parentMeta?.id ?? null, createdBy: agent });
        const page = getPage(doc, id)!;
        initCourse(page, { topic: topic.trim(), goal, startLevel: start_level });
        setCurriculum(page, { topic: topic.trim(), ...(curriculum as Omit<Curriculum, "topic">) });
        // Lessons are written as interactive steps (write_interactive_lesson) and played in the app.
        (page.get("course") as Y.Map<any>).set("format", "interactive");
        page.set("updatedAt", Date.now());
        return id;
      });
      presence(id, `Designing course “${topic}”`);
      const page = getPage(doc, id)!;
      return `Created course ${ref(pageMeta(page))}.\n\n${courseOutline(doc, page)}`;
    },
  );

  tool(
    "update_course",
    {
      title: "Update course",
      description:
        "Revise a course: replace its curriculum (keep lesson ids of lessons you keep so progress is preserved; new lessons get ids) and/or its goal. Use it to adapt the path to the learner (add remedial or deeper lessons).",
      input: {
        course: z.string().describe("Course id or title"),
        curriculum: CURRICULUM.optional(),
        goal: z.string().optional(),
      },
    },
    ({ course, curriculum, goal }) => {
      const { meta, page } = requireCourse(course);
      tx(() => {
        const c = page.get("course") as Y.Map<any>;
        if (goal !== undefined) c.set("goal", goal);
        if (curriculum) setCurriculum(page, { topic: c.get("topic") ?? displayTitle(meta), ...(curriculum as Omit<Curriculum, "topic">) });
        page.set("updatedAt", Date.now());
      });
      presence(meta.id, `Revising course “${displayTitle(meta)}”`);
      return `Updated course ${ref(meta)}.\n\n${courseOutline(doc, page)}`;
    },
  );

  tool(
    "get_course",
    {
      title: "Get course",
      description: "A course's outline with lesson ids, per-lesson status and quiz mastery, overall progress and the suggested next lesson.",
      input: { id_or_title: z.string() },
      readOnly: true,
    },
    ({ id_or_title }) => {
      const { meta, page } = requireCourse(id_or_title);
      presence(meta.id, `Reviewing course “${displayTitle(meta)}”`);
      return `${pageHeader(doc, meta)}\n\n${courseOutline(doc, page)}`;
    },
  );

  tool(
    "write_lesson",
    {
      title: "Write lesson",
      description:
        "Write (or rewrite) a lesson as a sub-page of the course and mark it in progress. Write a complete lesson in markdown: intuition, definitions, worked examples, LaTeX math, misconceptions, summary, practice problems.",
      input: {
        course: z.string().describe("Course id or title"),
        lesson_id: z.string().describe("Lesson id (or exact lesson title) from get_course"),
        markdown: z.string().min(1),
      },
    },
    async ({ course, lesson_id, markdown }) => {
      const { meta, page } = requireCourse(course);
      const { lesson, level, module } = findLesson(page, lesson_id);
      const progress = getProgress(page, lesson.id);
      const existing = progress.lessonPageId ? getPage(doc, progress.lessonPageId) : undefined;
      const lessonPageId =
        existing && !existing.get("deletedAt")
          ? progress.lessonPageId!
          : tx(() => createPage(doc, { title: lesson.title, icon: "📖", parentId: meta.id, createdBy: agent }));
      presence(lessonPageId, `Writing lesson “${lesson.title}”`);
      await writePageMarkdown(conv, doc, lessonPageId, markdown, { mode: "replace", origin });
      tx(() => {
        setProgress(page, lesson.id, { status: progress.status === "mastered" ? "mastered" : "in-progress", lessonPageId });
        page.set("updatedAt", Date.now());
      });
      return `Wrote lesson "${lesson.title}" (${level.name} › ${module.title}) to ${ref(pageMeta(getPage(doc, lessonPageId)!))}. Status: ${progress.status === "mastered" ? "mastered" : "in progress"}.${linkReport(markdown)}`;
    },
  );

  tool(
    "write_interactive_lesson",
    {
      title: "Write interactive lesson",
      description: `Write (or rewrite) a lesson as interactive steps, played in the app like a Brilliant lesson: short explanations and questions with instant feedback. Finishing it earns the learner XP in the linked skill. Keep lessons written ahead of the learner (get_course shows how many and which to write next).

Step types: explain {title?, body} · explore {body, min, max, step?, start?, label?, unit?, plot?, readout?} · choice {prompt, options, answer: [correct indexes], explain, hint?} · input {prompt, answers: [accepted], tolerance?, explain, hint?} · slider {prompt, min, max, step?, answer, tolerance?, plot?, readout?, explain, hint?} · order {prompt, items in the correct order, explain, hint?} · match {prompt, pairs: [{left, right}], explain, hint?} · reveal {prompt, body}. teach {prompt, keyPoints, model} · practice {prompt, minutes, focus, goal?}. Any step can add figure (SVG or https image), caption and phase.

${LESSON_STYLE}`,
      input: {
        course: z.string().describe("Course id or title"),
        lesson_id: z.string().describe("Lesson id (or exact lesson title) from get_course"),
        steps: z.array(STEP).min(3).max(30),
      },
    },
    ({ course, lesson_id, steps }) => {
      const { meta, page } = requireCourse(course);
      const { lesson } = findLesson(page, lesson_id);
      const problems = lessonProblems(steps);
      if (problems.length) throw new ToolError(`The lesson wasn't saved. Fix and call again:\n- ${problems.join("\n- ")}`);
      presence(meta.id, `Writing lesson “${lesson.title}”`);
      tx(() => {
        setLessonContent(page, lesson.id, steps, "claude");
        (page.get("course") as Y.Map<any>).set("format", "interactive");
        page.set("updatedAt", Date.now());
      });
      const ahead = courseAhead(page, learnerStats(doc).aheadTarget);
      return `Wrote "${lesson.title}" (${steps.length} steps). Lessons ready ahead of the learner: ${ahead.written}.${
        ahead.toWrite.length ? ` Still to write: ${ahead.toWrite.map((l) => `"${l.title}" (${l.id})`).join(", ")}.` : ""
      }${ahead.nearEnd ? " The course is close to its end: consider extend_course." : ""}`;
    },
  );

  tool(
    "extend_course",
    {
      title: "Extend course",
      description:
        "Add a module of new lessons to a course, without touching existing lessons or progress: the next stretch of the learner's path. Adds a new level when `level` doesn't exist yet. Then write the new lessons with write_interactive_lesson.",
      input: {
        course: z.string().describe("Course id or title"),
        level: z.string().describe("Existing level name to add to, or a new level name (added at the end)"),
        module: MODULE.describe("The new module and its lessons (omit ids)"),
      },
    },
    ({ course, level, module }) => {
      const { meta, page } = requireCourse(course);
      const c = getCurriculum(page);
      if (!c) throw new ToolError(`${ref(meta)} has no curriculum yet. Use update_course to create one.`);
      const levels = c.levels.map((l) => ({ ...l, modules: [...l.modules] }));
      let target = levels.find((l) => l.name.trim().toLowerCase() === level.trim().toLowerCase());
      if (!target) {
        target = { id: "", name: level.trim(), summary: "", modules: [] };
        levels.push(target);
      }
      target.modules.push({ id: "", title: module.title, summary: module.summary ?? "", lessons: module.lessons.map((l: Args) => ({ id: "", title: l.title, objectives: l.objectives ?? [] })) });
      tx(() => {
        setCurriculum(page, { ...c, levels });
        page.set("updatedAt", Date.now());
      });
      presence(meta.id, `Extending course “${displayTitle(meta)}”`);
      const added = getCurriculum(page)!.levels.find((l) => l.name === target!.name)!.modules.at(-1)!;
      return `Added "${added.title}" to ${target.name} in ${ref(meta)}: ${added.lessons.map((l) => `"${l.title}" (lesson_id: ${l.id})`).join(", ")}.`;
    },
  );

  tool(
    "record_quiz",
    {
      title: "Record quiz result",
      description: "Record the learner's quiz score for a lesson (0–1, or a percentage). A best score ≥ 0.8 marks the lesson mastered. Returns progress and the next lesson.",
      input: {
        course: z.string(),
        lesson_id: z.string(),
        score: z.number().min(0).max(100).describe("0..1 (or 0..100 as a percentage)"),
      },
    },
    ({ course, lesson_id, score }) => {
      const { meta, page } = requireCourse(course);
      const { lesson } = findLesson(page, lesson_id);
      const s = score > 1 ? score / 100 : score;
      const prev = getProgress(page, lesson.id);
      const mastery = Math.max(prev.mastery, s);
      const status = mastery >= 0.8 ? "mastered" : "in-progress";
      tx(() => {
        setProgress(page, lesson.id, { mastery, status, quizzes: [...prev.quizzes, { at: Date.now(), score: s }] });
        page.set("updatedAt", Date.now());
      });
      presence(meta.id, `Recording quiz for “${lesson.title}”`);
      const c = getCurriculum(page)!;
      const lessons = allLessons(c);
      const mastered = lessons.filter((l) => getProgress(page, l.lesson.id).status === "mastered").length;
      const next = lessons.find((l) => {
        const st = getProgress(page, l.lesson.id).status;
        return st !== "mastered" && st !== "skipped";
      });
      return [
        `Recorded ${Math.round(s * 100)}% for "${lesson.title}". Best: ${Math.round(mastery * 100)}% → ${status === "mastered" ? "mastered ✓" : "not yet mastered (needs ≥ 80%)"}.`,
        `Course progress: ${mastered}/${lessons.length} lessons mastered.`,
        next
          ? next.lesson.id === lesson.id
            ? `Next: review "${lesson.title}" again (re-teach the weak spots, then quiz).`
            : `Next lesson: "${next.lesson.title}" (lesson_id: ${next.lesson.id}) — ${next.level.name} › ${next.module.title}.`
          : "All lessons are mastered — the course is complete!",
      ].join("\n");
    },
  );

  tool(
    "add_flashcards",
    {
      title: "Add flashcards",
      description:
        "Append spaced-repetition flashcards to a page as a \"## Flashcards\" section of `front :: back` lines. The app turns them into review cards. Make cards atomic: one fact or idea each.",
      input: {
        page: z.string().describe("Page id or title (e.g. a lesson page)"),
        cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).min(1),
      },
    },
    async ({ page: pageRef, cards }) => {
      const meta = resolvePage(doc, pageRef);
      if (meta.kind === "board" || meta.kind === "paint") throw new ToolError("Flashcards can only be added to text pages.");
      const current = await readMarkdown(meta);
      const headings = [...current.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((m) => m[1].toLowerCase());
      const hasSection = headings.length > 0 && headings[headings.length - 1] === "flashcards";
      const flat = (s: string) => s.replace(/\s*\n\s*/g, " ").replace(/::/g, ":").trim();
      const lines = (cards as { front: string; back: string }[]).map((c) => `${flat(c.front)} :: ${flat(c.back)}`);
      const md = `${hasSection ? "" : "## Flashcards\n\n"}${lines.join("\n\n")}`;
      presence(meta.id, `Adding flashcards to “${displayTitle(meta)}”`);
      await writePageMarkdown(conv, doc, meta.id, md, { mode: "append", origin });
      return `Added ${lines.length} flashcard${lines.length === 1 ? "" : "s"} to ${ref(meta)}.`;
    },
  );

  // ---- skill tree -------------------------------------------------------------------------

  registerSkillTools(tool, { doc, tx });
}

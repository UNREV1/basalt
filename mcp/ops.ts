// Workspace helpers for the MCP server: resolving pages from what Claude
// passes in (ids, titles, paths), formatting pages for Claude, and search.

import * as Y from "yjs";
import {
  buildLinkGraph,
  displayTitle,
  getPage,
  getType,
  listPages,
  pageMeta,
  pageText,
  type PageMeta,
} from "../shared/model.ts";
import { allLessons, courseMap, getCurriculum, getProgress } from "../shared/course.ts";
import { courseAhead, learnerStats } from "../shared/learning.ts";
import { getLessonContent } from "../shared/lesson.ts";
import { readSceneFromBoard, sceneText } from "../shared/excalidraw-md.ts";
import { normalizeLinkTarget, notebookOutputText, pagePropEntries, propDisplayValue } from "../shared/vault.ts";

export class ToolError extends Error {}

// ---- resolution ------------------------------------------------------------------

function stripRef(ref: string): string {
  return ref
    .trim()
    .replace(/^\[\[|\]\]$/g, "")
    .replace(/\|.*$/, "")
    .trim();
}

function describeCandidates(doc: Y.Doc, pages: PageMeta[]): string {
  return pages
    .slice(0, 8)
    .map((p) => `- ${displayTitle(p)} (id: ${p.id}${p.parentId ? `, in "${titleOf(doc, p.parentId)}"` : ""})`)
    .join("\n");
}

export function titleOf(doc: Y.Doc, id: string): string {
  const p = getPage(doc, id);
  return p ? displayTitle(pageMeta(p)) : id;
}

/**
 * Find a live page by id, exact title (case-insensitive), or "Parent/Child"
 * path. Throws a ToolError with guidance when nothing (or too much) matches.
 */
export function resolvePage(doc: Y.Doc, ref: string, opts: { includeDeleted?: boolean; kind?: PageMeta["kind"] } = {}): PageMeta {
  const r = stripRef(ref);
  if (!r) throw new ToolError("A page id or title is required.");
  const byId = getPage(doc, r);
  if (byId) {
    const meta = pageMeta(byId);
    if (!meta.deletedAt || opts.includeDeleted) return meta;
    throw new ToolError(`Page "${displayTitle(meta)}" (id: ${meta.id}) is in the trash.`);
  }
  // A kind narrows titles: a course named like its skill's page is still found.
  const pages = listPages(doc, { includeDeleted: opts.includeDeleted }).filter((p) => !opts.kind || p.kind === opts.kind);
  const lower = normalizeLinkTarget(r).toLowerCase();
  const exact = pages.filter((p) => displayTitle(p).toLowerCase() === lower);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    // Prefer ordinary pages over Claude's memory notes and journal days with the same name.
    const nonSystem = exact.filter((p) => !isInSystemTree(doc, p));
    if (nonSystem.length === 1) return nonSystem[0];
    throw new ToolError(`Several pages are titled "${r}". Use an id instead:\n${describeCandidates(doc, exact)}`);
  }
  if (lower.includes("/")) {
    const segs = lower.split("/").filter(Boolean);
    let parent: string | null = null;
    let found: PageMeta | undefined;
    for (const seg of segs) {
      found = pages.find((p) => p.parentId === parent && displayTitle(p).toLowerCase() === seg);
      if (!found) break;
      parent = found.id;
    }
    if (found) return found;
  }
  const loose = pages.filter((p) => displayTitle(p).toLowerCase().includes(lower)).slice(0, 8);
  throw new ToolError(
    `No page found for "${r}".${loose.length ? ` Did you mean:\n${describeCandidates(doc, loose)}` : " Use search_notes or list_notes to find it."}`,
  );
}

function isInSystemTree(doc: Y.Doc, p: PageMeta): boolean {
  let cur: PageMeta | undefined = p;
  for (let i = 0; cur && i < 64; i++) {
    if (cur.system) return true;
    const parent: Y.Map<any> | undefined = cur.parentId ? getPage(doc, cur.parentId) : undefined;
    cur = parent ? pageMeta(parent) : undefined;
  }
  return false;
}

/** Is `id` somewhere below `ancestor` in the page tree? */
export function isDescendantOf(doc: Y.Doc, id: string, ancestor: string): boolean {
  let cur = getPage(doc, id);
  for (let i = 0; cur && i < 64; i++) {
    const parent = cur.get("parentId") as string | null;
    if (!parent) return false;
    if (parent === ancestor) return true;
    cur = getPage(doc, parent);
  }
  return false;
}

// ---- formatting ----------------------------------------------------------------------

export function ref(meta: Pick<PageMeta, "id" | "title">): string {
  return `[[${displayTitle(meta)}]] (id: ${meta.id})`;
}

export function fmtTime(ts: number): string {
  if (!ts) return "unknown";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function typeName(doc: Y.Doc, typeId: string): string {
  return getType(doc, typeId)?.name ?? typeId;
}

export function propsLine(doc: Y.Doc, page: Y.Map<any>): string {
  return pagePropEntries(doc, page)
    .map(({ def, value }) => `${def.name}: ${propDisplayValue(def, value, (id) => titleOf(doc, id))}`)
    .join(" · ");
}

export function childPages(doc: Y.Doc, id: string | null): PageMeta[] {
  return listPages(doc)
    .filter((p) => p.parentId === id)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function backlinksOf(doc: Y.Doc, id: string): PageMeta[] {
  const graph = buildLinkGraph(doc);
  return (graph.incoming.get(id) ?? [])
    .map((pid) => getPage(doc, pid))
    .filter((p): p is Y.Map<any> => !!p)
    .map(pageMeta)
    .filter((m) => !m.deletedAt);
}

export function pageHeader(doc: Y.Doc, meta: PageMeta): string {
  const page = getPage(doc, meta.id)!;
  const lines = [`# ${meta.icon ? `${meta.icon} ` : ""}${displayTitle(meta)}`];
  const kindBits = [`id: ${meta.id}`, `kind: ${meta.kind}`, `type: ${typeName(doc, meta.typeId)}`];
  if (meta.system) kindBits.push(`system: ${meta.system}`);
  lines.push(`- ${kindBits.join(" · ")}`);
  lines.push(`- parent: ${meta.parentId && getPage(doc, meta.parentId) ? ref(pageMeta(getPage(doc, meta.parentId)!)) : "(workspace root)"}`);
  const props = propsLine(doc, page);
  if (props) lines.push(`- properties: ${props}`);
  const kids = childPages(doc, meta.id);
  if (kids.length) lines.push(`- sub-pages (${kids.length}): ${kids.slice(0, 30).map(ref).join(", ")}${kids.length > 30 ? ", …" : ""}`);
  const back = backlinksOf(doc, meta.id);
  if (back.length) lines.push(`- backlinks (${back.length}): ${back.slice(0, 30).map(ref).join(", ")}${back.length > 30 ? ", …" : ""}`);
  lines.push(`- updated: ${fmtTime(meta.updatedAt)} · created: ${fmtTime(meta.createdAt)}${meta.createdBy ? ` by ${meta.createdBy}` : ""}`);
  return lines.join("\n");
}

/** Course outline with lesson ids and progress, for get_course and read_note. */
export function courseOutline(doc: Y.Doc, page: Y.Map<any>): string {
  const course = courseMap(page);
  const curriculum = getCurriculum(page);
  const out: string[] = [];
  const topic = course?.get("topic");
  const goal = course?.get("goal");
  const start = course?.get("startLevel");
  if (topic) out.push(`Topic: ${topic}`);
  if (goal) out.push(`Goal: ${goal}`);
  if (start) out.push(`Starting level: ${start}`);
  if (!curriculum) {
    out.push("", "No curriculum yet. Call create_course (or ask the learner to generate one in the app).");
    return out.join("\n");
  }
  const lessons = allLessons(curriculum);
  const progress = lessons.map((l) => ({ ...l, p: getProgress(page, l.lesson.id) }));
  const mastered = progress.filter((l) => l.p.status === "mastered").length;
  const inProgress = progress.filter((l) => l.p.status === "in-progress").length;
  out.push(
    `Progress: ${mastered}/${lessons.length} lessons mastered (${lessons.length ? Math.round((mastered / lessons.length) * 100) : 0}%), ${inProgress} in progress`,
  );
  const next = progress.find((l) => l.p.status === "in-progress") ?? progress.find((l) => l.p.status === "not-started");
  if (next) out.push(`Next up: "${next.lesson.title}" (lesson_id: ${next.lesson.id}) — ${next.level.name} › ${next.module.title}`);
  // How far ahead lessons are written, for keeping the path ready at the learner's pace.
  const stats = learnerStats(doc);
  const ahead = courseAhead(page, stats.aheadTarget);
  out.push(
    `Learner: ${stats.pace.toFixed(1)} lessons/day over 14 days${stats.accuracy === null ? "" : `, ${Math.round(stats.accuracy * 100)}% right first try lately`}${stats.streak ? `, ${stats.streak}-day streak` : ""}. Keep ${stats.aheadTarget} lessons written ahead; ${ahead.written} ready.`,
  );
  if (ahead.toWrite.length) out.push(`Write next (write_interactive_lesson): ${ahead.toWrite.map((l) => `"${l.title}" (${l.id})`).join(", ")}`);
  if (ahead.nearEnd) out.push("The path is about to run out: add the next module with extend_course.");
  if (curriculum.overview) out.push("", curriculum.overview);
  for (const level of curriculum.levels) {
    out.push("", `## ${level.name}${level.summary ? ` — ${level.summary}` : ""}`);
    for (const mod of level.modules) {
      out.push(`### ${mod.title}${mod.summary ? ` — ${mod.summary}` : ""}`);
      for (const lesson of mod.lessons) {
        const p = getProgress(page, lesson.id);
        const mark = p.status === "mastered" ? "[x]" : p.status === "in-progress" ? "[~]" : p.status === "skipped" ? "[-]" : "[ ]";
        const bits = [`lesson_id: ${lesson.id}`];
        if (p.status !== "not-started") bits.push(p.status);
        const content = getLessonContent(page, lesson.id);
        if (content) bits.push(`interactive, ${content.steps.length} steps`);
        if (p.quizzes.length) bits.push(`best quiz ${Math.round(p.mastery * 100)}% over ${p.quizzes.length} quiz${p.quizzes.length === 1 ? "" : "zes"}`);
        const lessonPage = p.lessonPageId ? getPage(doc, p.lessonPageId) : undefined;
        if (lessonPage && !lessonPage.get("deletedAt")) bits.push(`page: ${ref(pageMeta(lessonPage))}`);
        out.push(`- ${mark} ${lesson.title} (${bits.join(" · ")})`);
      }
    }
  }
  return out.join("\n");
}

export function boardSummary(page: Y.Map<any>): string {
  const { elements, files } = readSceneFromBoard(page);
  const counts = new Map<string, number>();
  for (const el of elements) counts.set(el.type, (counts.get(el.type) ?? 0) + 1);
  const lines = [
    `Whiteboard with ${elements.length} element${elements.length === 1 ? "" : "s"}${counts.size ? ` (${[...counts].map(([t, n]) => `${n} ${t}`).join(", ")})` : ""} and ${Object.keys(files).length} embedded file(s).`,
  ];
  const text = sceneText(elements);
  if (text) lines.push("", "Text on the board:", ...text.split("\n").map((l) => `- ${l}`));
  return lines.join("\n");
}

export function notebookMarkdown(page: Y.Map<any>): string {
  const cells = page.get("cells");
  if (!(cells instanceof Y.Array) || !cells.length) return "_Empty notebook._";
  const parts: string[] = [];
  cells.toArray().forEach((cell: any, i: number) => {
    const get = (k: string) => (cell instanceof Y.Map ? cell.get(k) : cell?.[k]);
    const src = get("source");
    const source = src instanceof Y.Text ? src.toString() : typeof src === "string" ? src : "";
    const type = String(get("type") ?? "code");
    if (type === "markdown" || type === "md" || type === "text") {
      parts.push(source);
      return;
    }
    parts.push(`Cell ${i + 1} (${get("lang") ?? "code"}):\n\`\`\`${get("lang") ?? ""}\n${source}\n\`\`\``);
    const out = notebookOutputText(get("outputs"));
    if (out) parts.push(`Output:\n${out.split("\n").map((l) => `> ${l}`).join("\n")}`);
  });
  return parts.join("\n\n");
}

export function paintSummary(page: Y.Map<any>): string {
  const layers = page.get("layers");
  const strokes = page.get("strokes");
  return `Painted layers: ${layers instanceof Y.Array ? layers.length : 0} layer(s) and ${strokes instanceof Y.Map ? strokes.size : 0} brush stroke(s). Painting can only be viewed in the Basalt app.`;
}

/** Canvases can carry painted layers next to their whiteboard shapes. */
export function hasPaintStrokes(page: Y.Map<any>): boolean {
  const strokes = page.get("strokes");
  return strokes instanceof Y.Map && strokes.size > 0;
}

// ---- search --------------------------------------------------------------------------

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** All searchable text of a page (content, properties, and kind-specific text). */
export function searchText(doc: Y.Doc, meta: PageMeta): string {
  const page = getPage(doc, meta.id);
  if (!page) return "";
  const parts = [pageText(doc, meta.id)];
  const props = propsLine(doc, page);
  if (props) parts.push(props);
  if (meta.kind === "board") parts.push(sceneText(readSceneFromBoard(page).elements));
  if (meta.kind === "notebook") {
    const cells = page.get("cells");
    if (cells instanceof Y.Array) {
      for (const c of cells.toArray() as any[]) {
        const src = c instanceof Y.Map ? c.get("source") : c?.source;
        parts.push(src instanceof Y.Text ? src.toString() : String(src ?? ""));
      }
    }
  }
  if (meta.kind === "course") {
    const c = getCurriculum(page);
    const topic = courseMap(page)?.get("topic");
    if (topic) parts.push(String(topic));
    if (c) for (const { lesson, module, level } of allLessons(c)) parts.push(`${level.name} ${module.title} ${lesson.title} ${lesson.objectives.join(" ")}`);
  }
  if (meta.kind === "chat") {
    const chat = page.get("chat");
    if (chat instanceof Y.Array) for (const m of chat.toArray() as { text?: unknown }[]) parts.push(String(m?.text ?? ""));
  }
  return parts.filter(Boolean).join("\n");
}

export interface SearchHit {
  meta: PageMeta;
  score: number;
  snippet: string;
  text: string;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function makeSnippet(text: string, terms: string[], width = 180): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const lower = flat.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (pos < 0 || i < pos)) pos = i;
  }
  const start = Math.max(0, pos < 0 ? 0 : pos - Math.floor(width / 3));
  let snip = flat.slice(start, start + width);
  if (start > 0) snip = `…${snip}`;
  if (start + width < flat.length) snip = `${snip}…`;
  const re = terms.length ? new RegExp(`(${terms.filter((t) => t.length > 1).map(escapeRe).join("|")})`, "gi") : null;
  return re && terms.some((t) => t.length > 1) ? snip.replace(re, "**$1**") : snip;
}

/**
 * BM25 over titles (boosted) and page text, with prefix matching for longer
 * query words and a bonus for exact phrase matches.
 */
export function searchPages(
  doc: Y.Doc,
  query: string,
  opts: { limit?: number; filter?: (meta: PageMeta) => boolean } = {},
): SearchHit[] {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const pages = listPages(doc).filter((p) => opts.filter?.(p) ?? true);
  const docs = pages.map((meta) => {
    const text = searchText(doc, meta);
    const titleToks = tokenize(displayTitle(meta));
    const bodyToks = tokenize(text);
    const tf = new Map<string, number>();
    for (const t of bodyToks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of titleToks) tf.set(t, (tf.get(t) ?? 0) + 3);
    return { meta, text, tf, len: bodyToks.length + titleToks.length * 3 };
  });
  if (!docs.length) return [];
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / docs.length || 1;
  const k1 = 1.2;
  const b = 0.75;
  const termFreq = (d: (typeof docs)[number], q: string): number => {
    let f = d.tf.get(q) ?? 0;
    if (q.length >= 3) for (const [t, n] of d.tf) if (t !== q && t.startsWith(q)) f += n * 0.5;
    return f;
  };
  const idf = new Map<string, number>();
  for (const q of terms) {
    const df = docs.filter((d) => termFreq(d, q) > 0).length;
    idf.set(q, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)));
  }
  const phrase = query.trim().toLowerCase();
  const hits: SearchHit[] = [];
  for (const d of docs) {
    let score = 0;
    let matched = 0;
    for (const q of terms) {
      const f = termFreq(d, q);
      if (!f) continue;
      matched++;
      score += idf.get(q)! * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
    }
    if (!matched) continue;
    // Pages matching every word rank above pages matching some.
    score *= 0.5 + (0.5 * matched) / terms.length;
    if (phrase.length > 2 && terms.length > 1) {
      if (displayTitle(d.meta).toLowerCase().includes(phrase)) score += 3;
      else if (d.text.toLowerCase().includes(phrase)) score += 1.5;
    }
    hits.push({ meta: d.meta, score, snippet: makeSnippet(d.text, terms), text: d.text });
  }
  return hits.sort((x, y) => y.score - x.score || y.meta.updatedAt - x.meta.updatedAt).slice(0, opts.limit ?? 10);
}

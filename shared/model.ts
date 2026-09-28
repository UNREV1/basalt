// The Basalt workspace data model, stored in a single Y.Doc per workspace.
//
//   doc.getMap("meta")    workspace name/icon
//   doc.getMap("pages")   pageId -> Y.Map (see PageMeta + content containers)
//   doc.getMap("types")   typeId -> ObjectType (plain JSON, Anytype-style types)
//   doc.getMap("learn")   learnerKey -> Y.Map(cardId -> CardState JSON)
//   doc.getMap("stats")   learnerKey -> Y.Map("YYYY-MM-DD" -> reviews that day)
//
// Every page Y.Map contains:
//   id, title, icon, kind, parentId, order, typeId, createdAt, updatedAt,
//   createdBy, deletedAt, favorite, system
//   props:   Y.Map(propId -> value)
//   content: Y.XmlFragment (BlockNote rich text; all kinds have one)
//   style:   optional plain JSON PageStyle (cover, icon image, fonts, lock…)
// plus kind-specific containers created up-front (see createPage) so that
// concurrent clients never race to create them.

import * as Y from "yjs";
import { randomId } from "./crypto.ts";

export type PageKind = "doc" | "board" | "paint" | "notebook" | "database" | "course" | "chat";

const CANVAS_DESCRIPTION = "Infinite canvas: shapes, diagrams, text and pressure-sensitive painting with layers";

/**
 * Page kinds. "board" is the canvas (whiteboard shapes and painting in one);
 * "paint" is a legacy kind that becomes a canvas the first time it's opened.
 * Legacy kinds are never offered for new pages.
 */
export const PAGE_KINDS: {
  kind: PageKind;
  label: string;
  icon: string;
  description: string;
  /** Old kind, migrated when opened. */
  legacy?: boolean;
  /** Made by the app (e.g. assistant chats), not from the create menus. */
  internal?: boolean;
}[] = [
  { kind: "doc", label: "Page", icon: "📄", description: "Rich text with blocks, [[links]] and flashcards" },
  { kind: "database", label: "Database", icon: "🗂️", description: "Typed objects as table, board, gallery or list" },
  { kind: "board", label: "Canvas", icon: "🎨", description: CANVAS_DESCRIPTION },
  { kind: "paint", label: "Canvas", icon: "🎨", description: CANVAS_DESCRIPTION, legacy: true },
  { kind: "notebook", label: "Notebook", icon: "📓", description: "Runnable JavaScript & Python cells" },
  { kind: "course", label: "Course", icon: "🎓", description: "Learn anything, scratch to PhD" },
  { kind: "chat", label: "Chat", icon: "💬", description: "A conversation with your assistant", internal: true },
];

export type PropKind = "text" | "number" | "select" | "multi" | "date" | "checkbox" | "url" | "page";

export interface PropDef {
  id: string;
  name: string;
  kind: PropKind;
  options?: { id: string; name: string; color: string }[];
}

export interface ObjectType {
  id: string;
  name: string;
  icon: string;
  props: PropDef[];
  builtin?: boolean;
}

export interface PageMeta {
  id: string;
  title: string;
  icon: string;
  kind: PageKind;
  parentId: string | null;
  order: number;
  typeId: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  deletedAt: number | null;
  favorite: boolean;
  /** Special pages: "claude-memory" (Claude's memory root), "journal" (daily notes root) */
  system?: string;
  /** Pages of type "skill": the skill (shared/skills.ts) this page is. */
  skillId?: string;
}

export const DEFAULT_TYPE_ID = "page";

export const SELECT_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

export const BUILTIN_TYPES: ObjectType[] = [
  { id: "page", name: "Page", icon: "📄", props: [], builtin: true },
  // A page in the life skill tree: level, XP, quests and prerequisites live
  // in shared/skills.ts, linked through the page's "skillId".
  { id: "skill", name: "Skill", icon: "🌱", props: [], builtin: true },
  {
    id: "task",
    name: "Task",
    icon: "✅",
    builtin: true,
    props: [
      {
        id: "status",
        name: "Status",
        kind: "select",
        options: [
          { id: "todo", name: "To do", color: "gray" },
          { id: "doing", name: "In progress", color: "blue" },
          { id: "done", name: "Done", color: "green" },
        ],
      },
      {
        id: "priority",
        name: "Priority",
        kind: "select",
        options: [
          { id: "low", name: "Low", color: "gray" },
          { id: "med", name: "Medium", color: "yellow" },
          { id: "high", name: "High", color: "red" },
        ],
      },
      { id: "due", name: "Due", kind: "date" },
      { id: "done", name: "Done", kind: "checkbox" },
    ],
  },
  {
    id: "note",
    name: "Note",
    icon: "🗒️",
    builtin: true,
    props: [
      { id: "tags", name: "Tags", kind: "multi", options: [] },
      { id: "source", name: "Source", kind: "url" },
    ],
  },
  {
    id: "book",
    name: "Book",
    icon: "📚",
    builtin: true,
    props: [
      { id: "author", name: "Author", kind: "text" },
      {
        id: "state",
        name: "State",
        kind: "select",
        options: [
          { id: "want", name: "Want to read", color: "gray" },
          { id: "reading", name: "Reading", color: "blue" },
          { id: "read", name: "Read", color: "green" },
        ],
      },
      { id: "rating", name: "Rating", kind: "number" },
    ],
  },
  {
    id: "person",
    name: "Person",
    icon: "🧑",
    builtin: true,
    props: [
      { id: "email", name: "Email", kind: "text" },
      { id: "company", name: "Company", kind: "text" },
    ],
  },
  {
    id: "memory",
    name: "Memory",
    icon: "🧠",
    builtin: true,
    props: [
      { id: "tags", name: "Tags", kind: "multi", options: [] },
      { id: "importance", name: "Importance", kind: "number" },
    ],
  },
];

// ---- accessors ----------------------------------------------------------------

export const pagesMap = (doc: Y.Doc) => doc.getMap<Y.Map<any>>("pages");
export const typesMap = (doc: Y.Doc) => doc.getMap<ObjectType>("types");
export const metaMap = (doc: Y.Doc) => doc.getMap<any>("meta");
export const learnMap = (doc: Y.Doc) => doc.getMap<Y.Map<any>>("learn");
export const statsMap = (doc: Y.Doc) => doc.getMap<Y.Map<number>>("stats");

export function getPage(doc: Y.Doc, id: string): Y.Map<any> | undefined {
  return pagesMap(doc).get(id);
}

export function pageMeta(page: Y.Map<any>): PageMeta {
  return {
    id: page.get("id"),
    title: page.get("title") ?? "",
    icon: page.get("icon") ?? "",
    kind: page.get("kind") ?? "doc",
    parentId: page.get("parentId") ?? null,
    order: page.get("order") ?? 0,
    typeId: page.get("typeId") ?? DEFAULT_TYPE_ID,
    createdAt: page.get("createdAt") ?? 0,
    updatedAt: page.get("updatedAt") ?? 0,
    createdBy: page.get("createdBy") ?? "",
    deletedAt: page.get("deletedAt") ?? null,
    favorite: page.get("favorite") ?? false,
    system: page.get("system") ?? undefined,
    skillId: page.get("skillId") ?? undefined,
  };
}

export function listPages(doc: Y.Doc, opts: { includeDeleted?: boolean } = {}): PageMeta[] {
  const out: PageMeta[] = [];
  pagesMap(doc).forEach((p) => {
    const m = pageMeta(p);
    if (!m.id) return;
    if (!opts.includeDeleted && m.deletedAt) return;
    out.push(m);
  });
  return out;
}

export function childrenOf(pages: PageMeta[], parentId: string | null): PageMeta[] {
  return pages.filter((p) => p.parentId === parentId).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function displayTitle(meta: Pick<PageMeta, "title">): string {
  return meta.title.trim() || "Untitled";
}

export function defaultIcon(kind: PageKind): string {
  return PAGE_KINDS.find((k) => k.kind === kind)?.icon ?? "📄";
}

// ---- mutations ----------------------------------------------------------------

export interface CreatePageInput {
  id?: string;
  title?: string;
  kind?: PageKind;
  parentId?: string | null;
  typeId?: string;
  icon?: string;
  props?: Record<string, unknown>;
  createdBy?: string;
  system?: string;
  order?: number;
  /** Canvases: open with the paint tools rather than the whiteboard tools. */
  canvasMode?: "paint";
}

export function createPage(doc: Y.Doc, input: CreatePageInput = {}): string {
  const id = input.id ?? randomId();
  const kind = input.kind ?? "doc";
  const now = Date.now();
  doc.transact(() => {
    const page = new Y.Map<any>();
    const siblings = listPages(doc).filter((p) => p.parentId === (input.parentId ?? null));
    const order = input.order ?? (siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0);
    page.set("id", id);
    page.set("title", input.title ?? "");
    page.set("icon", input.icon ?? "");
    page.set("kind", kind);
    page.set("parentId", input.parentId ?? null);
    page.set("order", order);
    page.set("typeId", input.typeId ?? DEFAULT_TYPE_ID);
    page.set("createdAt", now);
    page.set("updatedAt", now);
    page.set("createdBy", input.createdBy ?? "");
    page.set("deletedAt", null);
    page.set("favorite", false);
    if (input.system) page.set("system", input.system);
    if (input.canvasMode) page.set("canvasMode", input.canvasMode);
    const props = new Y.Map<any>();
    for (const [k, v] of Object.entries(input.props ?? {})) props.set(k, v);
    page.set("props", props);
    page.set("content", new Y.XmlFragment());
    initKindContainers(page, kind);
    pagesMap(doc).set(id, page);
  });
  return id;
}

/** Kinds offered when creating a page. */
export const CREATABLE_KINDS = PAGE_KINDS.filter((k) => !k.legacy && !k.internal);

export interface CreateOption {
  id: string;
  label: string;
  icon: string;
  description: string;
  input: CreatePageInput;
}

/** What the create menus offer: every kind, plus a canvas that opens ready to paint. */
export const CREATE_OPTIONS: CreateOption[] = CREATABLE_KINDS.flatMap((k): CreateOption[] => {
  const option = { id: k.kind, label: k.label, icon: k.icon, description: k.description, input: { kind: k.kind } };
  if (k.kind !== "board") return [option];
  return [
    { ...option, label: "Whiteboard", description: "Shapes, arrows, text and diagrams on an infinite canvas" },
    {
      id: "painting",
      label: "Painting",
      icon: "🖌️",
      description: "Pressure brushes, layers and colors (vector, zoom forever)",
      input: { kind: "board", canvasMode: "paint", icon: "🖌️" },
    },
  ];
});

/**
 * Turn a legacy paint page into a canvas: it keeps its layers, strokes and
 * paper, and gains the whiteboard's containers. Safe to call more than once.
 */
export function migrateToCanvas(page: Y.Map<any>) {
  if (page.get("kind") !== "paint") return;
  const run = () => {
    if (!(page.get("elements") instanceof Y.Map)) page.set("elements", new Y.Map());
    if (!(page.get("files") instanceof Y.Map)) page.set("files", new Y.Map());
    page.set("kind", "board");
  };
  if (page.doc) page.doc.transact(run);
  else run();
}

/** Kind-specific shared containers. See each view for how they are used. */
function initKindContainers(page: Y.Map<any>, kind: PageKind) {
  switch (kind) {
    case "board":
      page.set("elements", new Y.Map()); // elementId -> Excalidraw element JSON
      page.set("files", new Y.Map()); // fileId -> BinaryFileData JSON
      break;
    case "paint":
      page.set("layers", new Y.Array()); // Y.Map{id,name,visible,opacity,blend,locked}
      page.set("strokes", new Y.Map()); // strokeId -> Stroke JSON (has layerId, z)
      page.set("paintMeta", new Y.Map()); // width, height, background
      break;
    case "notebook":
      page.set("cells", new Y.Array()); // Y.Map{id,type,lang,source:Y.Text,outputs,execCount}
      break;
    case "database":
      page.set("view", new Y.Map()); // layout, typeId, groupBy, sortBy, filters, visibleProps
      break;
    case "course":
      page.set("course", new Y.Map()); // topic, level, curriculum JSON, progress
      break;
    case "chat":
      page.set("chat", new Y.Array()); // {id, role, text, actions?, at} — see src/assistant/chats.ts
      break;
    default:
      break;
  }
}

export function touchPage(doc: Y.Doc, id: string) {
  getPage(doc, id)?.set("updatedAt", Date.now());
}

export function updatePage(doc: Y.Doc, id: string, patch: Partial<Omit<PageMeta, "id">>) {
  const page = getPage(doc, id);
  if (!page) return;
  doc.transact(() => {
    for (const [k, v] of Object.entries(patch)) page.set(k, v);
    if (!("updatedAt" in patch)) page.set("updatedAt", Date.now());
  });
}

export function descendants(doc: Y.Doc, id: string, includeDeleted = true): string[] {
  const all = listPages(doc, { includeDeleted });
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const p of all) {
      if (p.parentId === pid && !out.includes(p.id)) {
        out.push(p.id);
        walk(p.id);
      }
    }
  };
  walk(id);
  return out;
}

export function trashPage(doc: Y.Doc, id: string) {
  const now = Date.now();
  doc.transact(() => {
    for (const pid of [id, ...descendants(doc, id, false)]) getPage(doc, pid)?.set("deletedAt", now);
  });
}

export function restorePage(doc: Y.Doc, id: string) {
  const page = getPage(doc, id);
  if (!page) return;
  const deletedAt = page.get("deletedAt");
  doc.transact(() => {
    for (const pid of [id, ...descendants(doc, id)]) {
      const p = getPage(doc, pid);
      if (p && p.get("deletedAt") === deletedAt) p.set("deletedAt", null);
    }
    // Restore into root if the parent is gone or trashed.
    const parentId = page.get("parentId");
    const parent = parentId ? getPage(doc, parentId) : undefined;
    if (parentId && (!parent || parent.get("deletedAt"))) page.set("parentId", null);
  });
}

export function deletePageForever(doc: Y.Doc, id: string) {
  doc.transact(() => {
    for (const pid of [id, ...descendants(doc, id)]) {
      // A skill page takes its skill and XP log with it (see shared/skills.ts).
      const skillId = getPage(doc, pid)?.get("skillId");
      if (typeof skillId === "string" && (doc.getMap("skills").get(skillId) as { pageId?: string } | undefined)?.pageId === pid) {
        doc.getMap("skills").delete(skillId);
        doc.getMap("skillXp").delete(skillId);
      }
      pagesMap(doc).delete(pid);
    }
  });
}

export function movePage(doc: Y.Doc, id: string, parentId: string | null, order?: number) {
  if (parentId === id || (parentId && descendants(doc, id).includes(parentId))) return;
  const siblings = listPages(doc).filter((p) => p.parentId === parentId && p.id !== id);
  updatePage(doc, id, {
    parentId,
    order: order ?? (siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0),
  });
}

export function setProp(doc: Y.Doc, pageId: string, propId: string, value: unknown) {
  const page = getPage(doc, pageId);
  if (!page) return;
  doc.transact(() => {
    const props = page.get("props") as Y.Map<any>;
    if (value === undefined || value === null || value === "") props.delete(propId);
    else props.set(propId, value);
    page.set("updatedAt", Date.now());
  });
}

export function getProps(page: Y.Map<any>): Record<string, any> {
  return (page.get("props") as Y.Map<any> | undefined)?.toJSON() ?? {};
}

// ---- types ----------------------------------------------------------------------

export function ensureDefaults(doc: Y.Doc, name?: string) {
  doc.transact(() => {
    const types = typesMap(doc);
    for (const t of BUILTIN_TYPES) if (!types.has(t.id)) types.set(t.id, t);
    const meta = metaMap(doc);
    if (name && !meta.get("name")) meta.set("name", name);
    if (!meta.get("createdAt")) meta.set("createdAt", Date.now());
  });
}

/** Add a built-in type that an older workspace doesn't have yet. */
export function ensureBuiltinType(doc: Y.Doc, id: string) {
  const t = BUILTIN_TYPES.find((x) => x.id === id);
  if (t && !typesMap(doc).has(id)) typesMap(doc).set(id, t);
}

export function listTypes(doc: Y.Doc): ObjectType[] {
  const out: ObjectType[] = [];
  typesMap(doc).forEach((t) => out.push(t));
  const builtinOrder = BUILTIN_TYPES.map((t) => t.id);
  return out.sort((a, b) => {
    const ai = builtinOrder.indexOf(a.id);
    const bi = builtinOrder.indexOf(b.id);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });
}

export function getType(doc: Y.Doc, id: string): ObjectType | undefined {
  return typesMap(doc).get(id);
}

export function saveType(doc: Y.Doc, type: ObjectType) {
  typesMap(doc).set(type.id, JSON.parse(JSON.stringify(type)));
}

export function newPropId() {
  return randomId(8);
}

// ---- special pages ----------------------------------------------------------------

export function findSystemPage(doc: Y.Doc, system: string): string | undefined {
  return listPages(doc).find((p) => p.system === system)?.id;
}

export function ensureSystemPage(
  doc: Y.Doc,
  system: string,
  init: { title: string; icon: string; createdBy?: string },
): string {
  return (
    findSystemPage(doc, system) ??
    createPage(doc, { title: init.title, icon: init.icon, system, createdBy: init.createdBy })
  );
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function openDailyNote(doc: Y.Doc, createdBy = ""): string {
  const journal = ensureSystemPage(doc, "journal", { title: "Journal", icon: "📅", createdBy });
  const title = todayKey();
  const existing = listPages(doc).find((p) => p.parentId === journal && p.title === title);
  return existing?.id ?? createPage(doc, { title, icon: "🗓️", parentId: journal, createdBy });
}

// ---- rich text helpers (BlockNote XmlFragment) ----------------------------------

/** Name of the BlockNote inline content node used for [[page links]]. */
export const PAGE_LINK_NODE = "pageLink";
/** Name of the BlockNote block that shows another page inline (![[embeds]]). */
export const EMBED_NODE = "embed";
const isPageRef = (n: Y.AbstractType<unknown>) =>
  n instanceof Y.XmlElement && (n.nodeName === PAGE_LINK_NODE || n.nodeName === EMBED_NODE);

/** Walk a BlockNote XmlFragment and return plain text, one line per block. */
export function fragmentToText(fragment: Y.XmlFragment | undefined, resolveTitle?: (id: string) => string): string {
  if (!fragment) return "";
  const lines: string[] = [];
  const walk = (node: Y.XmlElement | Y.XmlFragment | Y.XmlText, line: string[]) => {
    if (node instanceof Y.XmlText) {
      for (const op of node.toDelta() as { insert: unknown }[]) {
        if (typeof op.insert === "string") line.push(op.insert);
      }
      return;
    }
    if (node instanceof Y.XmlElement) {
      if (node.nodeName === PAGE_LINK_NODE) {
        const id = node.getAttribute("pageId") as string | undefined;
        line.push(`[[${id ? (resolveTitle?.(id) ?? id) : ""}]]`);
        return;
      }
      if (node.nodeName === "hardBreak") {
        line.push("\n");
        return;
      }
      if (node.nodeName === "inlineMath") {
        line.push(`$${node.getAttribute("latex") ?? ""}$`);
        return;
      }
      if (node.nodeName === "math") {
        line.push(`$$${node.getAttribute("latex") ?? ""}$$`);
        return;
      }
      if (node.nodeName === EMBED_NODE) {
        const id = node.getAttribute("pageId") as string | undefined;
        line.push(`![[${id ? (resolveTitle?.(id) ?? id) : ""}]]`);
        return;
      }
      if (node.nodeName === "blockContainer") {
        const own: string[] = [];
        for (const child of node.toArray() as (Y.XmlElement | Y.XmlText)[]) {
          if (child instanceof Y.XmlElement && child.nodeName === "blockGroup") {
            if (own.length) lines.push(own.join(""));
            own.length = 0;
            walk(child, own);
          } else {
            walk(child, own);
          }
        }
        if (own.length) lines.push(own.join(""));
        return;
      }
    }
    for (const child of (node as Y.XmlElement).toArray() as (Y.XmlElement | Y.XmlText)[]) walk(child, line);
  };
  const root: string[] = [];
  walk(fragment, root);
  if (root.length) lines.push(root.join(""));
  return lines.filter((l) => l.trim().length > 0).join("\n");
}

/** All page ids referenced via [[links]] and ![[embeds]] inside a fragment. */
export function fragmentLinks(fragment: Y.XmlFragment | undefined): string[] {
  if (!fragment) return [];
  const ids = new Set<string>();
  for (const el of fragment.createTreeWalker(isPageRef)) {
    const id = (el as Y.XmlElement).getAttribute("pageId");
    if (typeof id === "string" && id) ids.add(id);
  }
  return [...ids];
}

export function pageText(doc: Y.Doc, id: string): string {
  const page = getPage(doc, id);
  if (!page) return "";
  const titles = (pid: string) => displayTitle(pageMeta(getPage(doc, pid) ?? new Y.Map()));
  return fragmentToText(page.get("content") as Y.XmlFragment, titles);
}

export interface LinkGraph {
  /** pageId -> ids it links to (including parent/child structure edges excluded) */
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
}

export function buildLinkGraph(doc: Y.Doc): LinkGraph {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  pagesMap(doc).forEach((page, id) => {
    if (page.get("deletedAt")) return;
    const links = fragmentLinks(page.get("content") as Y.XmlFragment).filter((l) => l !== id);
    outgoing.set(id, links);
    for (const l of links) {
      if (!incoming.has(l)) incoming.set(l, []);
      incoming.get(l)!.push(id);
    }
  });
  return { outgoing, incoming };
}

// ---- per-page appearance ------------------------------------------------------------
//
// page.get("style") holds a plain JSON object (PageStyle) shared with every
// collaborator, like Notion's page options. It is replaced as a whole on each
// change, so two people editing *different* style fields at the same instant
// resolve last-writer-wins; that trade-off keeps the layout a single key.
// Colors, gradients and tints are stored as palette ids (or #rrggbb), never as
// raw CSS, so a peer cannot inject styles.

export type PageFont = "sans" | "serif" | "mono" | "rounded";
export type PageWidth = "normal" | "wide" | "full";
export type PageLineSpacing = "compact" | "normal" | "relaxed";

export interface PageCover {
  /** gradient: palette id · color: palette id or #rrggbb · image: data:/https: URL */
  type: "gradient" | "color" | "image";
  value: string;
}

export interface PageStyle {
  cover?: PageCover;
  /** Vertical focal point of an image cover, 0 (top) – 100 (bottom). */
  coverY?: number;
  /** Small image icon (data URL); takes precedence over the emoji `icon`. */
  iconImage?: string;
  font?: PageFont;
  smallText?: boolean;
  lineSpacing?: PageLineSpacing;
  width?: PageWidth;
  /** Accent palette id or #rrggbb, scoped to this page. */
  accent?: string;
  /** Background tint palette id. */
  tint?: string;
  hideProperties?: boolean;
  hideBacklinks?: boolean;
  hideLocalGraph?: boolean;
  hideToc?: boolean;
  hideMeta?: boolean;
  /** Read-only for everyone until unlocked. */
  locked?: boolean;
}

export type PageStylePatch = { [K in keyof PageStyle]?: PageStyle[K] | null };

const PAGE_FONTS: PageFont[] = ["sans", "serif", "mono", "rounded"];
const PAGE_WIDTHS: PageWidth[] = ["normal", "wide", "full"];
const LINE_SPACINGS: PageLineSpacing[] = ["compact", "normal", "relaxed"];
const STYLE_FLAGS = ["smallText", "hideProperties", "hideBacklinks", "hideLocalGraph", "hideToc", "hideMeta", "locked"] as const;
const PALETTE_VALUE = /^(#[0-9a-f]{6}|[a-z][a-z0-9-]{0,31})$/i;
const IMAGE_URL = /^(data:image\/[a-z0-9.+-]+[;,]|https?:\/\/|blob:)/i;

/** Validate untrusted style JSON (it comes from collaborators) into a PageStyle. */
export function sanitizePageStyle(raw: unknown): PageStyle {
  const out: PageStyle = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  const c = r.cover as Record<string, unknown> | undefined;
  if (c && typeof c === "object" && typeof c.value === "string") {
    if (c.type === "image" && IMAGE_URL.test(c.value)) out.cover = { type: "image", value: c.value };
    else if ((c.type === "gradient" || c.type === "color") && PALETTE_VALUE.test(c.value)) out.cover = { type: c.type, value: c.value };
  }
  if (typeof r.coverY === "number" && Number.isFinite(r.coverY)) out.coverY = Math.min(100, Math.max(0, r.coverY));
  if (typeof r.iconImage === "string" && IMAGE_URL.test(r.iconImage)) out.iconImage = r.iconImage;
  if (PAGE_FONTS.includes(r.font as PageFont)) out.font = r.font as PageFont;
  if (PAGE_WIDTHS.includes(r.width as PageWidth)) out.width = r.width as PageWidth;
  if (LINE_SPACINGS.includes(r.lineSpacing as PageLineSpacing)) out.lineSpacing = r.lineSpacing as PageLineSpacing;
  if (typeof r.accent === "string" && PALETTE_VALUE.test(r.accent)) out.accent = r.accent;
  if (typeof r.tint === "string" && PALETTE_VALUE.test(r.tint)) out.tint = r.tint;
  for (const k of STYLE_FLAGS) if (r[k] === true) out[k] = true;
  return out;
}

export function getPageStyle(page: Y.Map<any> | undefined): PageStyle {
  return sanitizePageStyle(page?.get("style"));
}

export function isPageLocked(page: Y.Map<any> | undefined): boolean {
  return getPageStyle(page).locked === true;
}

/** Merge a patch into a page's style. null/undefined/false/"" remove a field. */
export function setPageStyle(doc: Y.Doc, id: string, patch: PageStylePatch, origin: unknown = null) {
  const page = getPage(doc, id);
  if (!page) return;
  const next: Record<string, unknown> = { ...getPageStyle(page) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === false || v === "") delete next[k];
    else next[k] = v;
  }
  const clean = sanitizePageStyle(next);
  doc.transact(() => {
    if (Object.keys(clean).length) page.set("style", clean);
    else if (page.has("style")) page.delete("style");
  }, origin);
}

// ---- duplicate ------------------------------------------------------------------

export interface DuplicateOptions {
  /** Also copy sub-pages (recursively). Default false. */
  includeChildren?: boolean;
  /** Title of the copy. Default "Copy of <title>". */
  title?: string;
  /** Parent of the copy. Default: same parent as the original. */
  parentId?: string | null;
  createdBy?: string;
}

/** Replace exact id strings inside plain JSON values. */
function remapJson(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === "string") return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapJson(v, ids));
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = remapJson(v, ids);
    return out;
  }
  return value;
}

/**
 * Deep-copy a page (content, properties, style and kind-specific containers)
 * via Y.Map#clone. With includeChildren, sub-pages are copied too and links
 * between copied pages ([[links]], page relations, course lesson ids) are
 * pointed at the copies. Returns the new page id, or null if `id` is unknown.
 */
export function duplicatePage(doc: Y.Doc, id: string, opts: DuplicateOptions = {}): string | null {
  const source = getPage(doc, id);
  if (!source) return null;
  const srcMeta = pageMeta(source);
  const all = listPages(doc);
  const ids = new Map<string, string>();
  const plan: { from: string; to: string; parentId: string | null }[] = [];
  const rootId = randomId();
  ids.set(id, rootId);
  plan.push({ from: id, to: rootId, parentId: opts.parentId === undefined ? srcMeta.parentId : opts.parentId });
  if (opts.includeChildren) {
    const walk = (pid: string) => {
      for (const child of childrenOf(all, pid)) {
        const to = randomId();
        ids.set(child.id, to);
        plan.push({ from: child.id, to, parentId: ids.get(pid)! });
        walk(child.id);
      }
    };
    walk(id);
  }

  const targetParent = plan[0].parentId;
  let order: number;
  const siblings = childrenOf(all, targetParent);
  if (targetParent === srcMeta.parentId) {
    // Right after the original, like Notion.
    const idx = siblings.findIndex((s) => s.id === id);
    const next = siblings[idx + 1];
    order = next ? (srcMeta.order + next.order) / 2 : srcMeta.order + 1;
  } else {
    order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
  }

  const now = Date.now();
  doc.transact(() => {
    for (const step of plan) {
      const original = getPage(doc, step.from)!;
      const copy = original.clone();
      copy.set("id", step.to);
      copy.set("parentId", step.parentId);
      copy.set("createdAt", now);
      copy.set("updatedAt", now);
      copy.set("deletedAt", null);
      copy.set("favorite", false);
      if (opts.createdBy !== undefined) copy.set("createdBy", opts.createdBy);
      copy.delete("system");
      if (step.from === id) {
        copy.set("title", opts.title ?? `Copy of ${displayTitle(srcMeta)}`);
        copy.set("order", order);
      }
      pagesMap(doc).set(step.to, copy);
    }
    if (ids.size > 1) {
      for (const step of plan) {
        const copy = getPage(doc, step.to)!;
        const content = copy.get("content");
        if (content instanceof Y.XmlFragment) {
          for (const el of content.createTreeWalker(isPageRef)) {
            const target = (el as Y.XmlElement).getAttribute("pageId");
            const mapped = typeof target === "string" ? ids.get(target) : undefined;
            if (mapped) (el as Y.XmlElement).setAttribute("pageId", mapped);
          }
        }
        for (const key of ["props", "course"]) {
          const m = copy.get(key);
          if (!(m instanceof Y.Map)) continue;
          for (const [k, v] of [...m.entries()]) {
            if (v instanceof Y.AbstractType) continue;
            const next = remapJson(v, ids);
            if (JSON.stringify(next) !== JSON.stringify(v)) m.set(k, next);
          }
        }
      }
    }
  });
  return rootId;
}

// ---- templates ------------------------------------------------------------------
//
// Templates are ordinary pages living under the "Templates" system page
// (created on demand). Its direct children are the templates; their own
// sub-pages are copied along when a template is used. This keeps templates
// visible, editable and synced like any page, with no extra flags to honor.

export const TEMPLATES_SYSTEM = "templates";

export function ensureTemplatesPage(doc: Y.Doc, createdBy = ""): string {
  return ensureSystemPage(doc, TEMPLATES_SYSTEM, { title: "Templates", icon: "📋", createdBy });
}

export function listTemplates(doc: Y.Doc): PageMeta[] {
  const root = findSystemPage(doc, TEMPLATES_SYSTEM);
  return root ? childrenOf(listPages(doc), root) : [];
}

/** The Templates page and everything inside it (excluded from study, search and graph). */
export function templateSubtree(doc: Y.Doc): Set<string> {
  const root = findSystemPage(doc, TEMPLATES_SYSTEM);
  return root ? new Set([root, ...descendants(doc, root)]) : new Set();
}

export function isTemplatePage(doc: Y.Doc, id: string): boolean {
  const root = findSystemPage(doc, TEMPLATES_SYSTEM);
  const parentId = getPage(doc, id)?.get("parentId");
  return !!root && parentId === root;
}

/** Copy a page (with sub-pages) into Templates. Returns the template's id. */
export function saveAsTemplate(doc: Y.Doc, id: string, createdBy = ""): string | null {
  const page = getPage(doc, id);
  if (!page) return null;
  const root = ensureTemplatesPage(doc, createdBy);
  return duplicatePage(doc, id, { parentId: root, includeChildren: true, title: displayTitle(pageMeta(page)), createdBy });
}

/** Create a new page from a template (sub-pages included, empty title). */
export function createFromTemplate(
  doc: Y.Doc,
  templateId: string,
  opts: { parentId?: string | null; createdBy?: string; title?: string } = {},
): string | null {
  return duplicatePage(doc, templateId, {
    parentId: opts.parentId ?? null,
    includeChildren: true,
    title: opts.title ?? "",
    createdBy: opts.createdBy ?? "",
  });
}

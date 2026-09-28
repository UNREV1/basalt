// Claude's long-term memory, stored as notes under the "claude-memory" system
// page. The tools mirror Anthropic's memory tool (a /memories directory of
// text files) while keeping every file a normal, human-editable Basalt page:
//
//   /memories/preferences.md          -> page "preferences" under Claude Memory
//   /memories/projects/basalt.md      -> page "basalt" under page "projects"
//
// A page can be both a file (its content) and a directory (its sub-pages).

import type * as Y from "yjs";
import {
  createPage,
  displayTitle,
  ensureSystemPage,
  findSystemPage,
  getPage,
  movePage,
  pageMeta,
  pageText,
  todayKey,
  trashPage,
  updatePage,
  type PageMeta,
} from "../shared/model.ts";
import { fragmentToMarkdown, writePageMarkdown, type BlockConverter } from "../shared/vault.ts";
import { ToolError, childPages, fmtTime, isDescendantOf, searchPages, tokenize } from "./ops.ts";

export const MEMORY_SYSTEM = "claude-memory";
export const MEMORY_TYPE = "memory";
const ROOT = "/memories";

interface MemoryPath {
  segments: string[];
  /** Ends with "/" (or is the root): the caller means a directory. */
  dir: boolean;
  /** Has a file extension (.md/.txt): the caller means a file. */
  file: boolean;
}

function segmentName(title: string): string {
  return title.replace(/[/\\]/g, "-").trim() || "untitled";
}

function sizeLabel(chars: number): string {
  return chars < 1024 ? `${chars} B` : `${(chars / 1024).toFixed(1)} KB`;
}

function countOccurrences(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) positions.push(i);
  return positions;
}

function numbered(lines: string[], start = 1): string {
  return lines.map((l, i) => `${String(start + i).padStart(6)}\t${l}`).join("\n");
}

export class MemoryStore {
  private readonly doc: Y.Doc;
  private readonly conv: BlockConverter;
  private readonly origin: unknown;
  private readonly agent: string;
  /** Called with the page Claude is working on (for live presence). */
  onTouch?: (pageId: string, activity: string) => void;

  constructor(doc: Y.Doc, conv: BlockConverter, opts: { origin: unknown; agent: string }) {
    this.doc = doc;
    this.conv = conv;
    this.origin = opts.origin;
    this.agent = opts.agent;
  }

  private tx<T>(fn: () => T): T {
    let out!: T;
    this.doc.transact(() => {
      out = fn();
    }, this.origin);
    return out;
  }

  rootId(create: boolean): string | undefined {
    const existing = findSystemPage(this.doc, MEMORY_SYSTEM);
    if (existing || !create) return existing;
    return this.tx(() => ensureSystemPage(this.doc, MEMORY_SYSTEM, { title: "Claude Memory", icon: "🧠", createdBy: this.agent }));
  }

  parse(path: string | undefined): MemoryPath {
    let s = (path ?? "").trim().replace(/\\/g, "/");
    s = s.replace(/^\/+/, "");
    if (/^memories(\/|$)/i.test(s)) s = s.slice("memories".length);
    s = s.replace(/^\/+/, "");
    const dir = s === "" || s.endsWith("/");
    const segments = s.split("/").filter(Boolean);
    for (const seg of segments) {
      if (seg === ".." || seg === ".") throw new ToolError(`Invalid path "${path}": "." and ".." are not allowed.`);
    }
    let file = false;
    if (!dir && segments.length) {
      const last = segments[segments.length - 1];
      const stripped = last.replace(/\.(md|markdown|txt)$/i, "");
      file = stripped !== last;
      segments[segments.length - 1] = stripped || last;
    }
    return { segments, dir, file };
  }

  private childNamed(parent: string, name: string): PageMeta | undefined {
    const kids = childPages(this.doc, parent);
    const lower = name.toLowerCase();
    return (
      kids.find((k) => displayTitle(k) === name) ??
      kids.find((k) => displayTitle(k).toLowerCase() === lower) ??
      kids.find((k) => segmentName(displayTitle(k)).toLowerCase() === lower)
    );
  }

  find(segments: string[]): string | undefined {
    let cur = this.rootId(false);
    for (const seg of segments) {
      if (!cur) return undefined;
      cur = this.childNamed(cur, seg)?.id;
    }
    return cur;
  }

  /** Display path of a memory page: "/memories/a/b.md" (or "/memories/a/" as a directory). */
  pathOf(id: string, asDir = false): string {
    const root = this.rootId(false);
    const segs: string[] = [];
    let cur = getPage(this.doc, id);
    for (let i = 0; cur && i < 64 && cur.get("id") !== root; i++) {
      segs.unshift(segmentName(displayTitle(pageMeta(cur))));
      const parent = cur.get("parentId") as string | null;
      cur = parent ? getPage(this.doc, parent) : undefined;
    }
    if (!segs.length) return `${ROOT}/`;
    return `${ROOT}/${segs.join("/")}${asDir ? "/" : ".md"}`;
  }

  private display(p: MemoryPath): string {
    if (!p.segments.length) return ROOT;
    return `${ROOT}/${p.segments.join("/")}${p.dir ? "/" : ".md"}`;
  }

  private ensureFolders(segments: string[]): string {
    let cur = this.rootId(true)!;
    for (const seg of segments) {
      const found = this.childNamed(cur, seg);
      cur =
        found?.id ??
        this.tx(() => createPage(this.doc, { title: seg, icon: "📁", parentId: cur, typeId: MEMORY_TYPE, createdBy: this.agent }));
    }
    return cur;
  }

  async read(id: string): Promise<string> {
    const page = getPage(this.doc, id);
    if (!page) return "";
    return fragmentToMarkdown(this.conv, this.doc, page.get("content") as Y.XmlFragment);
  }

  private async write(id: string, text: string) {
    await writePageMarkdown(this.conv, this.doc, id, text, { mode: "replace", origin: this.origin });
    this.onTouch?.(id, "Updating memory");
  }

  private requireFile(path: string): { id: string; p: MemoryPath } {
    const p = this.parse(path);
    if (!p.segments.length) throw new ToolError(`${ROOT} is a directory. Pass a file path such as ${ROOT}/notes.md.`);
    const id = this.find(p.segments);
    if (!id) throw new ToolError(`The path ${this.display(p)} does not exist. Call memory_view to list memory files.`);
    return { id, p };
  }

  private listing(id: string, depth = 3): string {
    const lines: string[] = [];
    const walk = (parent: string, level: number, indent: string) => {
      for (const kid of childPages(this.doc, parent)) {
        const text = pageText(this.doc, kid.id);
        const kids = childPages(this.doc, kid.id);
        const updated = fmtTime(kid.updatedAt);
        if (kids.length) {
          lines.push(`${indent}- ${this.pathOf(kid.id, true)}  (${kids.length} item${kids.length === 1 ? "" : "s"})`);
          if (text.trim()) lines.push(`${indent}  - ${this.pathOf(kid.id)}  (${sizeLabel(text.length)}, updated ${updated})`);
          if (level < depth) walk(kid.id, level + 1, `${indent}  `);
        } else if (this.isEmptyFolder(kid)) {
          lines.push(`${indent}- ${this.pathOf(kid.id, true)}  (empty folder)`);
        } else {
          lines.push(`${indent}- ${this.pathOf(kid.id)}  (${sizeLabel(text.length)}, updated ${updated})`);
        }
      }
    };
    walk(id, 1, "");
    const header = `Directory ${this.pathOf(id, true).replace(/\/$/, "") || ROOT}${id === this.rootId(false) ? "" : "/"}:`;
    if (!lines.length) return `${header}\n(empty)`;
    return `${header}\n${lines.join("\n")}`;
  }

  async view(path?: string, range?: [number, number]): Promise<string> {
    const p = this.parse(path);
    const root = this.rootId(false);
    if (!p.segments.length) {
      if (!root) return `Directory ${ROOT}:\n(empty — no memories yet. Save one with memory_create or remember.)`;
      const rootText = pageText(this.doc, root);
      const listing = this.listing(root);
      return rootText.trim() ? `${listing}\n\n(The memory root page itself also has notes; read them with read_note("Claude Memory").)` : listing;
    }
    const id = this.find(p.segments);
    if (!id) throw new ToolError(`The path ${this.display(p)} does not exist. Call memory_view with no path to list memory files.`);
    const kids = childPages(this.doc, id);
    if (p.dir || (!p.file && kids.length)) return this.listing(id);
    this.onTouch?.(id, "Reading memory");
    const text = await this.read(id);
    const lines = text ? text.replace(/\n$/, "").split("\n") : [];
    const display = this.pathOf(id);
    if (!lines.length) return `${display} is empty.`;
    if (range) {
      const [start, endRaw] = range;
      const end = endRaw === -1 ? lines.length : endRaw;
      if (start < 1 || start > lines.length || end < start) {
        throw new ToolError(`Invalid view_range [${start}, ${endRaw}]: the file has ${lines.length} lines.`);
      }
      return `Here's the content of ${display} (lines ${start}-${Math.min(end, lines.length)} of ${lines.length}):\n${numbered(lines.slice(start - 1, end), start)}`;
    }
    return `Here's the content of ${display} with line numbers:\n${numbered(lines)}`;
  }

  async create(path: string, content: string): Promise<string> {
    const p = this.parse(path);
    if (!p.segments.length || p.dir) throw new ToolError(`Give a file path such as ${ROOT}/notes.md.`);
    const existing = this.find(p.segments);
    if (existing) {
      await this.write(existing, content);
      return `File ${this.pathOf(existing)} overwritten.`;
    }
    const parent = this.ensureFolders(p.segments.slice(0, -1));
    const name = p.segments[p.segments.length - 1];
    const id = this.tx(() => createPage(this.doc, { title: name, icon: "📝", parentId: parent, typeId: MEMORY_TYPE, createdBy: this.agent }));
    await this.write(id, content);
    return `File created successfully at: ${this.pathOf(id)}`;
  }

  async strReplace(path: string, oldStr: string, newStr: string): Promise<string> {
    const { id } = this.requireFile(path);
    if (!oldStr) throw new ToolError("old_str must not be empty.");
    const text = await this.read(id);
    const hits = countOccurrences(text, oldStr);
    const display = this.pathOf(id);
    if (!hits.length) {
      throw new ToolError(
        `No replacement was performed: old_str did not appear verbatim in ${display}. Files are stored as rich text and shown normalized (e.g. "-" bullets, trimmed trailing spaces) — call memory_view("${display}") and copy the exact text.`,
      );
    }
    if (hits.length > 1) {
      const lineNos = hits.map((pos) => text.slice(0, pos).split("\n").length);
      throw new ToolError(`No replacement was performed. Multiple occurrences of old_str in lines ${lineNos.join(", ")} of ${display}. Include more context to make it unique.`);
    }
    const at = hits[0];
    const next = text.slice(0, at) + newStr + text.slice(at + oldStr.length);
    await this.write(id, next);
    const updated = (await this.read(id)).replace(/\n$/, "").split("\n");
    const line = next.slice(0, at).split("\n").length;
    const from = Math.max(1, line - 3);
    const to = Math.min(updated.length, line + newStr.split("\n").length + 3);
    return `The memory file ${display} has been edited. Snippet:\n${numbered(updated.slice(from - 1, to), from)}`;
  }

  async insert(path: string, insertLine: number, insertText: string): Promise<string> {
    const { id } = this.requireFile(path);
    const text = await this.read(id);
    const lines = text ? text.replace(/\n$/, "").split("\n") : [];
    if (!Number.isInteger(insertLine) || insertLine < 0 || insertLine > lines.length) {
      throw new ToolError(`Invalid insert_line ${insertLine}: it must be between 0 and ${lines.length} (the number of lines in ${this.pathOf(id)}).`);
    }
    lines.splice(insertLine, 0, ...insertText.replace(/\n$/, "").split("\n"));
    await this.write(id, lines.join("\n"));
    return `The memory file ${this.pathOf(id)} has been edited (inserted after line ${insertLine}).`;
  }

  private isEmptyFolder(meta: PageMeta): boolean {
    return meta.icon === "📁" && !childPages(this.doc, meta.id).length && !pageText(this.doc, meta.id).trim();
  }

  /** Trash folders that only existed to hold files that are gone now. */
  private pruneEmptyFolders(fromId: string | null) {
    const root = this.rootId(false);
    let cur = fromId;
    while (cur && cur !== root) {
      const page = getPage(this.doc, cur);
      if (!page) return;
      const meta = pageMeta(page);
      if (!this.isEmptyFolder(meta)) return;
      this.tx(() => trashPage(this.doc, meta.id));
      cur = meta.parentId;
    }
  }

  delete(path: string): string {
    const p = this.parse(path);
    if (!p.segments.length) throw new ToolError(`Refusing to delete the whole ${ROOT} directory. Delete individual files or folders instead.`);
    const id = this.find(p.segments);
    if (!id) throw new ToolError(`The path ${this.display(p)} does not exist.`);
    const hasKids = childPages(this.doc, id).length > 0;
    const display = this.pathOf(id, hasKids);
    const parent = (getPage(this.doc, id)?.get("parentId") as string | null) ?? null;
    this.tx(() => trashPage(this.doc, id));
    this.pruneEmptyFolders(parent);
    return `Deleted ${display}${hasKids ? " and everything in it" : ""} (moved to the Basalt trash, so the user can restore it).`;
  }

  rename(oldPath: string, newPath: string): string {
    const { id } = this.requireFile(oldPath);
    const to = this.parse(newPath);
    if (!to.segments.length) throw new ToolError("new_path must name a file, e.g. /memories/archive/old.md.");
    const clash = this.find(to.segments);
    if (clash && clash !== id) throw new ToolError(`The destination ${this.display({ ...to, dir: false })} already exists.`);
    const from = this.pathOf(id);
    const parent = this.ensureFolders(to.segments.slice(0, -1));
    if (parent === id || isDescendantOf(this.doc, parent, id)) throw new ToolError("Cannot move a folder into itself.");
    const name = to.segments[to.segments.length - 1];
    const oldParent = (getPage(this.doc, id)?.get("parentId") as string | null) ?? null;
    this.tx(() => {
      updatePage(this.doc, id, { title: name });
      if (oldParent !== parent) movePage(this.doc, id, parent);
    });
    if (oldParent !== parent) this.pruneEmptyFolders(oldParent);
    return `Renamed ${from} to ${this.pathOf(id)}.`;
  }

  async remember(fact: string, topic = "general"): Promise<string> {
    const clean = fact.replace(/\s*\n\s*/g, " ").trim();
    if (!clean) throw new ToolError("fact must not be empty.");
    const p = this.parse(topic || "general");
    if (!p.segments.length) p.segments.push("general");
    let id = this.find(p.segments);
    if (!id) {
      const parent = this.ensureFolders(p.segments.slice(0, -1));
      const name = p.segments[p.segments.length - 1];
      id = this.tx(() => createPage(this.doc, { title: name, icon: "📝", parentId: parent, typeId: MEMORY_TYPE, createdBy: this.agent }));
    }
    const line = `- ${todayKey()}: ${clean}`;
    await writePageMarkdown(this.conv, this.doc, id, line, { mode: "append", origin: this.origin });
    this.onTouch?.(id, "Remembering");
    return `Remembered in ${this.pathOf(id)}: ${line}`;
  }

  recall(query: string, limit = 5): string {
    const root = this.rootId(false);
    if (!root) return "No memories yet.";
    const hits = searchPages(this.doc, query, { limit, filter: (m) => m.id !== root && isDescendantOf(this.doc, m.id, root) });
    if (!hits.length) return `No memories match "${query}". Call memory_view to browse all memory files.`;
    const terms = tokenize(query);
    const out = [`${hits.length} memory file${hits.length === 1 ? "" : "s"} match "${query}":`];
    for (const h of hits) {
      out.push("", `## ${this.pathOf(h.meta.id)} (updated ${fmtTime(h.meta.updatedAt)})`);
      const lines = h.text.split("\n").filter((l) => {
        const toks = tokenize(l);
        return terms.some((t) => toks.some((x) => x === t || (t.length >= 3 && x.startsWith(t))));
      });
      if (lines.length) out.push(...lines.slice(0, 8).map((l) => `- ${l.replace(/^[-*]\s+/, "")}`));
      else out.push(h.snippet);
    }
    return out.join("\n");
  }
}

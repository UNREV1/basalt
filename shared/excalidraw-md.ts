// Excalidraw scenes <-> files, shared by the vault importer/exporter (Node and
// browser). Understands plain `.excalidraw` JSON and the Obsidian Excalidraw
// plugin's `.excalidraw.md` format (a markdown file whose "## Drawing" section
// holds the scene as a ```json or ```compressed-json block, the latter being
// LZString.compressToBase64 output wrapped over several lines).
//
// Board pages store the scene in two Y.Maps on the page (see shared/model.ts):
//   elements: elementId -> Excalidraw element JSON (z-order by fractional `index`)
//   files:    fileId    -> BinaryFileData JSON ({ id, mimeType, dataURL, created })

import * as Y from "yjs";
import * as lzNamespace from "lz-string";

// lz-string is CommonJS: Node exposes it as the default export, bundlers as
// named exports. Accept either shape.
const LZ: typeof lzNamespace = (lzNamespace as unknown as { default?: typeof lzNamespace }).default ?? lzNamespace;

export interface ExcalidrawScene {
  elements: any[];
  files: Record<string, any>;
  appState?: Record<string, any>;
  /**
   * Obsidian plugin only: fileId -> link target listed under "## Embedded Files"
   * (e.g. "Pasted Image 1.png" from `[[Pasted Image 1.png]]`, or a URL). The
   * plugin keeps images as separate vault files, so callers resolve these into
   * `files` entries themselves.
   */
  embedded?: Record<string, string>;
}

/** Does this file name look like an Excalidraw drawing we can import? */
export function isExcalidrawFileName(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".excalidraw") || n.endsWith(".excalidraw.md") || n.endsWith(".excalidraw.json");
}

/** File name without the drawing extension ("Plan.excalidraw.md" -> "Plan"). */
export function excalidrawBaseName(name: string): string {
  const base = name.split("/").pop() ?? name;
  return base.replace(/\.excalidraw(\.md|\.json)?$/i, "");
}

function sceneFromJson(obj: any): ExcalidrawScene | null {
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.elements)) return null;
  if (obj.type && typeof obj.type === "string" && !obj.type.startsWith("excalidraw")) return null;
  const files: Record<string, any> = {};
  if (obj.files && typeof obj.files === "object") {
    for (const [id, f] of Object.entries(obj.files as Record<string, any>)) {
      if (f && typeof f === "object" && typeof f.dataURL === "string") files[id] = { ...f, id: f.id ?? id };
    }
  }
  return {
    elements: obj.elements.filter((e: any) => e && typeof e === "object" && typeof e.id === "string"),
    files,
    appState: obj.appState && typeof obj.appState === "object" ? obj.appState : undefined,
  };
}

function parseEmbeddedFiles(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const start = md.search(/^##\s+Embedded Files\s*$/m);
  if (start < 0) return out;
  const rest = md.slice(start).split("\n").slice(1);
  for (const line of rest) {
    if (/^(##\s|%%|```)/.test(line.trim())) break;
    const m = line.match(/^([A-Za-z0-9_-]{6,}):\s*(.+?)\s*$/);
    if (!m) continue;
    const value = m[2];
    const link = value.match(/^!?\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
    if (link) out[m[1]] = link[1].trim();
    else if (/^https?:\/\//i.test(value)) out[m[1]] = value;
    // `$$latex$$` formulas and other plugin-rendered sources are skipped.
  }
  return out;
}

/**
 * Parse an Excalidraw drawing from a `.excalidraw` (JSON) or Obsidian
 * `.excalidraw.md` file. Returns null when the text holds no scene.
 */
export function parseExcalidrawFile(name: string, text: string): ExcalidrawScene | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      return sceneFromJson(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  const looksLikePlugin =
    name.toLowerCase().endsWith(".excalidraw.md") || /excalidraw-plugin\s*:/.test(text) || /^#\s+Excalidraw Data\s*$/m.test(text);
  if (!looksLikePlugin) return null;
  let scene: ExcalidrawScene | null = null;
  const compressed = text.match(/```compressed-json\s*\n([\s\S]*?)```/);
  if (compressed) {
    try {
      const json = LZ.decompressFromBase64(compressed[1].replace(/\s+/g, ""));
      if (json) scene = sceneFromJson(JSON.parse(json));
    } catch {
      scene = null;
    }
  }
  if (!scene) {
    const plain = text.match(/```json\s*\n([\s\S]*?)```/);
    if (plain) {
      try {
        scene = sceneFromJson(JSON.parse(plain[1]));
      } catch {
        scene = null;
      }
    }
  }
  if (!scene) return null;
  const embedded = parseEmbeddedFiles(text);
  if (Object.keys(embedded).length) scene.embedded = embedded;
  return scene;
}

// ---- fractional indices -------------------------------------------------------

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Same validity rules as the `fractional-indexing` package Excalidraw uses. */
function isValidIndex(key: unknown): key is string {
  if (typeof key !== "string" || !key || key === "A" + "0".repeat(26)) return false;
  const head = key[0];
  const len = head >= "a" && head <= "z" ? head.charCodeAt(0) - 95 : head >= "A" && head <= "Z" ? 92 - head.charCodeAt(0) : 0;
  if (!len || key.length < len) return false;
  for (let i = 1; i < key.length; i++) if (!DIGITS.includes(key[i])) return false;
  return !key.slice(len).endsWith("0");
}

/** The i-th integer key of the fractional-indexing scheme Excalidraw uses ("a0", "a1", …, "az", "b00", …). */
function integerKey(i: number): string {
  let head = 0;
  let count = 62;
  while (i >= count) {
    i -= count;
    head++;
    count *= 62;
  }
  let digits = "";
  for (let k = 0; k <= head; k++) {
    digits = DIGITS[i % 62] + digits;
    i = Math.floor(i / 62);
  }
  return String.fromCharCode(97 + head) + digits;
}

/**
 * Excalidraw orders elements by their fractional `index`. Keep valid, strictly
 * increasing indices as they are; otherwise (old files, hand-written JSON)
 * assign fresh ones in array (z) order.
 */
export function withValidIndices<T extends { index?: unknown }>(elements: T[]): T[] {
  let ok = true;
  let prev = "";
  for (const el of elements) {
    const idx = el.index;
    if (!isValidIndex(idx) || idx <= prev) {
      ok = false;
      break;
    }
    prev = idx;
  }
  if (ok) return elements;
  return elements.map((el, i) => ({ ...el, index: integerKey(i) }));
}

// ---- boards ---------------------------------------------------------------------

function ensureMap(page: Y.Map<any>, key: string): Y.Map<any> {
  let map = page.get(key);
  if (!(map instanceof Y.Map)) {
    map = new Y.Map<any>();
    page.set(key, map);
  }
  return map as Y.Map<any>;
}

const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Write a scene into a board page: elements by id into page.get("elements"),
 * files by id into page.get("files"). Deleted elements are skipped. With
 * `replace`, elements and files not in the scene are removed.
 */
export function writeSceneToBoard(
  page: Y.Map<any>,
  scene: { elements: any[]; files?: Record<string, any> },
  opts: { replace?: boolean; origin?: unknown } = {},
) {
  const run = () => {
    const elements = ensureMap(page, "elements");
    const files = ensureMap(page, "files");
    const live = withValidIndices(scene.elements.filter((e) => e && typeof e.id === "string" && !e.isDeleted));
    const keepEls = new Set(live.map((e) => e.id as string));
    if (opts.replace) for (const id of [...elements.keys()]) if (!keepEls.has(id)) elements.delete(id);
    for (const el of live) elements.set(el.id, plain(el));
    const sceneFiles = scene.files ?? {};
    if (opts.replace) for (const id of [...files.keys()]) if (!(id in sceneFiles)) files.delete(id);
    for (const [id, f] of Object.entries(sceneFiles)) {
      if (f && typeof f.dataURL === "string") files.set(id, plain({ ...f, id }));
    }
    if (page.has("updatedAt")) page.set("updatedAt", Date.now());
  };
  if (page.doc) page.doc.transact(run, opts.origin ?? null);
  else run();
}

/** Current scene of a board page: live elements in z-order plus stored files. */
export function readSceneFromBoard(page: Y.Map<any>): { elements: any[]; files: Record<string, any> } {
  const elements: any[] = [];
  const map = page.get("elements");
  if (map instanceof Y.Map) {
    map.forEach((el: any) => {
      if (el && typeof el === "object" && !el.isDeleted) elements.push(el);
    });
  }
  elements.sort((a, b) => {
    const ai = typeof a.index === "string" ? a.index : "￿";
    const bi = typeof b.index === "string" ? b.index : "￿";
    return ai < bi ? -1 : ai > bi ? 1 : String(a.id).localeCompare(String(b.id));
  });
  const files: Record<string, any> = {};
  const fmap = page.get("files");
  if (fmap instanceof Y.Map) fmap.forEach((f: any, id: string) => (files[id] = f));
  return { elements, files };
}

/** Serialize a scene as a standard `.excalidraw` file (JSON). Only referenced files are kept. */
export function sceneToExcalidrawJson(scene: { elements: any[]; files: Record<string, any>; appState?: Record<string, any> }): string {
  const used = new Set(scene.elements.map((e) => e.fileId).filter(Boolean));
  const files: Record<string, any> = {};
  for (const [id, f] of Object.entries(scene.files)) if (used.has(id)) files[id] = f;
  return JSON.stringify(
    {
      type: "excalidraw",
      version: 2,
      source: "basalt",
      elements: scene.elements,
      appState: { gridSize: null, viewBackgroundColor: "#ffffff", ...(scene.appState ?? {}) },
      files,
    },
    null,
    2,
  );
}

/** Plain text found in a scene (text elements and element links), for search. */
export function sceneText(elements: any[]): string {
  const out: string[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    const t = typeof el.originalText === "string" && el.originalText ? el.originalText : el.text;
    if (typeof t === "string" && t.trim()) out.push(t.trim());
    if (typeof el.link === "string" && el.link) out.push(el.link);
  }
  return out.join("\n");
}

// Board page storage helpers, shared by the whiteboard view, importers and
// exporters. Pure and Node-safe: no DOM, no Excalidraw runtime.
//
// A board page keeps two containers (see shared/model.ts):
//   elements: Y.Map<elementId, Excalidraw element JSON>
//   files:    Y.Map<fileId, { id, mimeType, dataURL, created }>
// Deleted elements stay in `elements` as tombstones (isDeleted: true) so that
// concurrent editors converge; z-order is the fractional `index` field.

import * as Y from "yjs";

export interface BoardScene {
  elements: any[];
  files: Record<string, any>;
}

export interface StoredFile {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}

export function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep copy through JSON: strips `undefined` and guarantees plain data. */
export function cloneJSON<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function randomNonce(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** The board's containers, created if a (malformed) page lacks them. */
export function boardContainers(page: Y.Map<any>): { elements: Y.Map<any>; files: Y.Map<any> } {
  let elements = page.get("elements");
  let files = page.get("files");
  if (!(elements instanceof Y.Map) || !(files instanceof Y.Map)) {
    const create = () => {
      if (!(elements instanceof Y.Map)) page.set("elements", (elements = new Y.Map()));
      if (!(files instanceof Y.Map)) page.set("files", (files = new Y.Map()));
    };
    if (page.doc) page.doc.transact(create);
    else create();
  }
  return { elements, files };
}

export function toStoredFile(f: Record<string, any>): StoredFile {
  return {
    id: String(f.id),
    mimeType: typeof f.mimeType === "string" ? f.mimeType : "application/octet-stream",
    dataURL: String(f.dataURL),
    created: typeof f.created === "number" ? f.created : Date.now(),
  };
}

export function isStoredFile(f: unknown): f is StoredFile {
  return isRecord(f) && typeof f.id === "string" && typeof f.dataURL === "string";
}

// ---- fractional indices ----------------------------------------------------
// Same key format as the `fractional-indexing` package Excalidraw uses, so
// indices we generate validate in the editor.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SMALLEST_INTEGER = "A" + "0".repeat(26);

function integerLength(head: string): number | null {
  if (head >= "a" && head <= "z") return head.charCodeAt(0) - 97 + 2;
  if (head >= "A" && head <= "Z") return 90 - head.charCodeAt(0) + 2;
  return null;
}

export function isValidIndex(key: unknown): key is string {
  if (typeof key !== "string" || !key || key === SMALLEST_INTEGER) return false;
  const len = integerLength(key[0]);
  if (len === null || key.length < len) return false;
  for (let i = 1; i < key.length; i++) if (!DIGITS.includes(key[i])) return false;
  return !key.slice(len).endsWith("0");
}

function incrementInteger(int: string): string | null {
  const head = int[0];
  const digits = int.slice(1).split("");
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]) + 1;
    if (d === DIGITS.length) digits[i] = "0";
    else {
      digits[i] = DIGITS[d];
      carry = false;
    }
  }
  if (!carry) return head + digits.join("");
  if (head === "Z") return "a0";
  if (head === "z") return null;
  const next = String.fromCharCode(head.charCodeAt(0) + 1);
  if (next > "a") digits.push("0");
  else digits.pop();
  return next + digits.join("");
}

/** A key strictly greater than `after` (or the first key when null). */
export function indexAfter(after: string | null): string {
  if (after === null) return "a0";
  const len = integerLength(after[0]) ?? 2;
  const next = incrementInteger(after.slice(0, len));
  // The integer space ("z" + 25 digits) is practically unbounded; fall back to
  // extending the key, which still sorts after `after`.
  return next ?? `${after}V`;
}

/** Excalidraw's z-order: by fractional index, ties broken by id. */
export function compareByIndex(a: { index?: unknown; id?: unknown }, b: { index?: unknown; id?: unknown }): number {
  const ai = typeof a.index === "string" ? a.index : null;
  const bi = typeof b.index === "string" ? b.index : null;
  if (ai !== bi) {
    if (ai === null) return 1;
    if (bi === null) return -1;
    return ai < bi ? -1 : 1;
  }
  return String(a.id) < String(b.id) ? -1 : 1;
}

// ---- read / write ------------------------------------------------------------

// Base element fields (Excalidraw's defaults) so stored elements are always
// well-formed, whatever produced the scene.
const BASE_DEFAULTS: Record<string, unknown> = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  angle: 0,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  groupIds: [],
  frameId: null,
  roundness: null,
  boundElements: [],
  link: null,
  locked: false,
};

function randomElementId(): string {
  let s = "";
  for (let i = 0; i < 21; i++) s += DIGITS[Math.floor(Math.random() * DIGITS.length)];
  return s;
}

/**
 * Write an Excalidraw scene (elements + files) into a board page.
 *
 * Elements are upserted by id; when an element already exists its version is
 * bumped past the stored one so every open editor accepts the new state.
 * Indices are kept when they are valid and sort above everything already on
 * the board, otherwise the imported elements are re-indexed on top.
 * With `replace`, existing elements that are not part of the scene are
 * tombstoned. Files are written once (existing ids are left untouched).
 */
export function writeSceneToBoard(
  page: Y.Map<any>,
  scene: { elements: readonly any[]; files?: Record<string, any> | null },
  opts: { replace?: boolean; origin?: unknown } = {},
): void {
  const { elements: yElements, files: yFiles } = boardContainers(page);
  const now = Date.now();

  const incoming: Record<string, any>[] = [];
  const seen = new Set<string>();
  for (const raw of scene.elements ?? []) {
    if (!isRecord(raw) || typeof raw.type !== "string" || raw.type === "selection") continue;
    const el = cloneJSON(raw);
    if (typeof el.id !== "string" || !el.id || seen.has(el.id)) el.id = randomElementId();
    seen.add(el.id);
    el.version = Number.isFinite(el.version) && el.version > 0 ? Math.floor(el.version) : 1;
    el.versionNonce = Number.isInteger(el.versionNonce) ? el.versionNonce : randomNonce();
    el.isDeleted = el.isDeleted === true;
    if (typeof el.updated !== "number") el.updated = now;
    if (typeof el.seed !== "number") el.seed = randomNonce();
    for (const [k, v] of Object.entries(BASE_DEFAULTS)) {
      if (el[k] === undefined) el[k] = Array.isArray(v) ? [] : v;
    }
    incoming.push(el);
  }

  // Highest index among stored elements the scene doesn't overwrite
  // (tombstones included: indices must stay unique across all of them).
  let maxOther: string | null = null;
  for (const [id, v] of yElements.entries()) {
    if (seen.has(id) || !isRecord(v) || typeof v.index !== "string") continue;
    if (maxOther === null || v.index > maxOther) maxOther = v.index;
  }
  const keepIndices = incoming.every(
    (el, i) =>
      isValidIndex(el.index) &&
      (i === 0 ? maxOther === null || el.index > maxOther : el.index > incoming[i - 1].index),
  );
  if (!keepIndices) {
    let prev: string | null = maxOther;
    for (const el of incoming) prev = el.index = indexAfter(prev);
  }

  const write = () => {
    for (const el of incoming) {
      const existing = yElements.get(el.id);
      if (isRecord(existing) && typeof existing.version === "number" && existing.version >= el.version) {
        el.version = existing.version + 1;
        el.versionNonce = randomNonce();
        el.updated = now;
      }
      yElements.set(el.id, el);
    }
    if (opts.replace) {
      const stale: [string, Record<string, any>][] = [];
      for (const [id, v] of yElements.entries()) {
        if (!seen.has(id) && isRecord(v) && !v.isDeleted) stale.push([id, v]);
      }
      for (const [id, v] of stale) {
        yElements.set(id, {
          ...cloneJSON(v),
          isDeleted: true,
          version: (typeof v.version === "number" ? v.version : 0) + 1,
          versionNonce: randomNonce(),
          updated: now,
        });
      }
    }
    for (const f of Object.values(scene.files ?? {})) {
      if (isStoredFile(f) && !yFiles.has(f.id)) yFiles.set(f.id, toStoredFile(f));
    }
  };
  if (page.doc) page.doc.transact(write, opts.origin ?? null);
  else write();
}

/**
 * The board's visible scene: non-deleted elements in z-order and the files
 * those elements reference (plain copies, safe to serialise or mutate).
 */
export function readSceneFromBoard(page: Y.Map<any>): BoardScene {
  const yElements = page.get("elements");
  const yFiles = page.get("files");
  const elements: any[] = [];
  if (yElements instanceof Y.Map) {
    yElements.forEach((v) => {
      if (isRecord(v) && !v.isDeleted && typeof v.type === "string") elements.push(cloneJSON(v));
    });
  }
  elements.sort(compareByIndex);
  const files: Record<string, any> = {};
  if (yFiles instanceof Y.Map) {
    for (const el of elements) {
      const id = el.fileId;
      if (typeof id !== "string" || files[id]) continue;
      const f = yFiles.get(id);
      if (isStoredFile(f)) files[id] = toStoredFile(f);
    }
  }
  return { elements, files };
}

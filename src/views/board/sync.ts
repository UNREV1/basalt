// Two-way binding between an Excalidraw editor and a board page's Y maps.
//
// Local -> Y: onChange marks the scene dirty; a throttled flush writes only
// elements whose (version, versionNonce) differ from what Y holds, in one
// transaction tagged with this binding's origin (so our own observer skips it).
// Y -> local: observed keys are queued and merged once per frame with
// Excalidraw's reconcileElements (higher version wins, ties by lower nonce),
// never touching elements the local user is dragging/resizing/typing into.

import type * as Y from "yjs";
import {
  CaptureUpdateAction,
  isInvisiblySmallElement,
  reconcileElements,
  restoreElements,
} from "@excalidraw/excalidraw";
import type { AppState, BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import {
  boardContainers,
  cloneJSON,
  compareByIndex,
  isRecord,
  isStoredFile,
  randomNonce,
  toStoredFile,
} from "./scene.ts";

const FLUSH_MS = 50;
/** How often board edits may bump the page's updatedAt (sidebar "recent" order). */
const TOUCH_MS = 30_000;

interface Stamp {
  version: number;
  nonce: number;
  deleted: boolean;
}

const stampOf = (el: { version?: unknown; versionNonce?: unknown; isDeleted?: unknown }): Stamp => ({
  version: typeof el.version === "number" ? el.version : 0,
  nonce: typeof el.versionNonce === "number" ? el.versionNonce : 0,
  deleted: el.isDeleted === true,
});

/** Excalidraw's conflict rule: higher version wins, ties go to the lower nonce. */
const beats = (el: ExcalidrawElement, s: Stamp) =>
  el.version > s.version || (el.version === s.version && el.versionNonce < s.nonce);

/** Elements the local user is actively manipulating; remote updates to them wait. */
function busyElementIds(appState: AppState, elements: readonly ExcalidrawElement[]): Set<string> {
  const ids = new Set<string>();
  const add = (id: string | null | undefined) => id && ids.add(id);
  add(appState.newElement?.id);
  add(appState.resizingElement?.id);
  add(appState.editingTextElement?.id);
  add(appState.multiElement?.id);
  add(appState.editingLinearElement?.elementId);
  add(appState.croppingElementId);
  if (appState.selectedLinearElement?.isDragging) add(appState.selectedLinearElement.elementId);
  if (appState.selectedElementsAreBeingDragged || appState.isResizing || appState.isRotating) {
    for (const id of Object.keys(appState.selectedElementIds)) ids.add(id);
  }
  if (ids.size) {
    // Bound text and arrows move along with their container during a drag.
    for (const el of elements) {
      if (!ids.has(el.id)) continue;
      for (const b of el.boundElements ?? []) ids.add(b.id);
    }
  }
  return ids;
}

/**
 * Fill in anything an element written by another tool (importer, older
 * client) may lack, so the editor never sees a malformed element. The sync
 * stamp is kept: restore would otherwise delete empty texts or re-version.
 */
function normalizeRemote(raw: Record<string, any>): ExcalidrawElement | null {
  const [restored] = restoreElements([raw as ExcalidrawElement], null);
  if (!restored) {
    // Dropped as invisibly small; only keep it if it is already well-formed.
    return Array.isArray(raw.groupIds) ? (raw as ExcalidrawElement) : null;
  }
  return {
    ...restored,
    version: raw.version,
    versionNonce: raw.versionNonce,
    isDeleted: raw.isDeleted === true,
    index: typeof raw.index === "string" ? raw.index : restored.index,
  } as ExcalidrawElement;
}

/** A shape still being created that has nothing to show peers yet. */
const isUnborn = (el: ExcalidrawElement) => isInvisiblySmallElement(el) || (el.type === "text" && !el.text);

function nextFrame(fn: () => void): () => void {
  if (typeof document !== "undefined" && document.hidden) {
    const t = setTimeout(fn, 16);
    return () => clearTimeout(t);
  }
  const h = requestAnimationFrame(fn);
  return () => cancelAnimationFrame(h);
}

export interface InitialScene {
  elements: ExcalidrawElement[];
  files: BinaryFiles;
}

export class BoardBinding {
  readonly doc: Y.Doc;
  readonly page: Y.Map<any>;
  readonly elements: Y.Map<any>;
  readonly files: Y.Map<any>;
  /** Unique per binding, so two views of the same page still see each other. */
  private readonly origin = { source: "basalt-board" };
  private api: ExcalidrawImperativeAPI | null = null;
  private ready = false;
  private started = false;
  /** What Y currently holds for each element (kept in step by the observer). */
  private synced = new Map<string, Stamp>();
  /** Element ids changed in Y and not yet merged into the scene. */
  private pending = new Set<string>();
  private knownFiles = new Set<string>();
  /** Element ids in the scene at the previous flush (to detect removals). */
  private lastSceneIds: Set<string> | null = null;
  private latest: { elements: readonly OrderedExcalidrawElement[]; files: BinaryFiles } | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private cancelApply: (() => void) | null = null;
  private lastTouched = 0;

  constructor(doc: Y.Doc, page: Y.Map<any>) {
    this.doc = doc;
    this.page = page;
    const { elements, files } = boardContainers(page);
    this.elements = elements;
    this.files = files;
  }

  setApi(api: ExcalidrawImperativeAPI) {
    this.api = api;
  }

  /**
   * Scene for Excalidraw's `initialData`. Excalidraw calls it while mounting
   * and installs the result in the same task, so Y and the scene start equal.
   */
  initialScene(): InitialScene {
    this.synced.clear();
    this.pending.clear();
    this.knownFiles.clear();
    this.lastSceneIds = null;
    this.latest = null;
    const elements: ExcalidrawElement[] = [];
    this.elements.forEach((v, id) => {
      if (!isRecord(v) || typeof v.type !== "string") return;
      this.synced.set(id, stampOf(v));
      elements.push(cloneJSON(v) as ExcalidrawElement);
    });
    elements.sort(compareByIndex);
    const files: BinaryFiles = {};
    this.files.forEach((f, id) => {
      if (!isStoredFile(f)) return;
      this.knownFiles.add(id);
      files[id] = { ...f } as BinaryFileData;
    });
    this.ready = true;
    return { elements, files };
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.elements.observe(this.onElements);
    this.files.observe(this.onFiles);
    window.addEventListener("pagehide", this.flushNow);
    if (this.pending.size) this.scheduleApply();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.flushNow();
    this.cancelApply?.();
    this.cancelApply = null;
    this.elements.unobserve(this.onElements);
    this.files.unobserve(this.onFiles);
    window.removeEventListener("pagehide", this.flushNow);
  }

  /** Excalidraw onChange: remember the scene and schedule a write. */
  onChange(elements: readonly OrderedExcalidrawElement[], files: BinaryFiles) {
    this.latest = { elements, files };
    if (!this.ready) return;
    if (!this.flushTimer) this.flushTimer = setTimeout(this.flushNow, FLUSH_MS);
    // Remote updates held back during a drag land as soon as it ends.
    if (this.pending.size) this.scheduleApply();
  }

  // ---- local -> Y ------------------------------------------------------------

  flushNow = () => {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const latest = this.latest;
    if (!this.ready || !latest) return;
    const { elements, files } = latest;

    const writes: ExcalidrawElement[] = [];
    const ids = new Set<string>();
    let behind = false;
    for (const el of elements) {
      ids.add(el.id);
      const s = this.synced.get(el.id);
      if (s) {
        if (s.version === el.version && s.nonce === el.versionNonce) continue;
        if (!beats(el, s)) {
          // Y has a newer version we haven't merged yet (held back while busy).
          if (!this.pending.has(el.id)) {
            this.pending.add(el.id);
            behind = true;
          }
          continue;
        }
      } else if (el.isDeleted || isUnborn(el)) {
        // Never shared and nothing to show yet (e.g. a shape at pointer-down).
        continue;
      }
      writes.push(el);
    }

    // Elements that left the scene without a tombstone (a loaded file replaced
    // the scene, or Excalidraw discarded a shape) are deleted for everyone.
    // An empty scene means the editor is (re)initialising, not a user action.
    const removed: string[] = [];
    if (this.lastSceneIds && elements.length) {
      for (const id of this.lastSceneIds) {
        if (!ids.has(id) && this.synced.get(id)?.deleted === false) removed.push(id);
      }
    }
    if (elements.length) this.lastSceneIds = ids;

    const newFiles: BinaryFileData[] = [];
    for (const id of Object.keys(files)) {
      if (!this.knownFiles.has(id) && files[id]?.dataURL) newFiles.push(files[id]);
    }

    if (writes.length || removed.length || newFiles.length) {
      this.doc.transact(() => {
        for (const f of newFiles) {
          this.knownFiles.add(f.id);
          if (!this.files.has(f.id)) this.files.set(f.id, toStoredFile(f));
        }
        for (const el of writes) {
          this.elements.set(el.id, cloneJSON(el));
          this.synced.set(el.id, stampOf(el));
        }
        const now = Date.now();
        if ((writes.length || removed.length) && now - this.lastTouched > TOUCH_MS) {
          this.lastTouched = now;
          this.page.set("updatedAt", now);
        }
        for (const id of removed) {
          const cur = this.elements.get(id);
          if (!isRecord(cur)) continue;
          const tomb = { ...cloneJSON(cur), isDeleted: true, version: (cur.version ?? 0) + 1, versionNonce: randomNonce(), updated: now };
          this.elements.set(id, tomb);
          this.synced.set(id, stampOf(tomb));
        }
      }, this.origin);
    }
    if (behind) this.scheduleApply();
  };

  // ---- Y -> local ------------------------------------------------------------

  private onElements = (event: Y.YMapEvent<any>, tr: Y.Transaction) => {
    if (tr.origin === this.origin) return;
    for (const id of event.keysChanged) {
      const v = this.elements.get(id);
      if (isRecord(v)) this.synced.set(id, stampOf(v));
      else this.synced.delete(id);
      this.pending.add(id);
    }
    this.scheduleApply();
  };

  private onFiles = (event: Y.YMapEvent<any>, tr: Y.Transaction) => {
    if (tr.origin === this.origin) return;
    const added: BinaryFileData[] = [];
    for (const id of event.keysChanged) {
      const f = this.files.get(id);
      if (this.knownFiles.has(id) || !isStoredFile(f)) continue;
      added.push({ ...f } as BinaryFileData);
    }
    // Before the first scene is built, initialScene() picks these up itself.
    if (!added.length || !this.ready || !this.api) return;
    for (const f of added) this.knownFiles.add(f.id);
    this.api.addFiles(added);
  };

  private scheduleApply() {
    if (this.cancelApply || !this.started) return;
    this.cancelApply = nextFrame(() => {
      this.cancelApply = null;
      this.applyRemote();
    });
  }

  private applyRemote() {
    const api = this.api;
    if (!api || !this.ready || !this.pending.size) return;
    const appState = api.getAppState();
    let local: readonly OrderedExcalidrawElement[] = api.getSceneElementsIncludingDeleted();
    const localById = new Map(local.map((el) => [el.id, el]));
    const busy = busyElementIds(appState, local);

    const remote: ExcalidrawElement[] = [];
    const removed = new Set<string>();
    for (const id of [...this.pending]) {
      if (busy.has(id)) continue;
      this.pending.delete(id);
      const v = this.elements.get(id);
      if (!isRecord(v)) {
        if (localById.has(id)) removed.add(id);
        continue;
      }
      const mine = localById.get(id);
      if (mine && mine.version === v.version && mine.versionNonce === v.versionNonce) continue;
      const el = normalizeRemote(cloneJSON(v));
      if (el) remote.push(el);
    }
    if (!remote.length && !removed.size) return;

    if (removed.size) {
      local = local.filter((el) => !removed.has(el.id));
      for (const id of removed) this.lastSceneIds?.delete(id);
    }
    let merged: readonly ExcalidrawElement[];
    try {
      merged = reconcileElements(local, remote as RemoteExcalidrawElement[], appState);
    } catch (err) {
      // Dev builds throw on index anomalies they would otherwise repair; merge
      // by the same rule ourselves and let updateScene fix the indices.
      console.warn("[board] reconcile failed, falling back", err);
      const byId = new Map<string, ExcalidrawElement>(local.map((el) => [el.id, el]));
      for (const r of remote) {
        const l = byId.get(r.id);
        if (!l || !beats(l, stampOf(r))) byId.set(r.id, r);
      }
      merged = [...byId.values()].sort(compareByIndex);
    }
    api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
  }
}

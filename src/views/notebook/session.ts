// Execution for one notebook: kernels, the run queue, and writing outputs
// into the shared Y.Doc. Lives outside React so runs survive navigating away
// and back (like a Jupyter kernel keeps running while its tab is closed).

import type * as Y from "yjs";
import { getPage } from "../../../shared/model.ts";
import { getSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Kernel } from "./kernel/kernel.ts";
import {
  OUTPUT_ORIGIN,
  cellLang,
  cellOutputs,
  cellSource,
  cellType,
  cellsOf,
  findCell,
  nextExecCount,
  type CellLang,
  type Output,
} from "./model.ts";

export type RunState = "queued" | "running";

/** Keep shared outputs bounded: they sync to every peer and persist in the doc. */
const MAX_TEXT = 100_000;
const MAX_IMAGES_BYTES = 6_000_000;
const FLUSH_MS = 60;

export interface RunningPresence {
  pageId: string;
  cellId: string;
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n… output truncated (${text.length - limit} more characters)` : text;
}

export class NotebookSession {
  readonly ws: Workspace;
  readonly pageId: string;
  readonly kernels: Record<CellLang, Kernel>;
  readonly runStates = new Map<string, RunState>();
  /** Transient per-cell status text, e.g. "Loading numpy…". */
  readonly statusText = new Map<string, string>();
  private queue: string[] = [];
  private processing = false;
  private listeners = new Set<() => void>();
  private buffers = new Map<string, Output[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  version = 0;

  constructor(ws: Workspace, pageId: string) {
    this.ws = ws;
    this.pageId = pageId;
    this.kernels = { javascript: new Kernel("javascript"), python: new Kernel("python") };
    for (const k of Object.values(this.kernels)) k.subscribe(() => this.emit());
    // Closing the workspace ends its notebooks' kernels.
    ws.doc.on("destroy", () => {
      this.dispose();
      for (const [key, s] of sessions) if (s === this) sessions.delete(key);
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  private get cells(): Y.Array<Y.Map<any>> | undefined {
    const page = getPage(this.ws.doc, this.pageId);
    return page ? cellsOf(page) : undefined;
  }

  /** Queue cells (by id) for execution, in order. Markdown cells are skipped. */
  run(cellIds: string[]) {
    for (const id of cellIds) {
      const cell = findCell(this.cells, id);
      if (!cell || cellType(cell) !== "code" || this.runStates.has(id)) continue;
      this.queue.push(id);
      this.runStates.set(id, "queued");
    }
    this.emit();
    void this.process();
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        const ok = await this.runOne(id);
        this.runStates.delete(id);
        this.statusText.delete(id);
        this.emit();
        if (!ok) this.cancelQueue();
      }
    } finally {
      this.processing = false;
      this.setRunningPresence(null);
    }
  }

  private cancelQueue() {
    for (const id of this.queue) this.runStates.delete(id);
    this.queue = [];
    this.emit();
  }

  private async runOne(id: string): Promise<boolean> {
    const cells = this.cells;
    const cell = findCell(cells, id);
    if (!cells || !cell) return true;
    const kernel = this.kernels[cellLang(cell)];
    // The session runs one cell at a time, so this count is still current when it starts.
    const count = nextExecCount(cells);
    const result = await kernel.run(cellSource(cell), `cell-${count}`, {
      onStart: () => {
        const c = findCell(this.cells, id);
        if (!c) return;
        this.ws.doc.transact(() => {
          c.set("outputs", []);
          c.set("execCount", count);
          c.set("runBy", getSettings().identity.name);
        }, OUTPUT_ORIGIN);
        this.buffers.delete(id);
        this.runStates.set(id, "running");
        this.setRunningPresence({ pageId: this.pageId, cellId: id });
        this.emit();
      },
      onOutput: (o) => this.pushOutput(id, o),
      onStatus: (text) => {
        if (text) this.statusText.set(id, text);
        else this.statusText.delete(id);
        this.emit();
      },
    });
    this.flush();
    return result.ok;
  }

  private setRunningPresence(running: RunningPresence | null) {
    this.ws.setPresence({ running });
  }

  private pushOutput(cellId: string, o: Output) {
    const buf = this.buffers.get(cellId) ?? [];
    buf.push(o);
    this.buffers.set(cellId, buf);
    this.flushTimer ??= setTimeout(() => this.flush(), FLUSH_MS);
  }

  /** Append buffered outputs, merging consecutive stream chunks like Jupyter. */
  flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.buffers.size) return;
    const cells = this.cells;
    const buffers = this.buffers;
    this.buffers = new Map();
    if (!cells) return;
    this.ws.doc.transact(() => {
      for (const [id, outs] of buffers) {
        const cell = findCell(cells, id);
        if (!cell) continue;
        const next = [...cellOutputs(cell)];
        for (const o of outs) {
          const last = next[next.length - 1];
          if (o.type === "stream" && last?.type === "stream" && last.name === o.name) {
            next[next.length - 1] = { ...last, text: last.text + o.text };
          } else next.push(o);
        }
        cell.set("outputs", limitOutputs(next));
      }
    }, OUTPUT_ORIGIN);
  }

  /** Stop running cells and clear the queue; idle kernels keep their state. */
  interrupt(lang?: CellLang) {
    this.cancelQueue();
    for (const k of Object.values(this.kernels)) {
      if ((!lang || k.lang === lang) && (k.state === "busy" || k.state === "starting")) k.interrupt();
    }
  }

  /** Stop one cell: dequeue it if it hasn't started, else interrupt its kernel. */
  stop(cellId: string) {
    const i = this.queue.indexOf(cellId);
    if (i >= 0) {
      this.queue.splice(i, 1);
      this.runStates.delete(cellId);
      this.emit();
      return;
    }
    const cell = findCell(this.cells, cellId);
    if (cell && this.runStates.get(cellId) === "running") this.interrupt(cellLang(cell));
  }

  restart(lang: CellLang) {
    this.cancelQueue();
    this.kernels[lang].restart();
    this.emit();
  }

  get busy(): boolean {
    return this.processing || this.queue.length > 0;
  }

  dispose() {
    this.flush();
    this.cancelQueue();
    for (const k of Object.values(this.kernels)) k.dispose();
    this.listeners.clear();
  }
}

function limitOutputs(outputs: Output[]): Output[] {
  let text = 0;
  let images = 0;
  const out: Output[] = [];
  for (const o of outputs) {
    if (o.type === "stream" || o.type === "result") {
      const t = truncate(o.text, Math.max(0, MAX_TEXT - text));
      text += t.length;
      out.push({ ...o, text: t });
    } else if (o.type === "display" && o.png) {
      images += o.png.length;
      out.push(images > MAX_IMAGES_BYTES ? { type: "display", text: "[image omitted: notebook output limit reached]" } : o);
    } else out.push(o);
  }
  return out;
}

// ---- registry --------------------------------------------------------------------

const sessions = new Map<string, NotebookSession>();
/** Python runtimes are large (100MB+), so only a few notebooks keep one alive. */
const MAX_LIVE_PYTHON = 2;

export function getSession(ws: Workspace, pageId: string): NotebookSession {
  const key = `${ws.id}:${pageId}`;
  let s = sessions.get(key);
  if (!s || s.ws !== ws) {
    s?.dispose();
    s = new NotebookSession(ws, pageId);
    sessions.set(key, s);
  }
  const live = [...sessions.values()].filter((x) => x !== s && x.kernels.python.state !== "off" && !x.busy);
  if (live.length >= MAX_LIVE_PYTHON) {
    live.sort((a, b) => a.kernels.python.lastUsed - b.kernels.python.lastUsed);
    live[0].kernels.python.restart();
  }
  return s;
}

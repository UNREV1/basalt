// Main-thread handle for a kernel worker. Interrupting terminates the worker
// (the only reliable way to stop synchronous code) and a fresh one starts on
// the next run, so interrupt == restart.

import type { CellLang, Output } from "../model.ts";
import type { KernelEvent, KernelRequest } from "./protocol.ts";

export type KernelState = "off" | "starting" | "idle" | "busy" | "error";

export interface RunHandlers {
  onStart?: () => void;
  onOutput: (o: Output) => void;
  onStatus?: (text: string | null) => void;
}

export interface RunResult {
  ok: boolean;
  interrupted?: boolean;
}

interface Job {
  id: number;
  code: string;
  label: string;
  handlers: RunHandlers;
  resolve: (r: RunResult) => void;
  started: boolean;
}

function spawn(lang: CellLang): Worker {
  // Separate literal `new Worker(new URL(...))` calls so Vite bundles each worker.
  return lang === "python"
    ? new Worker(new URL("./py.worker.ts", import.meta.url), { type: "module", name: "basalt-python" })
    : new Worker(new URL("./js.worker.ts", import.meta.url), { type: "module", name: "basalt-javascript" });
}

let nextId = 1;

export class Kernel {
  readonly lang: CellLang;
  state: KernelState = "off";
  /** Error that stopped the kernel from starting, if any. */
  error: string | null = null;
  info: string | null = null;
  lastUsed = Date.now();
  private worker: Worker | null = null;
  private jobs: Job[] = [];
  /** Handlers of finished jobs, for output a cell emits after it "finished" (timers, promises). */
  private late = new Map<number, RunHandlers>();
  private listeners = new Set<() => void>();

  constructor(lang: CellLang) {
    this.lang = lang;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private setState(state: KernelState) {
    this.state = state;
    this.emit();
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = spawn(this.lang);
    this.worker = w;
    this.error = null;
    this.setState("starting");
    w.onmessage = (e: MessageEvent<KernelEvent>) => this.onMessage(w, e.data);
    w.onerror = (e) => {
      if (this.worker !== w) return;
      e.preventDefault();
      this.fail(e.message || "The kernel crashed.");
    };
    return w;
  }

  private fail(message: string) {
    this.error = message;
    this.terminateWorker();
    for (const job of this.jobs.splice(0)) {
      job.handlers.onStart?.();
      job.handlers.onOutput({ type: "error", ename: "KernelError", message });
      job.resolve({ ok: false });
    }
    this.setState("error");
  }

  private onMessage(w: Worker, msg: KernelEvent) {
    if (this.worker !== w) return;
    switch (msg.type) {
      case "ready":
        this.info = msg.info ?? null;
        if (this.state === "starting") this.setState(this.jobs.length ? "busy" : "idle");
        this.startNext();
        break;
      case "fatal":
        this.fail(msg.message);
        break;
      case "status":
        this.handlersFor(msg.id)?.onStatus?.(msg.text);
        break;
      case "output":
        this.handlersFor(msg.id)?.onOutput(msg.output);
        break;
      case "done": {
        const idx = this.jobs.findIndex((j) => j.id === msg.id);
        if (idx >= 0) {
          const [job] = this.jobs.splice(idx, 1);
          this.late.set(job.id, job.handlers);
          if (this.late.size > 20) this.late.delete(this.late.keys().next().value!);
          job.resolve({ ok: msg.ok });
        }
        this.lastUsed = Date.now();
        this.startNext();
        this.setState(this.jobs.length ? "busy" : "idle");
        break;
      }
    }
  }

  private handlersFor(id: number | null): RunHandlers | undefined {
    if (id === null) return this.jobs[0]?.handlers;
    return this.jobs.find((j) => j.id === id)?.handlers ?? this.late.get(id);
  }

  /** Mark the head job started (the worker runs requests in order). */
  private startNext() {
    const job = this.jobs[0];
    if (!job || job.started || this.state === "starting") return;
    job.started = true;
    job.handlers.onStart?.();
    if (this.state !== "busy") this.setState("busy");
  }

  /** Boot the worker ahead of the first run (e.g. to retry a failed download). */
  start() {
    this.ensureWorker();
  }

  run(code: string, label: string, handlers: RunHandlers): Promise<RunResult> {
    this.lastUsed = Date.now();
    const w = this.ensureWorker();
    return new Promise<RunResult>((resolve) => {
      const job: Job = { id: nextId++, code, label, handlers, resolve, started: false };
      this.jobs.push(job);
      w.postMessage({ type: "run", id: job.id, code, label } satisfies KernelRequest);
      this.startNext();
    });
  }

  private terminateWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.late.clear();
  }

  /** Stop whatever is running; queued jobs are cancelled. */
  interrupt() {
    if (!this.worker) return;
    const jobs = this.jobs.splice(0);
    this.terminateWorker();
    jobs.forEach((job, i) => {
      if (i === 0 && job.started) {
        job.handlers.onOutput({
          type: "error",
          ename: this.lang === "python" ? "KeyboardInterrupt" : "Interrupted",
          message: "Execution was stopped and the kernel restarted; variables were cleared.",
        });
      }
      job.resolve({ ok: false, interrupted: true });
    });
    this.setState("off");
  }

  restart() {
    this.interrupt();
    this.error = null;
    this.terminateWorker();
    this.setState("off");
  }

  dispose() {
    this.interrupt();
    this.terminateWorker();
    this.listeners.clear();
  }
}

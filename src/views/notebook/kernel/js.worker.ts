// JavaScript kernel: evaluates notebook cells in one persistent global scope.
// Runs in a dedicated worker so a runaway loop can be stopped by terminating it.

import { fallbackCode, syntaxErrorPosition, transformCell, type Transformed } from "./js-transform.ts";
import { formatLogArgs, inspect } from "./inspect.ts";
import { plotSvg } from "./plot.ts";
import type { Output } from "../model.ts";
import type { KernelEvent, KernelRequest } from "./protocol.ts";

interface HtmlValue {
  __basaltHtml: string;
}

const scope = self as unknown as {
  postMessage(msg: KernelEvent): void;
  addEventListener(type: string, fn: (e: any) => void): void;
  onmessage: ((e: MessageEvent<KernelRequest>) => void) | null;
} & Record<string, unknown>;

/** The run that owns output; async output after a cell finishes still goes to it. */
let current = 0;
/** Output produced asynchronously (e.g. canvas encoding) that a run must wait for. */
const pending = new Set<Promise<unknown>>();

function emit(output: Output) {
  scope.postMessage({ type: "output", id: current, output });
}

function isHtml(v: unknown): v is HtmlValue {
  return typeof v === "object" && v !== null && typeof (v as HtmlValue).__basaltHtml === "string";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// ---- console -------------------------------------------------------------------

function tableHtml(data: unknown, columns?: string[]): string | null {
  if (typeof data !== "object" || data === null) return null;
  const rows: [string, unknown][] =
    data instanceof Map ? [...data.entries()].map(([k, v]) => [inspect(k), v]) : Object.entries(data as object);
  const cols: string[] = [];
  let hasValues = false;
  for (const [, row] of rows) {
    if (typeof row === "object" && row !== null) {
      for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
    } else hasValues = true;
  }
  const shown = columns ?? cols;
  const cell = (v: unknown) => `<td>${escapeHtml(typeof v === "string" ? v : v === undefined ? "" : inspect(v, { depth: 0 }))}</td>`;
  const head = `<tr><th>(index)</th>${shown.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}${hasValues ? "<th>Values</th>" : ""}</tr>`;
  const body = rows
    .slice(0, 1000)
    .map(([k, row]) => {
      const isObj = typeof row === "object" && row !== null;
      return `<tr><th>${escapeHtml(k)}</th>${shown.map((c) => (isObj ? cell((row as any)[c]) : "<td></td>")).join("")}${
        hasValues ? (isObj ? "<td></td>" : cell(row)) : ""
      }</tr>`;
    })
    .join("");
  return `<table class="nb-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

const counts = new Map<string, number>();
const timers = new Map<string, number>();
const out = (text: string) => emit({ type: "stream", name: "stdout", text: `${text}\n` });
const err = (text: string) => emit({ type: "stream", name: "stderr", text: `${text}\n` });

const notebookConsole = {
  log: (...a: unknown[]) => out(formatLogArgs(a)),
  info: (...a: unknown[]) => out(formatLogArgs(a)),
  debug: (...a: unknown[]) => out(formatLogArgs(a)),
  warn: (...a: unknown[]) => err(formatLogArgs(a)),
  error: (...a: unknown[]) => err(formatLogArgs(a)),
  trace: (...a: unknown[]) => err(`Trace: ${formatLogArgs(a)}`),
  dir: (v: unknown) => out(inspect(v, { depth: 4 })),
  assert: (cond: unknown, ...a: unknown[]) => {
    if (!cond) err(`Assertion failed${a.length ? `: ${formatLogArgs(a)}` : ""}`);
  },
  count: (label = "default") => {
    const n = (counts.get(label) ?? 0) + 1;
    counts.set(label, n);
    out(`${label}: ${n}`);
  },
  countReset: (label = "default") => counts.delete(label),
  time: (label = "default") => timers.set(label, performance.now()),
  timeLog: (label = "default", ...a: unknown[]) => {
    const t = timers.get(label);
    if (t !== undefined) out(`${label}: ${(performance.now() - t).toFixed(3)} ms${a.length ? ` ${formatLogArgs(a)}` : ""}`);
  },
  timeEnd: (label = "default") => {
    const t = timers.get(label);
    if (t === undefined) return;
    timers.delete(label);
    out(`${label}: ${(performance.now() - t).toFixed(3)} ms`);
  },
  table: (data: unknown, columns?: string[]) => {
    const html = tableHtml(data, columns);
    if (html) emit({ type: "display", html, text: inspect(data) });
    else out(formatLogArgs([data]));
  },
  group: (...a: unknown[]) => a.length && out(formatLogArgs(a)),
  groupCollapsed: (...a: unknown[]) => a.length && out(formatLogArgs(a)),
  groupEnd: () => {},
  clear: () => {},
};
Object.assign(console, notebookConsole);

// ---- notebook helpers ------------------------------------------------------------

function html(strings: string | TemplateStringsArray, ...values: unknown[]): HtmlValue {
  if (typeof strings === "string") return { __basaltHtml: strings };
  let s = strings[0];
  values.forEach((v, i) => (s += String(v) + strings[i + 1]));
  return { __basaltHtml: s };
}

async function canvasToPng(canvas: OffscreenCanvas | ImageBitmap): Promise<string> {
  let c: OffscreenCanvas;
  if (canvas instanceof OffscreenCanvas) c = canvas;
  else {
    c = new OffscreenCanvas(canvas.width, canvas.height);
    c.getContext("2d")!.drawImage(canvas, 0, 0);
  }
  const blob = await c.convertToBlob({ type: "image/png" });
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

function displayValue(v: unknown) {
  if (isHtml(v)) emit({ type: "display", html: v.__basaltHtml });
  else if (
    (typeof OffscreenCanvas !== "undefined" && v instanceof OffscreenCanvas) ||
    (typeof ImageBitmap !== "undefined" && v instanceof ImageBitmap)
  ) {
    const owner = current;
    const p = canvasToPng(v)
      .then((png) => scope.postMessage({ type: "output", id: owner, output: { type: "display", png } }))
      .catch((e) => err(String(e)))
      .finally(() => pending.delete(p));
    pending.add(p);
  } else emit({ type: "display", text: typeof v === "string" ? v : inspect(v, { depth: 4 }) });
}

function resolveSpecifier(spec: string): string {
  if (/^(https?:|data:|blob:)/.test(spec)) return spec;
  return `https://esm.sh/${spec.replace(/^npm:/, "")}`;
}

Object.assign(scope, {
  display: (...values: unknown[]) => values.forEach(displayValue),
  html,
  plot: (a: unknown, b?: unknown, c?: unknown) => html(plotSvg(a, b, c)),
  __basalt_import: (spec: string) => import(/* @vite-ignore */ resolveSpecifier(spec)),
});

// ---- evaluation --------------------------------------------------------------------

const indirectEval = eval;

function compiles(t: Transformed): boolean {
  try {
    new Function(t.isAsync ? `return ${t.code}` : t.code);
    return true;
  } catch {
    return false;
  }
}

function errorOutput(e: unknown, label: string, src: string): Output {
  if (e instanceof Error) {
    const frames = (e.stack ?? "")
      .split("\n")
      .filter((l) => l.includes(label))
      .map((l) => l.replace(/\(eval at [^)]*\)[^,]*, /, "").replace(/^\s*/, "    "));
    let stack = frames.join("\n");
    if (e instanceof SyntaxError && !frames.length) {
      const pos = syntaxErrorPosition(src);
      if (pos) stack = `    at ${label}:${pos.line}:${pos.column}`;
    }
    return { type: "error", ename: e.name || "Error", message: e.message, ...(stack ? { stack } : {}) };
  }
  return { type: "error", ename: "Uncaught", message: inspect(e) };
}

function resultOutput(value: unknown): Output {
  if (isHtml(value)) return { type: "result", text: "[HTML]", html: value.__basaltHtml };
  return { type: "result", text: inspect(value) };
}

async function run(req: KernelRequest) {
  current = req.id;
  let ok = true;
  try {
    let t = transformCell(req.code);
    if (!compiles(t)) t = fallbackCode(req.code);
    if (t.declare.length) indirectEval(`var ${t.declare.join(", ")};`);
    let value = indirectEval(`${t.code}\n//# sourceURL=${req.label}`);
    if (t.isAsync || (value && typeof (value as PromiseLike<unknown>).then === "function")) value = await value;
    if (pending.size) await Promise.allSettled([...pending]);
    if (value !== undefined) emit(resultOutput(value));
  } catch (e) {
    ok = false;
    emit(errorOutput(e, req.label, req.code));
  }
  scope.postMessage({ type: "done", id: req.id, ok });
}

// Cells run one at a time, in order.
let chain: Promise<void> = Promise.resolve();
scope.onmessage = (e) => {
  if (e.data?.type === "run") chain = chain.then(() => run(e.data));
};

scope.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
  e.preventDefault();
  emit({ ...(errorOutput(e.reason, "cell-", "") as Extract<Output, { type: "error" }>), ename: `Unhandled rejection: ${e.reason?.name ?? "Error"}` });
});
scope.addEventListener("error", (e: ErrorEvent) => {
  e.preventDefault();
  emit(errorOutput(e.error ?? new Error(e.message), "cell-", ""));
});

scope.postMessage({ type: "ready" });

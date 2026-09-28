// Python kernel: Pyodide (CPython on WebAssembly), loaded lazily from the jsDelivr CDN.

import type { Output } from "../model.ts";
import type { KernelEvent, KernelRequest } from "./protocol.ts";

/** Newest stable Pyodide first; the older one is a fallback if its CDN layout changes. */
const PYODIDE_URLS = [
  "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/",
  "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/",
];

interface PyProxy {
  toJs(opts?: { create_proxies?: boolean }): unknown;
  destroy(): void;
}

interface Pyodide {
  version: string;
  runPythonAsync(code: string, opts?: { globals?: unknown; filename?: string }): Promise<any>;
  runPython(code: string, opts?: { globals?: unknown }): any;
  loadPackagesFromImports(code: string, opts?: { messageCallback?: (m: string) => void; errorCallback?: (m: string) => void }): Promise<unknown>;
  setStdout(opts: { batched?: (s: string) => void; write?: (b: Uint8Array) => number }): void;
  setStderr(opts: { batched?: (s: string) => void; write?: (b: Uint8Array) => number }): void;
  setStdin(opts: { error?: boolean }): void;
  registerJsModule(name: string, module: object): void;
  globals: { get(name: string): any };
}

const scope = self as unknown as {
  postMessage(msg: KernelEvent): void;
  onmessage: ((e: MessageEvent<KernelRequest>) => void) | null;
};

let current = 0;
const emit = (output: Output) => scope.postMessage({ type: "output", id: current, output });
const status = (text: string | null) => scope.postMessage({ type: "status", id: current, text });

// Runs user code, then returns [repr, html] of the last expression (or None), with
// matplotlib figures emitted as PNG displays and tracebacks trimmed to user frames.
const PRELUDE = `
import sys, io, os, base64, builtins, traceback
# Workers have no DOM, so force the raster backend before matplotlib is imported.
os.environ["MPLBACKEND"] = "AGG"
from pyodide.code import eval_code_async, find_imports
import _basalt

def _basalt_rich(obj):
    html = None
    for attr in ("_repr_html_", "_repr_svg_"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                html = fn()
            except Exception:
                html = None
            if html:
                break
    png = None
    fn = getattr(obj, "_repr_png_", None)
    if callable(fn):
        try:
            data = fn()
            if data:
                png = base64.b64encode(data).decode() if isinstance(data, bytes) else data
        except Exception:
            png = None
    return html, png

def display(*objs):
    for obj in objs:
        if "matplotlib" in sys.modules:
            from matplotlib.figure import Figure
            if isinstance(obj, Figure):
                _basalt_show_figure(obj)
                continue
        html, png = _basalt_rich(obj)
        _basalt.display(repr(obj) if not isinstance(obj, str) else obj, html, png)

builtins.display = display

def _basalt_show_figure(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=110)
    _basalt.display(None, None, base64.b64encode(buf.getvalue()).decode())

def _basalt_flush_figures():
    if "matplotlib.pyplot" not in sys.modules:
        return
    import matplotlib.pyplot as plt
    for num in plt.get_fignums():
        _basalt_show_figure(plt.figure(num))
    plt.close("all")

def _basalt_setup_matplotlib():
    import matplotlib
    matplotlib.use("AGG")
    import matplotlib.pyplot as plt
    if getattr(plt.show, "_basalt", False):
        return
    def show(*args, **kwargs):
        _basalt_flush_figures()
    show._basalt = True
    plt.show = show

_basalt_ns = {"__name__": "__main__", "__builtins__": builtins}

async def _basalt_run(code, filename):
    if any(m == "matplotlib" or m.startswith("matplotlib.") for m in find_imports(code)):
        _basalt_setup_matplotlib()
    try:
        result = await eval_code_async(code, _basalt_ns, filename=filename)
    except BaseException as e:
        sys.stdout.flush()
        sys.stderr.flush()
        _basalt_flush_figures()
        tb = e.__traceback__
        # Drop frames that belong to Pyodide/our runner, keep the user's.
        while tb is not None and tb.tb_frame.f_code.co_filename != filename:
            tb = tb.tb_next
        lines = traceback.format_exception(type(e), e, tb)
        stack = "".join(lines[:-1]).rstrip()
        if stack.startswith("Traceback (most recent call last):") and stack.count("\\n") == 0:
            stack = ""
        message = "".join(traceback.format_exception_only(type(e), e)).strip()
        prefix = type(e).__name__ + ": "
        if message.startswith(prefix):
            message = message[len(prefix):]
        return ["error", type(e).__name__, message, stack]
    sys.stdout.flush()
    sys.stderr.flush()
    _basalt_flush_figures()
    if result is None:
        return None
    html, png = _basalt_rich(result)
    return ["value", repr(result), html, png]
`;

let pyodide: Pyodide | null = null;

async function importPyodide(): Promise<{ loadPyodide: (opts: object) => Promise<Pyodide>; indexURL: string }> {
  let lastError: unknown;
  for (const indexURL of PYODIDE_URLS) {
    try {
      const mod = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
      return { loadPyodide: mod.loadPyodide, indexURL };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function start(): Promise<Pyodide> {
  const { loadPyodide, indexURL } = await importPyodide();
  const py = await loadPyodide({ indexURL });
  py.setStdout({ batched: (text) => emit({ type: "stream", name: "stdout", text: `${text}\n` }) });
  py.setStderr({ batched: (text) => emit({ type: "stream", name: "stderr", text: `${text}\n` }) });
  py.setStdin({ error: true });
  py.registerJsModule("_basalt", {
    display: (text: string | null, html: string | null, png: string | null) => {
      const out: Output = { type: "display" };
      if (text) out.text = text;
      if (html) out.html = html;
      if (png) out.png = png;
      emit(out);
    },
  });
  await py.runPythonAsync(PRELUDE);
  return py;
}

async function run(req: KernelRequest) {
  current = req.id;
  let ok = true;
  const py = pyodide!;
  try {
    const packages: string[] = [];
    await py.loadPackagesFromImports(req.code, {
      messageCallback: (m) => {
        const match = /^Loading (.+)$/.exec(m.trim());
        if (match) {
          packages.push(match[1]);
          status(`Loading ${match[1]}…`);
        }
      },
      errorCallback: (m) => emit({ type: "stream", name: "stderr", text: `${m}\n` }),
    });
    if (packages.length) status(null);
    const runner = py.globals.get("_basalt_run");
    const res = await runner(req.code, req.label);
    runner.destroy?.();
    const value = res && typeof res.toJs === "function" ? (res as PyProxy).toJs() : res;
    res?.destroy?.();
    if (Array.isArray(value) && value[0] === "error") {
      ok = false;
      const [, ename, message, stack] = value as string[];
      emit({ type: "error", ename, message, ...(stack ? { stack } : {}) });
    } else if (Array.isArray(value)) {
      const [, text, html, png] = value as (string | null)[];
      if (png && !html) emit({ type: "display", png });
      emit({ type: "result", text: text ?? "", ...(html ? { html } : {}) });
    }
  } catch (e) {
    ok = false;
    const err = e as Error;
    emit({ type: "error", ename: err?.name || "Error", message: err?.message ?? String(e) });
  }
  status(null);
  scope.postMessage({ type: "done", id: req.id, ok });
}

let chain: Promise<void> = (async () => {
  try {
    pyodide = await start();
    scope.postMessage({ type: "ready", info: `Python · Pyodide ${pyodide.version}` });
  } catch (e) {
    console.error("Pyodide failed to start", e);
    scope.postMessage({
      type: "fatal",
      message:
        "Couldn't load the Python runtime (Pyodide) from cdn.jsdelivr.net. Check your internet connection or whether a firewall blocks the CDN, then try again.",
    });
  }
})();

scope.onmessage = (e) => {
  if (e.data?.type !== "run") return;
  chain = chain.then(() => (pyodide ? run(e.data) : undefined));
};

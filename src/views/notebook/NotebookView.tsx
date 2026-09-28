// Notebook page: collaborative code (JavaScript / Python) and Markdown cells.
// Cell sources are Y.Texts edited through CodeMirror; outputs and execution
// counts are stored in the doc so everyone sees results, like a shared Jupyter.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import * as Y from "yjs";
import type { EditorView } from "@codemirror/view";
import { useApp, useLatest, usePeers, useY, type Peer } from "../../lib/hooks.ts";
import type { PageViewProps } from "../types.ts";
import { Cell, type CellActions } from "./Cell.tsx";
import type { RunMode } from "./CellEditor.tsx";
import { Menu, type MenuEntry } from "./Menu.tsx";
import { exportNotebook, importNotebook } from "./ipynb.ts";
import {
  IconDownload,
  IconEraser,
  IconKeyboard,
  IconMore,
  IconPlus,
  IconRestart,
  IconRunAll,
  IconStop,
  IconUpload,
} from "./icons.tsx";
import {
  LANG_LABEL,
  OUTPUT_ORIGIN,
  STRUCT_ORIGIN,
  cellLang,
  cellOutputs,
  cellType,
  cellsOf,
  cloneCell,
  findCell,
  indexOfCell,
  listCells,
  makeCell,
  newCellId,
  type CellInit,
  type CellLang,
  type CellType,
} from "./model.ts";
import { getSession, type RunningPresence } from "./session.ts";
import type { Kernel } from "./kernel/kernel.ts";
import { useDarkMode } from "./theme.ts";
import "./NotebookView.css";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const EXAMPLES: { title: string; blurb: string; cells: CellInit[] }[] = [
  {
    title: "JavaScript basics",
    blurb: "Console output, results and a quick plot",
    cells: [
      {
        type: "markdown",
        source: "## JavaScript\nVariables persist between cells, the last expression is shown, and `await` works at the top level.",
      },
      {
        type: "code",
        lang: "javascript",
        source:
          'const xs = Array.from({ length: 80 }, (_, i) => i / 8);\nconsole.log("Sampled", xs.length, "points");\nplot(xs, [Math.sin, Math.cos], { title: "Trigonometry", labels: ["sin", "cos"] })',
      },
      {
        type: "code",
        lang: "javascript",
        source:
          "const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\nawait sleep(300);\n\nconst primes = [];\nfor (let n = 2; primes.length < 10; n++) if (primes.every((p) => n % p)) primes.push(n);\n({ primes, sum: primes.reduce((a, b) => a + b) })",
      },
    ],
  },
  {
    title: "Python + matplotlib",
    blurb: "NumPy arrays and a chart, rendered in the browser",
    cells: [
      {
        type: "code",
        lang: "python",
        source:
          'import numpy as np\nimport matplotlib.pyplot as plt\n\nx = np.linspace(0, 2 * np.pi, 200)\nplt.plot(x, np.sin(x), label="sin")\nplt.plot(x, np.cos(x), label="cos")\nplt.legend()\nplt.title("Hello from Python")\nplt.show()',
      },
      { type: "code", lang: "python", source: "sum(i * i for i in range(10))" },
    ],
  },
  {
    title: "Markdown & math",
    blurb: "Notes with LaTeX between your code",
    cells: [
      {
        type: "markdown",
        source:
          "## Euler's identity\nThe most beautiful equation: $e^{i\\pi} + 1 = 0$.\n\n$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$",
      },
    ],
  },
];

const SHORTCUTS: [string, string][] = [
  ["Shift+Enter", "Run cell and select the next one"],
  [`${MOD}+Enter`, "Run cell"],
  ["Alt+Enter", "Run cell and insert one below"],
  ["Esc", "Leave the editor (command mode)"],
  ["Enter", "Edit the selected cell"],
  ["↑ / ↓", "Select previous / next cell"],
  ["A / B", "Insert cell above / below"],
  ["M / Y", "Make cell Markdown / code"],
  ["D D", "Delete cell"],
  [`Z · ${MOD}+Z`, "Undo cell operation"],
];

function useSession(ws: PageViewProps["ws"], pageId: string) {
  const session = useMemo(() => getSession(ws, pageId), [ws, pageId]);
  const subscribe = useCallback((fn: () => void) => session.subscribe(fn), [session]);
  useSyncExternalStore(subscribe, () => session.version);
  return session;
}

function KernelPill({ kernel, onClick }: { kernel: Kernel; onClick: (el: HTMLElement) => void }) {
  const labels: Record<Kernel["state"], string> = {
    off: "not started",
    starting: "starting…",
    idle: "idle",
    busy: "busy",
    error: "failed",
  };
  const title = [kernel.info ?? `${LANG_LABEL[kernel.lang]} kernel`, labels[kernel.state], kernel.error ?? ""].filter(Boolean).join(" — ");
  return (
    <button type="button" className={`nb-kernel is-${kernel.state}`} title={title} aria-label={`${title}. Kernel options`} onClick={(e) => onClick(e.currentTarget)}>
      <span className="nb-kernel-dot" />
      <span className="nb-kernel-name">{kernel.lang === "python" ? "Python" : "JS"}</span>
      <span className="nb-kernel-state">{labels[kernel.state]}</span>
    </button>
  );
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal nb-shortcuts" role="dialog" aria-label="Keyboard shortcuts">
        <div className="modal-header">
          <IconKeyboard /> Notebook shortcuts
        </div>
        <div className="modal-body">
          <table>
            <tbody>
              {SHORTCUTS.map(([k, d]) => (
                <tr key={k}>
                  <td>
                    <span className="kbd">{k}</span>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NotebookView({ ws, pageId, page, embedded = false }: PageViewProps) {
  const { toast } = useApp();
  const dark = useDarkMode();
  const peers = usePeers(ws);
  const session = useSession(ws, pageId);

  // Notebook pages get "cells" at creation; older/converted pages may lack it.
  useEffect(() => {
    if (!page.get("cells")) ws.doc.transact(() => page.set("cells", new Y.Array()), STRUCT_ORIGIN);
  }, [ws, page]);
  useY(page);
  const cellsArr = cellsOf(page);
  useY(cellsArr);
  const cells = listCells(cellsArr);

  const [selected, setSelected] = useState<string | null>(null);
  const [mdEditing, setMdEditing] = useState<ReadonlySet<string>>(() => new Set());
  const [menu, setMenu] = useState<{ el: HTMLElement; kind: "more" | "restart" } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const editors = useRef(new Map<string, EditorView>());
  const containers = useRef(new Map<string, HTMLDivElement>());
  const pendingFocus = useRef<{ id: string; where: "start" | "end" | number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const undoManager = useMemo(
    () => (cellsArr ? new Y.UndoManager(cellsArr, { trackedOrigins: new Set([STRUCT_ORIGIN]), captureTimeout: 0 }) : null),
    [cellsArr],
  );
  useEffect(() => () => undoManager?.destroy(), [undoManager]);

  // Inside another page, presence stays on that page.
  useEffect(() => {
    if (!embedded) ws.setPresence({ pageId });
  }, [ws, pageId, embedded]);

  // ---- focus helpers --------------------------------------------------------------

  const placeCursor = (view: EditorView, where: "start" | "end" | number) => {
    const pos = where === "start" ? 0 : where === "end" ? view.state.doc.length : Math.min(where, view.state.doc.length);
    view.focus();
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
  };

  const focusContainer = (id: string) => {
    setSelected(id);
    requestAnimationFrame(() => {
      const el = containers.current.get(id);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "nearest" });
    });
  };

  const focusEditor = (id: string, where: "start" | "end" | number) => {
    setSelected(id);
    const cell = findCell(cellsArr, id);
    if (cell && cellType(cell) === "markdown") setMdEditing((s) => (s.has(id) ? s : new Set(s).add(id)));
    const view = editors.current.get(id);
    if (view) placeCursor(view, where);
    else pendingFocus.current = { id, where };
  };

  // ---- structural edits -------------------------------------------------------------

  const defaultLang = (): CellLang => {
    const sel = selected ? findCell(cellsArr, selected) : undefined;
    if (sel && cellType(sel) === "code") return cellLang(sel);
    const lastCode = [...cells].reverse().find((c) => cellType(c) === "code");
    return lastCode ? cellLang(lastCode) : "javascript";
  };

  const insertAt = (rawIndex: number, init: CellInit, focus = true): string | null => {
    if (!cellsArr) return null;
    const id = init.id ?? newCellId();
    const cell = makeCell({ lang: defaultLang(), ...init, id });
    ws.doc.transact(() => cellsArr.insert(Math.max(0, Math.min(rawIndex, cellsArr.length)), [cell]), STRUCT_ORIGIN);
    if (focus) focusEditor(id, "end");
    return id;
  };

  const appendCell = (type: CellType) => insertAt(cellsArr?.length ?? 0, { type });

  const insertExample = (ex: (typeof EXAMPLES)[number]) => {
    if (!cellsArr) return;
    const inits = ex.cells.map((c) => ({ ...c, id: newCellId() }));
    ws.doc.transact(() => cellsArr.push(inits.map((c) => makeCell(c))), STRUCT_ORIGIN);
    const firstCode = inits.find((c) => c.type === "code");
    if (firstCode) focusEditor(firstCode.id, "end");
  };

  const runCell = (id: string, mode: RunMode) => {
    const cell = findCell(cellsArr, id);
    if (!cell || !cellsArr) return;
    const type = cellType(cell);
    if (type === "markdown") setMdEditing((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : s));
    else session.run([id]);
    const list = listCells(cellsArr);
    const i = list.findIndex((c) => c.get("id") === id);
    if (mode === "advance") {
      const next = list[i + 1];
      if (next) {
        if (cellType(next) === "code") focusEditor(next.get("id"), "end");
        else focusContainer(next.get("id"));
      } else insertAt(cellsArr.length, { type: "code", lang: type === "code" ? cellLang(cell) : defaultLang() });
    } else if (mode === "insert") {
      insertAt(indexOfCell(cellsArr, id) + 1, { type: "code", lang: type === "code" ? cellLang(cell) : defaultLang() });
    } else if (type === "markdown") focusContainer(id);
  };

  const removeCell = (id: string) => {
    if (!cellsArr) return;
    const list = listCells(cellsArr);
    const i = list.findIndex((c) => c.get("id") === id);
    const neighbor = list[i + 1] ?? list[i - 1];
    const raw = indexOfCell(cellsArr, id);
    if (raw < 0) return;
    ws.doc.transact(() => cellsArr.delete(raw, 1), STRUCT_ORIGIN);
    if (neighbor) focusContainer(neighbor.get("id"));
    else setSelected(null);
    toast(`Cell deleted — press ${MOD}+Z or Z to undo`);
  };

  const moveCell = (id: string, dir: -1 | 1) => {
    if (!cellsArr) return;
    const i = indexOfCell(cellsArr, id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cellsArr.length) return;
    const view = editors.current.get(id);
    const hadFocus = view?.hasFocus ? view.state.selection.main.head : null;
    const clone = cloneCell(cellsArr.get(i));
    ws.doc.transact(() => {
      cellsArr.delete(i, 1);
      cellsArr.insert(j, [clone]);
    }, STRUCT_ORIGIN);
    if (hadFocus !== null) pendingFocus.current = { id, where: hadFocus };
    else focusContainer(id);
  };

  const duplicateCell = (id: string) => {
    const cell = findCell(cellsArr, id);
    if (!cell || !cellsArr) return;
    const copyId = newCellId();
    ws.doc.transact(() => cellsArr.insert(indexOfCell(cellsArr, id) + 1, [cloneCell(cell, copyId)]), STRUCT_ORIGIN);
    focusContainer(copyId);
  };

  const setType = (id: string, type: CellType) => {
    const cell = findCell(cellsArr, id);
    if (!cell || cellType(cell) === type) return;
    ws.doc.transact(() => {
      cell.set("type", type);
      if (type === "markdown") {
        cell.set("outputs", []);
        cell.set("execCount", null);
      }
    }, STRUCT_ORIGIN);
    if (type === "markdown") setMdEditing((s) => new Set(s).add(id));
  };

  const setLang = (id: string, lang: CellLang) => {
    const cell = findCell(cellsArr, id);
    if (cell && cellLang(cell) !== lang) ws.doc.transact(() => cell.set("lang", lang), STRUCT_ORIGIN);
  };

  const clearOutputs = (ids?: string[]) => {
    ws.doc.transact(() => {
      for (const c of cells) {
        if (ids && !ids.includes(c.get("id"))) continue;
        if (cellOutputs(c).length) c.set("outputs", []);
        if (!ids && c.get("execCount") !== null) c.set("execCount", null);
      }
    }, OUTPUT_ORIGIN);
  };

  const runAll = () => session.run(cells.filter((c) => cellType(c) === "code").map((c) => c.get("id")));

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !cellsArr) return;
    try {
      const inits = importNotebook(await file.text());
      ws.doc.transact(() => cellsArr.push(inits.map((c) => makeCell(c))), STRUCT_ORIGIN);
      toast(`Imported ${inits.length} cell${inits.length === 1 ? "" : "s"} from ${file.name}`);
    } catch (err) {
      toast(err instanceof SyntaxError ? "That file isn't valid JSON." : (err as Error).message);
    }
  };

  const onExport = () => {
    const title = String(page.get("title") ?? "").trim() || "Untitled notebook";
    const blob = new Blob([exportNotebook(cells, title)], { type: "application/x-ipynb+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[\\/:*?"<>|]+/g, "-")}.ipynb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // Callbacks for cells, stable across renders so memoized cells don't re-render.
  const mdEditingRef = useLatest(mdEditing);
  const latest = useLatest({
    runCell,
    removeCell,
    moveCell,
    duplicateCell,
    setType,
    setLang,
    clearOutputs,
    focusEditor,
    focusContainer,
    insertAt,
    session,
    cellsArr,
    undoManager,
  });
  const actions = useMemo<CellActions>(
    () => ({
      run: (id, mode) => latest.current.runCell(id, mode),
      stop: (id) => latest.current.session.stop(id),
      select: (id) => setSelected(id),
      focusEditor: (id, where) => latest.current.focusEditor(id, where),
      commandMode: (id) => {
        const cell = findCell(latest.current.cellsArr, id);
        if (cell && cellType(cell) === "markdown") setMdEditing((s) => new Set([...s].filter((x) => x !== id)));
        latest.current.focusContainer(id);
      },
      neighbor: (id, dir, into) => {
        const list = listCells(latest.current.cellsArr);
        const i = list.findIndex((c) => c.get("id") === id);
        const next = list[i + dir];
        if (!next) return false;
        const nid = next.get("id") as string;
        if (into === "container" || (cellType(next) === "markdown" && !mdEditingRef.current.has(nid))) latest.current.focusContainer(nid);
        else latest.current.focusEditor(nid, into);
        return true;
      },
      insert: (id, where, type = "code") => {
        const arr = latest.current.cellsArr;
        if (!arr) return;
        const i = indexOfCell(arr, id);
        latest.current.insertAt(where === "above" ? i : i + 1, { type });
      },
      remove: (id) => latest.current.removeCell(id),
      move: (id, dir) => latest.current.moveCell(id, dir),
      duplicate: (id) => latest.current.duplicateCell(id),
      setType: (id, type) => latest.current.setType(id, type),
      setLang: (id, lang) => latest.current.setLang(id, lang),
      clearOutputs: (id) => latest.current.clearOutputs([id]),
      undo: () => latest.current.undoManager?.undo(),
      redo: () => latest.current.undoManager?.redo(),
      editMarkdown: (id, editing) => {
        if (editing) latest.current.focusEditor(id, "end");
        else setMdEditing((s) => new Set([...s].filter((x) => x !== id)));
      },
      registerView: (id, view) => {
        if (view) {
          editors.current.set(id, view);
          const p = pendingFocus.current;
          if (p && p.id === id) {
            pendingFocus.current = null;
            requestAnimationFrame(() => placeCursor(view, p.where));
          }
        } else editors.current.delete(id);
      },
      registerContainer: (id, el) => {
        if (el) containers.current.set(id, el);
        else containers.current.delete(id);
      },
    }),
    [latest, mdEditingRef],
  );

  // Who is editing / running which cell.
  const { editingPeers, runningPeers } = useMemo(() => {
    const byText = new Map<Y.AbstractType<any>, string>();
    for (const c of cells) byText.set(c.get("source"), c.get("id"));
    const editing = new Map<string, Peer[]>();
    const running = new Map<string, Peer>();
    for (const p of peers) {
      if (p.state.pageId !== undefined && p.state.pageId !== pageId) continue;
      const r = p.state.running as RunningPresence | null | undefined;
      if (r && r.pageId === pageId) running.set(r.cellId, p);
      const cursor = p.state.cursor as { head?: unknown } | null | undefined;
      if (cursor?.head) {
        try {
          const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(cursor.head), ws.doc);
          const id = abs && byText.get(abs.type);
          if (id) editing.set(id, [...(editing.get(id) ?? []), p]);
        } catch {
          // A cursor from another editor type; not ours to show.
        }
      }
    }
    return { editingPeers: editing, runningPeers: running };
  }, [peers, cells, pageId, ws]);

  const codeCount = cells.filter((c) => cellType(c) === "code").length;
  const js = session.kernels.javascript;
  const py = session.kernels.python;
  const anyKernelActive = session.busy || js.state === "busy" || py.state === "busy" || py.state === "starting";
  const uses = (k: Kernel) => k.state !== "off" || cells.some((c) => cellType(c) === "code" && cellLang(c) === k.lang);
  const showPython = uses(py);
  const showJs = uses(js) || !showPython;

  const menuItems: MenuEntry[] =
    menu?.kind === "restart"
      ? [
          { heading: "Restart kernel" },
          { label: "JavaScript", onSelect: () => session.restart("javascript"), disabled: js.state === "off" },
          { label: "Python", onSelect: () => session.restart("python"), disabled: py.state === "off" },
          "sep",
          {
            label: "Restart all & run all",
            icon: <IconRunAll size={14} />,
            onSelect: () => {
              session.restart("javascript");
              session.restart("python");
              runAll();
            },
            disabled: !codeCount,
          },
        ]
      : [
          { label: "Import .ipynb…", icon: <IconUpload size={14} />, onSelect: () => fileInput.current?.click() },
          { label: "Export as .ipynb", icon: <IconDownload size={14} />, onSelect: onExport, disabled: !cells.length },
          "sep",
          { label: "Clear all outputs", icon: <IconEraser size={14} />, onSelect: () => clearOutputs(), disabled: !cells.length },
          { label: "Keyboard shortcuts", icon: <IconKeyboard size={14} />, onSelect: () => setShowKeys(true) },
        ];

  return (
    <div className="nb-root">
      <div className="nb-toolbar" role="toolbar" aria-label="Notebook">
        <div className="nb-tb-group">
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => appendCell("code")} title="Add a code cell at the end">
            <IconPlus size={14} /> Code
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => appendCell("markdown")} title="Add a Markdown cell at the end">
            <IconPlus size={14} /> Markdown
          </button>
        </div>
        <span className="nb-tb-sep" />
        <div className="nb-tb-group">
          <button type="button" className="btn btn-sm btn-ghost" onClick={runAll} disabled={!codeCount} title="Run all code cells in order">
            <IconRunAll size={15} /> <span className="nb-tb-label">Run all</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => session.interrupt()}
            disabled={!anyKernelActive}
            title="Stop running cells (restarts the busy kernel)"
          >
            <IconStop size={12} /> <span className="nb-tb-label">Stop</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={(e) => setMenu({ el: e.currentTarget, kind: "restart" })}
            title="Restart a kernel (clears its variables)"
          >
            <IconRestart size={14} /> <span className="nb-tb-label">Restart</span>
          </button>
          <button type="button" className="btn btn-sm btn-ghost nb-tb-clear" onClick={() => clearOutputs()} disabled={!cells.length} title="Clear all outputs">
            <IconEraser size={14} /> <span className="nb-tb-label">Clear</span>
          </button>
        </div>
        <span className="spacer" />
        <div className="nb-tb-group nb-kernels">
          {showJs && <KernelPill kernel={js} onClick={(el) => setMenu({ el, kind: "restart" })} />}
          {showPython && <KernelPill kernel={py} onClick={(el) => setMenu({ el, kind: "restart" })} />}
        </div>
        <button type="button" className="icon-btn" aria-label="More notebook actions" onClick={(e) => setMenu({ el: e.currentTarget, kind: "more" })}>
          <IconMore />
        </button>
      </div>

      {py.error && (
        <div className="nb-banner" role="alert">
          <div className="grow">
            <strong>Python is unavailable.</strong> {py.error}
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              session.restart("python");
              py.start();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {cells.length === 0 ? (
        <div className="nb-empty">
          <div className="nb-empty-icon" aria-hidden="true">
            📓
          </div>
          <h2>Start your notebook</h2>
          <p className="muted">
            Run JavaScript and Python right in your workspace. Code runs on your device; outputs are shared with everyone here in real time.
          </p>
          <div className="row nb-empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => appendCell("code")}>
              <IconPlus size={14} /> Code cell
            </button>
            <button type="button" className="btn" onClick={() => appendCell("markdown")}>
              <IconPlus size={14} /> Markdown
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
              <IconUpload size={14} /> Import .ipynb
            </button>
          </div>
          <div className="nb-examples">
            <div className="menu-label">Or start from an example</div>
            <div className="nb-example-grid">
              {EXAMPLES.map((ex) => (
                <button type="button" key={ex.title} className="nb-example" onClick={() => insertExample(ex)}>
                  <span className="nb-example-title">{ex.title}</span>
                  <span className="nb-example-blurb">{ex.blurb}</span>
                  <code className="nb-example-code">{ex.cells.find((c) => c.type === "code")?.source?.split("\n")[0] ?? ex.cells[0].source?.split("\n")[0]}</code>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="nb-cells">
          {cells.map((cell, i) => {
            const id = cell.get("id") as string;
            return (
              <div key={id} className="nb-cell-wrap">
                <Cell
                  cell={cell}
                  index={i}
                  count={cells.length}
                  selected={selected === id}
                  mdEditing={mdEditing.has(id)}
                  runState={session.runStates.get(id)}
                  statusText={session.statusText.get(id)}
                  kernelState={session.kernels[cellLang(cell)].state}
                  editingPeers={editingPeers.get(id) ?? NO_PEERS}
                  runningPeer={runningPeers.get(id)}
                  dark={dark}
                  awareness={ws.awareness}
                  actions={actions}
                />
                <div className="nb-adder">
                  <button type="button" onClick={() => insertAt(indexOfCell(cellsArr!, id) + 1, { type: "code" })}>
                    <IconPlus size={12} /> Code
                  </button>
                  <button type="button" onClick={() => insertAt(indexOfCell(cellsArr!, id) + 1, { type: "markdown" })}>
                    <IconPlus size={12} /> Markdown
                  </button>
                </div>
              </div>
            );
          })}
          <div className="nb-footer">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => appendCell("code")}>
              <IconPlus size={14} /> Code
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => appendCell("markdown")}>
              <IconPlus size={14} /> Markdown
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn-sm btn-ghost nb-keys-btn" onClick={() => setShowKeys(true)}>
              <IconKeyboard size={14} /> Shortcuts
            </button>
          </div>
        </div>
      )}

      <input ref={fileInput} type="file" accept=".ipynb,application/x-ipynb+json,application/json" hidden onChange={onImport} />
      {menu && <Menu anchor={menu.el} items={menuItems} onClose={() => setMenu(null)} />}
      {showKeys && <ShortcutsDialog onClose={() => setShowKeys(false)} />}
    </div>
  );
}

const NO_PEERS: Peer[] = [];

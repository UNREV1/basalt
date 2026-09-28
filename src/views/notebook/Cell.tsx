import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { EditorView } from "@codemirror/view";
import { useY, type Peer } from "../../lib/hooks.ts";
import { renderMarkdown } from "../../lib/render-markdown.ts";
import CellEditor, { type RunMode } from "./CellEditor.tsx";
import { Outputs } from "./Outputs.tsx";
import { Menu, type MenuEntry } from "./Menu.tsx";
import { IconCopy, IconDown, IconEraser, IconMore, IconPlay, IconStop, IconTrash, IconUp } from "./icons.tsx";
import { LANG_LABEL, cellLang, cellOutputs, cellType, type CellLang, type CellType } from "./model.ts";
import type { KernelState } from "./kernel/kernel.ts";
import type { RunState } from "./session.ts";

export interface CellActions {
  run(id: string, mode: RunMode): void;
  stop(id: string): void;
  select(id: string): void;
  focusEditor(id: string, where: "start" | "end"): void;
  /** Leave the editor into command mode (cell selected, keyboard shortcuts active). */
  commandMode(id: string): void;
  neighbor(id: string, dir: -1 | 1, into: "start" | "end" | "container"): boolean;
  insert(id: string, where: "above" | "below", type?: CellType): void;
  remove(id: string): void;
  move(id: string, dir: -1 | 1): void;
  duplicate(id: string): void;
  setType(id: string, type: CellType): void;
  setLang(id: string, lang: CellLang): void;
  clearOutputs(id: string): void;
  undo(): void;
  redo(): void;
  editMarkdown(id: string, editing: boolean): void;
  registerView(id: string, view: EditorView | null): void;
  registerContainer(id: string, el: HTMLDivElement | null): void;
}

interface Props {
  cell: Y.Map<any>;
  index: number;
  count: number;
  selected: boolean;
  mdEditing: boolean;
  runState?: RunState;
  statusText?: string;
  kernelState: KernelState;
  editingPeers: Peer[];
  runningPeer?: Peer;
  dark: boolean;
  awareness: Awareness;
  actions: CellActions;
}

function Elapsed() {
  const [start] = useState(() => performance.now());
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, []);
  const s = (performance.now() - start) / 1000;
  return <span className="nb-elapsed">{s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`}</span>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function MarkdownPreview({ ytext, onEdit }: { ytext: Y.Text; onEdit: () => void }) {
  useY(ytext);
  const src = ytext.toString();
  const html = useMemo(() => (src.trim() ? renderMarkdown(src) : ""), [src]);
  const onClick = (e: ReactMouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (a && href && /^https?:/i.test(href)) {
      e.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };
  if (!html) {
    return (
      <div className="nb-md-empty" onDoubleClick={onEdit}>
        Empty Markdown cell — double-click or press Enter to write
      </div>
    );
  }
  return <div className="nb-md-preview" onDoubleClick={onEdit} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

function CellImpl({ cell, index, count, selected, mdEditing, runState, statusText, kernelState, editingPeers, runningPeer, dark, awareness, actions }: Props) {
  useY(cell);
  const id = cell.get("id") as string;
  const type = cellType(cell);
  const lang = cellLang(cell);
  const ytext = cell.get("source") as Y.Text;
  const outputs = cellOutputs(cell);
  const execCount = cell.get("execCount") as number | null;
  const runBy = cell.get("runBy") as string | undefined;
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const lastKey = useRef<{ key: string; t: number }>({ key: "", t: 0 });
  const showEditor = type === "code" || mdEditing;
  const busy = !!runState;
  const peerRunning = !busy && runningPeer;

  const handlers = useMemo(
    () => ({
      run: (mode: RunMode) => actions.run(id, mode),
      escape: () => actions.commandMode(id),
      exitUp: () => actions.neighbor(id, -1, "end"),
      exitDown: () => actions.neighbor(id, 1, "start"),
      focus: () => actions.select(id),
    }),
    [actions, id],
  );
  const onView = useMemo(() => (v: EditorView | null) => actions.registerView(id, v), [actions, id]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    const prev = lastKey.current;
    lastKey.current = { key, t: Date.now() };
    let handled = true;
    if (key === "Enter") {
      if (e.shiftKey) actions.run(id, "advance");
      else if (mod) actions.run(id, "inplace");
      else if (e.altKey) actions.run(id, "insert");
      else actions.focusEditor(id, "end");
    } else if (key === "ArrowUp" || key === "k") actions.neighbor(id, -1, "container");
    else if (key === "ArrowDown" || key === "j") actions.neighbor(id, 1, "container");
    else if (key === "z" && mod) {
      if (e.shiftKey) actions.redo();
      else actions.undo();
    } else if (key === "y" && mod) actions.redo();
    else if (mod || e.altKey) handled = false;
    else if (key === "a") actions.insert(id, "above");
    else if (key === "b") actions.insert(id, "below");
    else if (key === "m") actions.setType(id, "markdown");
    else if (key === "y") actions.setType(id, "code");
    else if (key === "z") actions.undo();
    else if (key === "d" && prev.key === "d" && Date.now() - prev.t < 700) {
      lastKey.current = { key: "", t: 0 };
      actions.remove(id);
    } else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const menuItems: MenuEntry[] = [
    { label: "Duplicate", icon: <IconCopy size={14} />, onSelect: () => actions.duplicate(id) },
    { label: "Insert code cell below", onSelect: () => actions.insert(id, "below", "code"), hint: "B" },
    { label: "Insert Markdown cell below", onSelect: () => actions.insert(id, "below", "markdown") },
    { label: type === "code" ? "Convert to Markdown" : "Convert to code", onSelect: () => actions.setType(id, type === "code" ? "markdown" : "code"), hint: type === "code" ? "M" : "Y" },
    ...(type === "code" ? [{ label: "Clear output", icon: <IconEraser size={14} />, onSelect: () => actions.clearOutputs(id), disabled: !outputs.length }] : []),
    "sep",
    { label: "Delete cell", icon: <IconTrash size={14} />, danger: true, onSelect: () => actions.remove(id), hint: "D D" },
  ];

  const countLabel = busy || peerRunning ? "[*]" : execCount ? `[${execCount}]` : "[ ]";
  const pythonStarting = type === "code" && lang === "python" && runState === "queued" && kernelState === "starting";

  return (
    <div
      ref={(el) => actions.registerContainer(id, el)}
      className={`nb-cell nb-${type}${selected ? " selected" : ""}${busy ? ` ${runState}` : ""}`}
      data-cell-id={id}
      tabIndex={-1}
      onFocus={() => actions.select(id)}
      onKeyDown={onKeyDown}
      aria-label={`${type === "code" ? `${LANG_LABEL[lang]} cell` : "Markdown cell"} ${index + 1} of ${count}`}
    >
      <div className="nb-gutter">
        {type === "code" ? (
          <>
            {busy ? (
              <button
                type="button"
                className={`nb-run is-busy${runState === "queued" ? " is-queued" : ""}`}
                title={runState === "queued" ? "Queued — click to cancel" : "Stop (restarts the kernel)"}
                aria-label="Stop"
                onClick={() => actions.stop(id)}
              >
                <span className="nb-run-ring" />
                <IconStop size={10} />
              </button>
            ) : peerRunning ? (
              <span className="nb-run is-peer" title={`${runningPeer.state.user.name} is running this cell`} style={{ color: runningPeer.state.user.color }}>
                <span className="nb-run-ring" />
              </span>
            ) : (
              <button
                type="button"
                className="nb-run"
                title={`Run cell (${isMac ? "⇧↵" : "Shift+Enter"})`}
                aria-label="Run cell"
                onClick={() => actions.run(id, "inplace")}
              >
                <IconPlay size={13} />
              </button>
            )}
            <span className="nb-count" title={runBy ? `Last run by ${runBy}` : undefined}>
              {countLabel}
            </span>
          </>
        ) : null}
        {editingPeers.length > 0 && (
          <div className="nb-peers">
            {editingPeers.slice(0, 3).map((p) => (
              <span key={p.clientId} className="nb-peer" style={{ background: p.state.user.color }} title={`${p.state.user.name} is editing`}>
                {initials(p.state.user.name)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="nb-main">
        <div className="nb-cell-toolbar" onMouseDown={(e) => e.preventDefault()}>
          {type === "code" ? (
            <select
              className="nb-lang"
              value={lang}
              aria-label="Cell language"
              onChange={(e) => actions.setLang(id, e.target.value as CellLang)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
            </select>
          ) : (
            <span className="nb-type-label">Markdown</span>
          )}
          <button type="button" className="icon-btn" title="Move up" aria-label="Move cell up" disabled={index === 0} onClick={() => actions.move(id, -1)}>
            <IconUp size={15} />
          </button>
          <button type="button" className="icon-btn" title="Move down" aria-label="Move cell down" disabled={index === count - 1} onClick={() => actions.move(id, 1)}>
            <IconDown size={15} />
          </button>
          <button type="button" className="icon-btn" title="Delete cell" aria-label="Delete cell" onClick={() => actions.remove(id)}>
            <IconTrash size={14} />
          </button>
          <button type="button" className="icon-btn" title="More" aria-label="More cell actions" onClick={(e) => setMenu(menu ? null : e.currentTarget)}>
            <IconMore size={15} />
          </button>
        </div>

        {showEditor ? (
          <div className={`nb-input${type === "markdown" ? " nb-input-md" : ""}`}>
            <CellEditor
              ytext={ytext}
              awareness={awareness}
              mode={type === "markdown" ? "markdown" : lang}
              dark={dark}
              placeholder={type === "markdown" ? "Write Markdown — $math$ works too. Shift+Enter to render" : lang === "python" ? "# Python — Shift+Enter to run" : "// JavaScript — Shift+Enter to run"}
              handlers={handlers}
              onView={onView}
            />
          </div>
        ) : (
          <MarkdownPreview ytext={ytext} onEdit={() => actions.editMarkdown(id, true)} />
        )}

        {(busy || peerRunning || statusText) && (
          <div className="nb-status" aria-live="polite">
            {(runState === "running" || pythonStarting) && <span className="spinner" />}
            {statusText ? (
              <span>{statusText}</span>
            ) : pythonStarting ? (
              <span>Starting Python… the first run downloads ~10 MB</span>
            ) : runState === "queued" ? (
              <span>Queued</span>
            ) : runState === "running" ? (
              <span>
                Running <Elapsed />
              </span>
            ) : peerRunning ? (
              <span>
                <span className="nb-dot" style={{ background: runningPeer.state.user.color }} />
                {runningPeer.state.user.name} is running this cell…
              </span>
            ) : null}
          </div>
        )}

        {type === "code" && <Outputs outputs={outputs} />}
      </div>
      {menu && <Menu anchor={menu} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  );
}

export const Cell = memo(CellImpl);

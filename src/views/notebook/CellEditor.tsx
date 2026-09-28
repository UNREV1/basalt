// A CodeMirror 6 editor bound to a cell's Y.Text via y-codemirror.next, so
// edits merge with peers' and their cursors show inside the cell.

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { Compartment, EditorState, Prec, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  keymap,
  placeholder as placeholderExt,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, completionStatus } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import { useLatest } from "../../lib/hooks.ts";

export type EditorMode = "javascript" | "python" | "markdown";
export type RunMode = "advance" | "inplace" | "insert";

export interface CellEditorHandlers {
  run(mode: RunMode): void;
  escape(): void;
  /** Cursor tried to leave through the top/bottom edge; return true if handled. */
  exitUp(): boolean;
  exitDown(): boolean;
  focus(): void;
}

interface Props {
  ytext: Y.Text;
  awareness: Awareness;
  mode: EditorMode;
  dark: boolean;
  placeholder: string;
  handlers: CellEditorHandlers;
  /** Registers the view so the notebook can move focus between cells. */
  onView(view: EditorView | null): void;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "13.5px", backgroundColor: "transparent", color: "var(--text)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--mono)", lineHeight: "1.6", overflowX: "auto" },
  ".cm-content": { padding: "10px 0", caretColor: "var(--text)" },
  ".cm-line": { padding: "0 14px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--text)", borderLeftWidth: "1.5px" },
  ".cm-selectionBackground": { backgroundColor: "var(--nb-selection) !important" },
  ".cm-selectionMatch": { backgroundColor: "var(--nb-selection-match)" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--nb-bracket)",
    outline: "none",
  },
  ".cm-placeholder": { color: "var(--text-faint)", fontStyle: "normal" },
  ".cm-tooltip": {
    background: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--mono)", fontSize: "12.5px", maxHeight: "14em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "2px 10px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { background: "var(--accent-soft)", color: "var(--text)" },
  ".cm-completionDetail": { color: "var(--text-faint)" },
  ".cm-panels": { background: "var(--bg-soft)", color: "var(--text)", borderColor: "var(--border)" },
  ".cm-panels input, .cm-panels button": { fontSize: "12px" },
  ".cm-searchMatch": { backgroundColor: "var(--warning-soft)", outline: "1px solid var(--warning)" },
  ".cm-ySelectionInfo": { fontFamily: "var(--font)", fontSize: "11px", fontWeight: "600", padding: "1px 4px", borderRadius: "3px 3px 3px 0" },
});

function languageFor(mode: EditorMode): Extension {
  if (mode === "python") return python();
  if (mode === "markdown") return markdown();
  return javascript();
}

const highlightFor = (dark: boolean) => syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle, { fallback: true });

function atFirstLine(view: EditorView): boolean {
  const sel = view.state.selection.main;
  return sel.empty && view.state.doc.lineAt(sel.head).number === 1;
}

function atLastLine(view: EditorView): boolean {
  const sel = view.state.selection.main;
  return sel.empty && view.state.doc.lineAt(sel.head).number === view.state.doc.lines;
}

export default function CellEditor({ ytext, awareness, mode, dark, placeholder, handlers, onView }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartments = useRef({ lang: new Compartment(), theme: new Compartment(), placeholder: new Compartment() });
  const h = useLatest(handlers);
  const onViewRef = useLatest(onView);
  const initial = useLatest({ mode, dark, placeholder });

  useEffect(() => {
    const undoManager = new Y.UndoManager(ytext);
    const c = compartments.current;
    const cellKeys = Prec.highest(
      keymap.of([
        { key: "Shift-Enter", run: () => (h.current.run("advance"), true) },
        { key: "Mod-Enter", run: () => (h.current.run("inplace"), true) },
        { key: "Alt-Enter", run: () => (h.current.run("insert"), true) },
        {
          key: "Escape",
          run: (view) => {
            if (completionStatus(view.state) !== null) return false;
            h.current.escape();
            return true;
          },
        },
        { key: "ArrowUp", run: (view) => completionStatus(view.state) === null && atFirstLine(view) && h.current.exitUp() },
        { key: "ArrowDown", run: (view) => completionStatus(view.state) === null && atLastLine(view) && h.current.exitDown() },
      ]),
    );
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          cellKeys,
          c.lang.of(languageFor(initial.current.mode)),
          c.theme.of(highlightFor(initial.current.dark)),
          c.placeholder.of(placeholderExt(initial.current.placeholder)),
          baseTheme,
          // Wrap rather than scroll sideways: cells are read as much as edited, often on phones.
          EditorView.lineWrapping,
          highlightSpecialChars(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ icons: false }),
          rectangularSelection(),
          crosshairCursor(),
          highlightSelectionMatches(),
          yCollab(ytext, awareness, { undoManager }),
          keymap.of([
            ...yUndoManagerKeymap,
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...searchKeymap,
            ...defaultKeymap,
            indentWithTab,
          ]),
          EditorView.domEventHandlers({ focus: () => h.current.focus() }),
          EditorView.contentAttributes.of({ "aria-label": "Cell source", spellcheck: "false", autocapitalize: "off" }),
        ],
      }),
    });
    viewRef.current = view;
    onViewRef.current(view);
    return () => {
      onViewRef.current(null);
      viewRef.current = null;
      view.destroy();
      undoManager.destroy();
    };
  }, [ytext, awareness, h, onViewRef, initial]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.lang.reconfigure(languageFor(mode)) });
  }, [mode]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.theme.reconfigure(highlightFor(dark)) });
  }, [dark]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.placeholder.reconfigure(placeholderExt(placeholder)) });
  }, [placeholder]);

  return <div className="nb-editor" ref={host} />;
}

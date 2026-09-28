// Jupyter .ipynb (nbformat 4) import/export.

import { cellLang, cellOutputs, cellSource, cellType, type CellInit, type CellLang, type Output } from "./model.ts";
import type * as Y from "yjs";

type MultiLine = string | string[];

interface NbOutput {
  output_type: "stream" | "execute_result" | "display_data" | "error";
  name?: string;
  text?: MultiLine;
  data?: Record<string, MultiLine>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  execution_count?: number | null;
  metadata?: object;
}

interface NbCell {
  cell_type: "code" | "markdown" | "raw";
  id?: string;
  source: MultiLine;
  metadata?: { basalt?: { lang?: CellLang } } & Record<string, unknown>;
  outputs?: NbOutput[];
  execution_count?: number | null;
}

interface Notebook {
  cells: NbCell[];
  metadata?: {
    kernelspec?: { name?: string; language?: string; display_name?: string };
    language_info?: { name?: string };
  };
  nbformat: number;
  nbformat_minor?: number;
}

const joinText = (t: MultiLine | undefined) => (Array.isArray(t) ? t.join("") : (t ?? ""));

/** Split into Jupyter's line-array form (each line keeps its "\n"). */
function lines(s: string): string[] {
  const out = (s.match(/[^\n]*\n|[^\n]+$/g) ?? []);
  return out.length === 1 && out[0] === "" ? [] : out;
}

// Tracebacks from real Jupyter kernels are ANSI-colored.
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

function exportOutput(o: Output, execCount: number | null): NbOutput {
  switch (o.type) {
    case "stream":
      return { output_type: "stream", name: o.name, text: lines(o.text) };
    case "result":
      return {
        output_type: "execute_result",
        execution_count: execCount,
        metadata: {},
        data: { "text/plain": lines(o.text), ...(o.html ? { "text/html": lines(o.html) } : {}) },
      };
    case "error":
      return {
        output_type: "error",
        ename: o.ename,
        evalue: o.message,
        traceback: [...(o.stack ? o.stack.split("\n") : []), `${o.ename}: ${o.message}`],
      };
    case "display": {
      const data: Record<string, MultiLine> = {};
      if (o.png) data["image/png"] = o.png;
      if (o.html) data["text/html"] = lines(o.html);
      data["text/plain"] = lines(o.text ?? (o.png ? "<image>" : ""));
      return { output_type: "display_data", metadata: {}, data };
    }
  }
}

export function exportNotebook(cells: Y.Map<any>[], title: string): string {
  const langs = cells.filter((c) => cellType(c) === "code").map(cellLang);
  const py = langs.filter((l) => l === "python").length;
  const main: CellLang = py > langs.length - py ? "python" : "javascript";
  const nb: Notebook = {
    cells: cells.map((c): NbCell => {
      const id = String(c.get("id"));
      if (cellType(c) === "markdown") return { cell_type: "markdown", id, metadata: {}, source: lines(cellSource(c)) };
      const execCount = (c.get("execCount") as number | null) ?? null;
      return {
        cell_type: "code",
        id,
        metadata: { basalt: { lang: cellLang(c) } },
        source: lines(cellSource(c)),
        execution_count: execCount,
        outputs: cellOutputs(c).map((o) => exportOutput(o, execCount)),
      };
    }),
    metadata: {
      kernelspec:
        main === "python"
          ? { name: "python3", language: "python", display_name: "Python 3 (Pyodide)" }
          : { name: "javascript", language: "javascript", display_name: "JavaScript" },
      language_info: { name: main },
      basalt: { title },
    } as Notebook["metadata"],
    nbformat: 4,
    nbformat_minor: 5,
  };
  return JSON.stringify(nb, null, 1);
}

function importOutput(o: NbOutput): Output | null {
  switch (o.output_type) {
    case "stream":
      return { type: "stream", name: o.name === "stderr" ? "stderr" : "stdout", text: joinText(o.text) };
    case "execute_result":
    case "display_data": {
      const d = o.data ?? {};
      const html = d["text/html"] ? joinText(d["text/html"]) : d["image/svg+xml"] ? joinText(d["image/svg+xml"]) : undefined;
      const text = d["text/plain"] ? joinText(d["text/plain"]) : undefined;
      const png = d["image/png"] ? joinText(d["image/png"]).replace(/\s+/g, "") : undefined;
      if (o.output_type === "execute_result" && !png) return { type: "result", text: text ?? "", ...(html ? { html } : {}) };
      return { type: "display", ...(html ? { html } : {}), ...(text && !png ? { text } : {}), ...(png ? { png } : {}) };
    }
    case "error": {
      const tb = (o.traceback ?? []).map(stripAnsi);
      // Jupyter tracebacks end with "Name: message"; we store that separately.
      if (tb.length && tb[tb.length - 1].startsWith(`${o.ename}:`)) tb.pop();
      return { type: "error", ename: o.ename ?? "Error", message: o.evalue ?? "", ...(tb.length ? { stack: tb.join("\n") } : {}) };
    }
    default:
      return null;
  }
}

export function importNotebook(json: string): CellInit[] {
  const nb = JSON.parse(json) as Notebook;
  if (!nb || !Array.isArray(nb.cells)) throw new Error("This file doesn't look like a Jupyter notebook.");
  if (nb.nbformat < 4) throw new Error("Only nbformat 4 notebooks are supported (re-save it with a recent Jupyter).");
  const langName = (nb.metadata?.kernelspec?.language ?? nb.metadata?.language_info?.name ?? "python").toLowerCase();
  const defaultLang: CellLang = /javascript|typescript|js|deno|node/.test(langName) ? "javascript" : "python";
  return nb.cells.map((c): CellInit => {
    const source = joinText(c.source);
    if (c.cell_type !== "code") {
      return { type: "markdown", source: c.cell_type === "raw" ? `\`\`\`\n${source}\n\`\`\`` : source };
    }
    const lang = c.metadata?.basalt?.lang === "javascript" || c.metadata?.basalt?.lang === "python" ? c.metadata.basalt.lang : defaultLang;
    return {
      type: "code",
      lang,
      source,
      execCount: typeof c.execution_count === "number" ? c.execution_count : null,
      outputs: (c.outputs ?? []).map(importOutput).filter((o): o is Output => o !== null),
    };
  });
}

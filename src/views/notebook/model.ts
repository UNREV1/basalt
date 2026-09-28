// Notebook cell model helpers. A notebook page stores its cells in
// page.get("cells"): Y.Array<Y.Map> where each cell map holds
//   id, type ("code" | "markdown"), lang ("javascript" | "python"),
//   source: Y.Text, outputs: Output[] (plain JSON), execCount, runBy.

import * as Y from "yjs";
import { randomId } from "../../../shared/crypto.ts";

export type CellType = "code" | "markdown";
export type CellLang = "javascript" | "python";

export type Output =
  | { type: "stream"; name: "stdout" | "stderr"; text: string }
  | { type: "result"; text: string; html?: string }
  | { type: "error"; ename: string; message: string; stack?: string }
  | { type: "display"; html?: string; text?: string; png?: string };

export interface CellInit {
  type?: CellType;
  lang?: CellLang;
  source?: string;
  outputs?: Output[];
  execCount?: number | null;
  id?: string;
}

/** Transaction origin for structural edits (tracked by the notebook's undo manager). */
export const STRUCT_ORIGIN = { name: "notebook-struct" };
/** Transaction origin for kernel output writes (never undoable). */
export const OUTPUT_ORIGIN = { name: "notebook-output" };

export const LANG_LABEL: Record<CellLang, string> = { javascript: "JavaScript", python: "Python" };

export function cellsOf(page: Y.Map<any>): Y.Array<Y.Map<any>> | undefined {
  return page.get("cells") as Y.Array<Y.Map<any>> | undefined;
}

export const newCellId = () => randomId(10);

/** A new (not yet integrated) cell. Read the id from `init.id`: prelim Y.Maps can't be read. */
export function makeCell(init: CellInit = {}): Y.Map<any> {
  const cell = new Y.Map<any>();
  cell.set("id", init.id ?? newCellId());
  cell.set("type", init.type ?? "code");
  cell.set("lang", init.lang ?? "javascript");
  cell.set("source", new Y.Text(init.source ?? ""));
  cell.set("outputs", init.outputs ?? []);
  cell.set("execCount", init.execCount ?? null);
  return cell;
}

/** Y types can't be re-inserted once integrated, so moves re-create the cell. */
export function cloneCell(cell: Y.Map<any>, id: string = cell.get("id")): Y.Map<any> {
  const copy = makeCell({
    id,
    type: cell.get("type"),
    lang: cell.get("lang"),
    source: (cell.get("source") as Y.Text | undefined)?.toString() ?? "",
    outputs: cell.get("outputs") ?? [],
    execCount: cell.get("execCount") ?? null,
  });
  const runBy = cell.get("runBy");
  if (runBy) copy.set("runBy", runBy);
  return copy;
}

export function cellType(cell: Y.Map<any>): CellType {
  return cell.get("type") === "markdown" ? "markdown" : "code";
}

export function cellLang(cell: Y.Map<any>): CellLang {
  return cell.get("lang") === "python" ? "python" : "javascript";
}

export function cellSource(cell: Y.Map<any>): string {
  return (cell.get("source") as Y.Text | undefined)?.toString() ?? "";
}

export function cellOutputs(cell: Y.Map<any>): Output[] {
  const o = cell.get("outputs");
  return Array.isArray(o) ? o : [];
}

/** Cells in order, skipping duplicate ids (possible after two peers move the same cell at once). */
export function listCells(cells: Y.Array<Y.Map<any>> | undefined): Y.Map<any>[] {
  if (!cells) return [];
  const seen = new Set<string>();
  const out: Y.Map<any>[] = [];
  for (const c of cells.toArray()) {
    const id = c.get("id");
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

export function indexOfCell(cells: Y.Array<Y.Map<any>>, id: string): number {
  const arr = cells.toArray();
  for (let i = 0; i < arr.length; i++) if (arr[i].get("id") === id) return i;
  return -1;
}

export function findCell(cells: Y.Array<Y.Map<any>> | undefined, id: string): Y.Map<any> | undefined {
  if (!cells) return undefined;
  for (const c of cells) if (c.get("id") === id) return c;
  return undefined;
}

export function nextExecCount(cells: Y.Array<Y.Map<any>>): number {
  let max = 0;
  for (const c of cells) {
    const n = c.get("execCount");
    if (typeof n === "number" && n > max) max = n;
  }
  return max + 1;
}

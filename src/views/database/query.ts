// Database view settings (persisted in page.get("view")) and the row pipeline:
// collect objects of a type → filter → search → sort.

import type * as Y from "yjs";
import {
  getPage,
  getProps,
  type ObjectType,
  type PageMeta,
  type PropDef,
  type PropKind,
} from "../../../shared/model.ts";
import {
  compareValues,
  isEmptyValue,
  multiIds,
  parseDateKey,
  toDateKey,
  valueText,
} from "../../components/properties/propUtils.ts";

export type Layout = "table" | "board" | "gallery" | "list" | "calendar";
export const LAYOUTS: Layout[] = ["table", "board", "gallery", "list", "calendar"];
export type Scope = "type" | "children";

export interface SortRule {
  prop: string;
  dir: "asc" | "desc";
}

export interface FilterRule {
  id: string;
  prop: string;
  op: string;
  value?: unknown;
}

export interface ViewSettings {
  layout: Layout;
  typeId: string | null;
  scope: Scope;
  groupBy: string | null;
  dateProp: string | null;
  sort: SortRule[];
  filters: FilterRule[];
  hiddenProps: string[];
  widths: Record<string, number>;
}

export const DEFAULT_VIEW: ViewSettings = {
  layout: "table",
  typeId: null,
  scope: "type",
  groupBy: null,
  dateProp: null,
  sort: [],
  filters: [],
  hiddenProps: [],
  widths: {},
};

const arr = <T>(v: unknown, ok: (x: any) => boolean): T[] => (Array.isArray(v) ? (v.filter(ok) as T[]) : []);

export function readView(map: Y.Map<any> | undefined): ViewSettings {
  if (!map) return DEFAULT_VIEW;
  const layout = map.get("layout");
  const widths = map.get("widths");
  return {
    layout: LAYOUTS.includes(layout) ? layout : "table",
    typeId: typeof map.get("typeId") === "string" ? map.get("typeId") : null,
    scope: map.get("scope") === "children" ? "children" : "type",
    groupBy: typeof map.get("groupBy") === "string" ? map.get("groupBy") : null,
    dateProp: typeof map.get("dateProp") === "string" ? map.get("dateProp") : null,
    sort: arr<SortRule>(map.get("sort"), (s) => s && typeof s.prop === "string"),
    filters: arr<FilterRule>(map.get("filters"), (f) => f && typeof f.prop === "string" && typeof f.op === "string"),
    hiddenProps: arr<string>(map.get("hiddenProps"), (x) => typeof x === "string"),
    widths: widths && typeof widths === "object" && !Array.isArray(widths) ? widths : {},
  };
}

// ---- fields (type props + built-in pseudo properties) --------------------------------

export const TITLE_FIELD = "title";
export const CREATED_FIELD = "createdAt";
export const UPDATED_FIELD = "updatedAt";

export type FieldKind = PropKind | "title" | "created" | "updated";

export interface Field {
  id: string;
  name: string;
  kind: FieldKind;
  def?: PropDef;
}

export function fieldsFor(type: ObjectType): Field[] {
  return [
    { id: TITLE_FIELD, name: "Name", kind: "title" },
    ...type.props.map((def) => ({ id: def.id, name: def.name, kind: def.kind as FieldKind, def })),
    { id: CREATED_FIELD, name: "Created", kind: "created" },
    { id: UPDATED_FIELD, name: "Last edited", kind: "updated" },
  ];
}

export interface OpInfo {
  op: string;
  label: string;
  /** What kind of value the operator needs (none = unary). */
  input: "none" | "text" | "number" | "option" | "date" | "page";
}

const EMPTY_OPS: OpInfo[] = [
  { op: "empty", label: "is empty", input: "none" },
  { op: "not_empty", label: "is not empty", input: "none" },
];
const TEXT_OPS: OpInfo[] = [
  { op: "contains", label: "contains", input: "text" },
  { op: "not_contains", label: "does not contain", input: "text" },
  { op: "is", label: "is", input: "text" },
  { op: "is_not", label: "is not", input: "text" },
  { op: "starts_with", label: "starts with", input: "text" },
  ...EMPTY_OPS,
];
const DATE_OPS: OpInfo[] = [
  { op: "is", label: "is", input: "date" },
  { op: "before", label: "is before", input: "date" },
  { op: "after", label: "is after", input: "date" },
  { op: "on_or_before", label: "is on or before", input: "date" },
  { op: "on_or_after", label: "is on or after", input: "date" },
  { op: "past", label: "is in the past", input: "none" },
  { op: "next_7", label: "is within next 7 days", input: "none" },
];

export function opsFor(kind: FieldKind): OpInfo[] {
  switch (kind) {
    case "title":
    case "text":
    case "url":
      return TEXT_OPS;
    case "number":
      return [
        { op: "eq", label: "=", input: "number" },
        { op: "neq", label: "≠", input: "number" },
        { op: "gt", label: ">", input: "number" },
        { op: "lt", label: "<", input: "number" },
        { op: "gte", label: "≥", input: "number" },
        { op: "lte", label: "≤", input: "number" },
        ...EMPTY_OPS,
      ];
    case "select":
      return [
        { op: "is", label: "is", input: "option" },
        { op: "is_not", label: "is not", input: "option" },
        ...EMPTY_OPS,
      ];
    case "multi":
      return [
        { op: "has", label: "contains", input: "option" },
        { op: "not_has", label: "does not contain", input: "option" },
        ...EMPTY_OPS,
      ];
    case "date":
      return [...DATE_OPS, ...EMPTY_OPS];
    case "created":
    case "updated":
      return DATE_OPS;
    case "checkbox":
      return [
        { op: "checked", label: "is checked", input: "none" },
        { op: "unchecked", label: "is not checked", input: "none" },
      ];
    case "page":
      return [
        { op: "is", label: "is", input: "page" },
        { op: "is_not", label: "is not", input: "page" },
        ...EMPTY_OPS,
      ];
  }
}

// ---- rows ---------------------------------------------------------------------------

export interface Row {
  id: string;
  meta: PageMeta;
  props: Record<string, any>;
}

export function collectRows(doc: Y.Doc, pages: PageMeta[], typeId: string, scope: Scope, dbId: string | null): Row[] {
  const out: Row[] = [];
  for (const meta of pages) {
    if (meta.deletedAt || meta.id === dbId || meta.typeId !== typeId) continue;
    if (scope === "children" && meta.parentId !== dbId) continue;
    const page = getPage(doc, meta.id);
    if (!page) continue;
    out.push({ id: meta.id, meta, props: getProps(page) });
  }
  return out;
}

function fieldValue(row: Row, field: Field): unknown {
  switch (field.kind) {
    case "title":
      return row.meta.title;
    case "created":
      return toDateKey(new Date(row.meta.createdAt));
    case "updated":
      return toDateKey(new Date(row.meta.updatedAt));
    default:
      return row.props[field.id];
  }
}

function fieldText(doc: Y.Doc, row: Row, field: Field): string {
  if (field.kind === "title") return row.meta.title;
  if (!field.def) return String(fieldValue(row, field) ?? "");
  return valueText(doc, field.def, row.props[field.id]);
}

/** A filter whose value is still missing is ignored instead of hiding everything. */
export function isFilterComplete(rule: FilterRule, field: Field | undefined): boolean {
  if (!field) return false;
  const op = opsFor(field.kind).find((o) => o.op === rule.op);
  if (!op) return false;
  return op.input === "none" || !isEmptyValue(rule.value);
}

export function matchFilter(doc: Y.Doc, row: Row, field: Field, rule: FilterRule): boolean {
  const v = fieldValue(row, field);
  const target = rule.value;
  switch (rule.op) {
    case "empty":
      return isEmptyValue(v);
    case "not_empty":
      return !isEmptyValue(v);
    case "checked":
      return !!v;
    case "unchecked":
      return !v;
  }
  switch (field.kind) {
    case "title":
    case "text":
    case "url": {
      const s = fieldText(doc, row, field).toLowerCase();
      const t = String(target ?? "").toLowerCase();
      if (rule.op === "contains") return s.includes(t);
      if (rule.op === "not_contains") return !s.includes(t);
      if (rule.op === "is") return s.trim() === t.trim();
      if (rule.op === "is_not") return s.trim() !== t.trim();
      if (rule.op === "starts_with") return s.startsWith(t);
      return true;
    }
    case "number": {
      if (typeof v !== "number") return rule.op === "neq";
      const t = Number(target);
      if (rule.op === "eq") return v === t;
      if (rule.op === "neq") return v !== t;
      if (rule.op === "gt") return v > t;
      if (rule.op === "lt") return v < t;
      if (rule.op === "gte") return v >= t;
      if (rule.op === "lte") return v <= t;
      return true;
    }
    case "select":
      if (rule.op === "is") return v === target;
      if (rule.op === "is_not") return v !== target;
      return true;
    case "multi": {
      const ids = multiIds(v);
      if (rule.op === "has") return ids.includes(String(target));
      if (rule.op === "not_has") return !ids.includes(String(target));
      return true;
    }
    case "page":
      if (rule.op === "is") return v === target;
      if (rule.op === "is_not") return v !== target;
      return true;
    case "date":
    case "created":
    case "updated": {
      const d = typeof v === "string" && parseDateKey(v) ? v : null;
      const today = toDateKey(new Date());
      if (rule.op === "past") return !!d && d < today;
      if (rule.op === "next_7") {
        const end = new Date();
        end.setDate(end.getDate() + 7);
        return !!d && d >= today && d <= toDateKey(end);
      }
      if (!d) return false;
      const t = String(target ?? "");
      if (rule.op === "is") return d === t;
      if (rule.op === "before") return d < t;
      if (rule.op === "after") return d > t;
      if (rule.op === "on_or_before") return d <= t;
      if (rule.op === "on_or_after") return d >= t;
      return true;
    }
    default:
      return true;
  }
}

export function applyView(doc: Y.Doc, rows: Row[], type: ObjectType, settings: Pick<ViewSettings, "filters" | "sort">, search: string): Row[] {
  const fields = new Map(fieldsFor(type).map((f) => [f.id, f]));
  let out = rows;
  const active = settings.filters.filter((r) => isFilterComplete(r, fields.get(r.prop)));
  if (active.length) out = out.filter((row) => active.every((r) => matchFilter(doc, row, fields.get(r.prop)!, r)));
  const q = search.trim().toLowerCase();
  if (q) {
    const textFields = [...fields.values()].filter((f) => f.kind !== "created" && f.kind !== "updated" && f.kind !== "checkbox");
    out = out.filter((row) => textFields.some((f) => fieldText(doc, row, f).toLowerCase().includes(q)));
  }
  const sorts = settings.sort.filter((s) => fields.has(s.prop));
  const sorted = [...out];
  sorted.sort((a, b) => {
    for (const s of sorts) {
      const f = fields.get(s.prop)!;
      const c = compareField(doc, f, a, b);
      if (c === null) continue;
      if (c.emptyOrder !== 0) return c.emptyOrder; // empties last in both directions
      if (c.cmp !== 0) return s.dir === "desc" ? -c.cmp : c.cmp;
    }
    return a.meta.createdAt - b.meta.createdAt || a.meta.order - b.meta.order || a.id.localeCompare(b.id);
  });
  return sorted;
}

function compareField(doc: Y.Doc, f: Field, a: Row, b: Row): { cmp: number; emptyOrder: number } | null {
  if (f.kind === "created") return { cmp: a.meta.createdAt - b.meta.createdAt, emptyOrder: 0 };
  if (f.kind === "updated") return { cmp: a.meta.updatedAt - b.meta.updatedAt, emptyOrder: 0 };
  if (f.kind === "title") {
    const at = a.meta.title.trim();
    const bt = b.meta.title.trim();
    if (!at || !bt) return { cmp: 0, emptyOrder: at === bt ? 0 : at ? -1 : 1 };
    return { cmp: at.localeCompare(bt, undefined, { numeric: true, sensitivity: "base" }), emptyOrder: 0 };
  }
  if (!f.def) return null;
  const av = a.props[f.id];
  const bv = b.props[f.id];
  const ae = f.def.kind === "checkbox" ? false : isEmptyValue(av);
  const be = f.def.kind === "checkbox" ? false : isEmptyValue(bv);
  if (ae || be) return { cmp: 0, emptyOrder: ae === be ? 0 : ae ? 1 : -1 };
  return { cmp: compareValues(doc, f.def, av, bv), emptyOrder: 0 };
}

/** Property values a new row should get so it stays visible under the active filters. */
export function defaultsFromFilters(type: ObjectType, filters: FilterRule[]): { props: Record<string, unknown>; title?: string } {
  const props: Record<string, unknown> = {};
  let title: string | undefined;
  for (const f of filters) {
    if (isEmptyValue(f.value) && f.op !== "checked") continue;
    if (f.prop === TITLE_FIELD) {
      if (f.op === "is" || f.op === "contains" || f.op === "starts_with") title = String(f.value);
      continue;
    }
    const def = type.props.find((p) => p.id === f.prop);
    if (!def) continue;
    if (def.kind === "checkbox" && f.op === "checked") props[def.id] = true;
    else if ((def.kind === "select" || def.kind === "page") && f.op === "is") props[def.id] = f.value;
    else if (def.kind === "multi" && f.op === "has") props[def.id] = [...multiIds(props[def.id]), String(f.value)];
    else if ((def.kind === "text" || def.kind === "url") && (f.op === "is" || f.op === "contains" || f.op === "starts_with"))
      props[def.id] = String(f.value);
    else if (def.kind === "number" && (f.op === "eq" || f.op === "gte" || f.op === "lte")) props[def.id] = Number(f.value);
    else if (def.kind === "date" && (f.op === "is" || f.op === "on_or_after" || f.op === "on_or_before")) props[def.id] = f.value;
  }
  return { props, title };
}

/** Visible properties of a type for this view (in type order). */
export function visibleProps(type: ObjectType, hidden: string[]): PropDef[] {
  return type.props.filter((p) => !hidden.includes(p.id));
}

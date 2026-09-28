// Helpers shared by the properties panel, database views and the types manager:
// kind metadata, value formatting/comparison, and type/property mutations that
// keep every object of a type consistent (option deletes, kind conversions...).

import type * as Y from "yjs";
import { randomId } from "../../../shared/crypto.ts";
import {
  DEFAULT_TYPE_ID,
  SELECT_COLORS,
  defaultIcon,
  displayTitle,
  getPage,
  getType,
  pageMeta,
  pagesMap,
  saveType,
  typesMap,
  type ObjectType,
  type PageMeta,
  type PropDef,
  type PropKind,
} from "../../../shared/model.ts";
import type { IconName } from "./icons.tsx";

/** Transaction origin for writes made by the property/database UI. */
export const PROPS_ORIGIN = "basalt:props";

export type SelectOption = NonNullable<PropDef["options"]>[number];

export const KIND_INFO: Record<PropKind, { label: string; icon: IconName; hint: string }> = {
  text: { label: "Text", icon: "text", hint: "Plain text" },
  number: { label: "Number", icon: "number", hint: "Numbers, ratings, amounts" },
  select: { label: "Select", icon: "select", hint: "One option from a list" },
  multi: { label: "Multi-select", icon: "multi", hint: "Several tags" },
  date: { label: "Date", icon: "calendar", hint: "A calendar day" },
  checkbox: { label: "Checkbox", icon: "checkbox", hint: "Yes or no" },
  url: { label: "URL", icon: "url", hint: "A web link" },
  page: { label: "Relation", icon: "page", hint: "Link to another page" },
};

export const KIND_ORDER: PropKind[] = ["text", "number", "select", "multi", "date", "checkbox", "url", "page"];

export const COLOR_LABELS: Record<string, string> = {
  gray: "Gray",
  brown: "Brown",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  pink: "Pink",
  red: "Red",
};

export function pickColor(options: SelectOption[] = []): string {
  const used = new Set(options.map((o) => o.color));
  const free = SELECT_COLORS.filter((c) => c !== "gray" && !used.has(c));
  if (free.length) return free[0];
  return SELECT_COLORS[(options.length + 1) % SELECT_COLORS.length];
}

// ---- values ------------------------------------------------------------------

export function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0);
}

export function optionById(def: PropDef, id: unknown): SelectOption | undefined {
  return def.options?.find((o) => o.id === id);
}

export function multiIds(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v) return [v];
  return [];
}

export function parseDateKey(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

const DAY_MS = 86_400_000;

export function formatDate(v: unknown, relative = true): string {
  const d = parseDateKey(v);
  if (!d) return "";
  if (relative) {
    const today = parseDateKey(toDateKey(new Date()))!;
    const diff = Math.round((d.getTime() - today.getTime()) / DAY_MS);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
  }
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function formatNumber(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function prettyUrl(v: string): string {
  return v.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function hrefFor(v: string): string {
  const s = v.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  return `https://${s}`;
}

export function pageTitleById(doc: Y.Doc, id: unknown): string {
  if (typeof id !== "string") return "";
  const p = getPage(doc, id);
  return p ? displayTitle(pageMeta(p)) : "";
}

/** Plain-text rendering of a value (search, kind conversion, previews). */
export function valueText(doc: Y.Doc, def: PropDef, v: unknown): string {
  if (isEmptyValue(v) && def.kind !== "number") return "";
  switch (def.kind) {
    case "text":
    case "url":
    case "date":
      return typeof v === "string" ? v : String(v ?? "");
    case "number":
      return typeof v === "number" ? String(v) : "";
    case "select":
      return optionById(def, v)?.name ?? "";
    case "multi":
      return multiIds(v)
        .map((id) => optionById(def, id)?.name)
        .filter(Boolean)
        .join(", ");
    case "checkbox":
      return v ? "Yes" : "";
    case "page":
      return pageTitleById(doc, v);
  }
}

/** Compare two values of the same property for sorting. Empty values are handled by the caller. */
export function compareValues(doc: Y.Doc, def: PropDef, a: unknown, b: unknown): number {
  switch (def.kind) {
    case "number":
      return (Number(a) || 0) - (Number(b) || 0);
    case "checkbox":
      return Number(!!a) - Number(!!b);
    case "select":
    case "multi": {
      const idx = (v: unknown) => {
        const id = def.kind === "multi" ? multiIds(v)[0] : v;
        const i = def.options?.findIndex((o) => o.id === id) ?? -1;
        return i === -1 ? 999 : i;
      };
      return idx(a) - idx(b);
    }
    case "date":
      return String(a).localeCompare(String(b));
    default:
      return valueText(doc, def, a).localeCompare(valueText(doc, def, b), undefined, { numeric: true, sensitivity: "base" });
  }
}

export function pageIconFor(meta: Pick<PageMeta, "icon" | "kind">, type?: ObjectType): string {
  if (meta.icon) return meta.icon;
  if (type && type.id !== DEFAULT_TYPE_ID && type.icon) return type.icon;
  return defaultIcon(meta.kind);
}

export function typeCounts(pages: PageMeta[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pages) out.set(p.typeId, (out.get(p.typeId) ?? 0) + 1);
  return out;
}

export function countObjectsOfType(doc: Y.Doc, typeId: string): number {
  let n = 0;
  pagesMap(doc).forEach((p) => {
    if (!p.get("deletedAt") && (p.get("typeId") ?? DEFAULT_TYPE_ID) === typeId) n++;
  });
  return n;
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/** "Changes apply to all 12 Task objects" style copy. */
export function typeScopeNote(doc: Y.Doc, type: ObjectType): string {
  const n = countObjectsOfType(doc, type.id);
  return n <= 1 ? `Applies to every “${type.name}” object` : `Applies to all ${n} “${type.name}” objects`;
}

export function uniqueName(existing: string[], base: string): string {
  const taken = new Set(existing.map((s) => s.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}

// ---- type mutations -----------------------------------------------------------

function cloneType(t: ObjectType): ObjectType {
  return JSON.parse(JSON.stringify(t));
}

/** Read-modify-write a type from the doc (never mutate the stored object in place). */
export function mutateType(doc: Y.Doc, typeId: string, fn: (t: ObjectType) => void) {
  const cur = getType(doc, typeId);
  if (!cur) return;
  const copy = cloneType(cur);
  fn(copy);
  saveType(doc, copy);
}

function forEachObject(doc: Y.Doc, typeId: string, fn: (props: Y.Map<any>, page: Y.Map<any>) => void) {
  pagesMap(doc).forEach((page) => {
    if ((page.get("typeId") ?? DEFAULT_TYPE_ID) !== typeId) return;
    const props = page.get("props") as Y.Map<any> | undefined;
    if (props) fn(props, page);
  });
}

export function createType(doc: Y.Doc, input: { name: string; icon: string; props?: PropDef[] }): string {
  const id = randomId(10);
  saveType(doc, { id, name: input.name.trim() || "Untitled type", icon: input.icon || "📦", props: input.props ?? [] });
  return id;
}

export function defaultDatabaseProps(): PropDef[] {
  return [
    {
      id: newId(),
      name: "Status",
      kind: "select",
      options: [
        { id: newId(), name: "Not started", color: "gray" },
        { id: newId(), name: "In progress", color: "blue" },
        { id: newId(), name: "Done", color: "green" },
      ],
    },
    { id: newId(), name: "Tags", kind: "multi", options: [] },
    { id: newId(), name: "Date", kind: "date" },
  ];
}

function newId() {
  return randomId(8);
}

/** Deleting a type re-homes its objects to the default Page type. */
export function deleteType(doc: Y.Doc, typeId: string) {
  if (typeId === DEFAULT_TYPE_ID) return;
  doc.transact(() => {
    pagesMap(doc).forEach((page) => {
      if (page.get("typeId") === typeId) page.set("typeId", DEFAULT_TYPE_ID);
    });
    typesMap(doc).delete(typeId);
  }, PROPS_ORIGIN);
}

export function addProp(doc: Y.Doc, typeId: string, input: { name: string; kind: PropKind }): PropDef | undefined {
  const type = getType(doc, typeId);
  if (!type) return undefined;
  const def: PropDef = {
    id: newId(),
    name: uniqueName(
      type.props.map((p) => p.name),
      input.name.trim() || KIND_INFO[input.kind].label,
    ),
    kind: input.kind,
  };
  if (input.kind === "select" || input.kind === "multi") def.options = [];
  mutateType(doc, typeId, (t) => t.props.push(def));
  return def;
}

export function updateProp(doc: Y.Doc, typeId: string, propId: string, patch: Partial<Omit<PropDef, "id">>) {
  mutateType(doc, typeId, (t) => {
    const def = t.props.find((p) => p.id === propId);
    if (def) Object.assign(def, patch);
  });
}

export function moveProp(doc: Y.Doc, typeId: string, from: number, to: number) {
  mutateType(doc, typeId, (t) => {
    const [item] = t.props.splice(from, 1);
    if (item) t.props.splice(to, 0, item);
  });
}

export function deleteProp(doc: Y.Doc, typeId: string, propId: string) {
  doc.transact(() => {
    mutateType(doc, typeId, (t) => {
      t.props = t.props.filter((p) => p.id !== propId);
    });
    forEachObject(doc, typeId, (props) => {
      if (props.has(propId)) props.delete(propId);
    });
  }, PROPS_ORIGIN);
}

export function addOption(doc: Y.Doc, typeId: string, propId: string, name: string, color?: string): SelectOption | undefined {
  const type = getType(doc, typeId);
  const def = type?.props.find((p) => p.id === propId);
  if (!def) return undefined;
  const existing = def.options?.find((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (existing) return existing;
  const opt: SelectOption = { id: randomId(6), name: name.trim(), color: color ?? pickColor(def.options) };
  mutateType(doc, typeId, (t) => {
    const d = t.props.find((p) => p.id === propId);
    if (d) d.options = [...(d.options ?? []), opt];
  });
  return opt;
}

export function updateOption(doc: Y.Doc, typeId: string, propId: string, optionId: string, patch: Partial<Omit<SelectOption, "id">>) {
  mutateType(doc, typeId, (t) => {
    const o = t.props.find((p) => p.id === propId)?.options?.find((x) => x.id === optionId);
    if (o) Object.assign(o, patch);
  });
}

export function moveOption(doc: Y.Doc, typeId: string, propId: string, from: number, to: number) {
  mutateType(doc, typeId, (t) => {
    const opts = t.props.find((p) => p.id === propId)?.options;
    if (!opts) return;
    const [item] = opts.splice(from, 1);
    if (item) opts.splice(to, 0, item);
  });
}

export function deleteOption(doc: Y.Doc, typeId: string, propId: string, optionId: string) {
  doc.transact(() => {
    mutateType(doc, typeId, (t) => {
      const d = t.props.find((p) => p.id === propId);
      if (d) d.options = (d.options ?? []).filter((o) => o.id !== optionId);
    });
    forEachObject(doc, typeId, (props) => {
      const v = props.get(propId);
      if (v === optionId) props.delete(propId);
      else if (Array.isArray(v) && v.includes(optionId)) {
        const next = v.filter((x) => x !== optionId);
        if (next.length) props.set(propId, next);
        else props.delete(propId);
      }
    });
  }, PROPS_ORIGIN);
}

const TRUE_WORDS = /^(true|yes|y|x|1|✓|✔|done|checked|on)$/i;

/** Change a property's kind and convert every object's value so nothing silently turns into garbage. */
export function changePropKind(doc: Y.Doc, typeId: string, propId: string, kind: PropKind) {
  const type = getType(doc, typeId);
  const def = type?.props.find((p) => p.id === propId);
  if (!type || !def || def.kind === kind) return;
  const wasOptions = def.kind === "select" || def.kind === "multi";
  const toOptions = kind === "select" || kind === "multi";
  const next: PropDef = { id: def.id, name: def.name, kind };
  if (toOptions) next.options = wasOptions ? [...(def.options ?? [])] : [];
  const byName = new Map((next.options ?? []).map((o) => [o.name.trim().toLowerCase(), o]));
  const optionFor = (name: string): string | undefined => {
    const n = name.trim();
    if (!n) return undefined;
    let o = byName.get(n.toLowerCase());
    if (!o) {
      o = { id: randomId(6), name: n, color: pickColor(next.options) };
      next.options!.push(o);
      byName.set(n.toLowerCase(), o);
    }
    return o.id;
  };
  const titleIndex = new Map<string, string>();
  if (kind === "page") {
    pagesMap(doc).forEach((p, id) => {
      if (!p.get("deletedAt")) titleIndex.set(String(p.get("title") ?? "").trim().toLowerCase(), id);
    });
  }

  doc.transact(() => {
    forEachObject(doc, typeId, (props) => {
      if (!props.has(propId)) return;
      const v = props.get(propId);
      const text = valueText(doc, def, v).trim();
      let out: unknown;
      switch (kind) {
        case "text":
        case "url":
          out = text;
          break;
        case "number": {
          const n = typeof v === "number" ? v : parseFloat(text.replace(/[, ]/g, ""));
          out = Number.isFinite(n) ? n : undefined;
          break;
        }
        case "select":
          if (wasOptions) out = multiIds(v)[0];
          else out = optionFor(text);
          break;
        case "multi":
          if (wasOptions) out = multiIds(v);
          else out = [...new Set(text.split(",").map(optionFor).filter((x): x is string => !!x))];
          break;
        case "date": {
          const d = parseDateKey(v) ?? (text ? new Date(text) : null);
          out = d && !Number.isNaN(d.getTime()) ? toDateKey(d) : undefined;
          break;
        }
        case "checkbox":
          out = def.kind === "number" ? Number(v) !== 0 : TRUE_WORDS.test(text);
          break;
        case "page":
          if (typeof v === "string" && getPage(doc, v)) out = v;
          else out = titleIndex.get(text.toLowerCase());
          break;
      }
      if (isEmptyValue(out)) props.delete(propId);
      else props.set(propId, out);
    });
    mutateType(doc, typeId, (t) => {
      const i = t.props.findIndex((p) => p.id === propId);
      if (i !== -1) t.props[i] = next;
    });
  }, PROPS_ORIGIN);
}

// ---- icons ----------------------------------------------------------------------

export const EMOJIS = [
  "📄", "📝", "🗒️", "📋", "📌", "📎", "🗂️", "📁", "📚", "📖", "📓", "📔",
  "✅", "☑️", "🎯", "🚀", "⭐", "🔥", "💡", "🧠", "🧩", "🎨", "🎵", "🎬",
  "🧑", "👥", "🤝", "🏢", "🏠", "🌍", "✈️", "🚗", "🍎", "☕", "🍳", "🌱",
  "💼", "💰", "🛒", "🎁", "📦", "🏷️", "🔖", "🗓️", "⏰", "📅", "📈", "📊",
  "🧪", "🔬", "🧬", "⚙️", "🛠️", "💻", "📱", "🖥️", "🐛", "🔒", "🔑", "🧾",
  "❤️", "💬", "📣", "🎓", "🏆", "🎮", "🏃", "🧘", "🌙", "☀️", "🌈", "🐾",
];

/** 0 = Sunday … 6 = Saturday, from the browser locale when it exposes week info. */
export function firstDayOfWeek(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch {
    // Older engines: fall through to Sunday.
  }
  return 0;
}

/** 6×7 grid of days covering the month of `month` (any day in that month). */
export function monthGrid(month: Date, weekStart = firstDayOfWeek()): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function weekdayLabels(weekStart = firstDayOfWeek(), style: "short" | "narrow" = "short"): string[] {
  const base = new Date(2024, 0, 7); // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    addDays(base, (weekStart + i) % 7).toLocaleDateString(undefined, { weekday: style }),
  );
}

/** Rank a title against a query: prefix > word start > substring > subsequence. 0 = no match. */
export function matchScore(title: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = title.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 60;
  const i = t.indexOf(q);
  if (i > 0 && /\W/.test(t[i - 1])) return 45;
  if (i >= 0) return 30 - Math.min(i, 20);
  let j = 0;
  for (const ch of t) if (ch === q[j]) j++;
  return j === q.length ? 4 : 0;
}

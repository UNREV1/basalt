// A compact, Node-style pretty printer for REPL results and console output.

const IDENT = /^[A-Za-z_$][\w$]*$/;
const MAX_WIDTH = 72;
const MAX_ITEMS = 100;
const MAX_STRING = 10_000;

export interface InspectOptions {
  depth?: number;
}

function quote(s: string): string {
  const body = s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}… (${s.length - MAX_STRING} more chars)` : s;
  const q = body.includes("'") && !body.includes('"') ? '"' : "'";
  return (
    q +
    body
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(new RegExp(q, "g"), `\\${q}`) +
    q
  );
}

function fnLabel(fn: Function): string {
  let src = "";
  try {
    src = Function.prototype.toString.call(fn);
  } catch {
    // Some host functions can't be stringified.
  }
  if (/^class\b/.test(src)) {
    const ext = /^class\s*[\w$]*\s+extends\s+([\w$.]+)/.exec(src);
    return `[class ${fn.name || "(anonymous)"}${ext ? ` extends ${ext[1]}` : ""}]`;
  }
  const kind = fn.constructor?.name === "AsyncFunction" ? "AsyncFunction" : fn.constructor?.name === "GeneratorFunction" ? "GeneratorFunction" : "Function";
  return `[${kind}${fn.name ? `: ${fn.name}` : " (anonymous)"}]`;
}

function keyLabel(k: string | symbol): string {
  if (typeof k === "symbol") return `[${k.toString()}]`;
  return IDENT.test(k) ? k : quote(k);
}

/** Join entries on one line if short, else one per line (or packed for short primitives). */
function wrap(open: string, close: string, entries: string[], indent: string, pack: boolean): string {
  if (!entries.length) return `${open}${close}`;
  const oneLine = `${open} ${entries.join(", ")} ${close}`;
  if (oneLine.length + indent.length <= MAX_WIDTH && !oneLine.includes("\n")) return oneLine;
  const inner = `${indent}  `;
  if (pack && entries.length > 6) {
    const width = Math.max(...entries.map((e) => e.length)) + 2;
    const perLine = Math.max(1, Math.floor((MAX_WIDTH - inner.length) / width));
    const lines: string[] = [];
    for (let i = 0; i < entries.length; i += perLine) {
      lines.push(
        inner +
          entries
            .slice(i, i + perLine)
            .map((e, j, arr) => (i + j === entries.length - 1 ? e : `${e},`).padEnd(j === arr.length - 1 ? 0 : width))
            .join(""),
      );
    }
    return `${open}\n${lines.join("\n")}\n${indent}${close}`;
  }
  return `${open}\n${entries.map((e) => inner + e).join(",\n")}\n${indent}${close}`;
}

function ctorName(v: object): string | null {
  const proto = Object.getPrototypeOf(v);
  if (proto === null) return null;
  return proto.constructor?.name ?? "Object";
}

function format(v: unknown, depth: number, seen: Set<object>, indent: string): string {
  switch (typeof v) {
    case "string":
      return quote(v);
    case "number":
      return Object.is(v, -0) ? "-0" : String(v);
    case "bigint":
      return `${v}n`;
    case "boolean":
    case "undefined":
      return String(v);
    case "symbol":
      return v.toString();
    case "function":
      return fnLabel(v);
  }
  if (v === null) return "null";
  const obj = v as object;
  if (seen.has(obj)) return "[Circular]";

  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? "Invalid Date" : obj.toISOString();
  if (obj instanceof RegExp) return String(obj);
  if (obj instanceof Error) {
    const stack = obj.stack && obj.stack.includes(obj.message) ? obj.stack : `${obj.name}: ${obj.message}`;
    return stack.split("\n").slice(0, 6).join(`\n${indent}`);
  }
  if (obj instanceof Promise) return "Promise { … }";
  if (obj instanceof WeakMap || obj instanceof WeakSet) return `${ctorName(obj)} { <items unknown> }`;
  if (obj instanceof ArrayBuffer) return `ArrayBuffer { byteLength: ${obj.byteLength} }`;
  if ((obj as { __basaltHtml?: unknown }).__basaltHtml !== undefined) return "[HTML]";

  const inner = `${indent}  `;
  const next = (x: unknown) => format(x, depth - 1, seen, inner);
  seen.add(obj);
  try {
    if (Array.isArray(obj) || ArrayBuffer.isView(obj)) {
      const arr = obj as ArrayLike<unknown>;
      const name = Array.isArray(obj) ? "" : `${ctorName(obj)}(${arr.length}) `;
      if (depth < 0) return Array.isArray(obj) ? "[Array]" : `[${ctorName(obj)}]`;
      const n = Math.min(arr.length, MAX_ITEMS);
      const entries: string[] = [];
      let holes = 0;
      for (let i = 0; i < n; i++) {
        if (Array.isArray(obj) && !(i in obj)) {
          holes++;
          continue;
        }
        if (holes) {
          entries.push(`<${holes} empty item${holes > 1 ? "s" : ""}>`);
          holes = 0;
        }
        entries.push(next(arr[i]));
      }
      if (holes) entries.push(`<${holes} empty item${holes > 1 ? "s" : ""}>`);
      if (arr.length > n) entries.push(`... ${arr.length - n} more item${arr.length - n > 1 ? "s" : ""}`);
      if (Array.isArray(obj)) {
        for (const k of Object.keys(obj)) if (!/^\d+$/.test(k)) entries.push(`${keyLabel(k)}: ${next((obj as any)[k])}`);
      }
      const pack = entries.every((e) => e.length <= 16 && !e.includes("\n"));
      return name + wrap("[", "]", entries, indent, pack);
    }
    if (obj instanceof Map) {
      if (depth < 0) return "[Map]";
      const entries: string[] = [];
      let i = 0;
      for (const [k, val] of obj) {
        if (i++ >= MAX_ITEMS) {
          entries.push(`... ${obj.size - MAX_ITEMS} more items`);
          break;
        }
        entries.push(`${next(k)} => ${next(val)}`);
      }
      return `Map(${obj.size}) ${wrap("{", "}", entries, indent, false)}`;
    }
    if (obj instanceof Set) {
      if (depth < 0) return "[Set]";
      const entries: string[] = [];
      let i = 0;
      for (const val of obj) {
        if (i++ >= MAX_ITEMS) {
          entries.push(`... ${obj.size - MAX_ITEMS} more items`);
          break;
        }
        entries.push(next(val));
      }
      return `Set(${obj.size}) ${wrap("{", "}", entries, indent, entries.every((e) => e.length <= 16))}`;
    }
    const name = ctorName(obj);
    const prefix = name === null ? "[Object: null prototype] " : name === "Object" ? "" : `${name} `;
    if (depth < 0) return `[${name ?? "Object"}]`;
    const keys: (string | symbol)[] = [
      ...Object.keys(obj),
      ...Object.getOwnPropertySymbols(obj).filter((s) => Object.prototype.propertyIsEnumerable.call(obj, s)),
    ];
    const entries: string[] = [];
    for (const k of keys.slice(0, MAX_ITEMS)) {
      let val: unknown;
      try {
        val = (obj as any)[k];
      } catch (e) {
        val = `<getter threw ${String(e)}>`;
      }
      entries.push(`${keyLabel(k)}: ${next(val)}`);
    }
    if (keys.length > MAX_ITEMS) entries.push(`... ${keys.length - MAX_ITEMS} more properties`);
    return prefix + wrap("{", "}", entries, indent, false);
  } finally {
    seen.delete(obj);
  }
}

export function inspect(value: unknown, opts: InspectOptions = {}): string {
  return format(value, opts.depth ?? 2, new Set(), "");
}

/** console.log-style formatting: printf directives, strings raw, others inspected. */
export function formatLogArgs(args: unknown[]): string {
  const out: string[] = [];
  let rest = args;
  if (typeof args[0] === "string" && /%[sdifoOjc%]/.test(args[0])) {
    let i = 1;
    const fmt = (args[0] as string).replace(/%([sdifoOjc%])/g, (m, d: string) => {
      if (d === "%") return "%";
      if (i >= args.length) return m;
      const a = args[i++];
      switch (d) {
        case "s":
          return typeof a === "string" ? a : inspect(a, { depth: 1 });
        case "d":
        case "i":
          return typeof a === "bigint" ? `${a}n` : String(d === "i" ? Math.trunc(Number(a)) : Number(a));
        case "f":
          return String(Number(a));
        case "j":
          try {
            return JSON.stringify(a);
          } catch {
            return "[Circular]";
          }
        case "c":
          return "";
        default:
          return inspect(a, { depth: 4 });
      }
    });
    out.push(fmt);
    rest = args.slice(i);
  } else if (args.length) {
    out.push(typeof args[0] === "string" ? args[0] : inspect(args[0]));
    rest = args.slice(1);
  }
  for (const a of rest) out.push(typeof a === "string" ? a : inspect(a));
  return out.join(" ");
}

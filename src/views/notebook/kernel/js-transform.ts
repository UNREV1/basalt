// Rewrites a notebook cell so it behaves like a REPL line:
//  - top-level let/const/class/function/import bindings become globals, so
//    later cells (and re-runs) can see and redefine them;
//  - the value of the last expression is returned;
//  - top-level `await` (and `import`) work by wrapping the cell in an async
//    function, since indirect eval has no top-level await.
// Edits never add newlines, so line numbers in stack traces stay correct.

import { parser } from "@lezer/javascript";
import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

export interface Transformed {
  /** Code to evaluate with indirect eval. */
  code: string;
  /** True when `code` evaluates to a promise of the cell's value. */
  isAsync: boolean;
  /** Global names to pre-declare with `var` (async mode only). */
  declare: string[];
}

const FUNCTION_SCOPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunction",
  "MethodDeclaration",
  "ClassBody",
]);

interface Edit {
  from: number;
  to: number;
  text: string;
}

function hasError(node: SyntaxNode): boolean {
  let found = false;
  node.toTree().iterate({
    enter(n: SyntaxNodeRef) {
      if (found) return false;
      if (n.type.isError) found = true;
      return undefined;
    },
  });
  return found;
}

/** Is there an `await` (or `for await`) outside of any nested function? */
function hasTopLevelAwait(stmt: SyntaxNode): boolean {
  const walk = (n: SyntaxNode): boolean => {
    if (n.name === "await" || n.name === "AwaitExpression") return true;
    if (FUNCTION_SCOPES.has(n.name)) return false;
    // Object-literal methods (`{ async m() {} }`) are Property nodes with a ParamList.
    if (n.name === "Property" && n.getChild("ParamList")) return false;
    for (let c = n.firstChild; c; c = c.nextSibling) if (walk(c)) return true;
    return false;
  };
  return walk(stmt);
}

function children(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
}

/** Names bound by a declaration target (identifier or destructuring pattern). */
function boundNames(node: SyntaxNode, src: string, out: string[]) {
  if (node.name === "VariableDefinition") {
    out.push(src.slice(node.from, node.to));
    return;
  }
  // Inside patterns, default values (`{a = f(x)}`) contain VariableNames we must skip:
  // only VariableDefinition nodes are bindings.
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (FUNCTION_SCOPES.has(c.name)) continue;
    boundNames(c, src, out);
  }
}

function stringValue(node: SyntaxNode, src: string): string {
  const raw = src.slice(node.from, node.to);
  try {
    return JSON.parse(raw.startsWith("'") ? `"${raw.slice(1, -1).replace(/"/g, '\\"')}"` : raw);
  } catch {
    return raw.slice(1, -1);
  }
}

/** Untransformed code, still async-wrapped when it awaits, for when transformCell's output doesn't compile. */
export function fallbackCode(src: string): Transformed {
  if (/\bawait\b/.test(src)) return { code: `(async () => {${src}\n})()`, isAsync: true, declare: [] };
  return { code: src, isAsync: false, declare: [] };
}

export function transformCell(src: string): Transformed {
  // `{ a: 1 }` on its own is a block to eval; consoles treat it as an object literal.
  const trimmed = src.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const wrapped = `(${src}\n)`;
    const t = parser.parse(wrapped);
    if (!hasError(t.topNode) && t.topNode.getChildren("ExpressionStatement").length === 1 && !t.topNode.firstChild?.nextSibling) {
      return { code: wrapped, isAsync: false, declare: [] };
    }
  }

  // Lezer recovers from errors (or from syntax it doesn't know), so the result may
  // not compile; the kernel compile-checks it and falls back to fallbackCode().
  const top = parser.parse(src).topNode;

  const stmts = children(top).filter((n) => n.name !== "LineComment" && n.name !== "BlockComment");
  const isAsync = stmts.some((s) => s.name === "ImportDeclaration" || hasTopLevelAwait(s));
  const edits: Edit[] = [];
  const declare: string[] = [];
  const hoisted: string[] = [];

  const rewriteDeclaration = (decl: SyntaxNode) => {
    const kids = children(decl);
    const kw = kids[0];
    if (!kw || !["let", "const", "var"].includes(kw.name)) return;
    if (!isAsync) {
      // Indirect eval turns top-level `var` into global properties.
      if (kw.name !== "var") edits.push({ from: kw.from, to: kw.to, text: "var" });
      return;
    }
    // Async mode: turn `const a = 1, {b} = o` into `;a = 1, ({b} = o)`.
    edits.push({ from: kw.from, to: kw.to, text: ";" });
    for (let i = 1; i < kids.length; i++) {
      const target = kids[i];
      if (!["VariableDefinition", "ObjectPattern", "ArrayPattern"].includes(target.name)) continue;
      boundNames(target, src, declare);
      const eq = kids[i + 1]?.name === "Equals" ? kids[i + 1] : null;
      if (!eq) {
        if (target.name === "VariableDefinition" && kw.name !== "var") edits.push({ from: target.to, to: target.to, text: " = void 0" });
        else if (target.name === "VariableDefinition") edits.push({ from: target.from, to: target.to, text: "void 0" });
        continue;
      }
      const init = kids[i + 2];
      if (target.name !== "VariableDefinition" && init) {
        edits.push({ from: target.from, to: target.from, text: "(" });
        edits.push({ from: init.to, to: init.to, text: ")" });
      }
    }
  };

  const rewriteImport = (imp: SyntaxNode) => {
    const kids = children(imp);
    const specNode = kids.find((k) => k.name === "String");
    if (!specNode) return;
    const spec = JSON.stringify(stringValue(specNode, src));
    const load = `await __basalt_import(${spec})`;
    let def: string | null = null;
    let ns: string | null = null;
    const named: string[] = [];
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.name === "Star") {
        const nameNode = kids.slice(i).find((n) => n.name === "VariableDefinition");
        if (nameNode) ns = src.slice(nameNode.from, nameNode.to);
        break;
      }
      if (k.name === "VariableDefinition" && !def) def = src.slice(k.from, k.to);
      if (k.name === "ImportGroup") {
        const g = children(k).filter((n) => n.name !== "{" && n.name !== "}" && n.name !== ",");
        for (let j = 0; j < g.length; j++) {
          const name = src.slice(g[j].from, g[j].to);
          if (g[j + 1]?.name === "as" && g[j + 2]) {
            const local = src.slice(g[j + 2].from, g[j + 2].to);
            named.push(`${name}: ${local}`);
            declare.push(local);
            j += 2;
          } else {
            named.push(name);
            declare.push(name);
          }
        }
      }
    }
    if (def) declare.push(def);
    if (ns) declare.push(ns);
    let text: string;
    if (ns) text = `;${ns} = ${load}${def ? `, ${def} = ${ns}.default` : ""};`;
    else if (def || named.length) {
      const parts = [...(def ? [`default: ${def}`] : []), ...named];
      text = `;({ ${parts.join(", ")} } = ${load});`;
    } else text = `;${load};`;
    edits.push({ from: imp.from, to: imp.to, text });
  };

  const rewriteClass = (cls: SyntaxNode) => {
    const nameNode = cls.getChild("VariableDefinition");
    if (!nameNode) return;
    const name = src.slice(nameNode.from, nameNode.to);
    edits.push({ from: cls.from, to: cls.from, text: isAsync ? `;${name} = ` : `var ${name} = ` });
    edits.push({ from: cls.to, to: cls.to, text: ";" });
    if (isAsync) declare.push(name);
  };

  const rewriteStatement = (stmt: SyntaxNode) => {
    switch (stmt.name) {
      case "VariableDeclaration":
        rewriteDeclaration(stmt);
        break;
      case "ClassDeclaration":
        rewriteClass(stmt);
        break;
      case "FunctionDeclaration":
        if (isAsync) {
          const nameNode = stmt.getChild("VariableDefinition");
          if (nameNode) {
            const name = src.slice(nameNode.from, nameNode.to);
            declare.push(name);
            hoisted.push(name);
          }
        }
        break;
      case "ImportDeclaration":
        if (isAsync) rewriteImport(stmt);
        break;
      case "ExportDeclaration": {
        // Notebook cells aren't modules; treat `export` as a no-op.
        const kids = children(stmt);
        const inner = kids.find((k) => k.name !== "export" && k.name !== "default");
        const isDefault = kids.some((k) => k.name === "default");
        if (inner && !isDefault) {
          edits.push({ from: stmt.from, to: inner.from, text: "" });
          rewriteStatement(inner);
        } else if (inner) {
          edits.push({ from: stmt.from, to: inner.from, text: ";" });
        }
        break;
      }
      default:
        break;
    }
  };

  for (const s of stmts) rewriteStatement(s);

  if (isAsync) {
    const last = stmts[stmts.length - 1];
    if (last?.name === "ExpressionStatement" && last.firstChild) {
      const expr = last.firstChild;
      edits.push({ from: last.from, to: expr.from, text: "return (" });
      edits.push({ from: expr.to, to: expr.to, text: ")" });
    }
  }

  // Apply edits back-to-front; stable for inserts at the same position.
  const ordered = edits.map((e, i) => ({ ...e, i })).sort((a, b) => b.from - a.from || b.to - a.to || b.i - a.i);
  let out = src;
  for (const e of ordered) out = out.slice(0, e.from) + e.text + out.slice(e.to);

  if (!isAsync) return { code: out, isAsync: false, declare: [] };
  const exportFns = hoisted.map((n) => `globalThis[${JSON.stringify(n)}] = ${n};`).join(" ");
  return {
    code: `(async () => {${exportFns ? ` ${exportFns}` : ""} ${out}\n})()`,
    isAsync: true,
    declare: [...new Set(declare)].filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)),
  };
}

/** 1-based position of the first parse error, for SyntaxErrors the engine reports without one. */
export function syntaxErrorPosition(src: string): { line: number; column: number } | null {
  let pos = -1;
  parser.parse(src).iterate({
    enter(n: SyntaxNodeRef) {
      if (pos >= 0) return false;
      if (n.type.isError) pos = n.from;
      return undefined;
    },
  });
  if (pos < 0) return null;
  const before = src.slice(0, pos).split("\n");
  return { line: before.length, column: before[before.length - 1].length + 1 };
}

// A tiny, safe math expression evaluator for lesson widgets (sliders and live
// graphs): numbers, + - * / ^, parentheses, variables and a few functions.
// No eval: expressions come from AI and other clients.

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const isFunc = (name: string) => Object.hasOwn(FUNCS, name);
const isConst = (name: string) => Object.hasOwn(CONSTS, name);

function tokenize(src: string): string[] {
  const out: string[] = [];
  const re = /\s*(\d+\.?\d*(?:e[-+]?\d+)?|\.\d+|[a-z_][a-z0-9_]*|\*\*|[-+*/^(),])/giy;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(src))) {
    out.push(m[1]);
    last = re.lastIndex;
  }
  if (src.slice(last).trim()) throw new Error(`Can't read "${src.slice(last).trim()}"`);
  return out.map((t) => (t === "**" ? "^" : t));
}

function parse(src: string): Node {
  const t = tokenize(src);
  let i = 0;
  const peek = () => t[i];
  const take = (s?: string) => {
    const v = t[i++];
    if (s && v !== s) throw new Error(`Expected "${s}"`);
    return v;
  };
  // expr := term (("+"|"-") term)*
  const expr = (): Node => {
    let a = term();
    while (peek() === "+" || peek() === "-") a = { k: "bin", op: take(), a, b: term() };
    return a;
  };
  // term := unary (("*"|"/") unary | implicit)*
  const term = (): Node => {
    let a = unary();
    for (;;) {
      if (peek() === "*" || peek() === "/") a = { k: "bin", op: take(), a, b: unary() };
      else if (peek() !== undefined && (peek() === "(" || /^[a-z_\d.]/i.test(peek()!))) a = { k: "bin", op: "*", a, b: unary() };
      else return a;
    }
  };
  const unary = (): Node => {
    if (peek() === "-") {
      take();
      return { k: "neg", a: unary() };
    }
    if (peek() === "+") take();
    return power();
  };
  // power := atom ("^" unary)?  (right-associative)
  const power = (): Node => {
    const a = atom();
    if (peek() === "^") {
      take();
      return { k: "bin", op: "^", a, b: unary() };
    }
    return a;
  };
  const atom = (): Node => {
    const tok = take();
    if (tok === undefined) throw new Error("Unexpected end");
    if (tok === "(") {
      const e = expr();
      take(")");
      return e;
    }
    if (/^[\d.]/.test(tok)) return { k: "num", v: Number(tok) };
    if (/^[a-z_]/i.test(tok)) {
      const name = tok.toLowerCase();
      if (peek() === "(" && isFunc(name)) {
        take("(");
        const args: Node[] = [];
        if (peek() !== ")") {
          args.push(expr());
          while (peek() === ",") {
            take();
            args.push(expr());
          }
        }
        take(")");
        return { k: "call", fn: name, args };
      }
      return { k: "var", name };
    }
    throw new Error(`Unexpected "${tok}"`);
  };
  const out = expr();
  if (i < t.length) throw new Error(`Unexpected "${t[i]}"`);
  return out;
}

function evaluate(n: Node, vars: Record<string, number>): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var":
      if (Object.hasOwn(vars, n.name)) return vars[n.name];
      if (isConst(n.name)) return CONSTS[n.name];
      throw new Error(`Unknown name "${n.name}"`);
    case "neg":
      return -evaluate(n.a, vars);
    case "call":
      return FUNCS[n.fn](...n.args.map((a) => evaluate(a, vars)));
    case "bin": {
      const a = evaluate(n.a, vars);
      const b = evaluate(n.b, vars);
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : Math.pow(a, b);
    }
  }
}

const cache = new Map<string, Node | Error>();

/** Compile an expression once; the result evaluates it (NaN on any error). */
export function compile(src: string): (vars: Record<string, number>) => number {
  let node = cache.get(src);
  if (!node) {
    try {
      node = parse(src);
    } catch (e) {
      node = e instanceof Error ? e : new Error(String(e));
    }
    if (cache.size > 200) cache.clear();
    cache.set(src, node);
  }
  const n = node;
  return (vars) => {
    if (n instanceof Error) return NaN;
    try {
      const v = evaluate(n, vars);
      return Number.isFinite(v) ? v : NaN;
    } catch {
      return NaN;
    }
  };
}

/** Whether an expression parses and only uses the given variables. */
export function validExpr(src: string, vars: string[]): boolean {
  try {
    const n = parse(src);
    const ok = (x: Node): boolean =>
      x.k === "num" ||
      (x.k === "var" && (vars.includes(x.name) || isConst(x.name))) ||
      (x.k === "neg" && ok(x.a)) ||
      (x.k === "bin" && ok(x.a) && ok(x.b)) ||
      (x.k === "call" && x.args.every(ok));
    return ok(n);
  } catch {
    return false;
  }
}

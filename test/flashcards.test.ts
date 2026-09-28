import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  cardToLine,
  collectCards,
  findClozes,
  findSeparator,
  fragmentToCardSource,
  parseFlashcards,
  renderCloze,
  shortHash,
} from "../shared/flashcards.ts";
import { createPage, trashPage, getPage } from "../shared/model.ts";

const P = "page1";

test("basic and bidirectional cards", () => {
  const cards = parseFlashcards("Capital of France :: Paris\nHello ::: Bonjour\nJust a sentence.", P);
  assert.equal(cards.length, 3);
  assert.deepEqual(
    cards.map((c) => [c.kind, c.front, c.back, c.line]),
    [
      ["basic", "Capital of France", "Paris", 0],
      ["basic", "Hello", "Bonjour", 1],
      ["reverse", "Bonjour", "Hello", 1],
    ],
  );
  for (const c of cards) assert.equal(c.pageId, P);
});

test("separator heuristics avoid code-like text", () => {
  assert.equal(parseFlashcards("Use std::vector for arrays", P).length, 0);
  assert.equal(parseFlashcards("In C++ `a :: b` is scope", P).length, 0);
  assert.equal(parseFlashcards("Term::Definition", P).length, 0, "both sides word chars");
  assert.equal(parseFlashcards("Term:: Definition", P).length, 1);
  assert.equal(parseFlashcards(":: nothing in front", P).length, 0);
  assert.equal(parseFlashcards("dangling ::", P).length, 0);
  assert.equal(parseFlashcards("a :::: b", P).length, 0);
  const math = parseFlashcards("$a::b$ in math, but this :: counts", P);
  assert.equal(math.length, 1);
  assert.equal(math[0].front, "$a::b$ in math, but this");
  assert.deepEqual(findSeparator("x ::: y"), { index: 2, length: 3 });
});

test("list markers are stripped from single-line cards", () => {
  const cards = parseFlashcards("- item :: one\n  1. nested :: two\n- [ ] task :: three\n> quote :: four", P);
  assert.deepEqual(
    cards.map((c) => c.front),
    ["item", "nested", "task", "quote"],
  );
});

test("Anki cloze: one card per number, hints, and plain {{ }} groups", () => {
  const cards = parseFlashcards("The {{c1::mitochondria}} is the {{c2::powerhouse::a building}} of the {{c1::cell}}", P);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].kind, "cloze");
  assert.equal(cards[0].clozeIndex, 1);
  assert.equal(cards[0].back, "mitochondria, cell");
  assert.equal(cards[1].clozeIndex, 2);
  assert.equal(cards[1].back, "powerhouse");

  const plain = parseFlashcards("{{Paris}} is the capital of {{France}}", P);
  assert.deepEqual(
    plain.map((c) => [c.clozeIndex, c.back]),
    [
      [1, "Paris"],
      [2, "France"],
    ],
  );
  const mixed = findClozes("{{c2::a}} {{b}} {{c1::c}}");
  assert.deepEqual(
    mixed.map((c) => c.index),
    [2, 3, 1],
  );
  assert.equal(parseFlashcards("Vue shows {{ message }} here", P).length, 0, "template syntax is not a cloze");
  assert.equal(parseFlashcards("`{{c1::code}}` stays code", P).length, 0);
  // Clozes win over :: inside the braces.
  assert.equal(parseFlashcards("{{c1::a::hint}} and more", P)[0].kind, "cloze");
});

test("cloze with LaTeX braces", () => {
  const [card] = parseFlashcards("Derivative of $x^2$ is {{c1::$\\frac{d}{dx}x^2 = 2x$}}", P);
  assert.equal(card.back, "$\\frac{d}{dx}x^2 = 2x$");
  const [c2] = parseFlashcards("Fraction {{c1::\\frac{a}{b}}}", P);
  assert.equal(c2.back, "\\frac{a}{b}");
});

test("renderCloze hides the active cloze only", () => {
  const front = "The {{c1::mitochondria}} is the {{c2::powerhouse::a building}}";
  assert.equal(renderCloze(front, 1, false), "The \\[…\\] is the powerhouse");
  assert.equal(renderCloze(front, 1, true), "The **mitochondria** is the powerhouse");
  assert.equal(renderCloze(front, 2, false), "The mitochondria is the \\[a building\\]");
  assert.equal(
    renderCloze(front, 2, true, { format: "html" }),
    'The mitochondria is the <mark class="cloze-answer">powerhouse</mark>',
  );
  assert.equal(renderCloze(front, 1, false, { format: "html" }), 'The <span class="cloze-blank">[…]</span> is the powerhouse');
});

test("multi-line cards with ? and ??", () => {
  const text = [
    "# Biology",
    "Some intro prose.",
    "",
    "What are the two stages",
    "of photosynthesis?",
    "?",
    "- Light-dependent reactions",
    "- Calvin cycle",
    "",
    "## Words",
    "Chlorophyll",
    "??",
    "Green pigment",
    "After :: card",
  ].join("\n");
  const cards = parseFlashcards(text, P);
  assert.equal(cards.length, 4);
  assert.equal(cards[0].front, "What are the two stages\nof photosynthesis?");
  assert.equal(cards[0].back, "- Light-dependent reactions\n- Calvin cycle");
  assert.equal(cards[0].line, 3);
  assert.equal(cards[0].context, "Biology");
  assert.deepEqual(
    cards.slice(1).map((c) => [c.kind, c.front, c.back, c.context]),
    [
      ["basic", "Chlorophyll", "Green pigment", "Words"],
      ["reverse", "Green pigment", "Chlorophyll", "Words"],
      ["basic", "After", "card", "Words"],
    ],
  );
  // No question or no answer -> nothing.
  assert.equal(parseFlashcards("?\nanswer", P).length, 0);
  assert.equal(parseFlashcards("question\n?", P).length, 0);
});

test("code fences and very long lines are ignored", () => {
  const text = ["```", "foo :: bar", "```", "x".repeat(1001) + " :: y", "ok :: yes"].join("\n");
  const cards = parseFlashcards(text, P);
  assert.deepEqual(
    cards.map((c) => c.front),
    ["ok"],
  );
});

test("ids are stable across answer and formatting edits, distinct otherwise", () => {
  const [a] = parseFlashcards("Capital of France :: Paris", P);
  const [b] = parseFlashcards("  capital   of **France** :: Paris, obviously", P);
  const [c] = parseFlashcards("Capital of Spain :: Madrid", P);
  const [d] = parseFlashcards("Capital of France :: Paris", "other-page");
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.notEqual(a.id, d.id);
  const [fwd, rev] = parseFlashcards("Capital of France ::: Paris", P);
  assert.equal(fwd.id, a.id, "switching :: to ::: keeps the forward card's history");
  assert.notEqual(rev.id, fwd.id);
  const cl = parseFlashcards("{{a}} {{b}}", P);
  assert.notEqual(cl[0].id, cl[1].id);
  // cloze ids survive edits of the hidden text, not of the surrounding sentence
  const [z1] = parseFlashcards("The capital of France is {{c1::Paris}}", P);
  const [z2] = parseFlashcards("The capital of France is {{c1::Paris, on the Seine::city}}", P);
  const [z3] = parseFlashcards("The capital of Italy is {{c1::Rome}}", P);
  assert.equal(z1.id, z2.id);
  assert.notEqual(z1.id, z3.id);
  // the same question twice (e.g. under different headings) stays two cards; exact duplicates collapse
  const twice = parseFlashcards("# France\nCapital :: Paris\n# Spain\nCapital :: Madrid", P);
  assert.equal(twice.length, 2);
  assert.notEqual(twice[0].id, twice[1].id);
  assert.equal(parseFlashcards("{{Paris}}\n{{Rome}}", P).length, 2);
  assert.equal(parseFlashcards("x :: 1\nx :: 1", P).length, 1);
  assert.match(a.id, /^[0-9a-z]{10}$/);
  assert.equal(shortHash("hello"), shortHash("hello"));
  assert.notEqual(shortHash("hello"), shortHash("hellp"));
});

test("fragmentToCardSource keeps structure the parser needs", () => {
  const doc = new Y.Doc();
  const frag = doc.getXmlFragment("c");
  const block = (type: string, text: string | null, attrs: Record<string, string> = {}) => {
    const container = new Y.XmlElement("blockContainer");
    const el = new Y.XmlElement(type);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== null) {
      const t = new Y.XmlText();
      el.insert(0, [t]);
      return { container, el, t, text };
    }
    return { container, el, t: null, text };
  };
  const group = new Y.XmlElement("blockGroup");
  frag.insert(0, [group]);
  const items = [
    block("heading", "Chemistry", { level: "2" }),
    block("paragraph", "Water is H2O"),
    block("paragraph", null),
    block("paragraph", "What is ice?"),
    block("paragraph", "?"),
    block("bulletListItem", "Solid water"),
    block("codeBlock", "a :: b\nc :: d"),
    block("paragraph", "Formula :: "),
  ];
  group.insert(
    0,
    items.map((i) => i.container),
  );
  for (const i of items) {
    i.container.insert(0, [i.el]);
    if (i.t) i.t.insert(0, i.text!);
  }
  // bold formatting + inline math + page link on the last paragraph
  const last = items[items.length - 1].t!;
  last.insert(last.length, "H", { bold: {} });
  const math = new Y.XmlElement("inlineMath");
  math.setAttribute("latex", "_2O");
  items[items.length - 1].el.insert(1, [math]);

  const src = fragmentToCardSource(frag);
  assert.equal(
    src,
    ["## Chemistry", "Water is H2O", "", "What is ice?", "?", "- Solid water", "```", "a :: b", "c :: d", "```", "Formula :: **H**$_2O$"].join(
      "\n",
    ),
  );
  const cards = parseFlashcards(src, P);
  assert.deepEqual(
    cards.map((c) => [c.front, c.back, c.context]),
    [
      ["What is ice?", "- Solid water", "Chemistry"],
      ["Formula", "**H**$_2O$", "Chemistry"],
    ],
  );
});

test("collectCards skips trashed pages", () => {
  const doc = new Y.Doc();
  const a = createPage(doc, { title: "A" });
  const b = createPage(doc, { title: "B" });
  const put = (id: string, lines: string[]) => {
    const frag = getPage(doc, id)!.get("content") as Y.XmlFragment;
    const group = new Y.XmlElement("blockGroup");
    frag.insert(0, [group]);
    for (const line of lines) {
      const c = new Y.XmlElement("blockContainer");
      const p = new Y.XmlElement("paragraph");
      const t = new Y.XmlText();
      group.insert(group.length, [c]);
      c.insert(0, [p]);
      p.insert(0, [t]);
      t.insert(0, line);
    }
  };
  put(a, ["One :: 1", "Two ::: 2"]);
  put(b, ["The {{c1::sun}} is a star"]);
  assert.equal(collectCards(doc).length, 4);
  trashPage(doc, b);
  const cards = collectCards(doc);
  assert.equal(cards.length, 3);
  assert.ok(cards.every((c) => c.pageId === a));
});

test("cardToLine produces parseable note syntax", () => {
  const line = cardToLine("What is\nC++ scope op :: ?", "The {{scope}} operator");
  const cards = parseFlashcards(line, P);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].kind, "basic");
  assert.equal(cards[0].front, "What is C++ scope op : ?");
  const cloze = parseFlashcards(cardToLine("The {{c1::sun}} is a star", ""), P);
  assert.equal(cloze[0].kind, "cloze");
});

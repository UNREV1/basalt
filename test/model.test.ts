import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  buildLinkGraph,
  createPage,
  deletePageForever,
  descendants,
  ensureDefaults,
  getPage,
  listPages,
  movePage,
  openDailyNote,
  restorePage,
  trashPage,
  PAGE_LINK_NODE,
} from "../shared/model.ts";
import { linkifyBlocks, mathifyBlocks, unlinkBlocks, unmathBlocks } from "../shared/markdown.ts";

test("pages: create, nest, move, trash and restore subtrees", () => {
  const doc = new Y.Doc();
  ensureDefaults(doc, "Test");
  const a = createPage(doc, { title: "A" });
  const b = createPage(doc, { title: "B", parentId: a });
  const c = createPage(doc, { title: "C", parentId: b, kind: "board" });
  assert.deepEqual(descendants(doc, a).sort(), [b, c].sort());
  assert.ok(getPage(doc, c)!.get("elements") instanceof Y.Map, "board containers exist");

  // Can't move a page into its own descendant.
  movePage(doc, a, c);
  assert.equal(getPage(doc, a)!.get("parentId"), null);

  trashPage(doc, b);
  assert.deepEqual(listPages(doc).map((p) => p.title), ["A"]);
  restorePage(doc, b);
  assert.equal(listPages(doc).length, 3);

  deletePageForever(doc, a);
  assert.equal(listPages(doc, { includeDeleted: true }).length, 0);
});

test("daily note is created once per day under Journal", () => {
  const doc = new Y.Doc();
  const first = openDailyNote(doc);
  const second = openDailyNote(doc);
  assert.equal(first, second);
  const journal = getPage(doc, getPage(doc, first)!.get("parentId"))!;
  assert.equal(journal.get("system"), "journal");
});

test("link graph reads pageLink nodes from rich text", () => {
  const doc = new Y.Doc();
  const a = createPage(doc, { title: "A" });
  const b = createPage(doc, { title: "B" });
  const frag = getPage(doc, a)!.get("content") as Y.XmlFragment;
  const group = new Y.XmlElement("blockGroup");
  const container = new Y.XmlElement("blockContainer");
  const para = new Y.XmlElement("paragraph");
  const link = new Y.XmlElement(PAGE_LINK_NODE);
  link.setAttribute("pageId", b);
  para.insert(0, [new Y.XmlText("see "), link]);
  container.insert(0, [para]);
  group.insert(0, [container]);
  frag.insert(0, [group]);
  const g = buildLinkGraph(doc);
  assert.deepEqual(g.outgoing.get(a), [b]);
  assert.deepEqual(g.incoming.get(b), [a]);
});

test("markdown helpers: wikilinks and math round-trip at the block level", () => {
  const blocks = [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Read [[Alpha]] and [[Missing|alias]] with $x^2$ costing $5", styles: {} }],
      children: [],
    },
    { type: "paragraph", content: [{ type: "text", text: "$$\\int f$$", styles: {} }], children: [] },
  ];
  const linked = mathifyBlocks(linkifyBlocks(blocks, (t) => (t === "Alpha" ? { id: "id1", title: "Alpha" } : null)));
  const inline = linked[0].content as { type: string }[];
  assert.deepEqual(
    inline.map((i) => i.type),
    ["text", "pageLink", "text", "inlineMath", "text"],
  );
  assert.equal(linked[1].type, "math");
  const back = unlinkBlocks(unmathBlocks(linked), () => "Alpha");
  const text = (back[0].content as { text: string }[]).map((i) => i.text).join("");
  assert.equal(text, "Read [[Alpha]] and [[Missing|alias]] with $x^2$ costing $5");
});

test("code blocks are left literal by link/math conversion", () => {
  const blocks = [{ type: "codeBlock", content: [{ type: "text", text: "a = [[x]] + $y$", styles: {} }], children: [] }];
  const out = mathifyBlocks(linkifyBlocks(blocks, () => ({ id: "x", title: "x" })));
  assert.deepEqual(out[0].content, blocks[0].content);
});

test("LaTeX survives markdown parsing and export", async () => {
  const { protectMath, restoreMath } = await import("../shared/markdown.ts");
  const { ServerBlockNoteEditor } = await import("@blocknote/server-util");
  const { headlessSchema } = await import("../shared/schema.ts");
  const editor = ServerBlockNoteEditor.create({ schema: headlessSchema });
  const md = "Sum $x_i + y_i$ and set $\\{a, b\\}$.\n\n$$\n\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}\n$$\n\n`$not_math$`";
  const blocks = mathifyBlocks(linkifyBlocks((await editor.tryParseMarkdownToBlocks(protectMath(md))) as any[], () => null));
  const inline = (blocks[0].content as { type: string; props?: { latex: string } }[]).filter((i) => i.type === "inlineMath");
  assert.deepEqual(inline.map((i) => i.props!.latex), ["x_i + y_i", "\\{a, b\\}"]);
  assert.equal(blocks[1].type, "math");
  assert.equal((blocks[1].props as { latex: string }).latex, "\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}");
  const out = restoreMath(await editor.blocksToMarkdownLossy(unmathBlocks(blocks) as any));
  assert.ok(out.includes("$x_i + y_i$"), out);
  assert.ok(out.includes("$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$"), out);
  assert.ok(out.includes("`$not_math$`"), out);
});

test("![[embeds]] become embed blocks and export back", async () => {
  const { unlinkBlocks } = await import("../shared/markdown.ts");
  const { ServerBlockNoteEditor } = await import("@blocknote/server-util");
  const { headlessSchema } = await import("../shared/schema.ts");
  const { fragmentLinks, fragmentToText } = await import("../shared/model.ts");
  const editor = ServerBlockNoteEditor.create({ schema: headlessSchema });
  const pages: Record<string, { id: string; title: string }> = { plan: { id: "p1", title: "Plan" }, board: { id: "p2", title: "Board" } };
  const resolve = (t: string) => pages[t.toLowerCase()] ?? null;
  const md = "Intro\n\n![[Board]]\n\nSee ![[Plan]] inline.\n\n![[Nowhere]]";
  const blocks = linkifyBlocks((await editor.tryParseMarkdownToBlocks(md)) as any[], resolve);
  assert.equal(blocks[1].type, "embed");
  assert.equal((blocks[1].props as { pageId: string }).pageId, "p2");
  const inline = blocks[2].content as { type: string; text?: string; props?: { pageId: string } }[];
  assert.deepEqual(inline.map((i) => i.type), ["text", "pageLink", "text"], "an embed inside text becomes a link");
  assert.equal(inline[0].text, "See ");
  assert.equal(blocks[3].type, "paragraph", "unresolved embeds stay text");

  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("f");
  doc.transact(() => editor.blocksToYXmlFragment(blocks as any, fragment));
  assert.deepEqual(fragmentLinks(fragment).sort(), ["p1", "p2"], "embeds count as links");
  assert.ok(fragmentToText(fragment, (id) => (id === "p2" ? "Board" : id)).includes("![[Board]]"));

  const titleOf = (id: string) => Object.values(pages).find((p) => p.id === id)?.title;
  const out = await editor.blocksToMarkdownLossy(unlinkBlocks(blocks, titleOf) as any);
  assert.ok(out.includes("![[Board]]") || out.includes("!\\[\\[Board\\]\\]"), out);
});

test("legacy paint pages become canvases, keeping their painting", async () => {
  const { migrateToCanvas, CREATABLE_KINDS } = await import("../shared/model.ts");
  const doc = new Y.Doc();
  ensureDefaults(doc, "Canvas test");
  const id = createPage(doc, { title: "Old painting", kind: "paint" });
  const page = getPage(doc, id)!;
  page.get("strokes").set("s1", { id: "s1", layerId: "l1", z: 1, kind: "brush", points: [0, 0, 0.5] });
  migrateToCanvas(page);
  assert.equal(page.get("kind"), "board");
  assert.ok(page.get("elements") instanceof Y.Map);
  assert.ok(page.get("files") instanceof Y.Map);
  assert.equal(page.get("strokes").size, 1);
  assert.ok(page.get("paintMeta") instanceof Y.Map, "paper settings kept");
  migrateToCanvas(page); // idempotent
  assert.equal(page.get("kind"), "board");
  assert.ok(!CREATABLE_KINDS.some((k) => k.kind === "paint"), "paint is no longer offered for new pages");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  PAGE_LINK_NODE,
  childrenOf,
  createFromTemplate,
  createPage,
  duplicatePage,
  ensureSystemPage,
  fragmentLinks,
  getPage,
  getPageStyle,
  isPageLocked,
  isTemplatePage,
  listPages,
  listTemplates,
  sanitizePageStyle,
  saveAsTemplate,
  setPageStyle,
  setProp,
} from "../shared/model.ts";

/** Append a paragraph "<text> [[link]]" to a page's BlockNote fragment. */
function writeParagraph(doc: Y.Doc, pageId: string, text: string, linkTo?: string) {
  const frag = getPage(doc, pageId)!.get("content") as Y.XmlFragment;
  doc.transact(() => {
    let group = frag.get(0) as Y.XmlElement | undefined;
    if (!group) {
      group = new Y.XmlElement("blockGroup");
      frag.insert(0, [group]);
    }
    const container = new Y.XmlElement("blockContainer");
    container.setAttribute("id", Math.random().toString(36).slice(2));
    const para = new Y.XmlElement("heading");
    para.setAttribute("level", 2 as never);
    const t = new Y.XmlText();
    t.insert(0, text, { bold: true });
    const children: (Y.XmlText | Y.XmlElement)[] = [t];
    if (linkTo) {
      const link = new Y.XmlElement(PAGE_LINK_NODE);
      link.setAttribute("pageId", linkTo);
      children.push(link);
    }
    para.insert(0, children);
    container.insert(0, [para]);
    group.insert(group.length, [container]);
  });
}

test("page style: merge, remove and sanitize", () => {
  const doc = new Y.Doc();
  const id = createPage(doc, { title: "Styled" });
  assert.deepEqual(getPageStyle(getPage(doc, id)), {});

  setPageStyle(doc, id, { font: "serif", width: "wide", cover: { type: "gradient", value: "dawn" }, coverY: 30 });
  setPageStyle(doc, id, { smallText: true, accent: "#3366ff" });
  assert.deepEqual(getPageStyle(getPage(doc, id)), {
    font: "serif",
    width: "wide",
    cover: { type: "gradient", value: "dawn" },
    coverY: 30,
    smallText: true,
    accent: "#3366ff",
  });

  // null / false / "" remove keys; an empty style removes the key entirely.
  setPageStyle(doc, id, { smallText: false, accent: null, width: undefined, font: "" as never });
  assert.deepEqual(getPageStyle(getPage(doc, id)), { cover: { type: "gradient", value: "dawn" }, coverY: 30 });
  setPageStyle(doc, id, { cover: null, coverY: null });
  assert.equal(getPage(doc, id)!.has("style"), false);

  // Hostile values from a peer are dropped rather than rendered.
  const dirty = sanitizePageStyle({
    font: "comic",
    accent: "red; background: url(x)",
    tint: "sage",
    coverY: 250,
    cover: { type: "gradient", value: "linear-gradient(red, blue)" },
    iconImage: "javascript:alert(1)",
    locked: "yes",
    hideToc: true,
  });
  assert.deepEqual(dirty, { tint: "sage", coverY: 100, hideToc: true });
  assert.deepEqual(sanitizePageStyle({ cover: { type: "image", value: "https://example.com/a.jpg" } }).cover, {
    type: "image",
    value: "https://example.com/a.jpg",
  });

  setPageStyle(doc, id, { locked: true });
  assert.equal(isPageLocked(getPage(doc, id)), true);
});

test("page style syncs between replicas", () => {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on("update", (u: Uint8Array) => Y.applyUpdate(b, u));
  b.on("update", (u: Uint8Array) => Y.applyUpdate(a, u));
  const id = createPage(a, { title: "Shared" });
  setPageStyle(a, id, { tint: "sky", hideBacklinks: true });
  assert.deepEqual(getPageStyle(getPage(b, id)), { tint: "sky", hideBacklinks: true });
  setPageStyle(b, id, { locked: true });
  assert.equal(isPageLocked(getPage(a, id)), true);
});

test("duplicatePage deep-clones content, props, style and kind containers", () => {
  const doc = new Y.Doc();
  const parent = createPage(doc, { title: "Parent" });
  const src = createPage(doc, { title: "Notes", parentId: parent, icon: "🧪", typeId: "note" });
  const after = createPage(doc, { title: "After", parentId: parent });
  writeParagraph(doc, src, "Hello");
  setProp(doc, src, "source", "https://example.com");
  setPageStyle(doc, src, { font: "mono", cover: { type: "color", value: "sage" } });
  getPage(doc, src)!.set("favorite", true);

  const copy = duplicatePage(doc, src)!;
  assert.ok(copy && copy !== src);
  const c = getPage(doc, copy)!;
  assert.equal(c.get("id"), copy);
  assert.equal(c.get("title"), "Copy of Notes");
  assert.equal(c.get("parentId"), parent);
  assert.equal(c.get("icon"), "🧪");
  assert.equal(c.get("typeId"), "note");
  assert.equal(c.get("favorite"), false);
  assert.deepEqual(getPageStyle(c), getPageStyle(getPage(doc, src)));
  assert.equal((c.get("props") as Y.Map<unknown>).get("source"), "https://example.com");

  // Sits between the original and its next sibling.
  const order = childrenOf(listPages(doc), parent).map((p) => p.id);
  assert.deepEqual(order, [src, copy, after]);

  // Rich text (attributes + formatting) is copied, and the copy is independent.
  const srcFrag = getPage(doc, src)!.get("content") as Y.XmlFragment;
  const copyFrag = c.get("content") as Y.XmlFragment;
  assert.notEqual(copyFrag, srcFrag);
  assert.equal(copyFrag.toString(), srcFrag.toString());
  assert.match(copyFrag.toString(), /level="2"/);
  assert.match(copyFrag.toString(), /<bold>Hello<\/bold>/);
  writeParagraph(doc, copy, "Only in the copy");
  assert.doesNotMatch(srcFrag.toString(), /Only in the copy/);
  setProp(doc, copy, "source", "changed");
  assert.equal((getPage(doc, src)!.get("props") as Y.Map<unknown>).get("source"), "https://example.com");

  // Kind containers: notebook cells with nested Y.Text, board elements.
  const nb = createPage(doc, { kind: "notebook", title: "NB" });
  const cell = new Y.Map<unknown>();
  const source = new Y.Text("print(1)");
  cell.set("id", "c1");
  cell.set("source", source);
  (getPage(doc, nb)!.get("cells") as Y.Array<Y.Map<unknown>>).push([cell]);
  const nbCopy = getPage(doc, duplicatePage(doc, nb)!)!;
  const copiedCell = (nbCopy.get("cells") as Y.Array<Y.Map<unknown>>).get(0);
  assert.equal((copiedCell.get("source") as Y.Text).toString(), "print(1)");
  (copiedCell.get("source") as Y.Text).insert(0, "# ");
  assert.equal(source.toString(), "print(1)");

  const board = createPage(doc, { kind: "board", title: "B" });
  (getPage(doc, board)!.get("elements") as Y.Map<unknown>).set("e1", { id: "e1", type: "rectangle" });
  const boardCopy = getPage(doc, duplicatePage(doc, board, { title: "Board 2" })!)!;
  assert.equal(boardCopy.get("title"), "Board 2");
  assert.deepEqual((boardCopy.get("elements") as Y.Map<unknown>).toJSON(), { e1: { id: "e1", type: "rectangle" } });

  // System markers are not copied (no second Journal).
  const journal = ensureSystemPage(doc, "journal", { title: "Journal", icon: "📅" });
  const jCopy = duplicatePage(doc, journal)!;
  assert.equal(getPage(doc, jCopy)!.get("system"), undefined);

  assert.equal(duplicatePage(doc, "missing"), null);
});

test("duplicatePage with sub-pages re-points links at the copies", () => {
  const doc = new Y.Doc();
  const root = createPage(doc, { title: "Project" });
  const child = createPage(doc, { title: "Tasks", parentId: root });
  const grandchild = createPage(doc, { title: "Done", parentId: child });
  const outside = createPage(doc, { title: "Elsewhere" });
  const trashed = createPage(doc, { title: "Old", parentId: root });
  getPage(doc, trashed)!.set("deletedAt", Date.now());
  writeParagraph(doc, root, "See", child);
  writeParagraph(doc, root, "Also", outside);
  setProp(doc, child, "related", [grandchild, outside]);

  const shallow = duplicatePage(doc, root)!;
  assert.equal(childrenOf(listPages(doc), shallow).length, 0);

  const deep = duplicatePage(doc, root, { includeChildren: true, parentId: null, title: "Project v2" })!;
  const kids = childrenOf(listPages(doc), deep);
  assert.deepEqual(kids.map((k) => k.title), ["Tasks"], "trashed sub-pages are skipped");
  const newChild = kids[0].id;
  assert.notEqual(newChild, child);
  const newGrand = childrenOf(listPages(doc), newChild);
  assert.deepEqual(newGrand.map((k) => k.title), ["Done"]);

  const links = fragmentLinks(getPage(doc, deep)!.get("content") as Y.XmlFragment);
  assert.deepEqual(links.sort(), [newChild, outside].sort());
  // The original still points at its own child.
  assert.deepEqual(fragmentLinks(getPage(doc, root)!.get("content") as Y.XmlFragment).sort(), [child, outside].sort());
  assert.deepEqual((getPage(doc, newChild)!.get("props") as Y.Map<unknown>).get("related"), [newGrand[0].id, outside]);
});

test("templates: save, list and instantiate", () => {
  const doc = new Y.Doc();
  assert.deepEqual(listTemplates(doc), []);
  const page = createPage(doc, { title: "Meeting", icon: "🤝" });
  const sub = createPage(doc, { title: "Agenda", parentId: page });
  writeParagraph(doc, page, "Attendees", sub);
  setPageStyle(doc, page, { cover: { type: "gradient", value: "sea" } });

  const tpl = saveAsTemplate(doc, page, "Ada")!;
  assert.ok(isTemplatePage(doc, tpl));
  assert.ok(!isTemplatePage(doc, page));
  assert.deepEqual(listTemplates(doc).map((t) => t.title), ["Meeting"]);
  const templatesRoot = getPage(doc, tpl)!.get("parentId");
  assert.equal(getPage(doc, templatesRoot)!.get("system"), "templates");
  // Saving again reuses the same Templates page.
  saveAsTemplate(doc, page);
  assert.equal(listTemplates(doc).length, 2);
  assert.equal(listPages(doc).filter((p) => p.system === "templates").length, 1);

  const target = createPage(doc, { title: "Team" });
  const fresh = createFromTemplate(doc, tpl, { parentId: target, createdBy: "Bo" })!;
  const meta = getPage(doc, fresh)!;
  assert.equal(meta.get("title"), "");
  assert.equal(meta.get("icon"), "🤝");
  assert.equal(meta.get("parentId"), target);
  assert.equal(meta.get("createdBy"), "Bo");
  assert.deepEqual(getPageStyle(meta).cover, { type: "gradient", value: "sea" });
  const freshKids = childrenOf(listPages(doc), fresh);
  assert.deepEqual(freshKids.map((k) => k.title), ["Agenda"]);
  assert.deepEqual(fragmentLinks(meta.get("content") as Y.XmlFragment), [freshKids[0].id]);
  assert.ok(!isTemplatePage(doc, fresh));
});

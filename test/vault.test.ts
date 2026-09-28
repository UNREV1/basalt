import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Y from "yjs";
import * as lz from "lz-string";
import {
  createPage,
  ensureDefaults,
  ensureSystemPage,
  fragmentLinks,
  getPage,
  listPages,
  pageText,
  trashPage,
  updatePage,
} from "../shared/model.ts";
import { initCourse, setCurriculum, setProgress } from "../shared/course.ts";
import {
  VaultExporter,
  applyProps,
  coerceProps,
  importVault,
  parseYaml,
  splitFrontmatter,
  toYaml,
  writePageMarkdown,
} from "../shared/vault.ts";
import { parseExcalidrawFile, readSceneFromBoard, withValidIndices, writeSceneToBoard } from "../shared/excalidraw-md.ts";
import { nodeConverter } from "../mcp/convert.ts";
import { readVaultDir, writeVault } from "../mcp/vault-cli.ts";

const conv = nodeConverter();
const LZ: typeof lz = (lz as unknown as { default?: typeof lz }).default ?? lz;
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function tmpDir(name: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `basalt-${name}-`));
}

function rect(id: string, extra: Record<string, unknown> = {}): Record<string, any> {
  return { id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: false, version: 1, ...extra };
}

test("frontmatter YAML round-trips Obsidian-style properties", () => {
  const data = { id: "abc123", icon: "✅", created: "2026-09-28T05:51:00.000Z", tags: ["ml", "papers"], Rating: 4, Done: true, title: "A: tricky # title" };
  const text = `---\n${toYaml(data)}\n---\nBody text`;
  const { data: back, body } = splitFrontmatter(text);
  assert.deepEqual(back, data);
  assert.equal(body, "Body text");
  assert.deepEqual(parseYaml("tags: [a, 'b c', \"d\"]\naliases:\n  - One\n  - Two\nnote: |\n  line 1\n  line 2\nempty:"), {
    tags: ["a", "b c", "d"],
    aliases: ["One", "Two"],
    note: "line 1\nline 2",
    empty: null,
  });
});

test("excalidraw files: plain JSON, Obsidian compressed-json and json blocks", () => {
  const scene = { type: "excalidraw", version: 2, elements: [rect("r1", { index: "a0" }), rect("r2", { index: "a1", isDeleted: true })], files: {} };
  assert.equal(parseExcalidrawFile("x.excalidraw", JSON.stringify(scene))!.elements.length, 2);
  const compressed = LZ.compressToBase64(JSON.stringify(scene)).replace(/(.{64})/g, "$1\n\n");
  const md = `---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n## Text Elements\n## Embedded Files\nabc1234567: [[pic one.png]]\n\n%%\n## Drawing\n\`\`\`compressed-json\n${compressed}\n\`\`\`\n%%`;
  const parsed = parseExcalidrawFile("Plan.excalidraw.md", md)!;
  assert.equal(parsed.elements.length, 2);
  assert.deepEqual(parsed.embedded, { abc1234567: "pic one.png" });
  const plain = parseExcalidrawFile("Plan.excalidraw.md", `# Excalidraw Data\n## Drawing\n\`\`\`json\n${JSON.stringify(scene)}\n\`\`\``)!;
  assert.equal(plain.elements[0].id, "r1");
  assert.equal(parseExcalidrawFile("note.md", "# Just a note\n```json\n{}\n```"), null);

  // Missing or out-of-order indices are regenerated in z-order.
  const fixed = withValidIndices([rect("a"), rect("b", { index: "a5" }), rect("c", { index: "a1" })]);
  assert.deepEqual(
    fixed.map((e) => e.index),
    ["a0", "a1", "a2"],
  );
  const doc = new Y.Doc();
  const board = createPage(doc, { kind: "board", title: "B" });
  writeSceneToBoard(getPage(doc, board)!, { elements: scene.elements, files: { f1: { id: "f1", mimeType: "image/png", dataURL: PNG, created: 1 } } });
  const back = readSceneFromBoard(getPage(doc, board)!);
  assert.deepEqual(back.elements.map((e) => e.id), ["r1"]);
  assert.equal(back.files.f1.dataURL, PNG);
});

async function buildWorkspace() {
  const doc = new Y.Doc();
  ensureDefaults(doc, "Vault test");
  const home = createPage(doc, { title: "Home", icon: "🏠" });
  const ideas = createPage(doc, { title: "Ideas", parentId: home });
  const otherIdeas = createPage(doc, { title: "Ideas", parentId: null });
  const note = createPage(doc, { title: "Paper notes", typeId: "note", parentId: home });
  doc.transact(() => {
    applyProps(doc, getPage(doc, note)!, coerceProps(doc, "note", { Tags: ["ml", "papers"], Source: "https://arxiv.org" }, { createOptions: true }));
  });
  await writePageMarkdown(conv, doc, ideas, "Some ideas.");
  await writePageMarkdown(conv, doc, otherIdeas, "Other ideas.");
  await writePageMarkdown(
    conv,
    doc,
    home,
    `# Welcome\n\nSee [[Ideas]] and [[Paper notes]].\n\n- [ ] todo item\n\n![diagram](${PNG})\n\n$$\nE = mc^2\n$$\n\nCapital of France :: Paris\n\n\`\`\`js\nconst links = "[[not a link]]";\n\`\`\``,
  );
  const board = createPage(doc, { title: "Sketch", kind: "board" });
  writeSceneToBoard(getPage(doc, board)!, {
    elements: [rect("e1", { index: "a0" }), { ...rect("e2", { index: "a1" }), type: "image", fileId: "file1" }, { ...rect("t1", { index: "a2" }), type: "text", text: "Hello board" }],
    files: { file1: { id: "file1", mimeType: "image/png", dataURL: PNG, created: 1 } },
  });
  const nb = createPage(doc, { title: "Analysis", kind: "notebook" });
  doc.transact(() => {
    const cell = new Y.Map<any>();
    cell.set("id", "c1");
    cell.set("type", "code");
    cell.set("lang", "python");
    cell.set("source", new Y.Text("print(1 + 1)"));
    cell.set("outputs", [{ type: "text", text: "2" }]);
    (getPage(doc, nb)!.get("cells") as Y.Array<any>).push([cell]);
  });
  const course = createPage(doc, { title: "Topology", kind: "course" });
  const cp = getPage(doc, course)!;
  initCourse(cp, { topic: "Topology", goal: "Research" });
  setCurriculum(cp, {
    topic: "Topology",
    overview: "Open sets to research.",
    levels: [{ id: "l1", name: "Foundations", summary: "Basics", modules: [{ id: "m1", title: "Sets", summary: "", lessons: [{ id: "s1", title: "Open sets", objectives: ["Define open sets"] }] }] }],
  });
  const lesson = createPage(doc, { title: "Open sets", parentId: course });
  setProgress(cp, "s1", { status: "mastered", mastery: 0.9, lessonPageId: lesson, quizzes: [{ at: 1, score: 0.9 }] });
  const trashed = createPage(doc, { title: "Old stuff" });
  trashPage(doc, trashed);
  const memory = ensureSystemPage(doc, "claude-memory", { title: "Claude Memory", icon: "🧠" });
  createPage(doc, { title: "preferences", parentId: memory, typeId: "memory" });
  return { doc, home, ideas, otherIdeas, note, board, nb, course };
}

test("export writes an Obsidian vault; re-import restores pages, links, properties and boards", async () => {
  const ws = await buildWorkspace();
  const out = tmpDir("export");
  const exporter = new VaultExporter(ws.doc, conv);
  const files = await exporter.build();
  const res = writeVault(out, files, "Vault test");
  assert.equal(res.written, files.size);
  const read = (p: string) => fs.readFileSync(path.join(out, p), "utf8");

  const home = read("Home/Home.md");
  const { data: fm, body } = splitFrontmatter(home);
  assert.equal(fm.id, ws.home);
  assert.equal(fm.icon, "🏠");
  assert.match(body, /See \[\[Home\/Ideas\|Ideas\]\] and \[\[Paper notes\]\]\./, "ambiguous titles link by path");
  assert.match(body, /- \[ \] todo item/);
  assert.match(body, /!\[\[_attachments\/[\w]+\/diagram\.png\]\]/);
  assert.match(body, /\$\$E = mc\^2\$\$/);
  assert.match(body, /Capital of France :: Paris/);
  assert.match(body, /const links = "\[\[not a link\]\]";/);
  const attachment = body.match(/!\[\[(_attachments\/[^\]]+)\]\]/)![1];
  assert.ok(fs.readFileSync(path.join(out, attachment)).equals(Buffer.from(PNG.split(",")[1], "base64")));

  assert.ok(fs.existsSync(path.join(out, "Home/Ideas.md")));
  assert.ok(fs.existsSync(path.join(out, "Ideas.md")));
  const paper = splitFrontmatter(read("Home/Paper notes.md")).data;
  assert.equal(paper.type, "note");
  assert.deepEqual(paper.tags, ["ml", "papers"]);
  assert.equal(paper.Source, "https://arxiv.org");

  const sketch = JSON.parse(read("Sketch.excalidraw"));
  assert.equal(sketch.type, "excalidraw");
  assert.deepEqual(sketch.elements.map((e: { id: string }) => e.id), ["e1", "e2", "t1"]);
  assert.equal(sketch.files.file1.dataURL, PNG);

  const nb = read("Analysis.md");
  assert.match(nb, /kind: notebook/);
  assert.match(nb, /```python\nprint\(1 \+ 1\)\n```\n\n> 2/);

  const course = read("Topology/Topology.md");
  assert.match(course, /kind: course/);
  assert.match(course, /- \[x\] Open sets _\(best quiz 90%\)_ → \[\[Open sets\]\]/);
  assert.ok(fs.existsSync(path.join(out, "Topology/Open sets.md")));
  assert.ok(fs.existsSync(path.join(out, "Claude Memory/preferences.md")));
  assert.ok(!files.has("Old stuff.md"), "trashed pages are not exported");
  const claudeMd = read("CLAUDE.md");
  assert.match(claudeMd, /Claude Memory\/Claude Memory\.md/);
  assert.match(claudeMd, /\.excalidraw/);

  // Incremental rebuild: renaming a page moves its file and updates links to it.
  updatePage(ws.doc, ws.note, { title: "Reading notes" });
  exporter.invalidate([ws.note]);
  const files2 = await exporter.build();
  const res2 = writeVault(out, files2, "Vault test");
  assert.ok(res2.removed >= 1);
  assert.ok(!fs.existsSync(path.join(out, "Home/Paper notes.md")));
  assert.match(read("Home/Home.md"), /\[\[Reading notes\]\]/);

  // Round trip into a fresh workspace.
  const doc2 = new Y.Doc();
  ensureDefaults(doc2, "Copy");
  const result = await importVault(doc2, conv, readVaultDir(out), { containerTitle: "Imported" });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.boards, 1);
  const pages = listPages(doc2);
  const byTitle = (t: string) => pages.filter((p) => p.title === t);
  const home2 = byTitle("Home")[0];
  assert.equal(home2.id, ws.home, "ids from frontmatter are reused when free");
  assert.equal(home2.icon, "🏠");
  const ideas2 = byTitle("Ideas");
  assert.equal(ideas2.length, 2);
  const nested = ideas2.find((p) => p.parentId === home2.id)!;
  assert.ok(nested, "folder notes restore the hierarchy");
  const links = fragmentLinks(getPage(doc2, home2.id)!.get("content"));
  assert.ok(links.includes(nested.id), "path links resolve to the right duplicate");
  assert.ok(links.includes(byTitle("Reading notes")[0].id));
  const homeText = pageText(doc2, home2.id);
  assert.match(homeText, /Capital of France :: Paris/);
  assert.match(homeText, /\$\$E = mc\^2\$\$/);
  const blocks = conv.fragmentToBlocks(getPage(doc2, home2.id)!.get("content")) as { type: string; props?: { url?: string } }[];
  const image = blocks.find((b) => b.type === "image");
  assert.equal(image?.props?.url, PNG);
  const reading = getPage(doc2, byTitle("Reading notes")[0].id)!;
  assert.equal(reading.get("typeId"), "note");
  const tags = (reading.get("props") as Y.Map<any>).get("tags");
  assert.equal(tags.length, 2);
  const sketch2 = byTitle("Sketch")[0];
  assert.equal(sketch2.kind, "board");
  const scene2 = readSceneFromBoard(getPage(doc2, sketch2.id)!);
  assert.deepEqual(scene2.elements.map((e) => e.id), ["e1", "e2", "t1"]);
  assert.equal(scene2.files.file1.dataURL, PNG);
  fs.rmSync(out, { recursive: true, force: true });
});

// Runs only where Basalt sits inside the Obsidian vault it was built next to
// (the vault's notes are not part of the Basalt repository).
const VAULT = path.resolve(import.meta.dirname, "..", "..");
const hasVault = fs.existsSync(path.join(VAULT, "Drawing 2026-02-19 18.49.31.excalidraw.md"));

test("imports the real Obsidian vault in the repository root (Excalidraw drawing with pasted images)", { skip: !hasVault && "no Obsidian vault around this checkout" }, async () => {
  const source = VAULT;
  const copy = tmpDir("obsidian");
  for (const entry of fs.readdirSync(source)) {
    if (entry === "basalt" || entry.startsWith(".")) continue;
    fs.cpSync(path.join(source, entry), path.join(copy, entry), { recursive: true });
  }
  const doc = new Y.Doc();
  ensureDefaults(doc, "Imported");
  const files = readVaultDir(copy);
  const result = await importVault(doc, conv, files, { containerTitle: "Obsidian" });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.boards, 1);
  assert.equal(result.images, 3);
  assert.ok(result.notes >= 10);

  const pages = listPages(doc);
  const root = pages.find((p) => p.id === result.rootId)!;
  assert.equal(root.title, "Obsidian");
  const drawing = pages.find((p) => p.kind === "board")!;
  assert.equal(drawing.title, "Drawing 2026-02-19 18.49.31");
  assert.equal(drawing.parentId, root.id);
  const scene = readSceneFromBoard(getPage(doc, drawing.id)!);
  assert.equal(scene.elements.length, 124);
  const images = scene.elements.filter((e) => e.type === "image");
  assert.equal(images.length, 3);
  for (const img of images) {
    const file = scene.files[img.fileId];
    assert.ok(file, `image file ${img.fileId} imported`);
    assert.match(file.dataURL, /^data:image\/png;base64,/);
    assert.equal(file.mimeType, "image/png");
  }
  // z-order (fractional indices) is preserved.
  const indices = scene.elements.map((e) => e.index);
  assert.deepEqual([...indices].sort(), indices);
  assert.equal(indices[0], "b5I");

  // Folders become the page tree.
  const byTitle = (t: string) => pages.find((p) => p.title === t)!;
  assert.equal(byTitle("Excalidraw").parentId, root.id);
  assert.equal(byTitle("ExcalidrawStartup").parentId, byTitle("Excalidraw").id);
  assert.equal(byTitle("Scripts").parentId, byTitle("Excalidraw").id);
  assert.equal(byTitle("Downloaded").parentId, byTitle("Scripts").id);
  assert.equal(byTitle("Mindmap Builder").parentId, byTitle("Downloaded").id);
  assert.match(pageText(doc, byTitle("ExcalidrawStartup").id), /onViewUnloadHook/);
  assert.ok(result.skipped.some((s) => s.endsWith(".svg")), "unreferenced icons are reported as skipped");

  // And the imported drawing exports back as a standard .excalidraw file.
  const exported = await new VaultExporter(doc, conv).build();
  const drawingFile = [...exported.keys()].find((k) => k.endsWith("Drawing 2026-02-19 18.49.31.excalidraw"))!;
  const json = JSON.parse(exported.get(drawingFile) as string);
  assert.equal(json.elements.length, 124);
  assert.equal(Object.keys(json.files).length, 3);
  fs.rmSync(copy, { recursive: true, force: true });
});

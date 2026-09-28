import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RelayProvider } from "../shared/relay-client.ts";
import { generateKey } from "../shared/crypto.ts";
import {
  createPage,
  ensureDefaults,
  findSystemPage,
  fragmentLinks,
  getPage,
  listPages,
  pageText,
} from "../shared/model.ts";
import { getProgress } from "../shared/course.ts";
import { createBasaltMcp } from "../mcp/basalt-mcp.ts";
import { parseShareLink } from "../mcp/connect.ts";

const PORT = 19000 + Math.floor(Math.random() * 1000);
const URL = `ws://localhost:${PORT}/sync`;
let relay: ChildProcess;
let dataDir: string;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(fn: () => boolean, ms = 5000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("condition not met in time");
    await wait(20);
  }
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "basalt-mcp-test-"));
  relay = await new Promise<ChildProcess>((resolve, reject) => {
    const proc = spawn(process.execPath, ["server/index.ts"], {
      env: { ...process.env, PORT: String(PORT), BASALT_DATA: dataDir },
      stdio: ["ignore", "pipe", "inherit"],
    });
    proc.stdout!.on("data", (d) => {
      if (String(d).includes("listening")) resolve(proc);
    });
    proc.on("error", reject);
  });
});

after(() => {
  relay.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

interface Session {
  doc: Y.Doc;
  awareness: Awareness;
  provider: RelayProvider;
  client: Client;
  call: (name: string, args?: Record<string, unknown>) => Promise<string>;
  callRaw: (name: string, args?: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>;
  close: () => Promise<void>;
}

async function claudeSession(key: string): Promise<Session> {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalState({ user: { name: "Claude", color: "#d97757" }, agent: "claude" });
  const provider = new RelayProvider(doc, { url: URL, key, awareness });
  provider.connect();
  await provider.whenSynced();
  ensureDefaults(doc);
  const server = createBasaltMcp({ doc, awareness });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const callRaw = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
    return { text: res.content.map((c) => c.text).join("\n"), isError: !!res.isError };
  };
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await callRaw(name, args);
    assert.equal(res.isError, false, `${name} failed: ${res.text}`);
    return res.text;
  };
  return {
    doc,
    awareness,
    provider,
    client,
    call,
    callRaw,
    close: async () => {
      await client.close();
      await server.close();
      provider.destroy();
      awareness.destroy();
    },
  };
}

function humanClient(key: string) {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalState({ user: { name: "Ada", color: "#0090ff" } });
  const provider = new RelayProvider(doc, { url: URL, key, awareness });
  provider.connect();
  return { doc, awareness, provider };
}

test("share links parse into key, relay and name", () => {
  const key = generateKey();
  const parsed = parseShareLink(`https://basalt.example.com/app/#/join/${key}?s=${encodeURIComponent("wss://relay.example.com/sync")}&n=My%20Space`);
  assert.deepEqual(parsed, { key, server: "wss://relay.example.com/sync", name: "My Space" });
  assert.equal(parseShareLink(`http://localhost:5173/#/join/${key}`).server, "ws://localhost:5173/sync");
  assert.throws(() => parseShareLink("https://example.com/#/w/abc"));
});

test("notes: create/read with links, append/prepend, search, meta, backlinks — live for other clients", async () => {
  const key = generateKey();
  const human = humanClient(key);
  await human.provider.whenSynced();
  ensureDefaults(human.doc, "Test space");
  const existing = createPage(human.doc, { title: "Linear Algebra", createdBy: "Ada" });
  await wait(100);

  const claude = await claudeSession(key);
  await until(() => !!getPage(claude.doc, existing));

  const tools = await claude.client.listTools();
  const names = tools.tools.map((t) => t.name);
  for (const n of ["search_notes", "list_notes", "read_note", "create_note", "update_note", "update_note_meta", "trash_note", "get_backlinks", "daily_note", "list_types"]) {
    assert.ok(names.includes(n), `missing tool ${n}`);
  }

  const created = await claude.call("create_note", {
    title: "Study plan",
    markdown: "Learn [[linear algebra]] then [[Calculus]].\n\n- vectors\n- matrices\n\nEuler: $e^{i\\pi}+1=0$",
    type: "Task",
    props: { Status: "In progress", Due: "2026-10-01" },
  });
  assert.match(created, /Created \[\[Study plan\]\] \(id: (\w+)\)/);
  assert.match(created, /Unresolved links.*\[\[Calculus\]\]/);
  const id = created.match(/id: (\w+)/)![1];

  const read = await claude.call("read_note", { id_or_title: "study plan" });
  assert.match(read, /type: Task/);
  assert.match(read, /Status: In progress/);
  assert.match(read, /Due: 2026-10-01/);
  assert.match(read, /Learn \[\[Linear Algebra\]\] then \[\[Calculus\]\]\./);
  assert.match(read, /- vectors\n- matrices/);
  assert.match(read, /\$e\^\{i\\pi\}\+1=0\$/);
  const page = getPage(claude.doc, id)!;
  assert.deepEqual(fragmentLinks(page.get("content")), [existing]);

  await claude.call("update_note", { id_or_title: id, markdown: "Appended with [[Linear Algebra]].", mode: "append" });
  await claude.call("update_note", { id_or_title: id, markdown: "# Plan", mode: "prepend" });
  const text = pageText(claude.doc, id).split("\n");
  assert.equal(text[0], "Plan");
  assert.equal(text[1], "Learn [[Linear Algebra]] then [[Calculus]].");
  assert.equal(text[text.length - 1], "Appended with [[Linear Algebra]].");

  const search = await claude.call("search_notes", { query: "matrices" });
  assert.match(search, /\*\*Study plan\*\*/);
  assert.match(search, /\*\*matrices\*\*/);

  const back = await claude.call("get_backlinks", { id_or_title: "Linear Algebra" });
  assert.match(back, /\[\[Study plan\]\]/);

  await claude.call("create_note", { title: "Math", markdown: "Hub" });
  await claude.call("update_note_meta", { id_or_title: id, title: "Study plan 2026", parent: "Math", icon: "📐", props: { Status: "Done" } });
  const list = await claude.call("list_notes", { depth: 3 });
  assert.match(list, /- Math \(id: \w+\)\n {2}- 📐 Study plan 2026 \(id: \w+, type: Task\)/);
  const badOption = await claude.callRaw("update_note_meta", { id_or_title: id, props: { Status: "Blocked" } });
  assert.equal(badOption.isError, true);
  assert.match(badOption.text, /not an option of Status/);

  const missing = await claude.callRaw("read_note", { id_or_title: "Nope nothing" });
  assert.equal(missing.isError, true);

  // The human sees Claude's notes and presence live.
  await until(() => listPages(human.doc).some((p) => p.title === "Study plan 2026"));
  const humanView = listPages(human.doc).find((p) => p.title === "Study plan 2026")!;
  assert.equal(humanView.createdBy, "Claude");
  assert.match(pageText(human.doc, humanView.id), /Appended with \[\[Linear Algebra\]\]\./);
  await until(() => [...human.awareness.getStates().values()].some((s) => s?.agent === "claude"));
  const presence = [...human.awareness.getStates().values()].find((s) => s?.agent === "claude")!;
  assert.equal(presence.user.name, "Claude");

  // Edits from the human reach Claude.
  human.doc.transact(() => getPage(human.doc, existing)!.set("title", "Linear Algebra I"));
  await until(() => getPage(claude.doc, existing)!.get("title") === "Linear Algebra I");
  const reread = await claude.call("read_note", { id_or_title: id });
  assert.match(reread, /Learn \[\[Linear Algebra I\]\]/);

  await claude.call("trash_note", { id_or_title: "Math" });
  await until(() => !listPages(human.doc).some((p) => p.title === "Study plan 2026"));

  const daily = await claude.call("daily_note", { append_markdown: "Met with [[Linear Algebra I]] group" });
  assert.match(daily, /Met with \[\[Linear Algebra I\]\] group/);

  await claude.close();
  await until(() => ![...human.awareness.getStates().values()].some((s) => s?.agent === "claude"));
  human.provider.destroy();
  human.awareness.destroy();
});

test("memory tools mirror the memory-tool semantics on notes under Claude Memory", async () => {
  const key = generateKey();
  const claude = await claudeSession(key);
  const empty = await claude.call("memory_view");
  assert.match(empty, /no memories yet/);
  assert.equal(findSystemPage(claude.doc, "claude-memory"), undefined, "viewing must not create the memory root");

  assert.match(await claude.call("memory_create", { path: "/memories/preferences.md", content: "# Preferences\n\n- Likes tea\n- Writes TypeScript" }), /created/);
  const root = findSystemPage(claude.doc, "claude-memory")!;
  assert.ok(root);
  const pref = listPages(claude.doc).find((p) => p.title === "preferences")!;
  assert.equal(pref.parentId, root);
  assert.equal(pref.typeId, "memory");

  const view = await claude.call("memory_view", { path: "/memories/preferences.md" });
  assert.match(view, /^Here's the content of \/memories\/preferences\.md/);
  assert.match(view, / {5}1\t# Preferences\n {5}2\t\n {5}3\t- Likes tea\n {5}4\t- Writes TypeScript/);

  await claude.call("memory_str_replace", { path: "/memories/preferences.md", old_str: "- Likes tea", new_str: "- Likes green tea" });
  const dup = await claude.callRaw("memory_str_replace", { path: "/memories/preferences.md", old_str: "- ", new_str: "* " });
  assert.equal(dup.isError, true);
  assert.match(dup.text, /Multiple occurrences/);
  const none = await claude.callRaw("memory_str_replace", { path: "/memories/preferences.md", old_str: "coffee", new_str: "x" });
  assert.equal(none.isError, true);
  assert.match(none.text, /did not appear verbatim/);

  await claude.call("memory_insert", { path: "/memories/preferences.md", insert_line: 2, insert_text: "- Wakes up early" });
  const after = await claude.call("memory_view", { path: "/memories/preferences.md", view_range: [3, 4] });
  assert.match(after, /3\t- Wakes up early\n {5}4\t- Likes green tea/);

  await claude.call("memory_create", { path: "/memories/projects/basalt.md", content: "Local-first workspace." });
  await claude.call("remember", { fact: "Ships on Fridays", topic: "projects/basalt" });
  const listing = await claude.call("memory_view");
  assert.match(listing, /\/memories\/preferences\.md/);
  assert.match(listing, /\/memories\/projects\/ /);
  assert.match(listing, /\/memories\/projects\/basalt\.md/);
  const basalt = await claude.call("memory_view", { path: "/memories/projects/basalt.md" });
  assert.match(basalt, /Local-first workspace\.\n {5}2\t\n {5}3\t- \d{4}-\d{2}-\d{2}: Ships on Fridays/);

  const recall = await claude.call("recall", { query: "fridays" });
  assert.match(recall, /\/memories\/projects\/basalt\.md/);
  assert.match(recall, /Ships on Fridays/);

  await claude.call("memory_rename", { old_path: "/memories/projects/basalt.md", new_path: "/memories/archive/basalt.md" });
  const moved = await claude.call("memory_view");
  assert.match(moved, /\/memories\/archive\/basalt\.md/);
  assert.doesNotMatch(moved, /\/memories\/projects/, "empty auto-created folders are pruned");
  const clash = await claude.callRaw("memory_rename", { old_path: "/memories/archive/basalt.md", new_path: "/memories/preferences.md" });
  assert.equal(clash.isError, true);

  await claude.call("memory_delete", { path: "/memories/archive/basalt.md" });
  const gone = await claude.callRaw("memory_view", { path: "/memories/archive/basalt.md" });
  assert.equal(gone.isError, true);
  assert.match(gone.text, /does not exist/);
  const traversal = await claude.callRaw("memory_view", { path: "/memories/../secrets.md" });
  assert.equal(traversal.isError, true);

  // A second client sees the memory notes.
  const other = humanClient(key);
  await other.provider.whenSynced();
  await until(() => listPages(other.doc).some((p) => p.title === "preferences" && p.parentId === root));
  assert.match(pageText(other.doc, pref.id), /Wakes up early/);
  other.provider.destroy();
  other.awareness.destroy();
  await claude.close();
});

test("learning: courses, lessons, quizzes and flashcards", async () => {
  const key = generateKey();
  const claude = await claudeSession(key);
  const levels = ["Foundations", "Beginner", "Intermediate", "Advanced", "Graduate", "PhD / Research frontier"].map((name, i) => ({
    name,
    summary: `Level ${i + 1}`,
    modules: [{ title: `${name} module`, summary: "", lessons: [{ title: `${name} lesson`, objectives: ["Explain it"] }] }],
  }));
  const created = await claude.call("create_course", {
    topic: "Topology",
    goal: "Research-level understanding",
    start_level: "Complete beginner",
    curriculum: { overview: "From open sets to research.", levels },
  });
  assert.match(created, /Created course \[\[Topology\]\]/);
  const lessonId = created.match(/Foundations lesson \(lesson_id: (\w+)\)/)![1];
  const course = listPages(claude.doc).find((p) => p.kind === "course")!;

  const wrote = await claude.call("write_lesson", { course: "Topology", lesson_id: lessonId, markdown: "# Open sets\n\nA set $U$ is open if…" });
  assert.match(wrote, /Status: in progress/);
  const coursePage = getPage(claude.doc, course.id)!;
  const progress = getProgress(coursePage, lessonId);
  assert.equal(progress.status, "in-progress");
  const lessonPage = getPage(claude.doc, progress.lessonPageId!)!;
  assert.equal(lessonPage.get("parentId"), course.id);
  assert.equal(lessonPage.get("title"), "Foundations lesson");

  let quiz = await claude.call("record_quiz", { course: course.id, lesson_id: lessonId, score: 0.5 });
  assert.match(quiz, /not yet mastered/);
  quiz = await claude.call("record_quiz", { course: "Topology", lesson_id: "Foundations lesson", score: 85 });
  assert.match(quiz, /mastered/);
  assert.match(quiz, /Next lesson: "Beginner lesson"/);
  const p2 = getProgress(coursePage, lessonId);
  assert.equal(p2.status, "mastered");
  assert.equal(p2.mastery, 0.85);
  assert.equal(p2.quizzes.length, 2);

  await claude.call("add_flashcards", {
    page: progress.lessonPageId,
    cards: [
      { front: "What is an open set?", back: "A member of the topology" },
      { front: "Is the empty set open?", back: "Always" },
    ],
  });
  const lines = pageText(claude.doc, progress.lessonPageId!).split("\n");
  assert.ok(lines.includes("Flashcards"));
  assert.ok(lines.includes("What is an open set? :: A member of the topology"));
  assert.ok(lines.includes("Is the empty set open? :: Always"));

  const outline = await claude.call("get_course", { id_or_title: "Topology" });
  assert.match(outline, /Progress: 1\/6 lessons mastered/);
  assert.match(outline, /\[x\] Foundations lesson/);
  assert.match(outline, /## PhD \/ Research frontier/);

  const prompts = await claude.client.listPrompts();
  assert.deepEqual(prompts.prompts.map((p) => p.name).sort(), ["level_up_my_life", "memory_protocol", "teach_me"]);
  const teach = await claude.client.getPrompt({ name: "teach_me", arguments: { topic: "Topology", level: "undergrad" } });
  const teachText = (teach.messages[0].content as { text: string }).text;
  assert.match(teachText, /Topology/);
  assert.match(teachText, /Foundations → Beginner → Intermediate → Advanced → Graduate → PhD \/ Research frontier/);
  assert.match(teachText, /record_quiz/);
  await claude.close();
});

test("interactive lessons: Claude writes steps, extends the path and maps a branch", async () => {
  const { getLessonContent } = await import("../shared/lesson.ts");
  const { listSkills, totalXp } = await import("../shared/skills.ts");
  const key = generateKey();
  const claude = await claudeSession(key);
  const created = await claude.call("create_course", {
    topic: "Juggling",
    curriculum: { overview: "Three balls.", levels: [{ name: "Foundations", modules: [{ title: "Basics", lessons: [{ title: "One ball" }, { title: "Two balls" }] }] }] },
  });
  const lessonId = created.match(/One ball \(lesson_id: (\w+)\)/)![1];
  const course = listPages(claude.doc).find((p) => p.kind === "course")!;
  const page = getPage(claude.doc, course.id)!;
  assert.equal((page.get("course") as Y.Map<unknown>).get("format"), "interactive");

  // A broken lesson is refused with what to fix.
  const bad = await claude.callRaw("write_interactive_lesson", { course: "Juggling", lesson_id: lessonId, steps: [{ type: "explain", body: "Hi" }, { type: "choice", prompt: "?", options: ["a"], answer: [0] }, { type: "explain", body: "x" }] });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /step 2/);

  const wrote = await claude.call("write_interactive_lesson", {
    course: "Juggling",
    lesson_id: lessonId,
    steps: [
      { type: "explain", body: "Throw at eye height.", phase: "understand", figure: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' },
      { type: "choice", prompt: "Where should the ball peak?", options: ["Eye height", "Knee height"], answer: [0], explain: "Eye height gives time.", phase: "recall" },
      { type: "slider", prompt: "Set the height", min: 0, max: 2, answer: 0.5, tolerance: 0.1, plot: "2*sqrt(2*x/9.81)", explain: "About half a metre." },
      { type: "practice", prompt: "Throw one ball", minutes: 5, focus: ["Eye height"], goal: "10 in a row" },
    ],
  });
  assert.match(wrote, /Wrote "One ball" \(4 steps\)/);
  assert.match(wrote, /Still to write: "Two balls"/);
  const content = getLessonContent(page, lessonId)!;
  assert.equal(content.source, "claude");
  assert.equal(content.steps[2].type, "slider");

  const outline = await claude.call("get_course", { id_or_title: "Juggling" });
  assert.match(outline, /One ball \(lesson_id: \w+ · interactive, 4 steps\)/);
  assert.match(outline, /Learner: 0\.0 lessons\/day/);
  assert.match(outline, /Write next \(write_interactive_lesson\): "Two balls"/);
  assert.match(outline, /about to run out: add the next module with extend_course/);

  const extended = await claude.call("extend_course", { course: "Juggling", level: "Beginner", module: { title: "Three balls", lessons: [{ title: "The cascade" }] } });
  assert.match(extended, /Added "Three balls" to Beginner/);
  assert.match(await claude.call("get_course", { id_or_title: "Juggling" }), /## Beginner[\s\S]*The cascade/);

  // A branch: skills Claude maps for one goal, shown together in the app.
  await claude.call("add_skills", {
    branch: "Juggle five balls",
    skills: [
      { key: "three", name: "Three-ball cascade", area: "Sleight of Hand" },
      { key: "four", name: "Four-ball fountain", area: "dex", prerequisites: ["three"] },
    ],
  });
  const branch = listSkills(claude.doc).filter((s) => s.branch === "Juggle five balls");
  assert.deepEqual(branch.map((s) => s.category), ["dex", "dex"]);
  await claude.call("link_to_skill", { skill: "Three-ball cascade", page: course.id });
  assert.equal(totalXp(claude.doc, branch[0].id), 0);
  await claude.close();
});

test("skill tree: Claude plans skills, logs practice, awards XP and completes quests", async () => {
  const { listSkills, totalXp, skillsMap } = await import("../shared/skills.ts");
  const key = generateKey();
  const claude = await claudeSession(key);
  const human = humanClient(key);
  await human.provider.whenSynced();

  const added = await claude.call("add_skills", {
    skills: [
      { key: "run", name: "Running", icon: "🏃", area: "Body", quests: [{ title: "Run 20 minutes", cadence: "daily", xp: 30 }] },
      { key: "10k", name: "10K race", icon: "🏁", area: "Body", prerequisites: ["run"], required_level: 3 },
      { key: "budget", name: "Budgeting", icon: "💰", area: "Wealth" },
    ],
  });
  assert.match(added, /Added 3 skills/);
  const skills = listSkills(claude.doc);
  const run = skills.find((s) => s.name === "Running")!;
  const race = skills.find((s) => s.name === "10K race")!;
  assert.deepEqual(race.parents, [run.id]);
  assert.equal(race.requiredLevel, 3);

  const tree = await claude.call("get_skill_tree");
  assert.match(tree, /LOCKED: needs Running L3/);
  assert.match(tree, /Today's quests: 1 open of 1/);

  const logged = await claude.call("log_practice", { skill: "running", minutes: 45, note: "Easy run" });
  assert.match(logged, /\+\d+ XP/);
  const quest = await claude.call("complete_quest", { skill: "Running", quest: "Run 20 minutes" });
  assert.match(quest, /Completed "Run 20 minutes" \(\+30 XP\)/);
  assert.match(await claude.call("complete_quest", { skill: "Running", quest: "Run 20 minutes" }), /already complete/);
  const award = await claude.call("award_xp", { skill: "Budgeting", amount: 100, reason: "Built a monthly budget" });
  assert.match(award, /\+100 XP to Budgeting/);
  assert.equal((await claude.callRaw("award_xp", { skill: "Nope", amount: 5, reason: "x" })).isError, true);

  await claude.call("update_skill", { skill: "Budgeting", name: "Personal finance", goal_level: 10 });
  // The human's device sees everything live.
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("skills never synced")), 5000);
    const check = () => {
      const names = listSkills(human.doc).map((s) => s.name).sort();
      if (names.join() === "10K race,Personal finance,Running" && totalXp(human.doc, run.id) >= 30) {
        clearTimeout(t);
        human.doc.off("update", check);
        resolve();
      }
    };
    human.doc.on("update", check);
    check();
  });
  assert.ok(skillsMap(human.doc).size === 3);
  human.provider.destroy();
  human.awareness.destroy();
  await claude.close();
});

test("pages hold anything: Claude makes a canvas and database and embeds them with ![[Title]]", async () => {
  const key = generateKey();
  const claude = await claudeSession(key);
  await claude.call("create_note", { title: "Launch plan", markdown: "Goals for the launch." });
  const canvas = await claude.call("create_note", { title: "Launch sketch", kind: "canvas", parent_id_or_title: "Launch plan" });
  assert.match(canvas, /!\[\[Launch sketch\]\]/, "tells Claude how to embed it");
  await claude.call("create_note", { title: "Launch tasks", kind: "database", type: "Task", parent_id_or_title: "Launch plan" });
  await claude.call("update_note", { id_or_title: "Launch plan", markdown: "![[Launch sketch]]\n\n![[Launch tasks]]", mode: "append" });

  const byTitle = (t: string) => listPages(claude.doc).find((p) => p.title === t)!;
  const plan = byTitle("Launch plan");
  assert.equal(byTitle("Launch sketch").kind, "board");
  const tasks = byTitle("Launch tasks");
  assert.equal(tasks.kind, "database");
  assert.equal((getPage(claude.doc, tasks.id)!.get("view") as Y.Map<unknown>).get("typeId"), "task");

  const content = getPage(claude.doc, plan.id)!.get("content") as Y.XmlFragment;
  const embeds = content.createTreeWalker((n) => n instanceof Y.XmlElement && n.nodeName === "embed");
  assert.deepEqual([...embeds].map((e) => (e as Y.XmlElement).getAttribute("pageId")), [byTitle("Launch sketch").id, tasks.id]);
  assert.deepEqual(fragmentLinks(content).sort(), [byTitle("Launch sketch").id, tasks.id].sort());

  const read = await claude.call("read_note", { id_or_title: "Launch plan" });
  assert.match(read, /!\[\[Launch sketch\]\]/);
  assert.match(read, /!\[\[Launch tasks\]\]/);
  await claude.close();
});

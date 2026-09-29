import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { CATALOG, CATALOG_BY_KEY } from "../shared/skill-catalog.ts";
import { adoptPlanned, isPlanned, missingFor, nextLeaf, nextStep, searchMap, skillMapOf, startTreeOver, trail } from "../shared/skill-map.ts";
import { createSkill, getSkill, listSkills, setParents, updateSkill } from "../shared/skills.ts";

const key = (name: string, field?: string) => {
  const hit = CATALOG.find((e) => e.name === name && (!field || CATALOG_BY_KEY.get(e.field)!.name === field));
  assert.ok(hit, `${name} is in the catalog`);
  return hit.key;
};

test("catalog: areas > fields > topics (branching) > steps > advanced, every step in order, needs across trees", () => {
  const keys = new Set<string>();
  for (const e of CATALOG) {
    assert.ok(!keys.has(e.key), `unique key ${e.key}`);
    keys.add(e.key);
    for (const n of e.needs) assert.ok(CATALOG_BY_KEY.has(n), `${e.name} needs ${n}`);
    if (e.parent) assert.ok(CATALOG_BY_KEY.has(e.parent));
    assert.ok(["str", "dex", "con", "int", "wis", "cha"].includes(e.ability), `${e.name} has an ability`);
  }
  // Every ability has areas; each area has fields; each field has topics with steps.
  for (const a of ["str", "dex", "con", "int", "wis", "cha"]) assert.ok(CATALOG.some((e) => e.tier === "general" && e.ability === a), a);
  for (const g of CATALOG.filter((e) => e.tier === "general")) assert.ok(CATALOG.some((e) => e.parent === g.key && e.tier === "field"), `${g.name} has fields`);
  for (const f of CATALOG.filter((e) => e.tier === "field")) {
    assert.equal(CATALOG_BY_KEY.get(f.parent!)!.tier, "general");
    const subs = CATALOG.filter((e) => e.parent === f.key && e.tier === "sub");
    assert.ok(subs.length >= 2, `${f.name} has topics`);
    for (const s of subs) assert.ok(CATALOG.filter((e) => e.parent === s.key).length >= 3, `${s.name} has steps`);
  }
  assert.equal(CATALOG_BY_KEY.get(CATALOG_BY_KEY.get(key("Mathematics"))!.parent!)!.name, "Formal sciences");
  // Topics branch and join: Pre-algebra leads to both Algebra and Geometry; Trigonometry needs both.
  assert.deepEqual(CATALOG_BY_KEY.get(key("Algebra"))!.needs, [key("Pre-algebra")]);
  assert.deepEqual(CATALOG_BY_KEY.get(key("Geometry"))!.needs, [key("Pre-algebra")]);
  assert.deepEqual(CATALOG_BY_KEY.get(key("Trigonometry"))!.needs, [key("Algebra"), key("Geometry")]);
  // Related skills in other trees are linked, without locking.
  assert.ok(CATALOG_BY_KEY.get(key("Baking and pastry"))!.related.includes(key("Reactions", "Chemistry")));
  assert.ok(CATALOG.filter((e) => e.needs.some((n) => CATALOG_BY_KEY.get(n)!.field !== e.field)).length > 80, "plenty of links across trees");
  // No skipping: each detail needs the one before it.
  const arith = CATALOG.filter((e) => e.parent === key("Arithmetic"));
  assert.deepEqual(
    arith.map((e) => e.name),
    ["Counting and place value", "Addition and subtraction", "Multiplication and division", "Fractions", "Decimals and percentages"],
  );
  arith.forEach((d, i) => assert.deepEqual(d.needs, i ? [arith[i - 1].key] : []));
  assert.deepEqual(CATALOG_BY_KEY.get(key("Pre-algebra"))!.needs, [key("Arithmetic")]);
  // Advanced skills build on other trees: software development needs math and computer science.
  const sd = CATALOG_BY_KEY.get(key("Software development"))!;
  assert.equal(sd.tier, "advanced");
  assert.ok(sd.needs.includes(key("Algorithms", "Computer science")));
  assert.ok(sd.needs.includes(key("Discrete mathematics")));
  // And nothing needs itself, however far round.
  const state = new Map<string, "visiting" | "done">();
  const visit = (k: string): boolean => {
    if (state.get(k) === "done") return true;
    if (state.get(k) === "visiting") return false;
    state.set(k, "visiting");
    const e = CATALOG_BY_KEY.get(k)!;
    const ok = [...e.needs, ...(e.parent ? [e.parent] : [])].every(visit);
    state.set(k, "done");
    return ok;
  };
  for (const e of CATALOG) assert.ok(visit(e.key), `no loop through ${e.name}`);
});

test("skill map: the built-in tree is planned on an empty map, with nothing skipped", () => {
  const doc = new Y.Doc();
  const map = skillMapOf(doc);
  assert.equal(map.entries.length, CATALOG.length);
  assert.ok(map.entries.every((e) => isPlanned(e.id)));
  const id = (name: string, field?: string) => map.byKey.get(key(name, field))!;
  const math = map.byId.get(id("Mathematics"))!;
  assert.equal(math.locked, false);
  assert.equal(nextLeaf(map, math.id)!.name, "Counting and place value");
  assert.equal(map.byId.get(id("Counting and place value"))!.locked, false);
  assert.equal(map.byId.get(id("Addition and subtraction"))!.locked, true);
  assert.equal(map.byId.get(id("Pre-algebra"))!.locked, true);
  assert.equal(nextStep(map, id("Algebra"))!.name, "Counting and place value");
  assert.deepEqual(
    trail(map, id("Linear equations")).map((e) => e.name),
    ["Formal sciences", "Mathematics", "Algebra", "Linear equations"],
  );
  const sd = id("Software development");
  assert.equal(map.byId.get(sd)!.locked, true);
  assert.deepEqual(
    missingFor(map, sd).map((e) => e.name),
    ["Frontend development", "Backend development", "Databases", "Algorithms", "Discrete mathematics"],
  );
});

test("skill map: your skills take their place in the tree, and starting a planned step adopts its topic in order", () => {
  const doc = new Y.Doc();
  // A skill you already had, by name: it's the catalog's, locked behind what it builds on.
  const mine = createSkill(doc, { name: "Software development", category: "int" });
  let map = skillMapOf(doc);
  const sd = map.byId.get(mine.id)!;
  assert.equal(sd.cat?.key, key("Software development"));
  assert.equal(sd.locked, true);

  // Starting "Counting and place value" makes Formal sciences, Mathematics, Arithmetic and its five steps yours, in order.
  const first = adoptPlanned(doc, map, map.byKey.get(key("Counting and place value"))!)!;
  const skills = listSkills(doc);
  const byName = (n: string) => skills.find((s) => s.name === n)!;
  assert.equal(getSkill(doc, first)!.name, "Counting and place value");
  assert.equal(byName("Arithmetic").topic, byName("Mathematics").id);
  assert.equal(byName("Mathematics").topic, byName("Formal sciences").id);
  assert.equal(byName("Fractions").topic, byName("Arithmetic").id);
  assert.deepEqual(byName("Fractions").parents, [byName("Multiplication and division").id]);
  assert.equal(byName("Fractions").catalog, key("Fractions"));
  assert.equal(skills.filter((s) => s.catalog?.startsWith(key("Arithmetic"))).length, 6);
  assert.ok(!skills.some((s) => s.name === "Pre-algebra"), "only what you start");

  // The next step opens once this one is learnt (here: its goal reached).
  map = skillMapOf(doc);
  assert.equal(map.byId.get(byName("Addition and subtraction").id)!.locked, true);
  updateSkill(doc, first, { goalLevel: 1 });
  map = skillMapOf(doc);
  assert.equal(map.byId.get(first)!.done, true);
  assert.equal(map.byId.get(byName("Addition and subtraction").id)!.locked, false);
  assert.equal(nextLeaf(map, byName("Mathematics").id)!.name, "Addition and subtraction");
});

test("start the tree over: skills in the tree keep their progress and take their place; the rest are archived", () => {
  const doc = new Y.Doc();
  const athletics = createSkill(doc, { name: "Athletics", category: "str" });
  const climbing = createSkill(doc, { name: "Climbing", category: "str" });
  setParents(doc, climbing.id, [athletics.id], 3);
  const leadership = createSkill(doc, { name: "Leadership", category: "cha" });
  const odd = createSkill(doc, { name: "Some random thing", category: "int" });
  const res = startTreeOver(doc);
  assert.deepEqual(res, { kept: 3, archived: 1 });
  assert.equal(getSkill(doc, odd.id)!.archived, true);
  assert.equal(getSkill(doc, athletics.id)!.catalog, key("Athletics"));
  // A general topic starts fresh: its old prerequisites go.
  assert.deepEqual(getSkill(doc, climbing.id)!.parents, []);
  const map = skillMapOf(doc);
  const lead = map.byId.get(leadership.id)!;
  assert.equal(lead.tier, "field");
  assert.equal(map.byId.get(lead.parent!)!.name, "Influence");
  assert.equal(lead.locked, false);
});

test("search: names, what's inside a match, and everyday words, broadest first", () => {
  const map = skillMapOf(new Y.Doc());
  const first = (q: string) => searchMap(map, q, 1)[0]?.entry.name;
  assert.equal(first("math"), "Mathematics");
  assert.equal(first("diet"), "Nutrition");
  assert.equal(first("coding"), "Programming");
  assert.equal(first("software development"), "Software development");
  const nutrition = searchMap(map, "nutrition").map((h) => h.entry.name);
  assert.ok(nutrition.includes("Mediterranean diet"), "inside a match");
  assert.equal(searchMap(map, "diet", 3)[1].where, "Health › Nutrition");
  assert.deepEqual(searchMap(map, "x"), []);
});

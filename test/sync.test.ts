import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { RelayProvider } from "../shared/relay-client.ts";
import { generateKey } from "../shared/crypto.ts";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const URL = `ws://localhost:${PORT}/sync`;
let server: ChildProcess;
let dataDir: string;

function startServer(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, ["server/index.ts"], {
      env: { ...process.env, PORT: String(PORT), BASALT_DATA: dataDir, BASALT_COMPACT_AT: "20" },
      stdio: ["ignore", "pipe", "inherit"],
    });
    proc.stdout!.on("data", (d) => {
      if (String(d).includes("listening")) resolve(proc);
    });
    proc.on("error", reject);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(fn: () => boolean, ms = 5000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("condition not met in time");
    await wait(20);
  }
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "basalt-test-"));
  server = await startServer();
});

after(() => {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("two clients converge, offline edits merge, server stores only ciphertext", async () => {
  const key = generateKey();
  const a = new Y.Doc();
  const b = new Y.Doc();
  const pa = new RelayProvider(a, { url: URL, key });
  const pb = new RelayProvider(b, { url: URL, key });
  pa.connect();
  await pa.whenSynced();
  a.getText("t").insert(0, "hello secret world");
  pb.connect();
  await pb.whenSynced();
  await until(() => b.getText("t").toString() === "hello secret world");

  // Offline edit on B, concurrent online edit on A.
  pb.disconnect();
  b.getText("t").insert(0, "B:");
  a.getText("t").insert(a.getText("t").length, " :A");
  await wait(100);
  pb.connect();
  await pb.whenSynced();
  await until(() => a.getText("t").toString() === b.getText("t").toString());
  assert.equal(a.getText("t").toString(), "B:hello secret world :A");

  // Nothing readable on disk.
  for (const f of fs.readdirSync(dataDir)) {
    const content = fs.readFileSync(path.join(dataDir, f));
    assert.ok(!content.includes("secret"), `plaintext leaked into ${f}`);
  }
  pa.destroy();
  pb.destroy();
});

test("wrong key cannot join an existing room's data", async () => {
  const key = generateKey();
  const a = new Y.Doc();
  const pa = new RelayProvider(a, { url: URL, key });
  pa.connect();
  await pa.whenSynced();
  a.getMap("m").set("x", 1);
  await wait(100);
  const other = new Y.Doc();
  const po = new RelayProvider(other, { url: URL, key: generateKey() });
  po.connect();
  await po.whenSynced();
  assert.equal(other.getMap("m").get("x"), undefined);
  pa.destroy();
  po.destroy();
});

test("compaction keeps state and late joiners get everything", async () => {
  const key = generateKey();
  const a = new Y.Doc();
  const pa = new RelayProvider(a, { url: URL, key, batchMs: 0 });
  pa.connect();
  await pa.whenSynced();
  for (let i = 0; i < 60; i++) {
    a.getArray("arr").push([i]);
    await wait(5);
  }
  await wait(300);
  const c = new Y.Doc();
  const pc = new RelayProvider(c, { url: URL, key });
  pc.connect();
  await pc.whenSynced();
  assert.equal(c.getArray("arr").length, 60);
  const logs = fs.readdirSync(dataDir).filter((f) => f.endsWith(".log"));
  assert.ok(logs.length > 0);
  pa.destroy();
  pc.destroy();
});

test("awareness (presence) is relayed", async () => {
  const key = generateKey();
  const a = new Y.Doc();
  const b = new Y.Doc();
  const aa = new Awareness(a);
  const ab = new Awareness(b);
  aa.setLocalState({ user: { name: "Ada" } });
  ab.setLocalState({ user: { name: "Bob" } });
  const pa = new RelayProvider(a, { url: URL, key, awareness: aa });
  const pb = new RelayProvider(b, { url: URL, key, awareness: ab });
  pa.connect();
  await pa.whenSynced();
  pb.connect();
  await pb.whenSynced();
  await until(() => aa.getStates().get(b.clientID)?.user?.name === "Bob");
  await until(() => ab.getStates().get(a.clientID)?.user?.name === "Ada");
  pb.disconnect();
  await until(() => !aa.getStates().has(b.clientID));
  pa.destroy();
  pb.destroy();
  aa.destroy();
  ab.destroy();
});

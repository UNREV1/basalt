#!/usr/bin/env node
// Obsidian-compatible vault export/import for a Basalt workspace.
//
//   node mcp/vault-cli.ts export --link "<share link>" --out ~/Vaults/Basalt [--watch]
//   node mcp/vault-cli.ts import --link "<share link>" --dir ~/Vaults/MyObsidianVault [--into "Title" | --root]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Y from "yjs";
import { metaMap, pagesMap, typesMap } from "../shared/model.ts";
import {
  VAULT_MANIFEST,
  VaultExporter,
  importVault,
  type VaultData,
  type VaultManifest,
  type VaultSourceFile,
} from "../shared/vault.ts";
import { nodeConverter } from "./convert.ts";
import { ConfigError, configFromFlags, joinWorkspace, parseFlags } from "./connect.ts";

const USAGE = `Basalt vault tool — Obsidian-compatible export and import.

Usage:
  node mcp/vault-cli.ts export --link "<share link>" --out <dir> [--watch] [--force]
  node mcp/vault-cli.ts import --link "<share link>" --dir <vault dir> [--into <page title> | --root]

Export writes one markdown file per page (folders for pages with sub-pages), YAML
frontmatter with ids/types/properties, [[wikilinks]], whiteboards as .excalidraw
files, attachments under _attachments/, and a CLAUDE.md guide at the root.
--watch keeps the folder in sync with live changes (one-way). Only files the
exporter wrote (listed in ${VAULT_MANIFEST}) are ever deleted; --force allows
exporting into a non-empty folder that has no manifest yet.

Import reads .md notes (frontmatter → properties, folders → page tree, [[links]],
![[image]] embeds) and Excalidraw drawings (.excalidraw, .excalidraw.md) into a
new page named after the vault (--into to choose the title, --root for top level).

Common options: --key <key> --server <wss://host/sync> instead of --link; --timeout <sec>.`;

const log = (msg: string) => process.stderr.write(`${msg}\n`);

// ---- file system ------------------------------------------------------------------

export function readVaultDir(root: string): VaultSourceFile[] {
  const out: VaultSourceFile[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        const st = fs.statSync(full);
        out.push({
          path: path.relative(root, full).split(path.sep).join("/"),
          size: st.size,
          mtime: st.mtimeMs,
          read: async () => new Uint8Array(fs.readFileSync(full)),
        });
      }
    }
  };
  walk(root);
  return out;
}

function readManifest(outDir: string): VaultManifest | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(outDir, VAULT_MANIFEST), "utf8"));
  } catch {
    return null;
  }
}

function sameContent(file: string, data: VaultData): boolean {
  try {
    const cur = fs.readFileSync(file);
    const next = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return cur.equals(next);
  } catch {
    return false;
  }
}

function pruneEmptyDirs(outDir: string, from: string) {
  let dir = path.dirname(from);
  const root = path.resolve(outDir);
  while (path.resolve(dir).startsWith(root) && path.resolve(dir) !== root) {
    try {
      if (fs.readdirSync(dir).length) return;
      fs.rmdirSync(dir);
    } catch {
      return;
    }
    dir = path.dirname(dir);
  }
}

/** Write the vault to disk: changed files only, and remove files of deleted pages. */
export function writeVault(outDir: string, files: Map<string, VaultData>, workspace: string) {
  const root = path.resolve(outDir);
  fs.mkdirSync(root, { recursive: true });
  const previous = new Set(readManifest(root)?.files ?? []);
  let written = 0;
  let removed = 0;
  for (const [rel, data] of files) {
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) continue;
    if (sameContent(full, data)) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
    written++;
  }
  for (const rel of previous) {
    if (files.has(rel)) continue;
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep)) continue;
    try {
      fs.unlinkSync(full);
      removed++;
      pruneEmptyDirs(root, full);
    } catch {
      // already gone
    }
  }
  const manifest: VaultManifest = { workspace, exportedAt: new Date().toISOString(), files: [...files.keys()].sort() };
  fs.writeFileSync(path.join(root, VAULT_MANIFEST), JSON.stringify(manifest, null, 2));
  return { written, removed, total: files.size };
}

// ---- commands ------------------------------------------------------------------------

async function runExport(flags: Map<string, string | true>) {
  const out = flags.get("out");
  if (typeof out !== "string") throw new ConfigError("export needs --out <dir>");
  const outDir = path.resolve(out.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length && !readManifest(outDir) && !flags.has("force")) {
    throw new ConfigError(`${outDir} is not empty and was not created by this exporter. Choose an empty folder or pass --force.`);
  }
  const cfg = configFromFlags(flags);
  log(`Connecting to ${cfg.server} …`);
  const ws = await joinWorkspace(cfg, { log });
  const conv = nodeConverter();
  const exporter = new VaultExporter(ws.doc, conv);
  const name = () => String(metaMap(ws.doc).get("name") ?? cfg.name ?? "Basalt");

  const exportOnce = async () => {
    const started = Date.now();
    const files = await exporter.build();
    const res = writeVault(outDir, files, name());
    log(`Exported "${name()}" → ${outDir}: ${res.total} files (${res.written} written, ${res.removed} removed) in ${Date.now() - started} ms`);
  };
  await exportOnce();

  if (!flags.has("watch")) {
    await ws.close();
    return;
  }

  log("Watching for changes (Ctrl+C to stop) …");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstChangeAt = 0;
  let running: Promise<void> | null = null;
  let again = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = exportOnce().catch((err) => {
      log(`Export failed: ${err instanceof Error ? err.message : err}`);
    });
    await running;
    running = null;
    if (again) {
      again = false;
      schedule();
    }
  };
  const schedule = () => {
    const now = Date.now();
    if (!firstChangeAt) firstChangeAt = now;
    if (timer) clearTimeout(timer);
    // Debounce bursts of edits, but never wait more than 5 s while someone keeps typing.
    const delay = now - firstChangeAt > 5000 ? 0 : 800;
    timer = setTimeout(() => {
      timer = null;
      firstChangeAt = 0;
      void run();
    }, delay);
  };
  const pages = pagesMap(ws.doc);
  pages.observeDeep((events: Y.YEvent<any>[]) => {
    const ids = new Set<string>();
    for (const e of events) {
      if (e.target === pages) for (const key of (e as Y.YMapEvent<any>).keysChanged) ids.add(key);
      else if (typeof e.path[0] === "string") ids.add(e.path[0]);
    }
    exporter.invalidate(ids);
    schedule();
  });
  typesMap(ws.doc).observe(schedule);
  metaMap(ws.doc).observe(schedule);

  await new Promise<void>((resolve) => {
    const stop = async () => {
      if (timer) clearTimeout(timer);
      if (running) await running;
      await ws.close();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function runImport(flags: Map<string, string | true>) {
  const dir = flags.get("dir");
  if (typeof dir !== "string") throw new ConfigError("import needs --dir <vault folder>");
  const vaultDir = path.resolve(dir.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
  if (!fs.existsSync(vaultDir) || !fs.statSync(vaultDir).isDirectory()) throw new ConfigError(`${vaultDir} is not a folder`);
  const files = readVaultDir(vaultDir);
  if (!files.length) throw new ConfigError(`${vaultDir} has no files to import`);
  const cfg = configFromFlags(flags);
  log(`Connecting to ${cfg.server} …`);
  const ws = await joinWorkspace(cfg, { log });
  const into = flags.get("into");
  const containerTitle = flags.has("root") ? undefined : typeof into === "string" ? into : path.basename(vaultDir);
  const maxMb = Number(flags.get("max-embed-mb") ?? 2);
  let lastPct = -1;
  const res = await importVault(ws.doc, nodeConverter(), files, {
    containerTitle,
    createdBy: "Vault import",
    maxEmbedBytes: (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : 2) * 1024 * 1024,
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 100);
      if (pct % 10 === 0 && pct !== lastPct) {
        lastPct = pct;
        process.stderr.write(`\r${pct}%`);
      }
    },
  });
  process.stderr.write("\r");
  await ws.close();
  process.stdout.write(
    [
      `Imported ${vaultDir}${containerTitle ? ` into "${containerTitle}"` : ""}:`,
      `  ${res.notes} notes, ${res.boards} whiteboards, ${res.folders} folders, ${res.images} images, ${res.links} links`,
      res.skipped.length ? `  skipped ${res.skipped.length} unsupported or unreferenced files` : "",
      ...res.warnings.slice(0, 20).map((w) => `  ! ${w}`),
      res.warnings.length > 20 ? `  … and ${res.warnings.length - 20} more warnings` : "",
    ]
      .filter(Boolean)
      .join("\n") + "\n",
  );
}

async function main() {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const cmd = positional[0];
  if (!cmd || flags.has("help") || flags.has("h") || (cmd !== "export" && cmd !== "import")) {
    log(USAGE);
    process.exit(cmd && cmd !== "help" ? 2 : 0);
  }
  try {
    if (cmd === "export") await runExport(flags);
    else await runImport(flags);
    process.exit(0);
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
    if (err instanceof ConfigError) log(`\n${USAGE}`);
    process.exit(err instanceof ConfigError ? 2 : 1);
  }
}

// Allow importing the helpers (tests) without running the CLI.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();

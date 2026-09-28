// Settings → Data: import Obsidian vaults / markdown / Excalidraw files and
// Basalt backups, export an Obsidian-compatible vault, single pages and full
// backups. Conversion is the same shared logic the vault CLI uses.

import { useContext, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import * as Y from "yjs";
import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { AppContext, usePages } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { downloadBlob } from "../../lib/markdown.ts";
import { fileToStoredUrl } from "../../lib/files.ts";
import { getSettings } from "../../lib/settings.ts";
import { displayTitle, listPages, metaMap, todayKey, type PageMeta } from "../../../shared/model.ts";
import { safeFileName } from "../../../shared/markdown.ts";
import { isExcalidrawFileName } from "../../../shared/excalidraw-md.ts";
import { VaultExporter, importVault, type VaultImportResult, type VaultSourceFile } from "../../../shared/vault.ts";
import { Icon } from "../ui.tsx";
import { supportsFolderPicker } from "../../lib/platform.ts";
import { browserConverter } from "./converter.ts";
import "./ImportExportPanel.css";

interface Picked {
  path: string;
  file: File;
}

interface Job {
  label: string;
  done: number;
  total: number;
}

interface Outcome {
  tone: "success" | "error";
  title: string;
  lines: string[];
  details?: { summary: string; items: string[] }[];
  openId?: string | null;
}

interface PendingRestore {
  bytes: Uint8Array;
  fileName: string;
  pages: number;
  name: string | null;
}

const IMPORT_ORIGIN = "import";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

function isImportable(path: string): boolean {
  return /\.(md|markdown)$/i.test(path) || isExcalidrawFileName(path);
}

/** Read dropped files and folders (recursively) with their relative paths. */
async function filesFromDrop(dt: DataTransfer): Promise<{ files: Picked[]; folder: string | null }> {
  const entries = [...dt.items]
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return { files: [...dt.files].map((file) => ({ path: file.name, file })), folder: null };
  const out: Picked[] = [];
  const readFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));
  const readBatch = (reader: FileSystemDirectoryReader) =>
    new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
  const walk = async (entry: FileSystemEntry, prefix: string) => {
    if (entry.name.startsWith(".")) return;
    if (entry.isFile) {
      out.push({ path: prefix + entry.name, file: await readFile(entry as FileSystemFileEntry) });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await readBatch(reader);
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, "");
  const single = entries.length === 1 && entries[0].isDirectory ? entries[0].name : null;
  return {
    files: single ? out.map((f) => ({ ...f, path: f.path.slice(single.length + 1) })) : out,
    folder: single,
  };
}

/** Pages in sidebar order with their depth, for the single-page picker. */
function pageOutline(pages: PageMeta[]): { meta: PageMeta; depth: number }[] {
  const live = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, PageMeta[]>();
  for (const p of pages) {
    const parent = p.parentId && live.has(p.parentId) ? p.parentId : null;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent)!.push(p);
  }
  const out: { meta: PageMeta; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    const kids = (byParent.get(parent) ?? []).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    for (const k of kids) {
      out.push({ meta: k, depth });
      if (depth < 12) walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Unpack .zip files into import entries, dropping OS metadata and hidden files. */
async function expandZips(zips: Picked[]): Promise<{ files: Picked[]; root: string | null }> {
  const files: Picked[] = [];
  for (const z of zips) {
    const entries = unzipSync(new Uint8Array(await z.file.arrayBuffer()));
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith("/") || name.startsWith("__MACOSX/") || name.split("/").some((seg) => seg.startsWith("."))) continue;
      const base = name.split("/").pop()!;
      files.push({ path: name, file: new File([data as BlobPart], base) });
    }
  }
  // Strip a single top-level folder (a zipped vault) and use it as the import name.
  const tops = new Set(files.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")));
  if (tops.size === 1 && !tops.has("")) {
    const root = [...tops][0];
    return { files: files.map((f) => ({ ...f, path: f.path.slice(root.length + 1) })), root };
  }
  return { files, root: zips.length === 1 ? zips[0].path.replace(/\.zip$/i, "") : null };
}

export function ImportExportPanel({ ws }: { ws: Workspace }) {
  const app = useContext(AppContext);
  const pages = usePages(ws);
  const outline = useMemo(() => pageOutline(pages), [pages]);
  const conv = useMemo(() => browserConverter(), []);
  const [job, setJob] = useState<Job | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [restore, setRestore] = useState<PendingRestore | null>(null);
  const [together, setTogether] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [pageId, setPageId] = useState<string>("");
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const busy = !!job;
  const wsName = safeFileName(ws.info.name || metaMap(ws.doc).get("name") || "Basalt");

  useEffect(() => {
    // React has no typed prop for directory pickers.
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    if (!pageId || !outline.some((o) => o.meta.id === pageId)) setPageId(outline[0]?.meta.id ?? "");
  }, [outline, pageId]);

  const fail = (title: string, err: unknown) => {
    setJob(null);
    setOutcome({ tone: "error", title, lines: [err instanceof Error ? err.message : String(err)] });
  };

  // ---- import --------------------------------------------------------------------

  const prepareRestore = async (file: File) => {
    setOutcome(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const probe = new Y.Doc();
      try {
        Y.applyUpdate(probe, bytes);
      } catch {
        throw new Error(`${file.name} is not a Basalt backup.`);
      }
      const count = listPages(probe, { includeDeleted: true }).length;
      if (!count && probe.getMap("types").size === 0) throw new Error(`${file.name} does not contain any Basalt data.`);
      setRestore({ bytes, fileName: file.name, pages: count, name: (probe.getMap("meta").get("name") as string | undefined) ?? null });
      probe.destroy();
    } catch (err) {
      fail("Couldn't read the backup", err);
    }
  };

  const confirmRestore = () => {
    if (!restore) return;
    try {
      Y.applyUpdate(ws.doc, restore.bytes, IMPORT_ORIGIN);
      setOutcome({
        tone: "success",
        title: "Backup restored",
        lines: [`Merged ${plural(restore.pages, "page")} from ${restore.fileName} into this workspace.`],
      });
      app?.toast("Backup restored");
    } catch (err) {
      fail("Restore failed", err);
    }
    setRestore(null);
  };

  const runImport = async (input: Picked[], inputFolder: string | null) => {
    setOutcome(null);
    setRestore(null);
    let picked = input;
    let folder = inputFolder;
    // A zipped vault (the way to bring a folder in on iPhone/iPad) is unpacked in memory.
    const zips = input.filter((p) => /\.zip$/i.test(p.path));
    if (zips.length) {
      try {
        const expanded = await expandZips(zips);
        picked = [...input.filter((p) => !/\.zip$/i.test(p.path)), ...expanded.files];
        folder = folder ?? expanded.root;
      } catch (err) {
        fail("Couldn't open the zip file", err);
        return;
      }
    }
    const backups = picked.filter((p) => /\.basalt$/i.test(p.path));
    if (backups.length && backups.length === picked.length) {
      await prepareRestore(backups[0].file);
      return;
    }
    const byPath = new Map(picked.map((p) => [p.path, p.file]));
    const sources: VaultSourceFile[] = picked.map(({ path, file }) => ({
      path,
      size: file.size,
      mtime: file.lastModified || undefined,
      read: async () => new Uint8Array(await file.arrayBuffer()),
    }));
    const importable = sources.filter((s) => isImportable(s.path)).length;
    if (!importable) {
      setOutcome({
        tone: "error",
        title: "Nothing to import",
        lines: ["No markdown notes (.md) or Excalidraw drawings (.excalidraw, .excalidraw.md) were found."],
      });
      return;
    }
    const containerTitle = together && (folder || importable > 1) ? folder || `Imported ${todayKey()}` : undefined;
    setJob({ label: "Reading files…", done: 0, total: 1 });
    let last = 0;
    try {
      const res: VaultImportResult = await importVault(ws.doc, conv, sources, {
        containerTitle,
        createdBy: getSettings().identity.name,
        origin: IMPORT_ORIGIN,
        imageToDataUrl: (f) => fileToStoredUrl(byPath.get(f.path)!),
        onProgress: (done, total, label) => {
          const now = performance.now();
          if (now - last > 60 || done === total) {
            last = now;
            setJob({ label, done, total });
          }
        },
      });
      setJob(null);
      const firstPage = res.rootId ?? listPages(ws.doc).sort((a, b) => b.createdAt - a.createdAt)[0]?.id ?? null;
      const parts = [
        res.notes && plural(res.notes, "note"),
        res.boards && plural(res.boards, "whiteboard"),
        res.folders && plural(res.folders, "folder"),
        res.images && plural(res.images, "image"),
        res.links && plural(res.links, "link"),
      ].filter(Boolean);
      const details: Outcome["details"] = [];
      if (res.warnings.length) details.push({ summary: plural(res.warnings.length, "warning"), items: res.warnings });
      if (res.skipped.length) details.push({ summary: `${plural(res.skipped.length, "file")} skipped (unsupported or unused)`, items: res.skipped });
      setOutcome({
        tone: "success",
        title: containerTitle ? `Imported into “${containerTitle}”` : "Import complete",
        lines: [parts.length ? `Created ${parts.join(", ")}.` : "Nothing new was created."],
        details,
        openId: firstPage,
      });
      app?.toast(`Imported ${plural(res.pages, "page")}`);
    } catch (err) {
      fail("Import failed", err);
    }
  };

  const onPickFolder = (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list];
    const root = files[0].webkitRelativePath.split("/")[0] || null;
    const picked = files
      .filter((f) => !f.webkitRelativePath.split("/").some((seg) => seg.startsWith(".")))
      .map((file) => ({ path: root ? file.webkitRelativePath.slice(root.length + 1) : file.name, file }));
    void runImport(picked, root);
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    void runImport(
      [...list].map((file) => ({ path: file.name, file })),
      null,
    );
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    try {
      const { files, folder } = await filesFromDrop(e.dataTransfer);
      if (files.length) await runImport(files, folder);
    } catch (err) {
      fail("Couldn't read the dropped files", err);
    }
  };

  // ---- export --------------------------------------------------------------------

  const exportVault = async () => {
    setOutcome(null);
    setJob({ label: "Preparing…", done: 0, total: Math.max(1, pages.length) });
    try {
      let last = 0;
      const exporter = new VaultExporter(ws.doc, conv, {
        yieldEvery: 4,
        onProgress: (done, total, label) => {
          const now = performance.now();
          if (now - last > 60 || done === total) {
            last = now;
            setJob({ label, done, total });
          }
        },
      });
      const files = await exporter.build();
      setJob({ label: "Compressing…", done: 1, total: 1 });
      await new Promise((r) => setTimeout(r, 0));
      const zippable: Zippable = {};
      let bytes = 0;
      for (const [path, data] of files) {
        const u8 = typeof data === "string" ? strToU8(data) : data;
        bytes += u8.byteLength;
        // Images are already compressed; storing them avoids wasted CPU.
        zippable[`${wsName}/${path}`] = [u8, { level: typeof data === "string" ? 6 : 0 }];
      }
      const zipped = zipSync(zippable);
      downloadBlob(`${wsName}.zip`, new Blob([zipped as BlobPart], { type: "application/zip" }));
      setJob(null);
      setOutcome({
        tone: "success",
        title: "Vault exported",
        lines: [
          `${plural(files.size, "file")} (${formatBytes(bytes)} → ${formatBytes(zipped.byteLength)} zipped). Unzip it and open the folder as a vault in Obsidian — CLAUDE.md explains the layout to Claude Code.`,
        ],
      });
    } catch (err) {
      fail("Export failed", err);
    }
  };

  const exportPage = async () => {
    if (!pageId) return;
    setOutcome(null);
    try {
      const file = await new VaultExporter(ws.doc, conv, { claudeMd: false }).pageFile(pageId);
      downloadBlob(file.name, new Blob([file.data], { type: file.mime }));
    } catch (err) {
      fail("Export failed", err);
    }
  };

  const exportBackup = () => {
    setOutcome(null);
    const update = Y.encodeStateAsUpdate(ws.doc);
    downloadBlob(`${wsName} ${todayKey()}.basalt`, new Blob([update as BlobPart], { type: "application/octet-stream" }));
    setOutcome({
      tone: "success",
      title: "Backup downloaded",
      lines: [`${formatBytes(update.byteLength)} snapshot of every page, type, flashcard review and setting in this workspace. Keep it somewhere safe — it is not encrypted.`],
    });
  };

  const pct = job ? Math.round((job.done / Math.max(1, job.total)) * 100) : 0;

  return (
    <div className="iep">
      <section className="iep-section">
        <div className="iep-heading">
          <Icon name="upload" />
          <span>Import</span>
        </div>
        <div
          className={`iep-drop${dragging ? " dragging" : ""}${busy ? " disabled" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="iep-drop-icon" aria-hidden>
            📥
          </div>
          <div className="iep-drop-title">Drop an Obsidian vault, markdown notes or Excalidraw drawings</div>
          <div className="iep-drop-sub">
            Folders become pages with sub-pages, frontmatter becomes properties, [[links]] and ![[images]] are kept, and
            .excalidraw drawings become whiteboards.
          </div>
          <div className="iep-actions">
            {supportsFolderPicker && (
              <button className="btn btn-primary" disabled={busy} onClick={() => folderInput.current?.click()}>
                Choose vault folder…
              </button>
            )}
            <button
              className={`btn${supportsFolderPicker ? "" : " btn-primary"}`}
              disabled={busy}
              onClick={() => filesInput.current?.click()}
            >
              {supportsFolderPicker ? "Choose files or .zip…" : "Choose .zip or files…"}
            </button>
          </div>
          {!supportsFolderPicker && (
            <div className="iep-drop-sub">
              On iPhone and iPad, compress your vault folder first (Files app → long-press the folder → Compress), then
              choose the .zip.
            </div>
          )}
          <input
            ref={folderInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              onPickFolder(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={filesInput}
            type="file"
            multiple
            hidden
            accept=".md,.markdown,.excalidraw,.zip,.basalt,text/markdown,application/zip"
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <label className="iep-check">
          <input type="checkbox" checked={together} onChange={(e) => setTogether(e.target.checked)} />
          <span>Keep each import together inside a new page</span>
        </label>
        <div className="iep-row">
          <div className="iep-row-text">
            <strong>Restore a backup</strong>
            <span>Merge a .basalt backup into this workspace.</span>
          </div>
          <button className="btn" disabled={busy} onClick={() => backupInput.current?.click()}>
            Choose backup…
          </button>
          <input
            ref={backupInput}
            type="file"
            hidden
            accept=".basalt,application/octet-stream"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void prepareRestore(f);
              e.target.value = "";
            }}
          />
        </div>
        {restore && (
          <div className="iep-confirm" role="alertdialog" aria-label="Confirm restore">
            <div>
              <strong>{restore.fileName}</strong> contains {plural(restore.pages, "page")}
              {restore.name ? <> from “{restore.name}”</> : null}. Restoring merges it into this workspace: pages missing
              here are added, nothing is deleted. Pages that were permanently deleted here stay deleted — restore into a
              new, empty workspace to get everything back.
            </div>
            <div className="iep-actions">
              <button className="btn btn-primary" onClick={confirmRestore}>
                Merge backup
              </button>
              <button className="btn btn-ghost" onClick={() => setRestore(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="iep-section">
        <div className="iep-heading">
          <Icon name="download" />
          <span>Export</span>
        </div>
        <div className="iep-cards">
          <div className="iep-card">
            <div className="iep-card-title">
              <span aria-hidden>🗃️</span> Obsidian vault
            </div>
            <p>
              Every page as markdown with frontmatter and [[links]], whiteboards as .excalidraw, attachments, and a
              CLAUDE.md guide — ready for Obsidian or Claude Code.
            </p>
            <button className="btn" disabled={busy || !pages.length} onClick={exportVault}>
              Download .zip
            </button>
          </div>
          <div className="iep-card">
            <div className="iep-card-title">
              <span aria-hidden>📄</span> Single page
            </div>
            <p>One page as a self-contained markdown file (whiteboards as .excalidraw).</p>
            <select className="select" value={pageId} disabled={!outline.length} onChange={(e) => setPageId(e.target.value)} aria-label="Page to export">
              {outline.map(({ meta, depth }) => (
                <option key={meta.id} value={meta.id}>
                  {" ".repeat(depth * 2)}
                  {meta.icon ? `${meta.icon} ` : ""}
                  {displayTitle(meta)}
                </option>
              ))}
            </select>
            <button className="btn" disabled={busy || !pageId} onClick={exportPage}>
              Download
            </button>
          </div>
          <div className="iep-card">
            <div className="iep-card-title">
              <span aria-hidden>💾</span> Full backup
            </div>
            <p>A complete snapshot of this workspace (.basalt) that you can restore or merge later.</p>
            <button className="btn" disabled={busy} onClick={exportBackup}>
              Download backup
            </button>
          </div>
        </div>
      </section>

      {job && (
        <div className="iep-progress" role="status" aria-live="polite">
          <div className="iep-progress-row">
            <span className="spinner" />
            <span className="iep-progress-label">{job.label}</span>
            <span className="iep-progress-pct">{pct}%</span>
          </div>
          <div className="iep-bar">
            <div className="iep-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {outcome && (
        <div className={`iep-outcome ${outcome.tone}`} role="status">
          <div className="iep-outcome-head">
            <Icon name={outcome.tone === "success" ? "check" : "x"} />
            <strong>{outcome.title}</strong>
            <span className="spacer" />
            {outcome.openId && app && (
              <button className="btn btn-sm" onClick={() => app.openPage(outcome.openId!)}>
                Open
              </button>
            )}
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setOutcome(null)}>
              <Icon name="x" size={14} />
            </button>
          </div>
          {outcome.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
          {outcome.details?.map((d) => (
            <details key={d.summary}>
              <summary>{d.summary}</summary>
              <ul>
                {d.items.slice(0, 200).map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
                {d.items.length > 200 && <li>… and {d.items.length - 200} more</li>}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

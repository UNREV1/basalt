// Joining a Basalt workspace from Node: parse share links / CLI options,
// sync through the relay (end-to-end encrypted), optionally keep an offline
// cache, and flush pending edits before exiting.

import fs from "node:fs";
import path from "node:path";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { RelayProvider } from "../shared/relay-client.ts";
import { isValidKey, roomIdForKey } from "../shared/crypto.ts";

export interface WorkspaceConfig {
  key: string;
  /** Relay WebSocket URL, e.g. wss://basalt.example.com/sync */
  server: string;
  name: string | null;
  /** Directory for an offline cache of the workspace (optional). */
  local: string | null;
  timeoutMs: number;
}

export class ConfigError extends Error {}

/** Parse `https://host/#/join/<key>?s=<wss://host/sync>&n=<name>`. */
export function parseShareLink(link: string): { key: string; server: string; name: string | null } {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new ConfigError(`Not a valid share link: ${link}`);
  }
  const hash = url.hash.replace(/^#/, "");
  const [route, query = ""] = hash.split("?");
  const parts = route.split("/").filter(Boolean);
  if (parts[0] !== "join" || !parts[1]) {
    throw new ConfigError("The link is not a Basalt share link (expected …/#/join/<key>). Copy it from Share or from the Claude memory page in the app.");
  }
  const q = new URLSearchParams(query);
  const key = decodeURIComponent(parts[1]);
  const server = q.get("s") || `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/sync`;
  return { key, server, name: q.get("n") };
}

/** Read `--flag value` / `--flag=value` / boolean `--flag` options. */
export function parseFlags(argv: string[]): { flags: Map<string, string | true>; positional: string[] } {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags.set(a.slice(2), argv[++i]);
      else flags.set(a.slice(2), true);
    } else positional.push(a);
  }
  return { flags, positional };
}

export function configFromFlags(flags: Map<string, string | true>, env: NodeJS.ProcessEnv = process.env): WorkspaceConfig {
  const str = (name: string) => {
    const v = flags.get(name);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const link = str("link") ?? env.BASALT_LINK ?? null;
  let key = str("key") ?? env.BASALT_KEY ?? null;
  let server = str("server") ?? env.BASALT_SERVER ?? null;
  let name: string | null = null;
  if (link) {
    const parsed = parseShareLink(link);
    key ??= parsed.key;
    server ??= parsed.server;
    name = parsed.name;
  }
  if (!key) throw new ConfigError("Missing workspace: pass --link \"<share link>\" (or set BASALT_LINK), or --key <key> with --server <wss://host/sync>.");
  if (!isValidKey(key)) throw new ConfigError("The workspace key in the link is invalid (it must be the 43-character key after #/join/).");
  if (!server) throw new ConfigError("Missing relay URL: pass --server wss://<host>/sync (or use a full share link).");
  if (!/^wss?:\/\//.test(server)) throw new ConfigError(`The relay URL must start with ws:// or wss:// (got ${server}).`);
  const timeout = Number(str("timeout") ?? env.BASALT_TIMEOUT ?? 20);
  return {
    key,
    server,
    name,
    local: str("local") ?? env.BASALT_LOCAL ?? null,
    timeoutMs: (Number.isFinite(timeout) && timeout > 0 ? timeout : 20) * 1000,
  };
}

export interface JoinedWorkspace {
  doc: Y.Doc;
  awareness: Awareness;
  provider: RelayProvider;
  /** True when we are working from the offline cache because the relay was unreachable. */
  offline: boolean;
  /** Push pending edits to the relay (and cache), then disconnect. */
  close(): Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function joinWorkspace(
  cfg: WorkspaceConfig,
  opts: { presence?: Record<string, unknown>; log?: (msg: string) => void } = {},
): Promise<JoinedWorkspace> {
  const log = opts.log ?? (() => {});
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  if (opts.presence) awareness.setLocalState(opts.presence);
  else awareness.setLocalState(null);

  let cacheFile: string | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const saveCache = () => {
    if (!cacheFile) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const tmp = `${cacheFile}.tmp`;
    fs.writeFileSync(tmp, Y.encodeStateAsUpdate(doc));
    fs.renameSync(tmp, cacheFile);
  };
  if (cfg.local) {
    fs.mkdirSync(cfg.local, { recursive: true });
    cacheFile = path.join(cfg.local, `${roomIdForKey(cfg.key)}.ydoc`);
    if (fs.existsSync(cacheFile)) {
      try {
        Y.applyUpdate(doc, new Uint8Array(fs.readFileSync(cacheFile)), "cache");
        log(`Loaded offline cache ${cacheFile}`);
      } catch (err) {
        log(`Ignoring unreadable cache ${cacheFile}: ${err instanceof Error ? err.message : err}`);
      }
    }
    doc.on("update", () => {
      if (!saveTimer) saveTimer = setTimeout(saveCache, 1000);
    });
  }
  const hadCache = pagesCount(doc) > 0;

  const provider = new RelayProvider(doc, { url: cfg.server, key: cfg.key, awareness });
  provider.connect();
  let offline = false;
  try {
    await provider.whenSynced(cfg.timeoutMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fatal = provider.status === "error";
    if (!fatal && hadCache) {
      offline = true;
      log(`Relay ${cfg.server} unreachable (${msg}); working from the offline cache and retrying in the background.`);
    } else {
      provider.destroy();
      awareness.destroy();
      throw new Error(
        fatal
          ? `The relay refused the workspace: ${msg}`
          : `Could not sync with ${cfg.server} within ${Math.round(cfg.timeoutMs / 1000)}s (${msg}). Check that the Basalt server is running and reachable, and that the link is complete.`,
      );
    }
  }

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    // The provider batches outgoing updates; wait until they have left the socket.
    const internals = provider as unknown as { outbox?: unknown[]; flushTimer?: unknown; ws?: { bufferedAmount?: number } | null };
    const deadline = Date.now() + 4000;
    while (provider.synced && Date.now() < deadline) {
      const pending = (internals.outbox?.length ?? 0) > 0 || !!internals.flushTimer || (internals.ws?.bufferedAmount ?? 0) > 0;
      if (!pending) break;
      await sleep(25);
    }
    if (provider.synced) await sleep(150);
    saveCache();
    provider.destroy();
    awareness.destroy();
  };
  return { doc, awareness, provider, offline, close };
}

function pagesCount(doc: Y.Doc): number {
  return doc.getMap("pages").size;
}

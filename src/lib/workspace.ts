// Client-side workspace: a Y.Doc persisted in IndexedDB and (optionally)
// synced end-to-end encrypted through a relay, plus presence via awareness.

import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import { RelayProvider, type SyncStatus } from "../../shared/relay-client.ts";
import { generateKey, roomIdForKey } from "../../shared/crypto.ts";
import { ensureDefaults, metaMap } from "../../shared/model.ts";
import { defaultSyncUrl, getSettings, type Identity } from "./settings.ts";

export interface WorkspaceInfo {
  id: string;
  key: string;
  name: string;
  icon: string;
  /** Relay URL for this workspace; null = device default. */
  server: string | null;
  sync: boolean;
  lastOpened: number;
}

export type WorkspaceStatus = SyncStatus | "local";

export interface PresenceState {
  user: Identity;
  /** Page the user is looking at. */
  pageId?: string;
  /** Pointer on a canvas page (board/paint), in scene coordinates. */
  pointer?: { pageId: string; x: number; y: number; tool?: string };
  [key: string]: unknown;
}

const REGISTRY_KEY = "basalt:workspaces";

export function loadRegistry(): WorkspaceInfo[] {
  try {
    return JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRegistry(list: WorkspaceInfo[]) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("basalt:registry"));
}

export function upsertInfo(info: WorkspaceInfo) {
  const list = loadRegistry().filter((w) => w.id !== info.id);
  list.push(info);
  saveRegistry(list);
}

export function newWorkspaceInfo(name: string, sync = true): WorkspaceInfo {
  const key = generateKey();
  return { id: roomIdForKey(key), key, name, icon: "🪨", server: null, sync, lastOpened: Date.now() };
}

export function infoFromKey(key: string, server: string | null, name = "Shared workspace"): WorkspaceInfo {
  const existing = loadRegistry().find((w) => w.key === key);
  if (existing) return { ...existing, sync: true, server: server ?? existing.server };
  return { id: roomIdForKey(key), key, name, icon: "🪨", server, sync: true, lastOpened: Date.now() };
}

export function removeInfo(id: string) {
  saveRegistry(loadRegistry().filter((w) => w.id !== id));
}

export async function deleteLocalData(id: string) {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(`basalt-${id}`);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

/** Invite link. `origin` overrides this page's origin (e.g. the computer's Wi-Fi address). */
export function shareLink(info: WorkspaceInfo, origin = location.origin): string {
  const base = `${origin}${location.pathname}`;
  const params = new URLSearchParams();
  const server = info.server ?? getSettings().syncUrl;
  if (server) params.set("s", server);
  if (info.name) params.set("n", info.name);
  const q = params.toString();
  return `${base}#/join/${info.key}${q ? `?${q}` : ""}`;
}

type Listener = () => void;

export class Workspace {
  info: WorkspaceInfo;
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  readonly idb: IndexeddbPersistence;
  provider: RelayProvider | null = null;
  readonly ready: Promise<void>;
  private listeners = new Set<Listener>();
  private offProvider: (() => void) | null = null;

  constructor(info: WorkspaceInfo) {
    this.info = info;
    this.doc = new Y.Doc();
    this.awareness = new Awareness(this.doc);
    this.awareness.setLocalState({ user: getSettings().identity } satisfies PresenceState);
    this.idb = new IndexeddbPersistence(`basalt-${info.id}`, this.doc);
    this.ready = this.idb.whenSynced.then(() => {
      ensureDefaults(this.doc, info.name);
    });
    metaMap(this.doc).observe(() => {
      const name = metaMap(this.doc).get("name");
      const icon = metaMap(this.doc).get("icon");
      if ((name && name !== this.info.name) || (icon && icon !== this.info.icon)) {
        this.info = { ...this.info, name: name ?? this.info.name, icon: icon ?? this.info.icon };
        upsertInfo(this.info);
        this.emit();
      }
    });
    if (info.sync) this.startSync();
    window.addEventListener("online", this.onOnline);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    document.addEventListener("visibilitychange", this.onVisible);
  }

  get id() {
    return this.info.id;
  }

  get status(): WorkspaceStatus {
    return this.provider ? this.provider.status : "local";
  }

  get serverUrl(): string {
    return this.info.server || defaultSyncUrl();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private onOnline = () => this.provider?.reconnectNow();

  private onVisible = () => {
    if (document.visibilityState === "visible") this.provider?.checkAlive();
  };

  // Tell peers we left right away, instead of letting our cursor linger
  // until the awareness timeout; restore it if the page comes back (bfcache).
  private hiddenPresence: PresenceState | null = null;
  private onPageHide = () => {
    this.hiddenPresence = this.awareness.getLocalState() as PresenceState | null;
    removeAwarenessStates(this.awareness, [this.doc.clientID], "pagehide");
  };
  private onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted && this.hiddenPresence) this.awareness.setLocalState(this.hiddenPresence);
    this.hiddenPresence = null;
    if (e.persisted) this.provider?.checkAlive();
  };

  startSync() {
    if (this.provider) return;
    this.provider = new RelayProvider(this.doc, {
      url: this.serverUrl,
      key: this.info.key,
      awareness: this.awareness,
    });
    const off1 = this.provider.on("status", () => this.emit());
    const off2 = this.provider.on("synced", () => ensureDefaults(this.doc, this.info.name));
    this.offProvider = () => {
      off1();
      off2();
    };
    // Wait for local data first so the initial diff we upload is minimal.
    this.ready.then(() => this.provider?.connect());
    this.emit();
  }

  stopSync() {
    this.offProvider?.();
    this.provider?.destroy();
    this.provider = null;
    this.emit();
  }

  setSync(enabled: boolean, server?: string | null) {
    this.info = { ...this.info, sync: enabled, server: server === undefined ? this.info.server : server };
    upsertInfo(this.info);
    this.stopSync();
    if (enabled) this.startSync();
    this.emit();
  }

  rename(name: string, icon?: string) {
    this.doc.transact(() => {
      metaMap(this.doc).set("name", name);
      if (icon) metaMap(this.doc).set("icon", icon);
    });
  }

  setPresence(patch: Partial<PresenceState>) {
    const cur = (this.awareness.getLocalState() ?? {}) as PresenceState;
    this.awareness.setLocalState({ ...cur, ...patch, user: getSettings().identity });
  }

  destroy() {
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.stopSync();
    this.awareness.destroy();
    this.idb.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }
}

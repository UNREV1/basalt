// Yjs provider that syncs a document through the Basalt relay with
// end-to-end encryption. Works in browsers and in Node >= 22 (global WebSocket).
//
// Sync algorithm (the server is a dumb, append-only log of encrypted blobs):
//  1. On connect, JOIN and receive every stored blob, then SYNCED.
//  2. Merge the blobs, apply them locally, and compute the server's state
//     vector from the merged update.
//  3. Send whatever the server is missing (offline edits) as one update.
//  4. From then on, stream local updates (batched) and apply remote ones.
//  5. When the server asks, upload an encrypted snapshot so the log stays short.

import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { MSG, decodeMessage, encodeMessage, type Message } from "./protocol.ts";
import { authForKey, decrypt, encrypt, keyBytes, roomIdForKey } from "./crypto.ts";

export type SyncStatus = "offline" | "connecting" | "syncing" | "synced" | "error";

export interface RelayProviderOptions {
  url: string;
  key: string;
  awareness?: awarenessProtocol.Awareness;
  /** Compact on join when the replayed log has more blobs than this. */
  compactThreshold?: number;
  /** Batch window for outgoing updates in ms. */
  batchMs?: number;
}

type Listener = (...args: any[]) => void;

const EMPTY_UPDATE_LEN = 2;

export class RelayProvider {
  readonly doc: Y.Doc;
  readonly awareness?: awarenessProtocol.Awareness;
  readonly room: string;
  url: string;
  status: SyncStatus = "offline";
  lastError = "";
  private ws: WebSocket | null = null;
  private readonly key: Uint8Array;
  private readonly auth: string;
  private pending: Uint8Array[] = [];
  private outbox: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private backoff = 1000;
  private maxSeqSeen = 0;
  private ref = 0;
  private wantConnected = false;
  private destroyed = false;
  private listeners = new Map<string, Set<Listener>>();
  private readonly compactThreshold: number;
  private readonly batchMs: number;

  constructor(doc: Y.Doc, opts: RelayProviderOptions) {
    this.doc = doc;
    this.url = opts.url;
    this.awareness = opts.awareness;
    this.key = keyBytes(opts.key);
    this.room = roomIdForKey(opts.key);
    this.auth = authForKey(opts.key);
    this.compactThreshold = opts.compactThreshold ?? 200;
    this.batchMs = opts.batchMs ?? 40;
    doc.on("update", this.onDocUpdate);
    this.awareness?.on("update", this.onAwarenessUpdate);
  }

  on(event: "status" | "synced" | "error", fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  private emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  private setStatus(s: SyncStatus) {
    if (this.status === s) return;
    this.status = s;
    this.emit("status", s);
  }

  get synced() {
    return this.status === "synced";
  }

  /** Resolves once the first full sync completes (or rejects on fatal error). */
  whenSynced(timeoutMs = 20000): Promise<void> {
    if (this.synced) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        off1();
        off2();
        reject(new Error(this.lastError || "Timed out waiting for sync"));
      }, timeoutMs);
      const off1 = this.on("synced", () => {
        clearTimeout(t);
        off1();
        off2();
        resolve();
      });
      const off2 = this.on("error", (msg: string) => {
        clearTimeout(t);
        off1();
        off2();
        reject(new Error(msg));
      });
    });
  }

  connect() {
    if (this.destroyed) return;
    this.wantConnected = true;
    if (this.ws) return;
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.lastError = String(err);
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.pending = [];
      this.maxSeqSeen = 0;
      this.lastMessageAt = Date.now();
      this.setStatus("syncing");
      this.send({ type: MSG.JOIN, room: this.room, auth: this.auth, since: 0 });
      this.pingTimer = setInterval(() => {
        if (Date.now() - this.lastMessageAt > 70000) {
          ws.close();
          return;
        }
        this.send({ type: MSG.PING });
      }, 25000);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = Date.now();
      try {
        this.handle(decodeMessage(new Uint8Array(ev.data as ArrayBuffer)));
      } catch (err) {
        console.warn("[basalt] bad message", err);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.cleanupSocket();
      if (this.status !== "error") this.setStatus("offline");
      this.dropRemoteAwareness();
      if (this.wantConnected) this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose follows; keep status handling there.
    };
  }

  disconnect() {
    this.wantConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      this.sendAwarenessRemoval();
      const ws = this.ws;
      this.cleanupSocket();
      ws.close();
    }
    this.dropRemoteAwareness();
    this.setStatus("offline");
  }

  /** Reconnect immediately (e.g. when the browser comes back online). */
  reconnectNow() {
    if (!this.wantConnected || this.ws) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.backoff = 1000;
    this.connect();
  }

  /**
   * Verify the connection after the app was suspended (iOS/iPadOS freeze
   * backgrounded pages and can leave a dead socket that still looks open):
   * ping, and reconnect if nothing comes back quickly.
   */
  checkAlive(timeoutMs = 4000) {
    if (!this.wantConnected) return;
    const ws = this.ws;
    if (!ws) {
      this.reconnectNow();
      return;
    }
    if (ws.readyState !== 1) return;
    const before = this.lastMessageAt;
    this.send({ type: MSG.PING });
    setTimeout(() => {
      if (this.ws === ws && this.lastMessageAt === before) ws.close();
    }, timeoutMs);
  }

  destroy() {
    this.disconnect();
    this.destroyed = true;
    this.doc.off("update", this.onDocUpdate);
    this.awareness?.off("update", this.onAwarenessUpdate);
    this.listeners.clear();
  }

  private cleanupSocket() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.pingTimer = null;
    this.flushTimer = null;
    this.outbox = [];
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.destroyed) return;
    const delay = this.backoff + Math.random() * 500;
    this.backoff = Math.min(this.backoff * 2, 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantConnected) this.connect();
    }, delay);
  }

  private send(msg: Message) {
    const ws = this.ws;
    if (ws && ws.readyState === 1) ws.send(encodeMessage(msg));
  }

  private open(data: Uint8Array): Uint8Array | null {
    try {
      return decrypt(this.key, data);
    } catch {
      return null;
    }
  }

  private handle(msg: Message) {
    switch (msg.type) {
      case MSG.BLOB: {
        this.maxSeqSeen = Math.max(this.maxSeqSeen, msg.seq);
        const plain = this.open(msg.data);
        if (!plain) {
          console.warn("[basalt] could not decrypt blob", msg.seq);
          return;
        }
        if (this.status === "syncing") this.pending.push(plain);
        else Y.applyUpdate(this.doc, plain, this);
        return;
      }
      case MSG.SYNCED: {
        this.maxSeqSeen = Math.max(this.maxSeqSeen, msg.lastSeq);
        const blobs = this.pending;
        this.pending = [];
        let serverSV: Uint8Array | undefined;
        if (blobs.length) {
          const merged = blobs.length === 1 ? blobs[0] : Y.mergeUpdates(blobs);
          Y.applyUpdate(this.doc, merged, this);
          serverSV = Y.encodeStateVectorFromUpdate(merged);
        }
        const missing = Y.encodeStateAsUpdate(this.doc, serverSV);
        if (missing.length > EMPTY_UPDATE_LEN) this.sendUpdate(missing);
        this.backoff = 1000;
        this.setStatus("synced");
        this.emit("synced");
        this.announceAwareness();
        if (msg.blobCount > this.compactThreshold) this.sendCompaction();
        return;
      }
      case MSG.ACK:
        this.maxSeqSeen = Math.max(this.maxSeqSeen, msg.seq);
        return;
      case MSG.AWARENESS: {
        if (!this.awareness) return;
        const plain = this.open(msg.data);
        if (plain) awarenessProtocol.applyAwarenessUpdate(this.awareness, plain, this);
        return;
      }
      case MSG.HELLO:
        this.announceAwareness();
        return;
      case MSG.COMPACT_REQUEST:
        if (this.status === "synced") this.sendCompaction();
        return;
      case MSG.ERROR:
        this.lastError = msg.message;
        this.setStatus("error");
        this.emit("error", msg.message);
        this.wantConnected = false;
        this.ws?.close();
        return;
      case MSG.PONG:
        return;
      default:
        return;
    }
  }

  private sendUpdate(update: Uint8Array) {
    this.send({ type: MSG.UPDATE, ref: ++this.ref, data: encrypt(this.key, update) });
  }

  private sendCompaction() {
    const snapshot = Y.encodeStateAsUpdate(this.doc);
    this.send({ type: MSG.COMPACT, upTo: this.maxSeqSeen, data: encrypt(this.key, snapshot) });
  }

  private flush = () => {
    this.flushTimer = null;
    if (!this.outbox.length || this.status !== "synced") {
      this.outbox = [];
      return;
    }
    const update = this.outbox.length === 1 ? this.outbox[0] : Y.mergeUpdates(this.outbox);
    this.outbox = [];
    this.sendUpdate(update);
  };

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.status !== "synced") return;
    this.outbox.push(update);
    if (!this.flushTimer) this.flushTimer = setTimeout(this.flush, this.batchMs);
  };

  private onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || !this.awareness || this.status !== "synced") return;
    const changed = added.concat(updated, removed);
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed);
    this.send({ type: MSG.AWARENESS, data: encrypt(this.key, update) });
  };

  private announceAwareness() {
    const state = this.awareness?.getLocalState();
    // Re-setting the state bumps its clock so peers accept it even if they
    // previously saw us leave; the resulting "update" event sends it.
    if (this.awareness && state) this.awareness.setLocalState({ ...state });
  }

  private sendAwarenessRemoval() {
    if (!this.awareness) return;
    // Encode a null state for ourselves (same clock) without touching local state.
    const update = awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID], new Map());
    this.send({ type: MSG.AWARENESS, data: encrypt(this.key, update) });
  }

  private dropRemoteAwareness() {
    if (!this.awareness) return;
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    if (others.length) awarenessProtocol.removeAwarenessStates(this.awareness, others, this);
  }
}

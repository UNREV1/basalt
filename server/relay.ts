// Basalt relay: serves the built web app and relays end-to-end encrypted
// Yjs updates between devices. It stores only ciphertext. Used by the CLI
// entry (server/index.ts) and embedded by the desktop app.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { MSG, decodeMessage, encodeMessage, type Message } from "../shared/protocol.ts";
import { verifierForAuth } from "../shared/crypto.ts";
import { FileStorage, type Blob } from "./storage.ts";

/**
 * How a Claude app on this computer starts Basalt's MCP server (shown on the
 * Claude memory page so the setup command has real paths in it).
 */
export interface McpLaunch {
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** Offline cache for the MCP server, so Claude works while Basalt is closed. */
  cacheDir?: string;
}

export interface BasaltServerOptions {
  /** Where encrypted room logs are stored. */
  dataDir: string;
  /** Built web app to serve (dist/). */
  distDir: string;
  /** Per-room storage cap in bytes (default 200 MB). */
  maxRoomBytes?: number;
  /** Ask clients to compact after this many blobs (default 300). */
  compactAt?: number;
  /** Reported by /api/info to this computer only (see McpLaunch). */
  mcp?: McpLaunch;
}

export interface BasaltServer {
  server: http.Server;
  /** Start listening; resolves with the actual port (0 = pick a free one). */
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

const MAX_MESSAGE_BYTES = 50 * 1024 * 1024;
const ROOM_IDLE_MS = 5 * 60 * 1000;

/** Adapters other devices can't reach this computer through (virtual machines, WSL, VPNs, Bluetooth, hotspots). */
const VIRTUAL = /vethernet|virtualbox|vmware|vmnet|hyper-v|wsl|docker|^br-|^veth|virbr|bluetooth|tailscale|zerotier|vpn|^utun|^awdl|^llw|loopback|local area connection\*|npcap/i;

/** How likely an address is to be the one a phone on the same Wi-Fi can reach (higher is likelier). */
function reachability(name: string, address: string): number {
  let score = 0;
  if (VIRTUAL.test(name)) score -= 100;
  if (/wi-?fi|wlan|wireless|^wl/i.test(name)) score += 30;
  else if (/ethernet|^eth|^en/i.test(name)) score += 20;
  // Home networks; not VirtualBox's (192.168.56.x) or Windows' hotspot (192.168.137.x) ranges.
  if (/^192\.168\.(56|137)\./.test(address)) score -= 50;
  else if (address.startsWith("192.168.")) score += 10;
  else if (address.startsWith("10.")) score += 8;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 2;
  else if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) score -= 20; // carrier-grade NAT, Tailscale
  return score;
}

export interface LanNetwork {
  url: string;
  /** The adapter's name, e.g. "Wi-Fi" or "Ethernet". */
  name: string;
  /** Looks like a real home or office network (not a virtual adapter). */
  likely: boolean;
}

/**
 * This computer's addresses other devices can try, likeliest first: the Wi-Fi
 * or Ethernet one before virtual adapters (WSL, Hyper-V, VirtualBox, VPNs).
 */
export function lanNetworks(port: number, interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): LanNetwork[] {
  const out: (LanNetwork & { score: number })[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal || a.address.startsWith("169.254.")) continue;
      const score = reachability(name, a.address);
      out.push({ url: `http://${a.address}:${port}`, name, likely: score >= 0, score });
    }
  }
  return out.sort((x, y) => y.score - x.score).map(({ score: _, ...n }) => n);
}

/** http://<address>:<port> for each LAN IPv4 address, likeliest first, so other devices can join. */
export function lanUrls(port: number, interfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string[] {
  return lanNetworks(port, interfaces).map((n) => n.url);
}

export function createBasaltServer(opts: BasaltServerOptions): BasaltServer {
  const DIST_DIR = path.resolve(opts.distDir);
  const MAX_ROOM_BYTES = opts.maxRoomBytes ?? 200 * 1024 * 1024;
  const COMPACT_AT = opts.compactAt ?? 300;
  const storage = new FileStorage(path.resolve(opts.dataDir));
  let port = 0;

  interface Room {
    id: string;
    verifier: string;
    blobs: Blob[];
    bytes: number;
    nextSeq: number;
    clients: Set<WebSocket>;
    compactRequestedAt: number;
    idleTimer: ReturnType<typeof setTimeout> | null;
  }

  const rooms = new Map<string, Room>();
  const clientRoom = new WeakMap<WebSocket, Room>();

  function loadRoom(id: string, auth: string): Room | string {
    let room = rooms.get(id);
    const verifier = verifierForAuth(auth);
    if (!room) {
      const meta = storage.readMeta(id);
      if (meta && meta.verifier !== verifier) return "Access denied for this workspace";
      if (!meta) storage.writeMeta(id, { verifier, createdAt: Date.now() });
      const blobs = storage.readLog(id);
      room = {
        id,
        verifier,
        blobs,
        bytes: blobs.reduce((n, b) => n + b.data.length, 0),
        nextSeq: blobs.length ? blobs[blobs.length - 1].seq + 1 : 1,
        clients: new Set(),
        compactRequestedAt: 0,
        idleTimer: null,
      };
      rooms.set(id, room);
    } else if (room.verifier !== verifier) {
      return "Access denied for this workspace";
    }
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = null;
    return room;
  }

  function send(ws: WebSocket, msg: Message) {
    if (ws.readyState === ws.OPEN) ws.send(encodeMessage(msg));
  }

  function broadcast(room: Room, from: WebSocket | null, msg: Message) {
    const buf = encodeMessage(msg);
    for (const c of room.clients) if (c !== from && c.readyState === c.OPEN) c.send(buf);
  }

  function leave(ws: WebSocket) {
    const room = clientRoom.get(ws);
    if (!room) return;
    room.clients.delete(ws);
    clientRoom.delete(ws);
    if (room.clients.size === 0 && !room.idleTimer) {
      room.idleTimer = setTimeout(() => {
        if (room.clients.size === 0) rooms.delete(room.id);
      }, ROOM_IDLE_MS);
    }
  }

  function handle(ws: WebSocket, msg: Message) {
    if (msg.type === MSG.PING) return send(ws, { type: MSG.PONG });
    if (msg.type === MSG.JOIN) {
      if (clientRoom.has(ws)) return send(ws, { type: MSG.ERROR, message: "Already joined" });
      const room = loadRoom(msg.room, msg.auth);
      if (typeof room === "string") {
        send(ws, { type: MSG.ERROR, message: room });
        return ws.close();
      }
      for (const b of room.blobs) if (b.seq > msg.since) send(ws, { type: MSG.BLOB, seq: b.seq, data: b.data });
      send(ws, { type: MSG.SYNCED, lastSeq: room.nextSeq - 1, blobCount: room.blobs.length });
      broadcast(room, ws, { type: MSG.HELLO });
      room.clients.add(ws);
      clientRoom.set(ws, room);
      return;
    }
    const room = clientRoom.get(ws);
    if (!room) return send(ws, { type: MSG.ERROR, message: "Join a room first" });
    switch (msg.type) {
      case MSG.UPDATE: {
        if (room.bytes + msg.data.length > MAX_ROOM_BYTES) {
          return send(ws, { type: MSG.ERROR, message: "Workspace storage limit reached on this server" });
        }
        const blob = { seq: room.nextSeq++, data: msg.data };
        room.blobs.push(blob);
        room.bytes += blob.data.length;
        storage.append(room.id, blob);
        send(ws, { type: MSG.ACK, ref: msg.ref, seq: blob.seq });
        broadcast(room, ws, { type: MSG.BLOB, seq: blob.seq, data: blob.data });
        if (room.blobs.length > COMPACT_AT && Date.now() - room.compactRequestedAt > 30000) {
          room.compactRequestedAt = Date.now();
          send(ws, { type: MSG.COMPACT_REQUEST });
        }
        return;
      }
      case MSG.AWARENESS:
        if (msg.data.length < 64 * 1024) broadcast(room, ws, msg);
        return;
      case MSG.COMPACT: {
        if (msg.upTo >= room.nextSeq) return;
        const kept = room.blobs.filter((b) => b.seq > msg.upTo);
        room.blobs = [{ seq: msg.upTo, data: msg.data }, ...kept];
        room.bytes = room.blobs.reduce((n, b) => n + b.data.length, 0);
        storage.rewrite(room.id, room.blobs);
        return;
      }
      default:
        return;
    }
  }

  // ---- static files ----------------------------------------------------------

  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8",
  };

  function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end(JSON.stringify({ ok: true, app: "basalt", rooms: rooms.size }));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    let file = path.join(DIST_DIR, path.normalize(rel));
    if (!file.startsWith(DIST_DIR)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST_DIR, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("Basalt relay is running. Build the web app with `npm run build` to serve it from here.");
      return;
    }
    const ext = path.extname(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://x");
    if (pathname === "/api/info") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      // Local paths are only for pages opened on this computer.
      const local = /^(127\.|::1$|::ffff:127\.)/.test(req.socket.remoteAddress ?? "");
      const networks = lanNetworks(port);
      res.end(JSON.stringify({ app: "basalt", lan: networks.map((n) => n.url), networks, mcp: local ? (opts.mcp ?? null) : null }));
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://x");
    if (pathname !== "/sync") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws: WebSocket) => {
    let alive = true;
    ws.on("pong", () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30000);
    ws.on("message", (data, isBinary) => {
      if (!isBinary) return;
      try {
        const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
        handle(ws, decodeMessage(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)));
      } catch (err) {
        console.warn("[relay] bad message", err);
      }
    });
    ws.on("close", () => {
      clearInterval(heartbeat);
      leave(ws);
    });
  });

  return {
    server,
    listen: (p, host) =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(p, host, () => {
          server.off("error", reject);
          const addr = server.address();
          port = typeof addr === "object" && addr ? addr.port : p;
          resolve(port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        for (const c of wss.clients) c.terminate();
        for (const room of rooms.values()) if (room.idleTimer) clearTimeout(room.idleTimer);
        wss.close();
        server.close(() => resolve());
      }),
  };
}

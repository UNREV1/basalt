// Board presence: our pointer/selection/viewport published through workspace
// awareness, and peers turned into Excalidraw collaborators.
//
// Awareness fields (besides the shared `pointer: { pageId, x, y, tool }`):
//   board: { pageId, button, selected, away, following, viewport }

import { UserIdleState } from "@excalidraw/excalidraw";
import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types";
import type { Peer } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";

export type SceneBounds = readonly [number, number, number, number];

export interface BoardPresence {
  pageId: string;
  button: "up" | "down";
  /** Ids of elements selected on this board. */
  selected: string[];
  /** Tab hidden: peers render the cursor faded. */
  away: boolean;
  /** Client id of the peer being followed on this board, if any. */
  following: number | null;
  /** Visible scene bounds, published only while someone follows us. */
  viewport: SceneBounds | null;
}

type Tool = "pointer" | "laser";

const THROTTLE_MS = 40;

export class PresencePublisher {
  private readonly ws: Workspace;
  private readonly pageId: string;
  private pointer: { x: number; y: number; tool: Tool } | null = null;
  private board: BoardPresence;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = 0;
  private active = false;
  private followed = false;

  constructor(ws: Workspace, pageId: string) {
    this.ws = ws;
    this.pageId = pageId;
    this.board = { pageId, button: "up", selected: [], away: false, following: null, viewport: null };
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.board = { ...this.board, away: document.hidden };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.send();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.ws.setPresence({ pointer: undefined, board: undefined });
  }

  setPointer(x: number, y: number, tool: Tool, button: "up" | "down") {
    this.pointer = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, tool };
    this.patch({ button });
  }

  clearPointer() {
    if (!this.pointer) return;
    this.pointer = null;
    this.patch({ button: "up" });
  }

  setSelection(ids: string[]) {
    const cur = this.board.selected;
    if (ids.length === cur.length && ids.every((id, i) => id === cur[i])) return;
    this.patch({ selected: ids });
  }

  setFollowing(clientId: number | null) {
    this.patch({ following: clientId });
  }

  /** Someone started/stopped following us: publish our visible area while they do. */
  setFollowed(followed: boolean, bounds: () => SceneBounds) {
    if (followed === this.followed) return;
    this.followed = followed;
    this.setViewport(followed ? bounds() : null);
  }

  /** Our visible area changed (only published while followed). */
  viewportChanged(bounds: () => SceneBounds) {
    if (this.followed) this.setViewport(bounds());
  }

  private setViewport(bounds: SceneBounds | null) {
    const v = bounds && (bounds.map((n) => Math.round(n)) as unknown as SceneBounds);
    const cur = this.board.viewport;
    if (v && cur && v.every((n, i) => n === cur[i])) return;
    this.patch({ viewport: v });
  }

  private onVisibility = () => this.patch({ away: document.hidden });

  private patch(p: Partial<BoardPresence>) {
    this.board = { ...this.board, ...p };
    this.schedule();
  }

  private schedule() {
    if (!this.active || this.timer) return;
    const wait = THROTTLE_MS - (Date.now() - this.lastSent);
    if (wait <= 0) this.send();
    else this.timer = setTimeout(this.send, wait);
  }

  private send = () => {
    this.timer = null;
    if (!this.active) return;
    this.lastSent = Date.now();
    this.ws.setPresence({
      pointer: this.pointer ? { pageId: this.pageId, ...this.pointer } : undefined,
      board: this.board,
    });
  };
}

export function boardPresenceOf(peer: Peer | undefined, pageId: string): BoardPresence | null {
  const b = peer?.state.board as BoardPresence | undefined;
  return b && typeof b === "object" && b.pageId === pageId ? b : null;
}

// Excalidraw 0.18 derives cursor/selection/avatar colours from a hash of the
// collaborator id (37 pastel hues) and ignores `color`. Pick an id whose hash
// lands on the hue closest to the person's identity colour so the board
// matches the rest of the app.

function excalidrawHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
  return (Math.abs(hash) % 37) * 10;
}

function hueOf(color: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return null;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const idCache = new Map<string, string>();

export function collaboratorIdFor(clientId: number, color: string): string {
  const key = `${clientId}|${color}`;
  const hit = idCache.get(key);
  if (hit) return hit;
  const target = hueOf(color);
  let best = `basalt-${clientId}`;
  if (target !== null) {
    let bestDist = Infinity;
    for (let n = 0; n < 600 && bestDist > 5; n++) {
      const id = `basalt-${clientId}-${n}`;
      const diff = Math.abs(excalidrawHue(id) - target);
      const dist = Math.min(diff, 360 - diff);
      if (dist < bestDist) {
        bestDist = dist;
        best = id;
      }
    }
  }
  idCache.set(key, best);
  return best;
}

function darken(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.round(c * 0.72).toString(16).padStart(2, "0");
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/**
 * Peers looking at this board as Excalidraw collaborators, plus a signature
 * that changes only when something visible changes (so our own awareness
 * updates don't re-render the editor).
 */
export function collaboratorsFor(peers: Peer[], pageId: string): { map: Map<SocketId, Collaborator>; signature: string } {
  const map = new Map<SocketId, Collaborator>();
  const parts: unknown[] = [];
  for (const peer of peers) {
    const { state, clientId } = peer;
    const board = boardPresenceOf(peer, pageId);
    const pointer = state.pointer?.pageId === pageId ? state.pointer : undefined;
    if (!board && !pointer) continue;
    const color = state.user?.color || "#6e56cf";
    const socketId = String(clientId) as SocketId;
    const selected = board?.selected ?? [];
    map.set(socketId, {
      id: collaboratorIdFor(clientId, color),
      socketId,
      username: state.user?.name || "Anonymous",
      color: { background: color, stroke: darken(color) },
      pointer: pointer ? { x: pointer.x, y: pointer.y, tool: pointer.tool === "laser" ? "laser" : "pointer" } : undefined,
      button: board?.button ?? "up",
      selectedElementIds: Object.fromEntries(selected.map((id) => [id, true])),
      userState: board?.away ? UserIdleState.AWAY : UserIdleState.ACTIVE,
    });
    parts.push([clientId, state.user?.name, color, pointer?.x, pointer?.y, pointer?.tool, board?.button, board?.away, selected]);
  }
  return { map, signature: JSON.stringify(parts) };
}

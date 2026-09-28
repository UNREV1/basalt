// The workspace layout: which panels sit in the left and right docks, in
// what order, which are collapsed, and how wide the right dock is. Per
// device (localStorage), like the appearance settings; never synced.

import { useSyncExternalStore } from "react";

export type DockSide = "left" | "right";

export type PanelId = "nav" | "favorites" | "pages" | "outline" | "backlinks" | "graph" | "quests" | "assistant";

export interface PanelInfo {
  id: PanelId;
  title: string;
  icon: string;
  description: string;
  /** Can't be hidden: it's how you get around (it can still move). */
  required?: boolean;
  /** Takes the dock's spare height. */
  grow?: boolean;
}

export const PANELS: PanelInfo[] = [
  { id: "nav", title: "Navigate", icon: "home", description: "Search, Today, your assistant, skills, flashcards and more", required: true },
  { id: "favorites", title: "Favorites", icon: "star", description: "Pages you've starred" },
  { id: "pages", title: "Pages", icon: "template", description: "All your pages as a tree", grow: true },
  { id: "outline", title: "Outline", icon: "menu", description: "Headings of the open page" },
  { id: "backlinks", title: "Backlinks", icon: "link", description: "Pages that link to the open page" },
  { id: "graph", title: "Local graph", icon: "graph", description: "How the open page connects to others" },
  { id: "quests", title: "Quests", icon: "tree", description: "Today's quests from your skill tree" },
  { id: "assistant", title: "Assistant", icon: "sparkle", description: "Chat with your assistant right in the dock", grow: true },
];

export const panelInfo = (id: PanelId) => PANELS.find((p) => p.id === id)!;

export interface LayoutState {
  left: PanelId[];
  right: PanelId[];
  rightOpen: boolean;
  rightWidth: number;
  collapsed: PanelId[];
}

export const RIGHT_MIN = 220;
export const RIGHT_MAX = 560;

export const DEFAULT_LAYOUT: LayoutState = {
  left: ["nav", "favorites", "pages"],
  right: ["outline", "backlinks", "quests"],
  rightOpen: false,
  rightWidth: 300,
  collapsed: [],
};

const KEY = "basalt:layout";
const IDS = new Set<PanelId>(PANELS.map((p) => p.id));

function normalize(raw: unknown): LayoutState {
  const d = DEFAULT_LAYOUT;
  if (!raw || typeof raw !== "object") return { ...d, left: [...d.left], right: [...d.right], collapsed: [] };
  const r = raw as Partial<LayoutState>;
  const seen = new Set<PanelId>();
  const list = (v: unknown): PanelId[] =>
    (Array.isArray(v) ? v : []).filter((id): id is PanelId => IDS.has(id as PanelId) && !seen.has(id as PanelId) && !!seen.add(id as PanelId));
  const left = list(r.left);
  const right = list(r.right);
  // Required panels always live somewhere.
  for (const p of PANELS) if (p.required && !seen.has(p.id)) left.unshift(p.id);
  const width = Number(r.rightWidth);
  return {
    left,
    right,
    rightOpen: !!r.rightOpen,
    rightWidth: Number.isFinite(width) ? Math.round(Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, width))) : d.rightWidth,
    collapsed: (Array.isArray(r.collapsed) ? r.collapsed : []).filter((id): id is PanelId => IDS.has(id as PanelId)),
  };
}

function load(): LayoutState {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return normalize(null);
  }
}

let state = load();
const listeners = new Set<() => void>();

function set(next: LayoutState) {
  state = normalize(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable: the layout still works for this session.
  }
  listeners.forEach((l) => l());
}

export function useLayout(): LayoutState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function getLayout(): LayoutState {
  return state;
}

export function whereIs(id: PanelId): DockSide | null {
  return state.left.includes(id) ? "left" : state.right.includes(id) ? "right" : null;
}

/** Put a panel at `index` in a dock (moving it from wherever it was). */
export function movePanel(id: PanelId, side: DockSide, index: number) {
  const from = whereIs(id);
  const fromIndex = from ? state[from].indexOf(id) : -1;
  const left = state.left.filter((p) => p !== id);
  const right = state.right.filter((p) => p !== id);
  const target = side === "left" ? left : right;
  // Removing it first shifts later positions in the same dock by one.
  const at = from === side && fromIndex < index ? index - 1 : index;
  target.splice(Math.max(0, Math.min(at, target.length)), 0, id);
  set({ ...state, left, right, rightOpen: side === "right" ? true : state.rightOpen });
}

/** Move a panel up (-1) or down (+1) within its dock. */
export function nudgePanel(id: PanelId, delta: -1 | 1) {
  const side = whereIs(id);
  if (!side) return;
  const i = state[side].indexOf(id);
  movePanel(id, side, delta < 0 ? Math.max(0, i - 1) : i + 2);
}

export function hidePanel(id: PanelId) {
  if (panelInfo(id).required) return;
  set({ ...state, left: state.left.filter((p) => p !== id), right: state.right.filter((p) => p !== id) });
}

export function toggleCollapsed(id: PanelId, collapsed?: boolean) {
  const is = state.collapsed.includes(id);
  const next = collapsed ?? !is;
  if (next === is) return;
  set({ ...state, collapsed: next ? [...state.collapsed, id] : state.collapsed.filter((p) => p !== id) });
}

export function setRightOpen(open: boolean) {
  set({ ...state, rightOpen: open });
}

export function setRightWidth(width: number) {
  set({ ...state, rightWidth: width });
}

export function resetLayout() {
  set(normalize(null));
}

export const REVEAL_EVENT = "basalt:reveal-panel";

/** Show a panel: open its dock, expand it, and let the shell scroll to it. */
export function revealPanel(id: PanelId) {
  const side = whereIs(id);
  if (!side) return false;
  set({ ...state, rightOpen: side === "right" ? true : state.rightOpen, collapsed: state.collapsed.filter((p) => p !== id) });
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: { id, side } }));
  return true;
}

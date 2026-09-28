// Per-device settings and identity, kept in localStorage.

import { syncTitleBar } from "./desktop.ts";
import { useSyncExternalStore } from "react";
import { resolveDark } from "./appearance.ts";

export interface Identity {
  name: string;
  color: string;
}

export type UiFont = "sans" | "serif" | "mono" | "rounded" | "system";

/** Per-device look & feel (Settings → Appearance). Never synced. */
export interface Appearance {
  /** Theme preset id (see THEME_PRESETS in appearance.ts). */
  preset: string;
  /** "" = the preset's own accent, else #rrggbb. */
  accent: string;
  uiFont: UiFont;
  /** Base interface font size in px (13–18). */
  fontSize: number;
  density: "comfortable" | "compact";
  /** Sidebar width in px (200–420). */
  sidebarWidth: number;
  reduceMotion: boolean;
  /** Sidebar navigation items hidden on this device (ids from SIDEBAR_NAV). */
  hiddenNav: string[];
  /** Favorite page ids in the order shown in the sidebar. */
  favoriteOrder: string[];
  /** Obsidian-style CSS snippet, applied on this device only. */
  customCss: string;
  customCssEnabled: boolean;
  /** Liquid Glass backdrop: a WALLPAPERS id, or "image" for wallpaperImage. */
  wallpaper: string;
  /** Custom wallpaper as a downscaled data URL (this device only). */
  wallpaperImage: string;
  /** Solid surfaces instead of glass (like Apple's "Reduce transparency"). */
  reduceTransparency: boolean;
  /** Liquid Glass lensing strength, 0–100 (Chromium only; 0 = frosted glass only). */
  refraction: number;
  /** Liquid Glass frosting blur, 0–100. */
  frost: number;
  /** Corner style of glass surfaces. */
  corners: "subtle" | "round";
  /** Set once the calm backdrop became the default (see normalizeAppearance). */
  calmDefault: boolean;
}

/** A remote MCP server the assistant may use (via the Claude API's MCP connector). */
export interface McpServerConfig {
  name: string;
  url: string;
  token: string;
  enabled: boolean;
}

/** The in-app assistant (see src/assistant/). */
export interface AssistantSettings {
  /** What the assistant is called. */
  name: string;
  /** Show the animated companion. */
  character: boolean;
  /** Read replies aloud. */
  voice: boolean;
  /** Let it search and read the web. */
  web: boolean;
  mcpServers: McpServerConfig[];
}

export function defaultAssistant(): AssistantSettings {
  return { name: "Pebble", character: true, voice: false, web: true, mcpServers: [] };
}

function normalizeAssistant(raw: unknown): AssistantSettings {
  const d = defaultAssistant();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<AssistantSettings>;
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : d.name,
    character: typeof r.character === "boolean" ? r.character : d.character,
    voice: typeof r.voice === "boolean" ? r.voice : d.voice,
    web: typeof r.web === "boolean" ? r.web : d.web,
    mcpServers: Array.isArray(r.mcpServers)
      ? r.mcpServers
          .filter((s) => s && typeof s.url === "string" && typeof s.name === "string")
          .map((s) => ({ name: s.name, url: s.url, token: typeof s.token === "string" ? s.token : "", enabled: s.enabled !== false }))
      : [],
  };
}

export interface Settings {
  theme: "system" | "light" | "dark";
  /** Custom relay URL (wss://host/sync). Empty = same origin / build default. */
  syncUrl: string;
  /** Optional Anthropic API key for AI features (stays on this device). */
  anthropicKey: string;
  /** Claude model for AI features. */
  model: string;
  identity: Identity;
  appearance: Appearance;
  assistant: AssistantSettings;
}

const KEY = "basalt:settings";
export const COLORS = ["#e5484d", "#f76b15", "#ffc53d", "#46a758", "#12a594", "#0090ff", "#6e56cf", "#d6409f", "#8e4ec6", "#3e63dd"];
const ADJ = ["Curious", "Brave", "Quiet", "Swift", "Clever", "Gentle", "Bold", "Bright", "Calm", "Witty"];
const ANIMALS = ["Otter", "Falcon", "Panda", "Lynx", "Heron", "Koala", "Fox", "Orca", "Ibis", "Yak"];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function defaultAppearance(): Appearance {
  return {
    preset: "glass",
    accent: "",
    uiFont: "sans",
    fontSize: 14,
    density: "comfortable",
    sidebarWidth: 260,
    reduceMotion: false,
    hiddenNav: [],
    favoriteOrder: [],
    customCss: "",
    customCssEnabled: false,
    wallpaper: "calm",
    wallpaperImage: "",
    reduceTransparency: false,
    refraction: 60,
    frost: 40,
    corners: "subtle",
    calmDefault: true,
  };
}

/** Fill in missing fields and drop malformed ones (settings may come from older versions). */
function normalizeAppearance(raw: unknown): Appearance {
  const d = defaultAppearance();
  if (!raw || typeof raw !== "object") return d;
  const out = { ...d, ...(raw as Partial<Appearance>) };
  for (const k of Object.keys(d) as (keyof Appearance)[]) {
    if (Array.isArray(d[k]) ? !Array.isArray(out[k]) : typeof out[k] !== typeof d[k]) (out as Record<string, unknown>)[k] = d[k];
  }
  if (out.corners !== "round") out.corners = "subtle";
  // Colorful "aurora" used to be the default; settings saved before "calm"
  // existed get the calm backdrop (choosing Aurora again sticks).
  if (!("calmDefault" in (raw as object)) && out.wallpaper === "aurora") out.wallpaper = "calm";
  out.calmDefault = true;
  return out;
}

function defaults(): Settings {
  return {
    theme: "system",
    syncUrl: "",
    anthropicKey: "",
    model: "claude-opus-5",
    identity: { name: `${pick(ADJ)} ${pick(ANIMALS)}`, color: pick(COLORS) },
    appearance: defaultAppearance(),
    assistant: defaultAssistant(),
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Nested so that fields added later get their defaults.
      return {
        ...defaults(),
        ...parsed,
        appearance: normalizeAppearance(parsed.appearance),
        assistant: normalizeAssistant(parsed.assistant),
      };
    }
  } catch {
    // ignore
  }
  const s = defaults();
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
  return s;
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function updateAppearance(patch: Partial<Appearance>) {
  updateSettings({ appearance: { ...current.appearance, ...patch } });
}

/** Listen to any settings change (outside React). Returns an unsubscribe function. */
export function subscribeSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Key under which a learner's spaced-repetition state is stored (per name). */
export function learnerKey(identity: Identity = current.identity): string {
  return identity.name.trim().toLowerCase() || "me";
}

export function defaultSyncUrl(): string {
  const s = current.syncUrl.trim();
  if (s) return s;
  const env = import.meta.env.VITE_SYNC_URL as string | undefined;
  if (env) return env;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/sync`;
}

/** Resolve light/dark (System follows the OS; single-mode presets force theirs). */
export function applyTheme(theme: Settings["theme"]) {
  const dark = resolveDark(theme, current.appearance.preset);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  syncTitleBar();
}

export function isDark(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

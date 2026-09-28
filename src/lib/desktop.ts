// The desktop app's bridge (desktop/preload.cjs). null in browsers.

export interface DesktopBridge {
  platform: string;
  version(): Promise<string | null>;
  setTitleBar(colors: { symbolColor: string; color?: string }): void;
  checkForUpdates(): Promise<void>;
  getAutoUpdate(): Promise<boolean | null>;
  setAutoUpdate(on: boolean): Promise<boolean | null>;
  openDataFolder(): Promise<string>;
  /** null when the link isn't a workspace link. */
  claudeCodeStatus?(link: string): Promise<ClaudeCodeStatus | null>;
  addToClaudeCode?(link: string): Promise<{ ok: boolean; message: string } | null>;
  /** Claude in the app through Claude Code (desktop/claude-run.cjs). */
  claude?: {
    available(): Promise<{ installed: boolean } | null>;
    run(opts: ClaudeRunOptions): Promise<{ id?: string; error?: string } | null>;
    cancel(id: string): Promise<boolean>;
    onEvent(cb: (ev: ClaudeRunEvent) => void): () => void;
  };
}

export interface ClaudeRunOptions {
  prompt: string;
  /** Appended to Claude Code's system prompt. */
  system?: string;
  /** Continue a conversation (Claude Code session id). */
  resume?: string;
  /** Allow web search and fetch (for research). */
  web?: boolean;
  /** The workspace's share link: the connector joins it. */
  link: string;
}

export type ClaudeRunEvent = { id: string } & (
  | { type: "init"; sessionId: string | null; connected: boolean }
  | { type: "turn" }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "done"; ok: boolean; result?: string; error?: string; cancelled?: boolean; sessionId: string | null }
);

export interface ClaudeCodeStatus {
  /** The claude CLI was found on this computer. */
  installed: boolean;
  /** none: not added · this: added for this workspace · outdated: this workspace, old command · other: another workspace. */
  state: "none" | "this" | "outdated" | "other";
}

export const desktop: DesktopBridge | null =
  typeof window !== "undefined" ? ((window as unknown as { basaltDesktop?: DesktopBridge }).basaltDesktop ?? null) : null;

function toHex(css: string): string | null {
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css);
  if (!m) return /^#[0-9a-f]{6}$/i.test(css) ? css : null;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

let pending = 0;

/** Color the window's minimize / maximize / close buttons like the app's text (Windows, Linux). */
export function syncTitleBar() {
  if (!desktop || desktop.platform === "darwin" || pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    const bar = document.querySelector(".topbar") ?? document.body;
    const symbolColor = toHex(getComputedStyle(bar).color);
    if (symbolColor) desktop.setTitleBar({ symbolColor });
  });
}

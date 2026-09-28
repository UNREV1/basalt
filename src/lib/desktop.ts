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
}

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

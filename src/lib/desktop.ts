// The desktop app's bridge (desktop/preload.cjs). null in browsers.

export interface DesktopBridge {
  platform: string;
  version(): Promise<string | null>;
  setTitleBar(colors: { symbolColor: string; color?: string }): void;
  checkForUpdates(): Promise<void>;
  getAutoUpdate(): Promise<boolean | null>;
  setAutoUpdate(on: boolean): Promise<boolean | null>;
  openDataFolder(): Promise<string>;
  /** Phones and tablets on the same network: Windows Firewall has to let them reach Basalt. */
  network?: {
    /** needed: this system has a firewall rule to add (Windows); allowed: it's in place. */
    status(): Promise<{ needed: boolean; allowed: boolean } | null>;
    /** Add the rule (Windows asks for permission). */
    allow(): Promise<{ ok: boolean; message: string } | null>;
  };
  /** null when the link isn't a workspace link. */
  claudeCodeStatus?(link: string): Promise<ClaudeCodeStatus | null>;
  addToClaudeCode?(link: string): Promise<{ ok: boolean; message: string } | null>;
  /** Claude in the app through Claude Code (desktop/claude-run.cjs). */
  claude?: {
    /**
     * account: the Claude account Claude Code is signed in with, if any.
     * settings: what's wrong with Claude Code's settings file, if anything.
     */
    available(): Promise<{ installed: boolean; account?: string | null; settings?: ClaudeSettingsProblem | null } | null>;
    /** Sign in (`claude auth login`, run by Basalt): the browser opens; events follow on onSignIn. */
    signIn?(): Promise<{ ok: boolean; message?: string } | null>;
    signInCode?(code: string): Promise<boolean>;
    signInCancel?(): Promise<boolean>;
    /** Open the sign-in page Claude Code printed (it shows a code to paste back). */
    signInPage?(): Promise<boolean>;
    /** The fallback: a terminal window with `claude` running. */
    signInTerminal?(): Promise<{ ok: boolean; message?: string } | null>;
    onSignIn?(cb: (ev: ClaudeSignInEvent) => void): () => void;
    fixSettings?(): Promise<{ ok: boolean; message: string; fixed?: "repaired" | "moved"; backup?: string } | null>;
    showSettings?(): Promise<boolean>;
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
  | {
      type: "done";
      ok: boolean;
      result?: string;
      error?: string;
      /** auth: Claude Code needs signing in (or its key was refused); limit: usage limit. */
      code?: "auth" | "limit" | "other";
      cancelled?: boolean;
      sessionId: string | null;
    }
);

/** Claude Code's settings file doesn't parse: where and why (never its contents). */
export interface ClaudeSettingsProblem {
  file: string;
  message: string;
  where: string;
}

export type ClaudeSignInEvent =
  | { type: "url"; url: string }
  | { type: "done"; ok: boolean; account?: string | null; error?: string; cancelled?: boolean; fallback?: boolean };

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

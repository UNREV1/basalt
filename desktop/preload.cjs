// The few desktop things the web app may ask for, exposed as
// window.basaltDesktop (src/lib/desktop.ts). Runs sandboxed with context
// isolation: the page only ever sees these functions, never Node or Electron.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("basaltDesktop", {
  platform: process.platform,
  /** App version, e.g. "0.1.2". */
  version: () => ipcRenderer.invoke("basalt:version"),
  /** Color the window's minimize / maximize / close buttons to match the app. */
  setTitleBar: (colors) => ipcRenderer.send("basalt:title-bar", colors),
  checkForUpdates: () => ipcRenderer.invoke("basalt:check-updates"),
  getAutoUpdate: () => ipcRenderer.invoke("basalt:get-auto-update"),
  setAutoUpdate: (on) => ipcRenderer.invoke("basalt:set-auto-update", Boolean(on)),
  openDataFolder: () => ipcRenderer.invoke("basalt:open-data-folder"),
  /** Other devices on the network: whether Windows Firewall lets them reach Basalt, and allowing it. */
  network: {
    status: () => ipcRenderer.invoke("basalt:network-status"),
    allow: () => ipcRenderer.invoke("basalt:network-allow"),
  },
  /** Whether Basalt is added to Claude Code, and for which workspace. */
  claudeCodeStatus: (link) => ipcRenderer.invoke("basalt:claude-code-status", String(link)),
  /** Add Basalt to Claude Code for this workspace (runs `claude mcp add`). */
  addToClaudeCode: (link) => ipcRenderer.invoke("basalt:claude-code-add", String(link)),
  /** Claude in the app, through Claude Code (no API key). */
  claude: {
    available: () => ipcRenderer.invoke("basalt:claude-available"),
    /** Sign in to Claude Code (`claude auth login`, run by Basalt): the browser opens. */
    signIn: () => ipcRenderer.invoke("basalt:claude-signin"),
    /** The code the sign-in page shows, if the browser couldn't hand it back. */
    signInCode: (code) => ipcRenderer.invoke("basalt:claude-signin-code", String(code)),
    signInCancel: () => ipcRenderer.invoke("basalt:claude-signin-cancel"),
    /** Open the sign-in page Claude Code printed. */
    signInPage: () => ipcRenderer.invoke("basalt:claude-signin-page"),
    /** The fallback: a terminal with `claude` running. */
    signInTerminal: () => ipcRenderer.invoke("basalt:claude-signin-terminal"),
    onSignIn: (cb) => {
      const handler = (_e, ev) => cb(ev);
      ipcRenderer.on("basalt:claude-signin-event", handler);
      return () => ipcRenderer.removeListener("basalt:claude-signin-event", handler);
    },
    /** Repair Claude Code's settings file (or move it aside), keeping the original. */
    fixSettings: () => ipcRenderer.invoke("basalt:claude-settings-fix"),
    showSettings: () => ipcRenderer.invoke("basalt:claude-settings-show"),
    run: (opts) => ipcRenderer.invoke("basalt:claude-run", opts),
    cancel: (id) => ipcRenderer.invoke("basalt:claude-cancel", String(id)),
    onEvent: (cb) => {
      const listener = (_e, ev) => cb(ev);
      ipcRenderer.on("basalt:claude-event", listener);
      return () => ipcRenderer.removeListener("basalt:claude-event", listener);
    },
  },
});

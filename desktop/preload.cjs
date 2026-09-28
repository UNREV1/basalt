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
});

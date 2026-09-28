// Basalt desktop app (Windows .exe, macOS .app, Linux AppImage).
//
// Runs the same Basalt server the web version uses — it serves the app and
// relays end-to-end encrypted sync — inside the app, then shows it in a
// native window. Other devices on the same Wi-Fi can join through it.

const { app, BrowserWindow, Menu, ipcMain, nativeTheme, shell, dialog } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { createUpdater } = require("./updater.cjs");

// The web app's storage (IndexedDB) is tied to its address, so always prefer
// the same local port; only fall back when something else is using it.
const PORTS = [8787, 18787, 28787, 38787];

let win = null;
let relay = null;
let appUrl = "";
const updater = createUpdater(() => win);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
}

/**
 * How Claude Desktop / Claude Code start Basalt's MCP server on this computer:
 * this app's own executable run as Node (ELECTRON_RUN_AS_NODE=1) on a copy of
 * app/mcp.cjs in the user-data folder. The copy's path never changes — unlike
 * the app's own files for the portable .exe and AppImage, which unpack to a
 * new temporary folder on every launch.
 */
function mcpLaunch() {
  const dir = path.join(app.getPath("userData"), "claude");
  const script = path.join(dir, "mcp.cjs");
  try {
    const source = path.join(__dirname, "app", "mcp.cjs");
    const stamp = `${app.getVersion()}:${fs.statSync(source).size}`;
    const stampFile = path.join(dir, "version.txt");
    const current = fs.existsSync(stampFile) ? fs.readFileSync(stampFile, "utf8") : "";
    if (current !== stamp || !fs.existsSync(script)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(script, fs.readFileSync(source));
      fs.writeFileSync(stampFile, stamp);
    }
  } catch (err) {
    console.error("[basalt] could not install the MCP server", err);
    return undefined;
  }
  return {
    command: process.env.APPIMAGE || process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
    args: [script],
    env: { ELECTRON_RUN_AS_NODE: "1" },
    cacheDir: path.join(dir, "cache"),
  };
}

// Is a Basalt server (e.g. `npm start`) already running on this port?
function isBasaltAt(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/info", timeout: 1500 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body).app === "basalt");
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => req.destroy());
  });
}

async function startServer() {
  const { createBasaltServer } = require("./app/server.cjs");
  const mcp = mcpLaunch();
  for (const port of PORTS) {
    relay = createBasaltServer({
      dataDir: path.join(app.getPath("userData"), "relay"),
      distDir: path.join(__dirname, "app", "dist"),
      mcp,
    });
    try {
      // 0.0.0.0 so phones and tablets on the same network can sync.
      const actual = await relay.listen(port, "0.0.0.0");
      return `http://localhost:${actual}`;
    } catch (err) {
      relay = null;
      if (err && err.code !== "EADDRINUSE") throw err;
      // Same address → same local data, so reuse a Basalt server that is already running.
      if (await isBasaltAt(port)) return `http://localhost:${port}`;
    }
  }
  throw new Error(`Ports ${PORTS.join(", ")} are all in use. Close the other program using them and try again.`);
}

// Remember the window's size and position between launches.
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveWindowState() {
  if (!win) return;
  try {
    const state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // Not important enough to bother the user.
  }
}

/** Must match --titlebar-h in src/desktop.css: the top bars are this tall. */
const TITLE_BAR_HEIGHT = 44;

function overlayColors() {
  // Transparent: the buttons sit on Basalt's own top bar. The app re-colors
  // the symbols to match its theme once it has loaded (basalt:title-bar).
  return nativeTheme.shouldUseDarkColors
    ? { color: "#00000000", symbolColor: "#f5f5f7", height: TITLE_BAR_HEIGHT }
    : { color: "#00000000", symbolColor: "#1d1d1f", height: TITLE_BAR_HEIGHT };
}

/** Requests from the web app (desktop/preload.cjs); only from Basalt's own page. */
function registerIpc() {
  const fromApp = (event) => {
    const url = event.senderFrame?.url ?? "";
    return !!appUrl && (url === appUrl || url.startsWith(`${appUrl}/`));
  };
  const color = (v) => (typeof v === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v : null);
  ipcMain.handle("basalt:version", (e) => (fromApp(e) ? app.getVersion() : null));
  ipcMain.on("basalt:title-bar", (e, colors) => {
    if (!fromApp(e) || !win || process.platform === "darwin" || !colors) return;
    const symbolColor = color(colors.symbolColor);
    if (!symbolColor) return;
    try {
      win.setTitleBarOverlay({ color: color(colors.color) ?? "#00000000", symbolColor, height: TITLE_BAR_HEIGHT });
    } catch {
      // Not supported on this system; the default colors stay.
    }
  });
  ipcMain.handle("basalt:check-updates", (e) => (fromApp(e) ? updater.check(true) : undefined));
  ipcMain.handle("basalt:get-auto-update", (e) => (fromApp(e) ? updater.isAutomatic() : null));
  ipcMain.handle("basalt:set-auto-update", (e, on) => {
    if (!fromApp(e)) return null;
    updater.setAutomatic(Boolean(on));
    buildMenu();
    return updater.isAutomatic();
  });
  ipcMain.handle("basalt:open-data-folder", (e) => (fromApp(e) ? shell.openPath(app.getPath("userData")) : undefined));
}

function createWindow() {
  const mac = process.platform === "darwin";
  const state = loadWindowState();
  win = new BrowserWindow({
    width: state.width || 1320,
    height: state.height || 860,
    x: state.x,
    y: state.y,
    minWidth: 380,
    minHeight: 520,
    title: "Basalt",
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#17171a" : "#f6f6f8",
    icon: path.join(__dirname, "app", "dist", "icon-512.png"),
    // Frameless look: native window buttons float over Basalt's glass top bar.
    titleBarStyle: mac ? "hiddenInset" : "hidden",
    ...(mac ? { trafficLightPosition: { x: 18, y: 18 } } : { titleBarOverlay: overlayColors() }),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadURL(`${appUrl}/?desktop=${process.platform}`);
  win.once("ready-to-show", () => {
    if (state.maximized) win.maximize();
    win.show();
  });
  win.on("close", saveWindowState);

  // Links to other sites open in the default browser, not inside Basalt.
  const isInternal = (url) => url === appUrl || url.startsWith(`${appUrl}/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url) && /^(https?|mailto):/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (isInternal(url)) return;
    event.preventDefault();
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
  });

  win.on("closed", () => {
    win = null;
  });
}

function buildMenu() {
  const mac = process.platform === "darwin";
  const template = [
    ...(mac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Check for updates…",
          click: () => updater.check(true),
        },
        {
          label: updater.automaticLabel,
          type: "checkbox",
          checked: updater.isAutomatic(),
          click: (item) => updater.setAutomatic(item.checked),
        },
        { type: "separator" },
        {
          label: "Show data folder",
          click: () => shell.openPath(app.getPath("userData")),
        },
        {
          label: `Basalt ${app.getVersion()}`,
          enabled: false,
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start() {
  if (process.platform === "win32") app.setAppUserModelId("app.basalt.desktop");
  try {
    appUrl = await startServer();
  } catch (err) {
    dialog.showErrorBox("Basalt couldn’t start", String(err && err.message ? err.message : err));
    app.quit();
    return;
  }
  registerIpc();
  buildMenu();
  createWindow();
  updater.start();
  app.on("activate", () => {
    if (!win) createWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  relay?.close();
});

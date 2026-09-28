// Keeps the desktop app up to date from the public GitHub releases of
// UNREV1/basalt (built by .github/workflows/desktop.yml).
//
//   Windows (installed) and Linux AppImage: updates download in the
//   background and install on restart — Basalt asks whether to restart now.
//   The portable Windows .exe can't replace itself, so Basalt says a new
//   version is out and opens the download page.

const { app, dialog, net, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const OWNER = "UNREV1";
const REPO = "basalt";
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_AFTER_MS = 15 * 1000;

const settingsFile = () => path.join(app.getPath("userData"), "desktop-settings.json");

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeSettings(patch) {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch }));
  } catch {
    // Not important enough to bother the user.
  }
}

/** Numeric compare of "1.2.3" versions: > 0 when a is newer. */
function compareVersions(a, b) {
  const pa = String(a).split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(/[.+-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function canInstallItself() {
  if (!app.isPackaged) return false;
  if (process.platform === "win32") return !process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.platform === "linux") return Boolean(process.env.APPIMAGE);
  return false;
}

/**
 * @param {() => Electron.BrowserWindow | null} getWindow
 */
function createUpdater(getWindow) {
  const selfInstall = canInstallItself();
  let autoUpdater = null;
  let busy = false;
  let readyVersion = null;
  const told = new Set(); // versions already announced this session
  let timer = null;

  const box = (options) => {
    const win = getWindow();
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  };

  function offerRestart(version) {
    readyVersion = version;
    if (told.has(version)) return;
    told.add(version);
    box({
      type: "info",
      title: "Update ready",
      message: `Basalt ${version} is ready`,
      detail: "Restart Basalt to finish updating. If you choose Later, it updates the next time you quit.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(true, true));
    });
  }

  function announceDownload(version) {
    if (told.has(version)) return;
    told.add(version);
    box({
      type: "info",
      title: "Update available",
      message: `Basalt ${version} is available`,
      detail: `You have ${app.getVersion()}. Download the new version to update — your notes stay where they are.`,
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) shell.openExternal(RELEASES_PAGE);
    });
  }

  if (selfInstall) {
    ({ autoUpdater } = require("electron-updater"));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;
    autoUpdater.on("update-downloaded", (info) => offerRestart(info.version));
    autoUpdater.on("error", () => {
      // Offline or GitHub unreachable: try again at the next check.
    });
  }

  /** Latest released version, read from the Windows update manifest. */
  async function latestVersion() {
    const res = await net.fetch(`https://github.com/${OWNER}/${REPO}/releases/latest/download/latest.yml`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const match = /^version:\s*['"]?([^'"\s]+)/m.exec(await res.text());
    if (!match) throw new Error("No version in the update manifest");
    return match[1];
  }

  /** @param {boolean} manual - the user chose "Check for updates…" */
  async function check(manual = false) {
    if (!app.isPackaged) {
      if (manual) box({ type: "info", message: "Updates are only available in the installed app." });
      return;
    }
    if (busy) return;
    busy = true;
    try {
      if (selfInstall) {
        if (readyVersion) {
          if (manual) {
            told.delete(readyVersion);
            offerRestart(readyVersion);
          }
          return;
        }
        const result = await autoUpdater.checkForUpdates();
        result?.downloadPromise?.catch(() => {}); // reported through the "error" event
        const version = result?.updateInfo?.version;
        const newer = version && compareVersions(version, app.getVersion()) > 0;
        // Automatic updates off: a manual check still fetches the update.
        if (newer && manual && !autoUpdater.autoDownload) autoUpdater.downloadUpdate().catch(() => {});
        if (manual) {
          box({
            type: "info",
            message: newer ? `Downloading Basalt ${version}…` : "Basalt is up to date",
            detail: newer ? "You'll be asked to restart when it's ready." : `You have the latest version (${app.getVersion()}).`,
          });
        }
      } else {
        const version = await latestVersion();
        if (compareVersions(version, app.getVersion()) > 0) {
          if (manual) told.delete(version);
          announceDownload(version);
        } else if (manual) {
          box({ type: "info", message: "Basalt is up to date", detail: `You have the latest version (${app.getVersion()}).` });
        }
      }
    } catch (err) {
      if (manual) {
        box({
          type: "warning",
          message: "Couldn't check for updates",
          detail: `Check your internet connection and try again.\n\n${err && err.message ? err.message : err}`,
        });
      }
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearInterval(timer);
    timer = null;
    if (!isAutomatic()) return;
    setTimeout(() => check(false), FIRST_CHECK_AFTER_MS);
    timer = setInterval(() => check(false), CHECK_EVERY_MS);
  }

  function isAutomatic() {
    return readSettings().autoUpdate !== false;
  }

  function setAutomatic(on) {
    writeSettings({ autoUpdate: on });
    if (autoUpdater) autoUpdater.autoDownload = on;
    schedule();
  }

  return {
    start: schedule,
    check,
    isAutomatic,
    setAutomatic,
    /** Menu label: installing updates vs. just telling you about them. */
    automaticLabel: selfInstall ? "Update automatically" : "Tell me about new versions",
  };
}

module.exports = { createUpdater, compareVersions };

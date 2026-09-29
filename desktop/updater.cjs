// Keeps the desktop app up to date from the public GitHub releases of
// UNREV1/basalt (built by .github/workflows/desktop.yml), without you having
// to do anything:
//
//   Windows (installed) and Linux AppImage: Basalt checks every hour, downloads
//   a new version in the background and installs it by itself, restarting
//   when you're not using it (you locked the screen, stepped away, or Basalt
//   has been in the background a while) and never while Claude is working on
//   something. Otherwise it installs when you quit. Afterwards a small
//   notification says what version you're on.
//   Installed for all users (in Program Files), Windows asks permission to
//   change the app, so Basalt installs those updates when you quit instead of
//   while you're away (where the question would wait for you).
//   The portable Windows .exe can't replace itself, so Basalt says a new
//   version is out and opens the download page.

const { app, dialog, net, shell, powerMonitor, Notification } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { goodMoment } = require("./update-timing.cjs");

const OWNER = "UNREV1";
const REPO = "basalt";
const RELEASES_PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 60 * 60 * 1000;
const FIRST_CHECK_AFTER_MS = 15 * 1000;
/** How often a downloaded update looks for a good moment to install (see update-timing.cjs). */
const WAIT_STEP_MS = 60 * 1000;

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

/** Whether replacing the app needs an administrator's permission (installed for all users). */
function needsPermission() {
  if (process.platform !== "win32") return false;
  const probe = path.join(path.dirname(process.execPath), `.basalt-update-check-${process.pid}`);
  try {
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
    return false;
  } catch {
    return true;
  }
}

/**
 * @param {() => Electron.BrowserWindow | null} getWindow
 * @param {{ isBusy?: () => boolean }} [opts] - isBusy: something is running that a restart would cut short
 */
function createUpdater(getWindow, opts = {}) {
  const isBusy = opts.isBusy ?? (() => false);
  const selfInstall = canInstallItself();
  const askPermission = selfInstall && needsPermission();
  let autoUpdater = null;
  let busy = false;
  let readyVersion = null;
  const told = new Set(); // versions already announced this session
  let timer = null;
  let waiting = null;
  let backgroundSince = 0;
  let installing = false;

  const box = (options) => {
    const win = getWindow();
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  };

  function install() {
    if (installing || !readyVersion) return;
    installing = true;
    clearInterval(waiting);
    // Silent, and Basalt opens again straight after.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  /** Installs at the next good moment; installed for all users, when you quit (autoInstallOnAppQuit). */
  function installWhenAway() {
    if (askPermission || !isAutomatic()) return;
    clearInterval(waiting);
    const attempt = () => {
      const win = getWindow();
      // (Basalt may never have had focus: count from now.)
      if (win && !win.isDestroyed() && !win.isFocused() && !backgroundSince) backgroundSince = Date.now();
      if (!isBusy() && goodMoment(win, backgroundSince, Date.now(), powerMonitor.getSystemIdleTime())) install();
    };
    waiting = setInterval(attempt, WAIT_STEP_MS);
    attempt();
  }

  function offerRestart(version) {
    box({
      type: "info",
      title: "Update ready",
      message: `Basalt ${version} is ready`,
      detail: askPermission
        ? "It installs by itself when you quit Basalt (Windows asks for permission, as Basalt is installed for everyone on this computer)."
        : "It installs by itself when you're not using Basalt, or when you quit.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) install();
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
    autoUpdater.on("update-downloaded", (info) => {
      readyVersion = info.version;
      installWhenAway();
    });
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
    if (busy || installing) return;
    busy = true;
    try {
      if (selfInstall) {
        if (readyVersion) {
          if (manual) offerRestart(readyVersion);
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
            detail: newer
              ? "It installs by itself when it's ready: when you're not using Basalt, or when you quit."
              : `You have the latest version (${app.getVersion()}).`,
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

  /** Says which version you're on, once, after an update installed itself. */
  function sayUpdated() {
    const now = app.getVersion();
    const { lastVersion } = readSettings();
    if (lastVersion === now) return;
    writeSettings({ lastVersion: now });
    if (!lastVersion || compareVersions(now, lastVersion) <= 0 || !Notification.isSupported()) return;
    new Notification({ title: `Basalt updated to ${now}`, body: "Updated in the background. You're on the latest version.", silent: true }).show();
  }

  function start() {
    sayUpdated();
    schedule();
    // Coming back from sleep: a good time to look for a new version.
    powerMonitor.on("resume", () => setTimeout(() => check(false), FIRST_CHECK_AFTER_MS));
    // Locking the screen means you've stepped away.
    powerMonitor.on("lock-screen", () => {
      if (readyVersion && !askPermission && isAutomatic() && !isBusy()) install();
    });
    // Keep track of how long Basalt has been in the background.
    app.on("browser-window-blur", () => {
      if (!backgroundSince) backgroundSince = Date.now();
    });
    app.on("browser-window-focus", () => {
      backgroundSince = 0;
    });
  }

  function isAutomatic() {
    return readSettings().autoUpdate !== false;
  }

  function setAutomatic(on) {
    writeSettings({ autoUpdate: on });
    if (autoUpdater) autoUpdater.autoDownload = on;
    schedule();
    if (on && readyVersion) installWhenAway();
    else clearInterval(waiting);
  }

  return {
    start,
    check,
    isAutomatic,
    setAutomatic,
    /** Menu label: installing updates vs. just telling you about them. */
    automaticLabel: selfInstall ? "Update automatically" : "Tell me about new versions",
  };
}

module.exports = { createUpdater, compareVersions };

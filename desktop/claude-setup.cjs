// "Add to Claude Code" in one click: find the claude CLI on this computer and
// run `claude mcp add` with the arguments as a list, not through a shell, so
// no quoting or PowerShell rule can get in the way. Also reads Claude Code's
// config to tell whether Basalt is already added, and for which workspace.

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const NAME = "basalt";
const windows = process.platform === "win32";

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** How to run the claude CLI ({ file, pre, env }), or null when it can't be found. */
function findClaude() {
  const home = os.homedir();
  // Apps started from the Start menu or dock may not see the shell's PATH, so
  // also look where the installers put it.
  const dirs = [
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean),
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    ...(windows ? [path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "npm")] : ["/usr/local/bin", "/opt/homebrew/bin"]),
  ];
  for (const dir of dirs) {
    if (!windows) {
      if (isFile(path.join(dir, "claude"))) return { file: path.join(dir, "claude"), pre: [], env: {} };
      continue;
    }
    if (isFile(path.join(dir, "claude.exe"))) return { file: path.join(dir, "claude.exe"), pre: [], env: {} };
    // npm installs a claude.cmd shim, which only runs through cmd.exe; run the
    // package's cli.js with this app's own Node instead.
    const cli = path.join(dir, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
    if (isFile(path.join(dir, "claude.cmd")) && isFile(cli)) return { file: process.execPath, pre: [cli], env: { ELECTRON_RUN_AS_NODE: "1" } };
  }
  return null;
}

function run(claude, args) {
  return new Promise((resolve) => {
    execFile(
      claude.file,
      [...claude.pre, ...args],
      { env: { ...process.env, ...claude.env }, timeout: 60_000, windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout || ""}${stderr || ""}`.trim() || (err ? err.message : "") }),
    );
  });
}

/** Basalt's entry in Claude Code's user config (~/.claude.json), if any. */
function readEntry() {
  const dir = process.env.CLAUDE_CONFIG_DIR || os.homedir();
  try {
    const config = JSON.parse(fs.readFileSync(path.join(dir, ".claude.json"), "utf8"));
    const entry = config && config.mcpServers && config.mcpServers[NAME];
    return entry && typeof entry === "object" ? entry : null;
  } catch {
    return null;
  }
}

function entryLink(entry) {
  if (entry.env && typeof entry.env.BASALT_LINK === "string") return entry.env.BASALT_LINK;
  const args = Array.isArray(entry.args) ? entry.args : [];
  const i = args.indexOf("--link");
  return i >= 0 ? args[i + 1] : undefined;
}

/** A workspace join link, and nothing that could smuggle in more arguments. */
function validLink(link) {
  if (typeof link !== "string" || link.length > 2000 || /[\s"'`\\]/.test(link)) return false;
  try {
    const url = new URL(link);
    return (url.protocol === "http:" || url.protocol === "https:") && /^#\/join\/[\w-]{20,}/.test(url.hash);
  } catch {
    return false;
  }
}

/**
 * installed: whether the claude CLI was found.
 * state: "none" (not added), "this" (added for this workspace and this app),
 * "outdated" (this workspace, but an old command) or "other" (another workspace).
 */
function status(link, launch) {
  const entry = readEntry();
  const installed = !!findClaude();
  if (!entry) return { installed, state: "none" };
  if (entryLink(entry) !== link) return { installed, state: "other" };
  const args = Array.isArray(entry.args) ? entry.args : [];
  const current = launch && entry.command === launch.command && args[0] === launch.args[0];
  return { installed, state: current ? "this" : "outdated" };
}

async function add(link, launch) {
  if (!launch) return { ok: false, message: "Basalt couldn't set up its connector on this computer." };
  const claude = findClaude();
  if (!claude) {
    return { ok: false, message: "Claude Code isn't installed on this computer, or Basalt can't find it. Install it, or run the command below in a terminal." };
  }
  if (readEntry()) await run(claude, ["mcp", "remove", NAME, "--scope", "user"]);
  const env = { ...launch.env, ...(launch.cacheDir ? { BASALT_LOCAL: launch.cacheDir } : {}), BASALT_LINK: link };
  const res = await run(claude, [
    "mcp",
    "add",
    "--scope",
    "user",
    ...Object.entries(env).flatMap(([k, v]) => ["--env", `${k}=${v}`]),
    "--transport",
    "stdio",
    NAME,
    "--",
    launch.command,
    ...launch.args,
  ]);
  if (!res.ok) return { ok: false, message: res.out || "Claude Code couldn't add Basalt." };
  return { ok: true, message: "Added Basalt to Claude Code." };
}

/**
 * What Claude Code is signed in with on this computer: the Claude account from
 * `claude` → /login (its email, from ~/.claude.json), and whether an API key
 * in the environment would take over from it.
 */
function authInfo() {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  let account = null;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(configDir || os.homedir(), ".claude.json"), "utf8"));
    const oauth = config && config.oauthAccount;
    if (oauth && typeof oauth === "object") account = String(oauth.emailAddress || oauth.displayName || "your Claude account");
  } catch {
    // No config yet: never signed in.
  }
  return {
    account,
    apiKey: !!process.env.ANTHROPIC_API_KEY,
    authToken: !!process.env.ANTHROPIC_AUTH_TOKEN,
  };
}

// ---- signing in -----------------------------------------------------------------------

/**
 * One sign-in at a time: `claude auth login`, run by Basalt itself with no
 * terminal. Claude Code opens the browser; when you've approved, it's done.
 * If the browser didn't open, the page it printed shows a code to paste back
 * here (sendSignInCode). No full-screen Claude, so nothing (like a settings
 * dialog) can get in the way.
 */
let signIn = null;

function startSignIn(onEvent) {
  const claude = findClaude();
  if (!claude) return { ok: false, message: "Claude Code isn't installed on this computer. Install it first (claude.com/claude-code)." };
  if (signIn) {
    signIn.onEvent = onEvent;
    if (signIn.url) onEvent({ type: "url", url: signIn.url });
    return { ok: true };
  }
  const { spawn } = require("node:child_process");
  let child;
  try {
    child = spawn(claude.file, [...claude.pre, "auth", "login"], {
      cwd: os.homedir(),
      env: { ...process.env, ...claude.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (err) {
    return { ok: false, message: `Couldn't start Claude Code: ${err.message}` };
  }
  const s = { child, url: null, output: "", onEvent, cancelled: false };
  signIn = s;
  let finished = false;
  const finish = (ev) => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (signIn === s) signIn = null;
    s.onEvent({ type: "done", ...ev });
  };
  // Nobody finished signing in: stop waiting.
  const timer = setTimeout(() => child.kill(), 15 * 60_000);
  const take = (chunk) => {
    s.output = (s.output + chunk.toString("utf8")).slice(-6000);
    const m = !s.url && s.output.match(/https:\/\/[^\s"'<>]+/);
    if (m) {
      s.url = m[0];
      s.onEvent({ type: "url", url: s.url });
    }
  };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  child.stdin.on("error", () => {});
  child.on("error", (err) => finish({ ok: false, error: err.message, fallback: true }));
  child.on("close", (code) => {
    if (s.cancelled) return finish({ ok: false, cancelled: true });
    if (code === 0) return finish({ ok: true, account: authInfo().account });
    const said = s.output
      .replace(/https:\/\/\S+/g, "")
      .replace(/paste code here if prompted\s*>?/gi, "\n")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/opening browser|browser didn't open/i.test(l))
      .slice(-3)
      .join(" ");
    // No sign-in page ever came up: this Claude Code may not have `auth login` yet.
    finish({ ok: false, error: said || `Claude Code stopped (code ${code}).`, fallback: !s.url });
  });
  return { ok: true };
}

/** The code the sign-in page shows, when the browser couldn't hand it over by itself. */
function sendSignInCode(code) {
  const c = String(code || "").trim();
  if (!signIn || !c || c.length > 4000 || /[\r\n]/.test(c)) return false;
  signIn.child.stdin.write(`${c}\n`);
  return true;
}

function cancelSignIn() {
  if (!signIn) return false;
  signIn.cancelled = true;
  signIn.child.kill();
  return true;
}

/** The sign-in page Claude Code printed, if it's Anthropic's (so it's safe to open). */
function signInUrl() {
  const url = signIn && signIn.url;
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return /(^|\.)(claude\.com|claude\.ai|anthropic\.com)$/.test(host) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The fallback: a terminal window with `claude`, where the first start asks you
 * to sign in (or type /login). Written as a small script so no shell quoting
 * gets in the way of paths with spaces.
 */
function openSignIn() {
  const claude = findClaude();
  if (!claude) return { ok: false, message: "Claude Code isn't installed on this computer. Install it first (claude.com/claude-code)." };
  const dir = path.join(os.tmpdir(), "basalt-claude");
  fs.mkdirSync(dir, { recursive: true });
  // An npm install: its claude.cmd shim runs fine in a real terminal.
  const shim = claude.pre[0] ? path.join(path.dirname(path.dirname(path.dirname(path.dirname(claude.pre[0])))), "claude.cmd") : "";
  const viaShim = windows && shim && isFile(shim);
  const cmd = viaShim ? [shim] : [claude.file, ...claude.pre];
  const env = viaShim ? {} : claude.env;
  const hello = [
    "Sign in to Claude Code here (type /login if it doesn't ask), then go back to Basalt and press Try again.",
    "If Claude says your settings file has an error, pick Continue without these settings (arrow down, Enter).",
  ];
  const home = os.homedir();
  const { spawn } = require("node:child_process");
  try {
    if (windows) {
      const script = path.join(dir, "sign-in.cmd");
      const lines = [
        "@echo off",
        "title Sign in to Claude Code",
        `cd /d "${home}"`,
        ...hello.map((l) => `echo ${l}`),
        "echo.",
        ...Object.entries(env).map(([k, v]) => `set "${k}=${v}"`),
        // call: a .cmd run without it never comes back to this script.
        `call ${cmd.map((a) => `"${a}"`).join(" ")}`,
        "echo.",
        "echo You can close this window.",
        "pause >nul",
        "exit",
      ];
      fs.writeFileSync(script, lines.join("\r\n") + "\r\n");
      spawn("cmd.exe", ["/c", "start", "", script], { cwd: home, detached: true, stdio: "ignore", windowsHide: false }).unref();
      return { ok: true };
    }
    const quote = (a) => `'${String(a).replace(/'/g, "'\\''")}'`;
    const body =
      [
        "#!/bin/sh",
        `cd ${quote(home)}`,
        ...hello.map((l) => `echo ${quote(l)}`),
        "echo",
        ...Object.entries(env).map(([k, v]) => `export ${k}=${quote(v)}`),
        cmd.map(quote).join(" "),
      ].join("\n") + "\n";
    if (process.platform === "darwin") {
      const script = path.join(dir, "sign-in.command");
      fs.writeFileSync(script, body, { mode: 0o755 });
      spawn("open", ["-a", "Terminal", script], { detached: true, stdio: "ignore" }).unref();
      return { ok: true };
    }
    const script = path.join(dir, "sign-in.sh");
    fs.writeFileSync(script, body + "exec \"${SHELL:-sh}\"\n", { mode: 0o755 });
    for (const term of ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"]) {
      const found = (process.env.PATH || "").split(path.delimiter).some((d) => isFile(path.join(d, term)));
      if (!found) continue;
      spawn(term, term === "gnome-terminal" ? ["--", script] : ["-e", script], { detached: true, stdio: "ignore" }).unref();
      return { ok: true };
    }
    return { ok: false, message: "Open a terminal and run `claude auth login` to sign in." };
  } catch (err) {
    return { ok: false, message: `Couldn't open a terminal: ${err.message}. Open one and run \`claude auth login\` to sign in.` };
  }
}

// ---- Claude Code's settings file ------------------------------------------------------

/** ~/.claude/settings.json (or in CLAUDE_CONFIG_DIR). */
function settingsFile() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "settings.json");
}

/**
 * Where JSON text first goes wrong and why, in plain words. Its own small
 * reader, because JSON.parse's messages can quote the file (which may hold keys).
 */
function locateJsonError(t) {
  let i = 0;
  const fail = (message) => {
    throw { pos: i, message };
  };
  const odd = () => (t[i] === "/" ? "Comments aren't allowed" : t[i] === "“" || t[i] === "”" ? "Curly quotes (use straight \" quotes)" : "");
  const ws = () => {
    while (i < t.length && " \t\n\r".includes(t[i])) i++;
  };
  const str = () => {
    i++;
    while (i < t.length && t[i] !== '"') {
      if (t[i] === "\n") fail("A line break inside quotes (a \" is missing)");
      i += t[i] === "\\" ? 2 : 1;
    }
    if (i >= t.length) fail("A \" is never closed");
    i++;
  };
  const list = (close, item) => {
    i++;
    ws();
    if (t[i] === close) return void i++;
    for (;;) {
      item();
      ws();
      if (t[i] === ",") {
        i++;
        ws();
        if (t[i] === close) fail(`A comma right before ${close} (remove it)`);
        continue;
      }
      if (t[i] === close) return void i++;
      if (i >= t.length) fail(`It ends too soon (a missing ${close}?)`);
      fail(odd() || `Expected a comma or ${close}`);
    }
  };
  const value = () => {
    ws();
    const c = t[i];
    if (i >= t.length) fail("It ends too soon (a missing } or ]?)");
    if (c === "{") {
      return list("}", () => {
        ws();
        if (t[i] !== '"') fail(odd() || 'Expected a "name" in double quotes');
        str();
        ws();
        if (t[i] !== ":") fail("Expected a : after the name");
        i++;
        value();
      });
    }
    if (c === "[") return list("]", value);
    if (c === '"') return str();
    const m = t.slice(i).match(/^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)/);
    if (m) return void (i += m[0].length);
    fail(odd() || `Unexpected ${JSON.stringify(c)}`);
  };
  try {
    value();
    ws();
    if (i < t.length) fail("Something extra after the end");
    return null;
  } catch (err) {
    if (err && typeof err.pos === "number") return err;
    throw err;
  }
}

/**
 * What's wrong with settings text the way Claude Code reads it, or null when
 * it's fine. Claude Code skips a broken file entirely (every setting in it),
 * and a full-screen `claude` stops at a "Settings Error" first.
 */
function jsonProblem(text) {
  const body = String(text).replace(/^﻿/, "");
  if (!body.trim()) return null;
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    const at = locateJsonError(body) || { pos: body.length, message: "It isn't valid JSON" };
    const lines = body.slice(0, at.pos).split("\n");
    return { message: at.message, where: `line ${lines.length}, column ${lines[lines.length - 1].length + 1}` };
  }
  return value && typeof value === "object" && !Array.isArray(value) ? null : { message: "It has to be one { … } object", where: "" };
}

/** The file's problem, if it has one. */
function settingsCheck() {
  const file = settingsFile();
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const problem = jsonProblem(text);
  return problem ? { file, ...problem } : null;
}

/** Walk JSON-ish text outside strings, letting `drop` remove characters. */
function outsideStrings(text, drop) {
  let out = "";
  for (let i = 0; i < text.length; ) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const skip = drop(text, i);
    if (skip > 0) i += skip;
    else out += text[i++];
  }
  return out;
}

/** Undo the usual hand-editing slips: comments and trailing commas. */
function looseRepair(text) {
  const noComments = outsideStrings(text, (t, i) => {
    if (t[i] === "/" && t[i + 1] === "/") {
      const end = t.indexOf("\n", i);
      return (end < 0 ? t.length : end) - i;
    }
    if (t[i] === "/" && t[i + 1] === "*") {
      const end = t.indexOf("*/", i + 2);
      return (end < 0 ? t.length : end + 2) - i;
    }
    return 0;
  });
  return outsideStrings(noComments, (t, i) => (t[i] === "," && /^\s*[}\]]/.test(t.slice(i + 1)) ? 1 : 0));
}

/**
 * Fix the settings file: small slips are repaired in place; otherwise it's
 * moved aside, which changes nothing Claude Code uses (it skips a broken file
 * anyway) but ends the error. The original is always kept next to it.
 */
function fixSettings() {
  const file = settingsFile();
  try {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      return { ok: true, message: "There's no settings file, so there's nothing to fix." };
    }
    if (!jsonProblem(text)) return { ok: true, message: "The settings file is fine." };
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
    const repaired = looseRepair(text.replace(/^﻿/, ""));
    if (repaired.trim() && !jsonProblem(repaired)) {
      const backup = `${file}.before-fix-${stamp}`;
      fs.copyFileSync(file, backup);
      fs.writeFileSync(file, repaired);
      return { ok: true, fixed: "repaired", backup, message: `Fixed. Your original is kept as ${path.basename(backup)}.` };
    }
    const aside = `${file}.broken-${stamp}`;
    fs.renameSync(file, aside);
    return {
      ok: true,
      fixed: "moved",
      backup: aside,
      message: `Moved it aside as ${path.basename(aside)}, so Claude Code starts with its default settings. Copy what you need from it into a new settings.json.`,
    };
  } catch (err) {
    return { ok: false, message: `Couldn't fix it: ${err.message}` };
  }
}

module.exports = {
  status,
  add,
  validLink,
  findClaude,
  authInfo,
  startSignIn,
  sendSignInCode,
  cancelSignIn,
  signInUrl,
  openSignIn,
  settingsFile,
  settingsCheck,
  jsonProblem,
  looseRepair,
  fixSettings,
};

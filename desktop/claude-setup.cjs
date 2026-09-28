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

module.exports = { status, add, validLink };

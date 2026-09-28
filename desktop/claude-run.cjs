// Claude inside Basalt, with the user's own Claude Code sign-in (no API key):
// runs `claude -p` in the background with Basalt's connector, so Claude can
// build courses, write lessons ahead of the learner and answer questions,
// all through the same MCP tools Claude Code uses. Output streams back to the
// page as a few simple events.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { findClaude } = require("./claude-setup.cjs");

/** runId -> child process */
const runs = new Map();
let nextId = 1;

/** Basalt's connector for this run: no offline cache (the app is open, and the cache belongs to Claude Code). */
function mcpConfig(launch, link) {
  return JSON.stringify({
    mcpServers: {
      basalt: { type: "stdio", command: launch.command, args: launch.args, env: { ...launch.env, BASALT_LINK: link } },
    },
  });
}

function friendlyError(text) {
  const t = String(text || "");
  if (/log ?in|\/login|not logged|invalid api key|authentication|OAuth/i.test(t)) {
    return "Claude Code isn't signed in on this computer. Open a terminal, run `claude` once and sign in, then try again.";
  }
  if (/usage limit|rate limit|quota/i.test(t)) return "You've reached your Claude usage limit for now. Try again later.";
  return t.trim().slice(0, 600) || "Claude stopped unexpectedly.";
}

/**
 * Start a run. opts: { prompt, system?, resume?, web?, link, cwd }
 * onEvent receives { type: "init" | "text" | "tool" | "done", ... }.
 */
function start(opts, launch, onEvent) {
  const claude = findClaude();
  if (!claude) return { error: "Claude Code isn't installed on this computer. Install it, sign in once with `claude`, then try again." };
  if (!launch) return { error: "Basalt couldn't set up its connector on this computer." };
  const id = String(nextId++);
  fs.mkdirSync(opts.cwd, { recursive: true });
  const allowed = ["mcp__basalt", ...(opts.web ? ["WebSearch", "WebFetch"] : [])];
  const args = [
    ...claude.pre,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--mcp-config",
    mcpConfig(launch, opts.link),
    "--strict-mcp-config",
    // Only Basalt's tools (and the web, for research): no files, no shell.
    "--tools",
    opts.web ? "WebSearch,WebFetch" : "",
    "--allowedTools",
    ...allowed,
    ...(opts.system ? ["--append-system-prompt", opts.system] : []),
    ...(opts.resume ? ["--resume", opts.resume] : []),
  ];
  const child = spawn(claude.file, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...claude.env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  runs.set(id, child);
  // The prompt goes in on stdin: no command-line length limits or quoting.
  child.stdin.end(opts.prompt);

  let buffer = "";
  let stderr = "";
  let finished = false;
  let sessionId = null;
  const finish = (ev) => {
    if (finished) return;
    finished = true;
    runs.delete(id);
    onEvent({ type: "done", sessionId, ...ev });
  };
  const handle = (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.session_id) sessionId = msg.session_id;
    if (msg.type === "system" && msg.subtype === "init") {
      const basalt = (msg.mcp_servers || []).find((s) => s.name === "basalt");
      onEvent({ type: "init", sessionId, connected: !basalt || basalt.status === "connected" });
    } else if (msg.type === "stream_event") {
      const e = msg.event;
      if (e && e.type === "content_block_delta" && e.delta && e.delta.type === "text_delta") onEvent({ type: "text", text: e.delta.text });
      if (e && e.type === "message_start") onEvent({ type: "turn" });
    } else if (msg.type === "assistant" && msg.message && Array.isArray(msg.message.content)) {
      for (const block of msg.message.content) {
        if (block.type === "tool_use") onEvent({ type: "tool", name: String(block.name || "").replace(/^mcp__basalt__/, ""), input: block.input });
      }
    } else if (msg.type === "result") {
      const error = msg.is_error ? friendlyError(msg.result || msg.subtype) : undefined;
      finish({ ok: !msg.is_error, result: typeof msg.result === "string" ? msg.result : "", error });
    }
  };
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) handle(line);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString("utf8")).slice(-4000);
  });
  child.on("error", (err) => finish({ ok: false, error: friendlyError(err.message) }));
  child.on("close", (code, signal) => {
    if (buffer.trim()) handle(buffer.trim());
    if (signal) finish({ ok: false, cancelled: true, error: "Stopped." });
    else finish({ ok: code === 0, error: code === 0 ? undefined : friendlyError(stderr || `Claude exited with code ${code}.`) });
  });
  return { id };
}

function cancel(id) {
  const child = runs.get(String(id));
  if (!child) return false;
  child.kill();
  return true;
}

function cancelAll() {
  for (const child of runs.values()) child.kill();
  runs.clear();
}

module.exports = { start, cancel, cancelAll, defaultCwd: (userData) => path.join(userData, "claude", "work") };

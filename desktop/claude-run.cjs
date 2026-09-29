// Claude inside Basalt, with the user's own Claude Code sign-in (no API key):
// runs `claude -p` in the background with Basalt's connector, so Claude can
// build courses, write lessons ahead of the learner and answer questions,
// all through the same MCP tools Claude Code uses. Output streams back to the
// page as a few simple events.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { authInfo, findClaude } = require("./claude-setup.cjs");

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

/** What went wrong, in words, with a code the app can act on ("auth": offer to sign in). */
function explain(text) {
  const raw = String(text || "").trim();
  const said = raw.split(/\r?\n/).find((l) => l.trim()) || "";
  const quote = said ? ` Claude Code said: “${said.slice(0, 200)}”` : "";
  if (/invalid api key|please run \/login|not logged in|log ?in to claude|oauth token (has )?expired|token (has )?expired|authentication_error|401\b|unauthori[sz]ed|credit balance is too low/i.test(raw)) {
    const auth = authInfo();
    // With a Claude account, runs leave any API key out (see start), so it's the account's sign-in.
    if (auth.account) return { code: "auth", error: `Claude Code is set up for ${auth.account}, but that sign-in didn't work (it may have expired). Sign in again, then try again.${quote}` };
    if (auth.apiKey || auth.authToken) {
      return { code: "auth", error: `Claude Code is using an API key set on this computer (ANTHROPIC_API_KEY), and it was refused. Sign in with your Claude account instead, or fix the key.${quote}` };
    }
    return { code: "auth", error: `Claude Code isn't signed in on this computer yet. Sign in once, then try again.${quote}` };
  }
  if (/usage limit|rate limit|quota|limit reached/i.test(raw)) return { code: "limit", error: `You've reached your Claude usage limit for now. Try again later.${quote}` };
  return { code: "other", error: raw.slice(0, 600) || "Claude stopped unexpectedly." };
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
  // Basalt uses your Claude sign-in: when Claude Code has one, a stray API key in the
  // environment mustn't take over (Claude Code prefers the key in -p mode).
  const env = { ...process.env, ...claude.env };
  if (authInfo().account) {
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
  }
  const child = spawn(claude.file, args, {
    cwd: opts.cwd,
    env,
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
      const bad = msg.is_error ? explain(msg.result || msg.subtype) : null;
      finish({ ok: !msg.is_error, result: typeof msg.result === "string" ? msg.result : "", ...(bad ? { error: bad.error, code: bad.code } : {}) });
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
  child.on("error", (err) => finish({ ok: false, ...explain(err.message) }));
  child.on("close", (code, signal) => {
    if (buffer.trim()) handle(buffer.trim());
    if (signal) finish({ ok: false, cancelled: true, error: "Stopped." });
    else finish(code === 0 ? { ok: true } : { ok: false, ...explain(stderr || `Claude exited with code ${code}.`) });
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

/** Whether Claude is working on something right now (so an update waits for it). */
const busy = () => runs.size > 0;

module.exports = { start, cancel, cancelAll, busy, explain, defaultCwd: (userData) => path.join(userData, "claude", "work") };

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("desktop: Claude Code sign-in is read from its config, and errors are explained in Claude's words", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basalt-claude-config-"));
  const saved = { dir: process.env.CLAUDE_CONFIG_DIR, key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN };
  process.env.CLAUDE_CONFIG_DIR = dir;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    const setup = require("../desktop/claude-setup.cjs");
    const run = require("../desktop/claude-run.cjs");

    // Never signed in.
    assert.deepEqual(setup.authInfo(), { account: null, apiKey: false, authToken: false });
    let e = run.explain("Invalid API key · Please run /login");
    assert.equal(e.code, "auth");
    assert.match(e.error, /isn't signed in on this computer yet/);
    assert.match(e.error, /Claude Code said: “Invalid API key · Please run \/login”/);

    // Signed in with a Claude account, but the sign-in was refused (expired).
    fs.writeFileSync(path.join(dir, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "me@example.com" } }));
    assert.equal(setup.authInfo().account, "me@example.com");
    e = run.explain("OAuth token has expired. Please obtain a new token or refresh your existing token.");
    assert.equal(e.code, "auth");
    assert.match(e.error, /set up for me@example\.com, but that sign-in didn't work/);

    // With an account, a stray API key is left out of runs, so the account is what failed.
    process.env.ANTHROPIC_API_KEY = "sk-stray";
    assert.match(run.explain("Invalid API key").error, /set up for me@example\.com/);

    // With no account, the API key in the environment is named as the culprit.
    fs.rmSync(path.join(dir, ".claude.json"));
    assert.match(run.explain("Invalid API key").error, /API key set on this computer/);
    delete process.env.ANTHROPIC_API_KEY;

    // Not every mention of logging is a sign-in problem; other errors come through as they are.
    e = run.explain("Error: Claude Code on Windows requires git-bash. Set CLAUDE_CODE_GIT_BASH_PATH.");
    assert.equal(e.code, "other");
    assert.match(e.error, /git-bash/);
    assert.equal(run.explain("Claude AI usage limit reached|1760000000").code, "limit");
  } finally {
    if (saved.dir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved.dir;
    if (saved.key !== undefined) process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.token !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop: a broken Claude Code settings file is found (where, never what's in it) and fixed, keeping the original", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basalt-claude-settings-"));
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    const setup = require("../desktop/claude-setup.cjs");
    const file = path.join(dir, "settings.json");
    assert.equal(setup.settingsFile(), file);
    // No file, an empty one, or one with a byte-order mark: all fine, as Claude Code sees them.
    assert.equal(setup.settingsCheck(), null);
    fs.writeFileSync(file, "");
    assert.equal(setup.settingsCheck(), null);
    fs.writeFileSync(file, '﻿{"model": "opus"}');
    assert.equal(setup.settingsCheck(), null);

    // A stray comma and a comment: found, and repaired in place.
    fs.writeFileSync(file, '{\n  "env": { "SECRET_KEY": "sk-do-not-show" },\n  // mine\n  "permissions": { "allow": ["Bash(ls)",] },\n}\n');
    const problem = setup.settingsCheck();
    assert.equal(problem.file, file);
    assert.match(problem.message, /Comments aren't allowed/);
    assert.equal(problem.where, "line 3, column 3");
    assert.doesNotMatch(JSON.stringify(problem), /sk-do-not-show/);
    const fixed = setup.fixSettings();
    assert.equal(fixed.fixed, "repaired");
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { env: { SECRET_KEY: "sk-do-not-show" }, permissions: { allow: ["Bash(ls)"] } });
    assert.match(fs.readFileSync(fixed.backup, "utf8"), /\/\/ mine/);
    assert.equal(setup.settingsCheck(), null);

    // Beyond repair (cut off halfway): moved aside, so Claude Code starts from its defaults.
    fs.writeFileSync(file, '{\n  "permissions": {\n    "allow": ["Bash(ls)"');
    assert.match(setup.settingsCheck().message, /ends too soon/);
    const moved = setup.fixSettings();
    assert.equal(moved.fixed, "moved");
    assert.equal(fs.existsSync(file), false);
    assert.match(fs.readFileSync(moved.backup, "utf8"), /Bash\(ls\)/);
    assert.equal(setup.settingsCheck(), null);

    // Strings that look like comments or commas are left alone.
    assert.equal(setup.looseRepair('{"a": "http://x, }", }'), '{"a": "http://x, }" }');
    assert.match(setup.jsonProblem('{"a": “b”}').message, /Curly quotes/);
    assert.match(setup.jsonProblem("[]").message, /one \{ … \} object/);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop: signing in runs `claude auth login` with no terminal, and takes a pasted code", { skip: process.platform === "win32" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basalt-claude-login-"));
  const saved = { path: process.env.PATH, config: process.env.CLAUDE_CONFIG_DIR };
  // A stand-in for Claude Code: prints the sign-in page, then waits for the code.
  fs.writeFileSync(
    path.join(dir, "claude"),
    `#!/bin/sh
[ "$1 $2" = "auth login" ] || { echo "unexpected: $*" >&2; exit 2; }
echo "Opening browser to sign in…"
echo "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=abc"
printf "Paste code here if prompted > "
read code
[ "$code" = "good-code" ] || { echo "Invalid code" >&2; exit 1; }
printf '{"oauthAccount":{"emailAddress":"me@example.com"}}' > "$CLAUDE_CONFIG_DIR/.claude.json"
echo "Login successful."
`,
    { mode: 0o755 },
  );
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  process.env.CLAUDE_CONFIG_DIR = dir;
  try {
    const setup = require("../desktop/claude-setup.cjs");
    const run = (code: string) =>
      new Promise<{ url?: string; done: Record<string, unknown> }>((resolve) => {
        let url: string | undefined;
        const res = setup.startSignIn((ev: { type: string; url?: string }) => {
          if (ev.type === "url") {
            url = ev.url;
            assert.equal(setup.signInUrl(), url);
            assert.equal(setup.sendSignInCode(code), true);
          } else resolve({ url, done: ev });
        });
        assert.equal(res.ok, true);
      });
    const bad = await run("wrong");
    assert.equal(bad.done.ok, false);
    assert.match(String(bad.done.error), /Invalid code/);
    assert.equal(bad.done.fallback, false);
    const good = await run("good-code");
    assert.match(String(good.url), /^https:\/\/claude\.com\/cai\/oauth\/authorize\?/);
    assert.deepEqual(good.done, { type: "done", ok: true, account: "me@example.com" });
    assert.equal(setup.signInUrl(), null);
    // Codes can't smuggle in more lines.
    assert.equal(setup.sendSignInCode("a\nb"), false);
  } finally {
    process.env.PATH = saved.path;
    if (saved.config === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved.config;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop: updates install themselves only when you're not using Basalt", () => {
  const { goodMoment, AWAY_SECONDS, BACKGROUND_MS } = require("../desktop/update-timing.cjs");
  const win = (s: { focused?: boolean; minimized?: boolean; visible?: boolean }) => ({
    isDestroyed: () => false,
    isFocused: () => s.focused ?? false,
    isMinimized: () => s.minimized ?? false,
    isVisible: () => s.visible ?? true,
  });
  const now = 10_000_000;
  // In use: focused, recently active.
  assert.equal(goodMoment(win({ focused: true }), 0, now, 5), false);
  // Stepped away from the computer (no keyboard or mouse), even with Basalt in front.
  assert.equal(goodMoment(win({ focused: true }), 0, now, AWAY_SECONDS), true);
  // In the background, but only just.
  assert.equal(goodMoment(win({}), now - 1000, now, 5), false);
  // In the background (or minimized) a while: you're doing something else.
  assert.equal(goodMoment(win({}), now - BACKGROUND_MS, now, 5), true);
  assert.equal(goodMoment(win({ minimized: true }), now - BACKGROUND_MS, now, 5), true);
  // No window at all.
  assert.equal(goodMoment(null, 0, now, 0), true);
  // And Claude working on something holds it back.
  assert.equal(require("../desktop/claude-run.cjs").busy(), false);
});

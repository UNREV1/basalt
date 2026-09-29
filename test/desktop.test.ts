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

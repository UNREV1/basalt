#!/usr/bin/env node
// Basalt MCP server over stdio: lets Claude Code / Claude Desktop use a Basalt
// workspace as long-term memory and knowledge vault, live and end-to-end
// encrypted. stdout is the MCP channel — all logging goes to stderr.
//
//   node mcp/index.ts --link "https://host/#/join/<key>?s=wss://host/sync"
//   node mcp/index.ts --key <key> --server wss://host/sync [--local ~/.basalt-cache]

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { displayTitle, ensureDefaults, listPages, metaMap } from "../shared/model.ts";
import { createBasaltMcp } from "./basalt-mcp.ts";
import { ConfigError, configFromFlags, joinWorkspace, parseFlags } from "./connect.ts";

// Anything printed to stdout would corrupt the JSON-RPC stream.
console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args);

const log = (msg: string) => process.stderr.write(`[basalt-mcp] ${msg}\n`);

const USAGE = `Basalt MCP server — use a Basalt workspace as Claude's memory and knowledge vault.

Usage:
  node mcp/index.ts --link "<share link>"
  node mcp/index.ts --key <workspace key> --server <wss://host/sync>

Options:
  --link <url>      Workspace share link (…/#/join/<key>?s=<relay>). Env: BASALT_LINK
  --key <key>       Workspace key (instead of --link). Env: BASALT_KEY
  --server <url>    Relay URL, e.g. wss://basalt.example.com/sync. Env: BASALT_SERVER
  --local <dir>     Keep an offline cache in <dir> (works when the relay is down). Env: BASALT_LOCAL
  --name <name>     Name shown to collaborators (default "Claude")
  --timeout <sec>   How long to wait for the first sync (default 20)

Claude Code:     claude mcp add basalt -- node /path/to/basalt/mcp/index.ts --link "<share link>"
Claude Desktop:  add { "command": "node", "args": ["/path/to/basalt/mcp/index.ts", "--link", "<share link>"] }
                 under "mcpServers" in claude_desktop_config.json.`;

async function main() {
  const { flags } = parseFlags(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(0);
  }
  let cfg;
  try {
    cfg = configFromFlags(flags);
  } catch (err) {
    if (err instanceof ConfigError) {
      log(err.message);
      process.stderr.write(`\n${USAGE}\n`);
      process.exit(2);
    }
    throw err;
  }
  const agentName = typeof flags.get("name") === "string" ? String(flags.get("name")) : "Claude";

  log(`Connecting to ${cfg.server} …`);
  let ws;
  try {
    ws = await joinWorkspace(cfg, {
      presence: { user: { name: agentName, color: "#d97757" }, agent: "claude" },
      log,
    });
  } catch (err) {
    log(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  const { doc, awareness } = ws;
  ensureDefaults(doc, cfg.name ?? undefined);

  const server = createBasaltMcp({ doc, awareness, agentName });
  const transport = new StdioServerTransport();

  let stopping = false;
  const shutdown = async (reason: string) => {
    if (stopping) return;
    stopping = true;
    log(`Shutting down (${reason}); flushing pending changes …`);
    try {
      await ws.close();
      await server.close().catch(() => {});
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGHUP", () => void shutdown("SIGHUP"));
  process.stdin.on("end", () => void shutdown("client disconnected"));
  process.stdin.on("close", () => void shutdown("client disconnected"));
  transport.onclose = () => void shutdown("transport closed");

  ws.provider.on("status", (status: string) => {
    if (stopping) return;
    if (status === "offline" || status === "error") log(`Sync ${status}${ws.provider.lastError ? `: ${ws.provider.lastError}` : ""} — retrying.`);
    if (status === "synced") log("Sync restored.");
  });

  await server.connect(transport);
  const name = metaMap(doc).get("name") ?? cfg.name ?? "workspace";
  const pages = listPages(doc);
  const memory = pages.find((p) => p.system === "claude-memory");
  log(
    `Ready: "${name}" with ${pages.length} page${pages.length === 1 ? "" : "s"}${ws.offline ? " (offline cache)" : ""}${
      memory ? `; memory at "${displayTitle(memory)}"` : "; memory will be created on first write"
    }.`,
  );
}

main().catch((err) => {
  log(`Fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});

// "Claude memory & vault": connect Claude (Code / Desktop / any MCP client) to
// this workspace, see it live when it is connected, and browse the memory
// notes it keeps under the "claude-memory" system page.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApp, usePages, usePeers, useWorkspaceStatus } from "../../lib/hooks.ts";
import { shareLink, type Workspace } from "../../lib/workspace.ts";
import { getSettings } from "../../lib/settings.ts";
import { useClaudeSignIn } from "../../lib/claude.ts";
import type { ClaudeSettingsProblem } from "../../lib/desktop.ts";
import { ClaudeSignInPanel } from "../lessons/ClaudeStatus.tsx";
import { desktop, type ClaudeCodeStatus } from "../../lib/desktop.ts";
import { displayTitle, ensureSystemPage, pageText, type PageMeta } from "../../../shared/model.ts";
import { Icon, timeAgo } from "../../components/ui.tsx";
import "./memory.css";

const MEMORY_SYSTEM = "claude-memory";
const DIR_KEY = "basalt:mcp-dir";
const DEFAULT_DIR = "/path/to/basalt";

type SetupTab = "code" | "desktop" | "vault";

function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the value just isn't remembered.
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function CopyBlock({ code, display, label }: { code: string; display?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <div className="mem-code">
      {label && <div className="mem-code-label">{label}</div>}
      <pre>
        <code>{display ?? code}</code>
      </pre>
      <button
        className={`btn btn-sm mem-copy${copied ? " copied" : ""}`}
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1600);
          }
        }}
        aria-label={label ? `Copy ${label}` : "Copy"}
      >
        <Icon name={copied ? "check" : "copy"} size={14} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function shellQuote(s: string): string {
  return /^[\w@%+=:,./~-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, "\\$1")}"`;
}

/** Double quotes that work in bash, zsh, cmd and PowerShell for paths (no $, " or ` in them). */
function pathQuote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** How Claude on this computer starts the MCP server, from the Basalt server running here (/api/info). */
interface McpLaunch {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cacheDir?: string;
}

function useMcpLaunch(): McpLaunch | null {
  const [launch, setLaunch] = useState<McpLaunch | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { mcp?: McpLaunch | null } | null) => {
        const m = info?.mcp;
        if (alive && m && typeof m.command === "string" && Array.isArray(m.args)) setLaunch(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return launch;
}

const CODE_STATE: Record<ClaudeCodeStatus["state"], string> = {
  none: "One click adds Basalt to every Claude Code project. You only do this once.",
  this: "Claude Code can reach this workspace from any project.",
  outdated: "Claude Code has an older setup for this workspace. Update it to use this app.",
  other: "Claude Code is set up for another workspace. Switching points it at this one.",
};

/** Desktop app: add Basalt to Claude Code with one click, then start a session. */
function ClaudeCodeConnect({ link, connected }: { link: string; connected: boolean }) {
  const [st, setSt] = useState<ClaudeCodeStatus | null>(null);
  const [account, setAccount] = useState<string | null | undefined>(undefined);
  const [settings, setSettings] = useState<ClaudeSettingsProblem | null>(null);
  const [resign, setResign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fixNote, setFixNote] = useState("");
  const signIn = useClaudeSignIn();
  const refresh = useCallback(() => {
    desktop?.claudeCodeStatus?.(link).then(setSt, () => setSt(null));
    desktop?.claude?.available().then(
      (a) => {
        setAccount(a?.account ?? null);
        setSettings(a?.settings ?? null);
      },
      () => setAccount(null),
    );
  }, [link]);
  // Signed in just now: show the account.
  useEffect(() => {
    if (signIn.status !== "done") return;
    setResign(false);
    refresh();
  }, [signIn.status, refresh]);
  useEffect(() => {
    refresh();
    // It may have been added by hand in a terminal meanwhile.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const add = async () => {
    setBusy(true);
    setError("");
    const res = await desktop?.addToClaudeCode?.(link).catch((e: unknown) => ({ ok: false, message: String(e) }));
    setBusy(false);
    if (!res?.ok) setError(res?.message || "Basalt couldn't add itself to Claude Code.");
    refresh();
  };

  const added = st?.state === "this";
  const missing = st ? !st.installed && !added : false;
  const fixSettings = async () => {
    const res = await desktop?.claude?.fixSettings?.();
    setFixNote(res?.message ?? "");
    refresh();
  };
  return (
    <ol className="mem-connect">
      {!missing && account !== undefined && (
        <li className={account && !resign ? "done" : ""}>
          <span className="mem-connect-num" aria-hidden>
            {account && !resign ? <Icon name="check" size={13} stroke={2.6} /> : <Icon name="lock" size={12} />}
          </span>
          <div className="mem-connect-text">
            <strong>{account ? "Signed in to Claude Code" : "Sign in to Claude Code"}</strong>
            <span>
              {account
                ? `As ${account}. Basalt uses your Claude plan through it: no API key.`
                : "Basalt uses your Claude plan through Claude Code, so it needs your sign-in once. Your browser opens to sign in; no terminal needed."}
              {account && !resign && signIn.status !== "waiting" && (
                <>
                  {" "}
                  <button className="cj-link" onClick={() => setResign(true)}>
                    Sign in again
                  </button>
                </>
              )}
            </span>
            {(!account || resign || signIn.status === "waiting") && <ClaudeSignInPanel />}
          </div>
        </li>
      )}
      {settings && (
        <li className="mem-connect-warn">
          <span className="mem-connect-num" aria-hidden>
            <Icon name="x" size={12} />
          </span>
          <div className="mem-connect-text">
            <strong>Claude Code’s settings file has a mistake</strong>
            <span>
              {settings.message}
              {settings.where ? ` (${settings.where})` : ""} in <code>{settings.file}</code>. Claude Code skips the whole file while it’s broken, and
              stops at a “Settings Error” when it starts in a terminal. Fix repairs small slips like a stray comma; if it can’t, it moves the file
              aside so Claude Code uses its defaults. Your original is always kept.
            </span>
            {fixNote && <span className="mem-connect-note">{fixNote}</span>}
            <span className="cj-actions">
              <button className="btn btn-sm btn-primary" onClick={fixSettings}>
                Fix it
              </button>
              <button className="btn btn-sm" onClick={() => void desktop?.claude?.showSettings?.()}>
                Show the file
              </button>
            </span>
          </div>
        </li>
      )}
      {!settings && fixNote && (
        <li className="done">
          <span className="mem-connect-num" aria-hidden>
            <Icon name="check" size={13} stroke={2.6} />
          </span>
          <div className="mem-connect-text">
            <strong>Claude Code’s settings file is fixed</strong>
            <span>{fixNote}</span>
          </div>
        </li>
      )}
      <li className={added ? "done" : ""}>
        <span className="mem-connect-num" aria-hidden>
          {added ? <Icon name="check" size={13} stroke={2.6} /> : 1}
        </span>
        <div className="mem-connect-text">
          <strong>{added ? "Added to Claude Code" : "Add Basalt to Claude Code"}</strong>
          <span>
            {!st
              ? "Checking…"
              : missing
                ? "Claude Code wasn't found on this computer. Install it first, or run the command below in a terminal."
                : CODE_STATE[st.state]}
          </span>
          {error && <span className="mem-connect-error">{error}</span>}
        </div>
        {!added && (
          <button className="btn btn-primary" disabled={busy || !st || missing} onClick={add}>
            {busy ? "Adding…" : st?.state === "other" ? "Switch to this workspace" : st?.state === "outdated" ? "Update" : "Add to Claude Code"}
          </button>
        )}
      </li>
      <li className={connected ? "done" : ""}>
        <span className="mem-connect-num" aria-hidden>
          {connected ? <Icon name="check" size={13} stroke={2.6} /> : 2}
        </span>
        <div className="mem-connect-text">
          <strong>{connected ? "Claude is connected" : "Start Claude Code"}</strong>
          {connected ? (
            <span>A Claude session is using this workspace right now.</span>
          ) : (
            <span>
              Open a terminal and run <code>claude</code>. Claude joins when a session starts and shows up at the top of this
              page while it’s open. Type <code>/mcp</code> in Claude Code to check.
            </span>
          )}
        </div>
      </li>
    </ol>
  );
}

interface MemoryNode {
  meta: PageMeta;
  path: string;
  children: MemoryNode[];
}

function buildTree(pages: PageMeta[], rootId: string): MemoryNode[] {
  const byParent = new Map<string, PageMeta[]>();
  for (const p of pages) {
    if (!p.parentId) continue;
    if (!byParent.has(p.parentId)) byParent.set(p.parentId, []);
    byParent.get(p.parentId)!.push(p);
  }
  const walk = (parent: string, prefix: string, depth: number): MemoryNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((meta) => {
        const name = displayTitle(meta).replace(/[/\\]/g, "-");
        const kids = depth < 8 ? walk(meta.id, `${prefix}${name}/`, depth + 1) : [];
        return { meta, path: kids.length ? `${prefix}${name}/` : `${prefix}${name}.md`, children: kids };
      });
  return walk(rootId, "/memories/", 0);
}

function countFiles(nodes: MemoryNode[]): number {
  return nodes.reduce((n, node) => n + (node.children.length ? countFiles(node.children) : 1), 0);
}

export default function MemoryView({ ws }: { ws: Workspace }) {
  const { openPage, toast } = useApp();
  const pages = usePages(ws);
  const peers = usePeers(ws);
  const status = useWorkspaceStatus(ws);
  const [tab, setTab] = useState<SetupTab>("code");
  const [dir, setDir] = useState(() => readSetting(DIR_KEY, DEFAULT_DIR));
  const [reveal, setReveal] = useState(false);
  const launch = useMcpLaunch();
  // The desktop app runs the MCP server with its own runtime; it has no vault CLI.
  const desktopApp = !!launch?.env?.ELECTRON_RUN_AS_NODE;
  // The desktop app can run `claude mcp add` itself (desktop/claude-setup.cjs).
  const oneClick = desktopApp && !!desktop?.addToClaudeCode;

  const link = shareLink(ws.info);
  const masked = link.replace(ws.info.key, `${ws.info.key.slice(0, 4)}••••••••••••`);
  const shown = reveal ? link : masked;
  const base = dir.trim().replace(/\/+$/, "") || DEFAULT_DIR;
  const entry = `${base}/mcp/index.ts`;
  const vaultCli = `${base}/mcp/vault-cli.ts`;

  // With the server on this computer the commands use its real paths;
  // otherwise, a Basalt checkout at the folder typed below.
  const mcpArgs = (l: string) =>
    launch ? [...launch.args, ...(launch.cacheDir ? ["--local", launch.cacheDir] : []), "--link", l] : [entry, "--link", l];
  // The link and cache go in --env so nothing after the command starts with
  // "-": PowerShell swallows the "--" separator when claude is an npm
  // script, and Claude Code would then take --link for one of its own flags.
  const claudeCmd = (l: string) => {
    const env: [string, string][] = [
      ...Object.entries(launch?.env ?? {}),
      ...(launch?.cacheDir ? [["BASALT_LOCAL", launch.cacheDir] as [string, string]] : []),
      ["BASALT_LINK", l],
    ];
    const flags = env.map(([k, v]) => `--env ${/^\w+$/.test(v) ? `${k}=${v}` : pathQuote(`${k}=${v}`)}`).join(" ");
    const command = launch ? [launch.command, ...launch.args].map(pathQuote) : ["node", shellQuote(entry)];
    return `claude mcp add ${flags} --scope user basalt ${command.join(" ")}`;
  };
  const desktopJson = (l: string) =>
    JSON.stringify(
      { mcpServers: { basalt: { command: launch?.command ?? "node", args: mcpArgs(l), ...(launch?.env ? { env: launch.env } : {}) } } },
      null,
      2,
    );
  const cliBase = launch && !desktopApp ? launch.args[0].replace(/index\.ts$/, "vault-cli.ts") : vaultCli;
  const node = launch && !desktopApp ? pathQuote(launch.command) : "node";
  const exportCmd = (l: string) => `${node} ${shellQuote(cliBase)} export --link "${l}" --out ~/Documents/Basalt-vault --watch`;
  const importCmd = (l: string) => `${node} ${shellQuote(cliBase)} import --link "${l}" --dir ~/Documents/MyObsidianVault`;

  const root = pages.find((p) => p.system === MEMORY_SYSTEM);
  const tree = useMemo(() => (root ? buildTree(pages, root.id) : []), [pages, root]);
  const fileCount = countFiles(tree);
  const byId = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);

  const claudePeers = peers.filter((p) => p.state.agent === "claude");
  const connected = claudePeers.length > 0;
  const localOnly = !ws.info.sync;

  const createSpace = useCallback(() => {
    ensureSystemPage(ws.doc, MEMORY_SYSTEM, { title: "Claude Memory", icon: "🧠", createdBy: getSettings().identity.name });
    toast("Memory space created");
  }, [ws, toast]);

  const updateDir = (v: string) => {
    setDir(v);
    writeSetting(DIR_KEY, v.trim());
  };

  const renderNodes = (nodes: MemoryNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const title = displayTitle(node.meta).toLowerCase();
      const snippet = node.children.length
        ? ""
        : (pageText(ws.doc, node.meta.id)
            .split("\n")
            .find((l) => l.trim() && l.trim().toLowerCase() !== title) ?? "");
      return (
        <li key={node.meta.id}>
          <button className="mem-note" style={{ paddingLeft: 10 + depth * 18 }} onClick={() => openPage(node.meta.id)}>
            <span className="mem-note-icon" aria-hidden>
              {node.meta.icon || (node.children.length ? "📁" : "📝")}
            </span>
            <span className="mem-note-main">
              <span className="mem-note-title">{displayTitle(node.meta)}</span>
              <span className="mem-note-path">{node.path}</span>
              {snippet && <span className="mem-note-snippet">{snippet}</span>}
            </span>
            <span className="mem-note-time" title={new Date(node.meta.updatedAt).toLocaleString()}>
              {timeAgo(node.meta.updatedAt)}
            </span>
          </button>
          {node.children.length > 0 && <ul>{renderNodes(node.children, depth + 1)}</ul>}
        </li>
      );
    });

  return (
    <div className="page-column mem">
      <div className="view-header">
        <span className="mem-header-icon" aria-hidden>
          🧠
        </span>
        <h1>Claude memory &amp; vault</h1>
      </div>
      <p className="mem-lead">
        Connect Claude Code, Claude Desktop or any MCP client to this workspace. Claude can then search, read and write
        your notes live, keep its own long-term memory here as ordinary pages you can read and edit, and tutor you with
        courses, lessons and flashcards. Everything stays end-to-end encrypted — the relay never sees your content.
      </p>

      <div className={`mem-status${connected ? " on" : ""}`} role="status" aria-live="polite">
        <span className="mem-dot" aria-hidden />
        <div className="mem-status-text">
          {connected ? (
            <>
              <strong>Claude is connected</strong>
              {claudePeers.map((p) => {
                const page = typeof p.state.pageId === "string" ? byId.get(p.state.pageId) : undefined;
                const activity = typeof p.state.activity === "string" ? p.state.activity : "";
                return (
                  <span key={p.clientId} className="mem-status-sub">
                    {activity || "Ready"}
                    {page && !activity.includes(displayTitle(page)) && (
                      <>
                        {" · "}
                        <button className="mem-inline-link" onClick={() => openPage(page.id)}>
                          {displayTitle(page)}
                        </button>
                      </>
                    )}
                    {claudePeers.length > 1 && p.state.user?.name ? ` (${p.state.user.name})` : ""}
                  </span>
                );
              })}
            </>
          ) : (
            <>
              <strong>Claude is not connected</strong>
              <span className="mem-status-sub">
                Claude connects while a Claude Code or Claude Desktop session is open. Set it up below, then start a session.
              </span>
            </>
          )}
        </div>
        <span className="mem-sync badge" title="Sync status of this device">
          <Icon name={status === "synced" ? "cloud" : "cloudoff"} size={13} />
          {status === "local" ? "Local only" : status === "synced" ? "Synced" : status === "error" ? "Sync error" : "Connecting…"}
        </span>
      </div>

      {localOnly && (
        <div className="mem-callout warn">
          <Icon name="cloudoff" />
          <div>
            <strong>This workspace is local-only.</strong> Claude reaches it through your sync server, so turn on sync
            first (your content stays end-to-end encrypted).
          </div>
          <button className="btn btn-sm" onClick={() => ws.setSync(true)}>
            Turn on sync
          </button>
        </div>
      )}

      <div className="mem-features">
        <div className="mem-feature">
          <span aria-hidden>🧠</span>
          <strong>Long-term memory</strong>
          <p>Claude loads /memories at the start of each chat and saves preferences, facts and decisions as notes.</p>
        </div>
        <div className="mem-feature">
          <span aria-hidden>🔎</span>
          <strong>Knowledge vault</strong>
          <p>Search, read and write pages with [[links]], typed properties, daily notes and backlinks.</p>
        </div>
        <div className="mem-feature">
          <span aria-hidden>🎓</span>
          <strong>Tutor</strong>
          <p>The teach_me prompt builds a course from scratch to PhD level with lessons, quizzes and flashcards.</p>
        </div>
      </div>

      <section className="mem-section">
        <h2>Set up</h2>
        {launch ? (
          <p className="mem-muted">
            {desktopApp
              ? "Claude runs Basalt's connector with this app, so there's nothing else to install."
              : "These commands use the Basalt server running on this computer."}{" "}
            Claude keeps an offline copy, so it works even while Basalt is closed; changes sync the next time it's open.
          </p>
        ) : (
          <>
            <p className="mem-muted">
              This page is served from another computer, so Claude needs a local copy of Basalt: Node.js 22.18 or newer and
              the Basalt folder with its dependencies installed (<code>npm install</code>). Using the desktop app? Open this
              page there instead and the commands fill themselves in.
            </p>
            <label className="mem-field">
              <span>Basalt folder on this computer (absolute path)</span>
              <input
                className="input mono"
                value={dir}
                spellCheck={false}
                onChange={(e) => updateDir(e.target.value)}
                onFocus={(e) => dir === DEFAULT_DIR && e.target.select()}
              />
            </label>
          </>
        )}

        <div className="tabs mem-tabs" role="tablist">
          {(
            [
              ["code", "Claude Code"],
              ["desktop", "Claude Desktop"],
              ["vault", "Obsidian vault"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {tab === "code" && oneClick && (
          <div className="mem-steps">
            <ClaudeCodeConnect link={link} connected={connected} />
            <details className="mem-manual">
              <summary>Or run the command yourself</summary>
              <p>Run this once in a terminal; Claude Code then has Basalt in every project:</p>
              <CopyBlock code={claudeCmd(link)} display={claudeCmd(shown)} label="Terminal" />
              <p className="mem-muted">
                If it says basalt already exists, remove the old one first with <code>claude mcp remove basalt -s user</code>.
              </p>
            </details>
            <p className="mem-muted">
              Try <code>/mcp__basalt__memory_protocol</code> at the start of a session, or{" "}
              <code>/mcp__basalt__teach_me</code> followed by a topic.
            </p>
          </div>
        )}
        {tab === "code" && !oneClick && (
          <div className="mem-steps">
            <p>Run this once in a terminal; Claude Code then has Basalt in every project:</p>
            <CopyBlock code={claudeCmd(link)} display={claudeCmd(shown)} label="Terminal" />
            <p>
              Then start Claude Code (<code>claude</code>): Claude joins when a session starts and shows up at the top of this
              page while it’s open. If the command says basalt already exists, run{" "}
              <code>claude mcp remove basalt -s user</code> first.
            </p>
            <p className="mem-muted">
              Try <code>/mcp__basalt__memory_protocol</code> at the start of a session, or{" "}
              <code>/mcp__basalt__teach_me</code> followed by a topic.
            </p>
          </div>
        )}
        {tab === "desktop" && (
          <div className="mem-steps">
            <p>
              Open Claude Desktop → Settings → Developer → Edit Config and merge this into{" "}
              <code>claude_desktop_config.json</code>, then restart Claude Desktop:
            </p>
            <CopyBlock code={desktopJson(link)} display={desktopJson(shown)} label="claude_desktop_config.json" />
            <p className="mem-muted">
              The file lives in <code>~/Library/Application Support/Claude/</code> (macOS) or{" "}
              <code>%APPDATA%\Claude\</code> (Windows).{" "}
              {!launch && (
                <>
                  If Claude can't start the server, replace <code>node</code> with the full path printed by{" "}
                  <code>which node</code>.{" "}
                </>
              )}
              Use the “Use Basalt as memory” and “Teach me” prompts from the + menu.
            </p>
          </div>
        )}
        {tab === "vault" && desktopApp && (
          <div className="mem-steps">
            <p>
              Import an Obsidian vault or export this workspace as markdown files from <strong>Settings → Import &amp; export</strong>.
              Claude can also read and write every page directly through the connector above.
            </p>
          </div>
        )}
        {tab === "vault" && !desktopApp && (
          <div className="mem-steps">
            <p>
              Mirror the workspace into an Obsidian-compatible folder of markdown files (with a CLAUDE.md guide), kept up
              to date live — handy for Obsidian, grep, or pointing Claude Code at your notes:
            </p>
            <CopyBlock code={exportCmd(link)} display={exportCmd(shown)} label="Export (live, one-way)" />
            <p>Import an existing Obsidian vault (notes, folders, properties, links, images, Excalidraw drawings):</p>
            <CopyBlock code={importCmd(link)} display={importCmd(shown)} label="Import" />
            <p className="mem-muted">You can also import and export from Settings → Data in the app.</p>
          </div>
        )}

        <div className="row wrap mem-reveal">
          <button className="btn btn-ghost btn-sm" onClick={() => setReveal((r) => !r)}>
            <Icon name={reveal ? "lock" : "link"} size={14} />
            {reveal ? "Hide the secret key" : "Show the secret key"}
          </button>
          <span className="mem-muted small">Copy buttons always copy the full link.</span>
        </div>

        <div className="mem-callout danger">
          <Icon name="lock" />
          <div>
            <strong>The link is the key to this whole workspace.</strong> Anyone — and any tool — that has it can read and
            change every page. Only give it to Claude apps you run yourself, never paste it into shared configs or chats,
            and keep your config files private. A key can't be revoked: to cut access, move your pages to a new workspace.
          </div>
        </div>
      </section>

      <section className="mem-section">
        <div className="mem-section-head">
          <h2>Memory notes</h2>
          {root && (
            <span className="mem-muted small">
              {fileCount} file{fileCount === 1 ? "" : "s"}
              {root.updatedAt ? ` · updated ${timeAgo(Math.max(root.updatedAt, ...tree.map((n) => n.meta.updatedAt)))}` : ""}
            </span>
          )}
          <span className="spacer" />
          {root && (
            <button className="btn btn-sm" onClick={() => openPage(root.id)}>
              <Icon name="open" size={14} />
              Open memory page
            </button>
          )}
        </div>
        {!root ? (
          <div className="mem-empty">
            <div className="empty-icon" aria-hidden>
              🗂️
            </div>
            <div>
              <strong>No memory space yet</strong>
              <p>Claude creates it the first time it saves a memory, or you can create it now and seed it with notes.</p>
            </div>
            <button className="btn btn-primary" onClick={createSpace}>
              Create memory space
            </button>
          </div>
        ) : tree.length === 0 ? (
          <div className="mem-empty">
            <div className="empty-icon" aria-hidden>
              ✨
            </div>
            <div>
              <strong>Nothing remembered yet</strong>
              <p>Ask Claude something like “Remember that I prefer short answers with code first.”</p>
            </div>
          </div>
        ) : (
          <ul className="mem-tree">{renderNodes(tree, 0)}</ul>
        )}
      </section>
    </div>
  );
}

// Settings → Assistant & AI: the assistant's name, companion, voice, web
// access and remote MCP servers.

import { useApp } from "../lib/hooks.ts";
import { updateSettings, useSettings, type McpServerConfig } from "../lib/settings.ts";
import { Icon, Toggle } from "../components/ui.tsx";
import { canListen, canSpeak } from "./voice.ts";
import "./assistant.css";

/** `onNavigate` closes the surrounding dialog when a link leaves it. */
export function AssistantSettings({ onNavigate }: { onNavigate?: () => void }) {
  const { ws } = useApp();
  const settings = useSettings();
  const a = settings.assistant;
  const set = (patch: Partial<typeof a>) => updateSettings({ assistant: { ...a, ...patch } });
  const setServer = (i: number, patch: Partial<McpServerConfig>) =>
    set({ mcpServers: a.mcpServers.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

  return (
    <div className="col" style={{ gap: 14 }}>
      <p className="small muted" style={{ margin: 0 }}>
        Your assistant is Claude working inside this workspace: it reads and edits your pages, plans your skills and quests,
        builds courses and flashcards, and remembers what you tell it. Open it by clicking the character or pressing{" "}
        <kbd className="kbd">{mod} J</kbd>. Every conversation is saved as a page under “Chats”.
      </p>
      <div className="col" style={{ gap: 4 }}>
        <label className="small muted">Name</label>
        <input className="input" value={a.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} onBlur={(e) => !e.target.value.trim() && set({ name: "Pebble" })} />
      </div>
      <Toggle
        label="Show the companion"
        hint="A little character that floats over the app, flies to what it's working on and reacts while it thinks"
        checked={a.character}
        onChange={(character) => set({ character })}
      />
      {canSpeak() && (
        <Toggle label="Speak replies" hint="Reads answers aloud with your device's voice" checked={a.voice} onChange={(voice) => set({ voice })} />
      )}
      {!canListen() && <span className="small muted">Voice input (the mic button) isn't available in this browser.</span>}
      <Toggle
        label="Search the web"
        hint="Lets it look things up and read web pages when your notes don't have the answer"
        checked={a.web}
        onChange={(web) => set({ web })}
      />

      <div className="as-connect">
        <div className="col grow" style={{ gap: 2 }}>
          <strong>Claude Desktop, Claude Code and claude.ai</strong>
          <span className="small muted">
            Basalt is also an MCP server. Connect the Claude apps to this workspace (no API key needed) and they get the same
            tools and the same memory.
          </span>
        </div>
        <a className="btn btn-sm" href={`#/w/${ws.id}/memory`} onClick={onNavigate}>
          <Icon name="brain" /> Connect & memory
        </a>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <div className="row">
          <strong className="grow">MCP servers</strong>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => set({ mcpServers: [...a.mcpServers, { name: `server${a.mcpServers.length + 1}`, url: "", token: "", enabled: true }] })}
          >
            <Icon name="plus" /> Add server
          </button>
        </div>
        <span className="small muted">
          Give the assistant more tools: remote MCP servers (an HTTPS address) that Claude connects to from Anthropic's servers.
          The token, if any, is stored only on this device.
        </span>
        {a.mcpServers.map((s, i) => (
          <div key={i} className="as-mcp-row">
            <input className="input" style={{ width: 120 }} placeholder="name" value={s.name} onChange={(e) => setServer(i, { name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })} aria-label="Server name" />
            <input className="input grow mono" placeholder="https://example.com/mcp" value={s.url} onChange={(e) => setServer(i, { url: e.target.value.trim() })} aria-label="Server URL" />
            <input className="input mono" style={{ width: 140 }} type="password" placeholder="token (optional)" value={s.token} onChange={(e) => setServer(i, { token: e.target.value.trim() })} aria-label="Access token" autoComplete="off" />
            <label className="row small" style={{ gap: 4 }}>
              <input type="checkbox" checked={s.enabled} onChange={(e) => setServer(i, { enabled: e.target.checked })} /> On
            </label>
            <button type="button" className="icon-btn" aria-label="Remove server" onClick={() => set({ mcpServers: a.mcpServers.filter((_, j) => j !== i) })}>
              <Icon name="trash" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useApp } from "../lib/hooks.ts";
import { COLORS, updateSettings, useSettings } from "../lib/settings.ts";
import { MODELS } from "../lib/ai.ts";
import { deleteLocalData, removeInfo } from "../lib/workspace.ts";
import { navigate } from "../lib/router.ts";
import { ImportExportPanel, Lazy } from "../views/registry.tsx";
import { AppearanceSettings } from "./customize/AppearanceSettings.tsx";
import { AssistantSettings } from "../assistant/AssistantSettings.tsx";
import { Avatar, EmojiPicker, Icon, Modal, type Anchor } from "./ui.tsx";

const TABS = [
  ["profile", "Profile"],
  ["appearance", "Appearance"],
  ["workspace", "Workspace"],
  ["ai", "Assistant & AI"],
  ["data", "Import & export"],
  ["about", "About"],
] as const;

export type SettingsTab = (typeof TABS)[number][0];

export function SettingsDialog({ onClose, initialTab = "profile" }: { onClose: () => void; initialTab?: string }) {
  const { ws, toast } = useApp();
  const settings = useSettings();
  const [tab, setTab] = useState<string>(initialTab);
  const [wsName, setWsName] = useState(ws.info.name);
  const [iconAnchor, setIconAnchor] = useState<Anchor | null>(null);
  const [showKey, setShowKey] = useState(false);

  return (
    <Modal title={<><Icon name="settings" /> Settings</>} onClose={onClose} width={720}>
      <div className="settings">
        <nav className="settings-nav">
          {TABS.map(([id, label]) => (
            <button key={id} className={`nav-item${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {tab === "profile" && (
            <div className="col" style={{ gap: 14 }}>
              <div className="row">
                <Avatar name={settings.identity.name} color={settings.identity.color} size={44} />
                <div className="col grow" style={{ gap: 4 }}>
                  <label className="small muted">Display name (shown to collaborators)</label>
                  <input
                    className="input"
                    value={settings.identity.name}
                    onChange={(e) => {
                      updateSettings({ identity: { ...settings.identity, name: e.target.value } });
                      ws.setPresence({});
                    }}
                  />
                </div>
              </div>
              <div className="col" style={{ gap: 6 }}>
                <label className="small muted">Cursor color</label>
                <div className="row wrap">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`color-swatch${settings.identity.color === c ? " selected" : ""}`}
                      style={{ background: c }}
                      onClick={() => {
                        updateSettings({ identity: { ...settings.identity, color: c } });
                        ws.setPresence({});
                      }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
              <p className="small muted">
                Flashcard progress is stored per display name, so use the same name on all your devices to keep one
                study history.
              </p>
            </div>
          )}

          {tab === "appearance" && <AppearanceSettings />}

          {tab === "workspace" && (
            <div className="col" style={{ gap: 14 }}>
              <div className="row">
                <button
                  className="page-icon small-icon"
                  onClick={(e) => setIconAnchor(e.currentTarget.getBoundingClientRect())}
                  title="Change icon"
                >
                  {ws.info.icon || "🪨"}
                </button>
                <input
                  className="input grow"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  onBlur={() => wsName.trim() && ws.rename(wsName.trim())}
                  placeholder="Workspace name"
                />
              </div>
              <div className="card col">
                <strong>Remove from this device</strong>
                <span className="small muted">
                  Deletes the local copy. If sync is on, the workspace stays available to other members and your other
                  devices through the invite link.
                </span>
                <div>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!confirm(`Remove “${ws.info.name}” from this device?`)) return;
                      const id = ws.id;
                      removeInfo(id);
                      onClose();
                      navigate({ name: "none" });
                      setTimeout(() => deleteLocalData(id), 300);
                    }}
                  >
                    Remove from device
                  </button>
                </div>
              </div>
              {iconAnchor && (
                <EmojiPicker
                  anchor={iconAnchor}
                  onPick={(icon) => icon && ws.rename(wsName.trim() || ws.info.name, icon)}
                  onClose={() => setIconAnchor(null)}
                />
              )}
            </div>
          )}

          {tab === "ai" && (
            <div className="col" style={{ gap: 14 }}>
              <AssistantSettings onNavigate={onClose} />
              <hr className="settings-sep" />
              <p className="small muted" style={{ margin: 0 }}>
                The assistant, courses and flashcard generation use Claude with your own Anthropic API key. The key is
                stored only on this device and requests go straight from your browser to Anthropic. Everything else in
                Basalt works without it.
              </p>
              <div className="col" style={{ gap: 4 }}>
                <label className="small muted">Anthropic API key</label>
                <div className="row">
                  <input
                    className="input grow mono"
                    type={showKey ? "text" : "password"}
                    placeholder="sk-ant-…"
                    value={settings.anthropicKey}
                    onChange={(e) => updateSettings({ anthropicKey: e.target.value.trim() })}
                    autoComplete="off"
                  />
                  <button className="btn" onClick={() => setShowKey((v) => !v)}>
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
                <span className="small muted">
                  Get one at <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">console.anthropic.com</a>.
                </span>
              </div>
              <div className="col" style={{ gap: 4 }}>
                <label className="small muted">Model</label>
                <select className="select" value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}>
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              {settings.anthropicKey && (
                <div>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      updateSettings({ anthropicKey: "" });
                      toast("API key removed from this device");
                    }}
                  >
                    Remove key
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === "data" && (
            <Lazy>
              <ImportExportPanel ws={ws} />
            </Lazy>
          )}

          {tab === "about" && (
            <div className="col small" style={{ gap: 10 }}>
              <strong style={{ fontSize: 16 }}>Basalt</strong>
              <span className="muted">
                A free, open-source, local-first workspace: pages, databases, whiteboards, painting, notebooks,
                flashcards, courses and a Claude assistant — with end-to-end encrypted realtime collaboration on any device.
              </span>
              <span className="muted">
                Your data lives on your devices (IndexedDB) and works offline. Install it as an app from your browser’s
                menu: “Add to Home Screen” on iPhone/iPad, “Add to Dock” in Safari on Mac, or “Install app” in Chrome/Edge.
              </span>
              <div className="col" style={{ gap: 4 }}>
                <strong>Keyboard shortcuts</strong>
                <span>
                  <span className="kbd">Ctrl/⌘ K</span> search & commands · <span className="kbd">Ctrl/⌘ \</span> sidebar ·{" "}
                  <span className="kbd">Ctrl/⌘ Alt N</span> new page · <span className="kbd">/</span> blocks ·{" "}
                  <span className="kbd">[[</span> link a page
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

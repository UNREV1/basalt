// First run / new workspace / join via link.

import { useState } from "react";
import { isValidKey } from "../../shared/crypto.ts";
import { parseHash, navigate } from "../lib/router.ts";
import { infoFromKey, loadRegistry, newWorkspaceInfo, upsertInfo } from "../lib/workspace.ts";
import { updateSettings, useSettings } from "../lib/settings.ts";
import { Icon } from "./ui.tsx";

export function Welcome() {
  const settings = useSettings();
  const [name, setName] = useState(loadRegistry().length ? "" : "My workspace");
  const [sync, setSync] = useState(true);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const existing = loadRegistry().sort((a, b) => b.lastOpened - a.lastOpened);

  const create = () => {
    const info = newWorkspaceInfo(name.trim() || "My workspace", sync);
    upsertInfo(info);
    navigate({ name: "view", wsId: info.id, view: "home" });
  };

  const join = () => {
    setError("");
    const text = link.trim();
    const hash = text.includes("#") ? text.slice(text.indexOf("#")) : `#/join/${text}`;
    const route = parseHash(hash);
    if (route.name !== "join" || !isValidKey(route.key)) {
      setError("That doesn’t look like a Basalt invite link.");
      return;
    }
    const info = infoFromKey(route.key, route.server, route.wsName ?? undefined);
    upsertInfo({ ...info, lastOpened: Date.now() });
    navigate({ name: "view", wsId: info.id, view: "home" });
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo">
          <img src="/icon.svg" alt="" width={56} height={56} />
        </div>
        <h1>Welcome to Basalt</h1>
        <p className="muted">
          Pages that hold notes, canvases, databases and code — plus skills, courses, flashcards and a Claude assistant — in one free, private
          workspace that syncs across all your devices.
        </p>

        <div className="col" style={{ gap: 6, textAlign: "left" }}>
          <label className="small muted">Your name</label>
          <input
            className="input"
            value={settings.identity.name}
            onChange={(e) => updateSettings({ identity: { ...settings.identity, name: e.target.value } })}
          />
        </div>

        <div className="col" style={{ gap: 6, textAlign: "left" }}>
          <label className="small muted">New workspace</label>
          <div className="row">
            <input
              className="input grow"
              placeholder="Workspace name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button className="btn btn-primary" onClick={create}>
              Create
            </button>
          </div>
          <label className="row small muted" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} />
            Sync across devices & enable sharing (end-to-end encrypted)
          </label>
        </div>

        <div className="welcome-or">
          <span>or join with an invite link</span>
        </div>

        <div className="col" style={{ gap: 6 }}>
          <div className="row">
            <input
              className="input grow mono small"
              placeholder="https://…/#/join/…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <button className="btn" onClick={join}>
              Join
            </button>
          </div>
          {error && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}
        </div>

        {existing.length > 0 && (
          <div className="col" style={{ gap: 4, textAlign: "left" }}>
            <label className="small muted">On this device</label>
            {existing.map((w) => (
              <button
                key={w.id}
                className="nav-item"
                onClick={() => navigate({ name: "view", wsId: w.id, view: "home" })}
              >
                <span>{w.icon || "🪨"}</span>
                <span className="grow ellipsis">{w.name || "Workspace"}</span>
                <Icon name="chevron" size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function JoinScreen({ keyStr, server, wsName }: { keyStr: string; server: string | null; wsName: string | null }) {
  const valid = isValidKey(keyStr);
  const info = valid ? infoFromKey(keyStr, server, wsName ?? undefined) : null;
  const known = info && loadRegistry().some((w) => w.id === info.id);
  const accept = () => {
    if (!info) return;
    upsertInfo({ ...info, lastOpened: Date.now() });
    navigate({ name: "view", wsId: info.id, view: "home" }, true);
  };
  // Already a member on this device: App redirects straight in.
  if (known) return null;
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo">
          <img src="/icon.svg" alt="" width={56} height={56} />
        </div>
        {valid && info ? (
          <>
            <h1>Join “{info.name}”?</h1>
            <p className="muted">
              You were invited to a Basalt workspace. It will sync to this device, end-to-end encrypted.
              {server && (
                <>
                  <br />
                  <span className="small mono">Server: {server}</span>
                </>
              )}
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn" onClick={() => navigate({ name: "none" })}>
                Cancel
              </button>
              <button className="btn btn-primary btn-lg" onClick={accept}>
                Join workspace
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Invalid invite link</h1>
            <p className="muted">This link is incomplete or damaged. Ask for a new one.</p>
            <button className="btn" onClick={() => navigate({ name: "none" })}>
              Go home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

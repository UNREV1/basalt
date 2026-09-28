import { useEffect, useState } from "react";
import { isValidKey } from "../shared/crypto.ts";
import { navigate, useRoute } from "./lib/router.ts";
import { infoFromKey, loadRegistry, upsertInfo, Workspace } from "./lib/workspace.ts";
import { Shell } from "./components/Shell.tsx";
import { JoinScreen, Welcome } from "./components/Welcome.tsx";
import { Loading } from "./views/registry.tsx";
import { isApple, isStandalone, requestPersistentStorage } from "./lib/platform.ts";

/** Owns the active Workspace instance for the workspace in the URL. */
function useActiveWorkspace(wsId: string | null): Workspace | null | "missing" {
  const [ws, setWs] = useState<Workspace | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!wsId) return;
    const info = loadRegistry().find((w) => w.id === wsId);
    if (!info) {
      setMissing(true);
      return;
    }
    setMissing(false);
    upsertInfo({ ...info, lastOpened: Date.now() });
    const instance = new Workspace(info);
    let cancelled = false;
    instance.ready.then(() => !cancelled && setWs(instance));
    // Safari may evict idle site data; ask to keep it (no prompt on Apple platforms).
    if ((isApple || isStandalone()) && !localStorage.getItem("basalt:persist-asked")) {
      localStorage.setItem("basalt:persist-asked", "1");
      requestPersistentStorage();
    }
    return () => {
      cancelled = true;
      setWs(null);
      instance.destroy();
    };
  }, [wsId]);
  if (missing) return "missing";
  return ws && ws.id === wsId ? ws : null;
}

export function App() {
  const route = useRoute();
  const wsId = route.name === "view" || route.name === "page" ? route.wsId : null;
  const ws = useActiveWorkspace(wsId);

  // Default route: most recently used workspace.
  useEffect(() => {
    if (route.name !== "none" || location.hash.startsWith("#/new")) return;
    const last = loadRegistry().sort((a, b) => b.lastOpened - a.lastOpened)[0];
    if (last) navigate({ name: "view", wsId: last.id, view: "home" }, true);
  }, [route.name]);

  // Invite links for workspaces already on this device open directly.
  useEffect(() => {
    if (route.name !== "join" || !isValidKey(route.key)) return;
    const info = infoFromKey(route.key, route.server, route.wsName ?? undefined);
    if (loadRegistry().some((w) => w.id === info.id)) {
      upsertInfo({ ...info, lastOpened: Date.now() });
      navigate({ name: "view", wsId: info.id, view: "home" }, true);
    }
  }, [route]);

  if (route.name === "join") return <JoinScreen keyStr={route.key} server={route.server} wsName={route.wsName} />;
  if (route.name === "none") return <Welcome />;
  if (ws === "missing") {
    return (
      <div className="welcome">
        <div className="welcome-card">
          <h1>Workspace not on this device</h1>
          <p className="muted">Open its invite link on this device to join it.</p>
          <button className="btn btn-primary" onClick={() => navigate({ name: "none" })}>
            Go to workspaces
          </button>
        </div>
      </div>
    );
  }
  if (!ws) return <Loading label="Opening workspace…" />;
  return <Shell ws={ws} route={route} />;
}

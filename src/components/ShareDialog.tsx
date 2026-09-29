import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { useApp, usePeers, useWorkspaceStatus } from "../lib/hooks.ts";
import { copyText } from "../lib/platform.ts";
import { shareLink } from "../lib/workspace.ts";
import { defaultSyncUrl } from "../lib/settings.ts";
import { desktop } from "../lib/desktop.ts";
import { Avatar, Icon, Modal } from "./ui.tsx";

function QrCode({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

interface Network {
  url: string;
  /** The adapter, e.g. "Wi-Fi". */
  name: string;
  /** A real home or office network (not a virtual adapter). */
  likely: boolean;
}

const NETWORK_KEY = "basalt:share-network";

/**
 * When Basalt runs on this computer (desktop app or `npm start`), "localhost"
 * links won't work on a phone. Ask the server for its network addresses
 * instead, the Wi-Fi one first; the one picked last is remembered.
 */
function useLanNetworks(): { networks: Network[]; origin: string | null; pick: (url: string) => void } {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [picked, setPicked] = useState<string | null>(() => {
    try {
      return localStorage.getItem(NETWORK_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    let cancelled = false;
    fetch("/api/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { lan?: string[]; networks?: Network[] } | null) => {
        if (cancelled || !info) return;
        setNetworks(info.networks ?? (info.lan ?? []).map((url) => ({ url, name: "", likely: true })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const origin = networks.find((n) => n.url === picked)?.url ?? networks[0]?.url ?? null;
  const pick = (url: string) => {
    setPicked(url);
    try {
      localStorage.setItem(NETWORK_KEY, url);
    } catch {
      // Not remembered; fine.
    }
  };
  return { networks, origin, pick };
}

/** Phones can't connect: same Wi-Fi, the right address, and (Windows) the firewall. */
function ConnectHelp({ networks, origin, pick }: { networks: Network[]; origin: string; pick: (url: string) => void }) {
  const { toast } = useApp();
  const net = desktop?.network;
  const [firewall, setFirewall] = useState<{ needed: boolean; allowed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    net
      ?.status()
      .then((st) => !cancelled && setFirewall(st))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [net]);
  const allow = async () => {
    if (!net) return;
    setBusy(true);
    try {
      const res = await net.allow();
      if (res) toast(res.message);
      setFirewall(await net.status());
    } catch {
      toast("Couldn't change Windows Firewall.");
    } finally {
      setBusy(false);
    }
  };
  const others = networks.filter((n) => n.url !== origin);
  return (
    <details className="advanced share-help">
      <summary className="small muted">Phone or tablet can’t connect?</summary>
      <ol className="small muted share-steps">
        <li>Connect it to the same Wi-Fi as this computer, and keep Basalt open here.</li>
        {firewall?.needed && (
          <li>
            {firewall.allowed ? (
              <>Windows Firewall lets devices on your network reach Basalt. ✓</>
            ) : (
              <>
                Windows Firewall blocks other devices until you allow Basalt (on any network, including ones Windows calls
                public).{" "}
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={allow}>
                  {busy ? "Waiting for Windows…" : "Allow phones to connect"}
                </button>
                <span className="block">Windows asks for permission once. Your notes stay end-to-end encrypted.</span>
              </>
            )}
          </li>
        )}
        {others.length > 0 && (
          <li>
            Still nothing? This computer has other addresses; try the link with another one:{" "}
            {others.map((n) => (
              <button key={n.url} className="btn btn-sm btn-ghost" onClick={() => pick(n.url)}>
                {n.name ? `${n.name} · ` : ""}
                {n.url.replace(/^http:\/\//, "")}
              </button>
            ))}
          </li>
        )}
        <li>To join from anywhere (not just this Wi-Fi), put Basalt online for free: see the README.</li>
      </ol>
    </details>
  );
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const { ws, toast } = useApp();
  const status = useWorkspaceStatus(ws);
  const peers = usePeers(ws);
  const [showQr, setShowQr] = useState(false);
  const [server, setServer] = useState(ws.info.server ?? "");
  const lan = useLanNetworks();
  const lanOrigin = lan.origin;
  const link = shareLink(ws.info, lanOrigin ?? undefined);

  const canShare = typeof navigator.share === "function";
  const copy = () => {
    copyText(link).then((ok) => toast(ok ? "Invite link copied" : "Couldn’t copy — select the link and copy it manually"));
  };

  return (
    <Modal title={<><Icon name="users" /> Share & sync</>} onClose={onClose} width={560}>
      <div className="share-hero">
        <div className="share-lock">
          <Icon name="lock" size={18} />
        </div>
        <div className="col" style={{ gap: 2 }}>
          <strong>End-to-end encrypted</strong>
          <span className="small muted">
            Your notes are encrypted on this device. The sync server only relays ciphertext — it can’t read anything.
          </span>
        </div>
      </div>

      <label className="switch-row">
        <input
          type="checkbox"
          checked={ws.info.sync}
          onChange={(e) => ws.setSync(e.target.checked, server.trim() || null)}
        />
        <span className="grow">
          <strong>Sync this workspace</strong>
          <div className="small muted">Keep your devices and collaborators in sync in real time.</div>
        </span>
        <span className={`status-pill status-${status}`}>{status}</span>
      </label>

      {ws.info.sync && (
        <>
          <div className="col">
            <strong className="small">Invite link</strong>
            <div className="row">
              <input className="input grow mono small" readOnly value={link} onFocus={(e) => e.target.select()} />
              <button className="btn btn-primary" onClick={copy}>
                <Icon name="copy" size={14} /> Copy
              </button>
              {canShare && (
                <button
                  className="btn"
                  title="AirDrop, Messages, Mail…"
                  onClick={() => {
                    navigator
                      .share({ title: ws.info.name || "Basalt", text: "Join my Basalt workspace", url: link })
                      .catch(() => {});
                  }}
                >
                  <Icon name="share" size={14} /> Share…
                </button>
              )}
            </div>
            <div className="row small muted">
              <span className="grow">
                Anyone with this link can view and edit the whole workspace. Open it on your phone or tablet to sync
                your own devices.
              </span>
              <button className="btn btn-sm btn-ghost" onClick={() => setShowQr((v) => !v)}>
                {showQr ? "Hide QR" : "Show QR"}
              </button>
            </div>
            {showQr && <QrCode text={link} />}
            {lanOrigin && (
              <>
                <div className="small muted">
                  This link uses your computer’s address on your network, so phones and tablets on the same Wi-Fi can join
                  while Basalt is running here.
                </div>
                {lan.networks.length > 1 && (
                  <label className="row small muted share-network">
                    <span>Address</span>
                    <select className="input small" value={lanOrigin} onChange={(e) => lan.pick(e.target.value)}>
                      {lan.networks.map((n) => (
                        <option key={n.url} value={n.url}>
                          {n.name ? `${n.name} · ` : ""}
                          {n.url.replace(/^http:\/\//, "")}
                          {n.likely ? "" : " (virtual)"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <ConnectHelp networks={lan.networks} origin={lanOrigin} pick={lan.pick} />
              </>
            )}
          </div>

          {peers.length > 0 && (
            <div className="col">
              <strong className="small">Online now</strong>
              <div className="row wrap">
                {peers.map((p) => (
                  <span key={p.clientId} className="badge" style={{ height: 28, paddingLeft: 3 }}>
                    <Avatar name={p.state.user.name} color={p.state.user.color} size={22} />
                    {p.state.user.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <details className="advanced">
            <summary className="small muted">Sync server</summary>
            <div className="col" style={{ marginTop: 8 }}>
              <div className="row">
                <input
                  className="input grow mono small"
                  placeholder={defaultSyncUrl()}
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                />
                <button className="btn" onClick={() => ws.setSync(true, server.trim() || null)}>
                  Apply
                </button>
              </div>
              <span className="small muted">
                Leave empty to use this app’s server. Run your own for free with <code>npm start</code> or Docker — see the
                README.
              </span>
            </div>
          </details>
        </>
      )}
    </Modal>
  );
}

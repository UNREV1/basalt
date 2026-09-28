import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { useApp, usePeers, useWorkspaceStatus } from "../lib/hooks.ts";
import { copyText } from "../lib/platform.ts";
import { shareLink } from "../lib/workspace.ts";
import { defaultSyncUrl } from "../lib/settings.ts";
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

/**
 * When Basalt runs on this computer (desktop app or `npm start`), "localhost"
 * links won't work on a phone. Ask the server for its Wi-Fi address instead.
 */
function useLanOrigin(): string | null {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
    let cancelled = false;
    fetch("/api/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { lan?: string[] } | null) => {
        if (!cancelled && info?.lan?.length) setOrigin(info.lan[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return origin;
}

export function ShareDialog({ onClose }: { onClose: () => void }) {
  const { ws, toast } = useApp();
  const status = useWorkspaceStatus(ws);
  const peers = usePeers(ws);
  const [showQr, setShowQr] = useState(false);
  const [server, setServer] = useState(ws.info.server ?? "");
  const lanOrigin = useLanOrigin();
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
              <div className="small muted">
                This link uses your computer’s Wi-Fi address, so phones and tablets on the same network can join while
                Basalt is running here. To join from anywhere, put Basalt online for free (see the README).
              </div>
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

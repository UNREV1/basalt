// Notion-style cover chooser: curated gradients & colors, upload, or a link.

import { useRef, useState } from "react";
import type { PageCover } from "../../../shared/model.ts";
import { fileToStoredUrl } from "../../lib/files.ts";
import { HEX_COLOR } from "../../lib/appearance.ts";
import { Icon, Popover, Segmented, type Anchor } from "../ui.tsx";
import { COVER_COLORS, COVER_GRADIENTS } from "./palette.ts";
import { probeImage } from "./image.ts";

type Tab = "gallery" | "upload" | "link";

export function CoverPicker({
  anchor,
  current,
  onPick,
  onRemove,
  onClose,
}: {
  anchor: Anchor;
  current?: PageCover;
  onPick: (cover: PageCover) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("gallery");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState(current?.type === "image" && !current.value.startsWith("data:") ? current.value : "");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const customColor = current?.type === "color" && HEX_COLOR.test(current.value) ? current.value : "#8fa3bf";

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That file isn’t an image.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onPick({ type: "image", value: await fileToStoredUrl(file) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const applyLink = async () => {
    const url = link.trim();
    if (!/^https?:\/\//i.test(url)) {
      setError("Paste a link that starts with https://");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await probeImage(url);
      onPick({ type: "image", value: url });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const isCurrent = (type: PageCover["type"], value: string) => current?.type === type && current.value === value;

  return (
    <Popover anchor={anchor} onClose={onClose} className="menu cover-picker" sheet label="Page cover" autoFocus>
      <div className="cover-picker-head">
        <Segmented<Tab>
          label="Cover source"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setError(null);
          }}
          options={[
            { value: "gallery", label: "Gallery" },
            { value: "upload", label: "Upload" },
            { value: "link", label: "Link" },
          ]}
        />
        <span className="spacer" />
        {onRemove && current && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              onRemove();
              onClose();
            }}
          >
            Remove
          </button>
        )}
      </div>

      {tab === "gallery" && (
        <div className="cover-picker-body">
          <div className="menu-label">Gradients</div>
          <div className="cover-grid">
            {COVER_GRADIENTS.map((g) => (
              <button
                key={g.id}
                className={`cover-swatch${isCurrent("gradient", g.id) ? " selected" : ""}`}
                style={{ background: g.css }}
                title={g.name}
                aria-label={`${g.name} gradient`}
                aria-pressed={isCurrent("gradient", g.id)}
                onClick={() => onPick({ type: "gradient", value: g.id })}
              />
            ))}
          </div>
          <div className="menu-label">Colors</div>
          <div className="cover-grid">
            {COVER_COLORS.map((c) => (
              <button
                key={c.id}
                className={`cover-swatch${isCurrent("color", c.id) ? " selected" : ""}`}
                style={{ background: c.css }}
                title={c.name}
                aria-label={`${c.name} color`}
                aria-pressed={isCurrent("color", c.id)}
                onClick={() => onPick({ type: "color", value: c.id })}
              />
            ))}
            <label
              className={`cover-swatch custom${current?.type === "color" && HEX_COLOR.test(current.value) ? " selected" : ""}`}
              title="Custom color"
              style={{ background: customColor }}
            >
              <Icon name="palette" size={14} />
              <input
                type="color"
                aria-label="Custom cover color"
                value={customColor}
                onChange={(e) => onPick({ type: "color", value: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {tab === "upload" && (
        <div className="cover-picker-body">
          <button
            className={`cover-drop${drag ? " over" : ""}`}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              upload(e.dataTransfer.files[0]);
            }}
          >
            {busy ? <span className="spinner" /> : <Icon name="image" size={22} />}
            <strong>{busy ? "Preparing image…" : "Upload an image"}</strong>
            <span className="small muted">or drop one here · wide images (1500px+) look best</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
          <span className="small faint">Images are stored encrypted inside the workspace and sync to every member.</span>
        </div>
      )}

      {tab === "link" && (
        <form
          className="cover-picker-body"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            className="input"
            aria-label="Image link"
            placeholder="https://images.example.com/photo.jpg"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" disabled={busy || !link.trim()}>
            {busy ? <span className="spinner" /> : null} Use image
          </button>
          <span className="small faint">Linked images load from their website, so they need a connection.</span>
        </form>
      )}

      {error && (
        <div className="cover-picker-error small" role="alert">
          {error}
        </div>
      )}
    </Popover>
  );
}

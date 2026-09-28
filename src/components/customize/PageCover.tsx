// The banner above a page's title: gradient, color or image, with hover
// controls and a drag-to-reposition mode for images (stores style.coverY).

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { setPageStyle, type PageStyle } from "../../../shared/model.ts";
import { useApp } from "../../lib/hooks.ts";
import { Icon, type Anchor } from "../ui.tsx";
import { CoverPicker } from "./CoverPicker.tsx";
import { coverBackground } from "./palette.ts";

export function PageCover({ pageId, style, locked }: { pageId: string; style: PageStyle; locked: boolean }) {
  const { ws, toast } = useApp();
  const cover = style.cover!;
  const [picker, setPicker] = useState<Anchor | null>(null);
  const [repositioning, setRepositioning] = useState(false);
  const [draftY, setDraftY] = useState(style.coverY ?? 50);
  const [broken, setBroken] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ startY: number; startPct: number; range: number } | null>(null);

  // Follow remote changes unless we're mid-reposition.
  useEffect(() => {
    if (!repositioning) setDraftY(style.coverY ?? 50);
  }, [style.coverY, repositioning]);
  useEffect(() => setBroken(false), [cover.value]);
  useEffect(() => {
    if (locked) setRepositioning(false);
  }, [locked]);

  const background = coverBackground(cover);
  const isImage = cover.type === "image";

  /** How many px the image overflows the frame vertically (0 = nothing to move). */
  const overflow = () => {
    const f = frame.current;
    const i = img.current;
    if (!f || !i || !i.naturalWidth) return 0;
    const rendered = (f.clientWidth / i.naturalWidth) * i.naturalHeight;
    return Math.max(0, rendered - f.clientHeight);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    // Let "Save position" / "Cancel" receive their clicks (capture would retarget them).
    if (!repositioning || (e.target as HTMLElement).closest(".page-cover-controls")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startPct: draftY, range: overflow() };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !d.range) return;
    // Dragging the image down reveals its top: the focal point moves up.
    const pct = d.startPct - ((e.clientY - d.startY) / d.range) * 100;
    setDraftY(Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const save = () => {
    setPageStyle(ws.doc, pageId, { coverY: Math.round(draftY * 10) / 10 });
    setRepositioning(false);
  };
  const cancel = () => {
    setDraftY(style.coverY ?? 50);
    setRepositioning(false);
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (!repositioning) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 2;
      setDraftY((y) => Math.min(100, Math.max(0, y + (e.key === "ArrowUp" ? -step : step))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div
      ref={frame}
      className={`page-cover${repositioning ? " repositioning" : ""}${locked ? " locked" : ""}`}
      style={background ? { background } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={repositioning ? 0 : undefined}
      role={repositioning ? "slider" : undefined}
      aria-label={repositioning ? "Cover position — use arrow keys, Enter to save" : undefined}
      aria-valuenow={repositioning ? Math.round(draftY) : undefined}
      aria-valuemin={repositioning ? 0 : undefined}
      aria-valuemax={repositioning ? 100 : undefined}
    >
      {isImage && !broken && (
        <img
          ref={img}
          src={cover.value}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          style={{ objectPosition: `center ${draftY}%` }}
          onError={() => setBroken(true)}
        />
      )}
      {isImage && broken && <div className="page-cover-broken small">Couldn’t load the cover image</div>}
      {repositioning ? (
        <>
          <div className="page-cover-hint">Drag image to reposition</div>
          <div className="page-cover-controls visible">
            <button className="cover-btn" onClick={save}>
              Save position
            </button>
            <button className="cover-btn" onClick={cancel}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        !locked && (
          <div className="page-cover-controls">
            <button className="cover-btn" onClick={(e) => setPicker(e.currentTarget.getBoundingClientRect())}>
              <Icon name="image" size={13} /> Change cover
            </button>
            {isImage && !broken && (
              <button
                className="cover-btn"
                onClick={() => {
                  if (!overflow()) {
                    toast("This image already fits — nothing to reposition");
                    return;
                  }
                  setRepositioning(true);
                  requestAnimationFrame(() => frame.current?.focus());
                }}
              >
                <Icon name="width" size={13} /> Reposition
              </button>
            )}
            <button
              className="cover-btn"
              onClick={() => setPageStyle(ws.doc, pageId, { cover: null, coverY: null })}
              aria-label="Remove cover"
              title="Remove cover"
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        )
      )}
      {picker && (
        <CoverPicker
          anchor={picker}
          current={cover}
          onPick={(c) => setPageStyle(ws.doc, pageId, { cover: c, coverY: c.type === "image" && c.value !== cover.value ? 50 : style.coverY })}
          onRemove={() => setPageStyle(ws.doc, pageId, { cover: null, coverY: null })}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

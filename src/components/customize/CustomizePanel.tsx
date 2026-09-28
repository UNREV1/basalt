// "Customize page": one popover grouping every per-page option (synced to
// collaborators). Changes apply to the page immediately, so the page itself
// is the live preview.

import { useState, type ReactNode } from "react";
import {
  getPageStyle,
  setPageStyle,
  type PageFont,
  type PageKind,
  type PageLineSpacing,
  type PageStyle,
  type PageStylePatch,
  type PageWidth,
} from "../../../shared/model.ts";
import { HEX_COLOR } from "../../lib/appearance.ts";
import { useApp, usePage } from "../../lib/hooks.ts";
import { useTheme } from "../../lib/theme.ts";
import { EmojiPicker, Icon, Popover, Segmented, Toggle, type Anchor } from "../ui.tsx";
import { CoverPicker } from "./CoverPicker.tsx";
import { setPageEmoji, setPageIconImage } from "./iconActions.ts";
import { PAGE_ACCENTS, PAGE_TINTS, accentColor, coverBackground, tintPreview } from "./palette.ts";
import { PageIcon } from "./PageIcon.tsx";

/** Style fields "Reset page style" clears; cover, icon and lock are content, not style. */
const RESETTABLE: (keyof PageStyle)[] = [
  "font", "smallText", "lineSpacing", "width", "accent", "tint",
  "hideProperties", "hideBacklinks", "hideLocalGraph", "hideToc", "hideMeta",
];

const FONTS: { id: PageFont; label: string }[] = [
  { id: "sans", label: "Default" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
  { id: "rounded", label: "Rounded" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cz-section" aria-label={title}>
      <div className="menu-label">{title}</div>
      {children}
    </section>
  );
}

export function CustomizePanel({ pageId, kind, anchor, onClose }: { pageId: string; kind: PageKind; anchor: Anchor; onClose: () => void }) {
  const { ws, toast } = useApp();
  const { page, meta } = usePage(ws, pageId);
  const dark = useTheme() === "dark";
  const [iconAnchor, setIconAnchor] = useState<Anchor | null>(null);
  const [coverAnchor, setCoverAnchor] = useState<Anchor | null>(null);
  if (!page || !meta) return null;
  const style = getPageStyle(page);
  const locked = !!style.locked;
  const set = (patch: PageStylePatch) => setPageStyle(ws.doc, pageId, patch);
  const canvas = kind === "board" || kind === "paint";
  const isDoc = kind === "doc";
  const customStyled = RESETTABLE.some((k) => style[k] !== undefined);
  const customAccent = style.accent && HEX_COLOR.test(style.accent) ? style.accent : null;
  const coverBg = style.cover ? coverBackground(style.cover) : null;

  return (
    <Popover anchor={anchor} onClose={onClose} className="menu customize-panel" sheet label="Customize page" autoFocus>
      <div className="cz-head">
        <Icon name="sliders" />
        <strong className="grow">Customize page</strong>
        {!canvas && (
          <button
            className="btn btn-sm btn-ghost"
            disabled={!customStyled || locked}
            title="Reset fonts, layout, colors and visibility"
            onClick={() => set(Object.fromEntries(RESETTABLE.map((k) => [k, null])) as PageStylePatch)}
          >
            <Icon name="reset" size={13} /> Reset
          </button>
        )}
      </div>

      {locked && (
        <div className="cz-locked">
          <Icon name="lock" size={14} />
          <span className="grow small">Locked — nobody can edit this page or its style.</span>
          <button className="btn btn-sm" onClick={() => set({ locked: null })}>
            Unlock
          </button>
        </div>
      )}

      <fieldset className="cz-body" disabled={locked}>
        <Section title={canvas ? "Icon" : "Cover & icon"}>
          <div className="cz-row">
            <button
              className="cz-icon-button"
              aria-label="Change icon"
              onClick={(e) => setIconAnchor(e.currentTarget.getBoundingClientRect())}
            >
              {style.iconImage || meta.icon ? (
                <PageIcon meta={meta} className="cz-icon-preview" />
              ) : (
                <span className="cz-icon-preview empty">
                  <Icon name="smile" size={16} />
                </span>
              )}
              <span>{style.iconImage || meta.icon ? "Change icon" : "Add icon"}</span>
            </button>
            {!canvas && (
              <button
                className="cz-cover-button"
                aria-label={style.cover ? "Change cover" : "Add cover"}
                onClick={(e) => setCoverAnchor(e.currentTarget.getBoundingClientRect())}
              >
                <span
                  className={`cz-cover-thumb${style.cover ? "" : " empty"}`}
                  style={coverBg ? { background: coverBg } : undefined}
                >
                  {style.cover?.type === "image" && <img src={style.cover.value} alt="" referrerPolicy="no-referrer" />}
                  {!style.cover && <Icon name="image" size={14} />}
                </span>
                <span>{style.cover ? "Change cover" : "Add cover"}</span>
              </button>
            )}
          </div>
        </Section>

        {!canvas && (
          <>
            <Section title="Text">
              <div className="cz-fonts" role="radiogroup" aria-label="Page font">
                {FONTS.map((f) => {
                  const active = (style.font ?? "sans") === f.id;
                  return (
                    <button
                      key={f.id}
                      role="radio"
                      aria-checked={active}
                      className={`cz-font${active ? " active" : ""}`}
                      data-font={f.id}
                      onClick={() => set({ font: f.id === "sans" ? null : f.id })}
                    >
                      <span className="cz-font-sample">Ag</span>
                      <span className="small">{f.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="cz-line">
                <span className="grow">Line spacing</span>
                <Segmented<PageLineSpacing>
                  label="Line spacing"
                  value={style.lineSpacing ?? "normal"}
                  onChange={(v) => set({ lineSpacing: v === "normal" ? null : v })}
                  options={[
                    { value: "compact", label: "Tight" },
                    { value: "normal", label: "Normal" },
                    { value: "relaxed", label: "Relaxed" },
                  ]}
                />
              </div>
              <Toggle label="Small text" checked={!!style.smallText} onChange={(v) => set({ smallText: v })} />
            </Section>

            <Section title="Layout">
              <div className="cz-line">
                <span className="grow">Width</span>
                <Segmented<PageWidth | "auto">
                  label="Page width"
                  value={style.width ?? (kind === "database" || kind === "notebook" ? "auto" : "normal")}
                  onChange={(v) => set({ width: v === "auto" || (v === "normal" && !(kind === "database" || kind === "notebook")) ? null : v })}
                  options={[
                    ...(kind === "database" || kind === "notebook" ? [{ value: "auto" as const, label: "Auto" }] : []),
                    { value: "normal", label: "Normal" },
                    { value: "wide", label: "Wide" },
                    { value: "full", label: "Full" },
                  ]}
                />
              </div>
            </Section>

            <Section title="Accent color">
              <div className="cz-swatches" role="radiogroup" aria-label="Accent color">
                <button
                  role="radio"
                  aria-checked={!style.accent}
                  className={`cz-swatch default${!style.accent ? " selected" : ""}`}
                  title="Theme accent"
                  aria-label="Theme accent"
                  onClick={() => set({ accent: null })}
                />
                {PAGE_ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={style.accent === a.id}
                    className={`cz-swatch${style.accent === a.id ? " selected" : ""}`}
                    style={{ background: accentColor(a.id, dark)! }}
                    title={a.name}
                    aria-label={a.name}
                    onClick={() => set({ accent: a.id })}
                  />
                ))}
                <label
                  className={`cz-swatch custom${customAccent ? " selected" : ""}`}
                  title="Custom color"
                  style={customAccent ? { background: customAccent } : undefined}
                >
                  <input
                    type="color"
                    aria-label="Custom accent color"
                    value={customAccent ?? "#5b5bd6"}
                    onChange={(e) => set({ accent: e.target.value })}
                  />
                </label>
              </div>
            </Section>

            <Section title="Background">
              <div className="cz-swatches" role="radiogroup" aria-label="Background tint">
                <button
                  role="radio"
                  aria-checked={!style.tint}
                  className={`cz-swatch none${!style.tint ? " selected" : ""}`}
                  title="No tint"
                  aria-label="No tint"
                  onClick={() => set({ tint: null })}
                />
                {PAGE_TINTS.map((t) => (
                  <button
                    key={t.id}
                    role="radio"
                    aria-checked={style.tint === t.id}
                    className={`cz-swatch tint${style.tint === t.id ? " selected" : ""}`}
                    style={{ background: tintPreview(t, dark) }}
                    title={t.name}
                    aria-label={`${t.name} tint`}
                    onClick={() => set({ tint: t.id })}
                  />
                ))}
              </div>
            </Section>

            <Section title="Show">
              <Toggle label="Properties" checked={!style.hideProperties} onChange={(v) => set({ hideProperties: !v })} />
              {isDoc && <Toggle label="Backlinks" checked={!style.hideBacklinks} onChange={(v) => set({ hideBacklinks: !v })} />}
              {isDoc && <Toggle label="Local graph" checked={!style.hideLocalGraph} onChange={(v) => set({ hideLocalGraph: !v })} />}
              {isDoc && (
                <Toggle
                  label="Table of contents"
                  hint="Shown on wide screens for pages with 3+ headings"
                  checked={!style.hideToc}
                  onChange={(v) => set({ hideToc: !v })}
                />
              )}
              <Toggle label="“Edited …” line" checked={!style.hideMeta} onChange={(v) => set({ hideMeta: !v })} />
            </Section>
          </>
        )}
      </fieldset>

      {!locked && (
        <div className="cz-section cz-lock">
          <Toggle
            label={
              <span className="row" style={{ gap: 6 }}>
                <Icon name="lock" size={14} /> Lock page
              </span>
            }
            hint="Read-only for everyone until someone unlocks it"
            checked={false}
            onChange={() => set({ locked: true })}
          />
        </div>
      )}

      {iconAnchor && (
        <EmojiPicker
          anchor={iconAnchor}
          onPick={(emoji) => setPageEmoji(ws, pageId, emoji)}
          onUploadImage={(file) => setPageIconImage(ws, pageId, file, toast)}
          onClose={() => setIconAnchor(null)}
        />
      )}
      {coverAnchor && (
        <CoverPicker
          anchor={coverAnchor}
          current={style.cover}
          onPick={(c) => set({ cover: c, coverY: c.type === "image" ? 50 : null })}
          onRemove={() => set({ cover: null, coverY: null })}
          onClose={() => setCoverAnchor(null)}
        />
      )}
    </Popover>
  );
}

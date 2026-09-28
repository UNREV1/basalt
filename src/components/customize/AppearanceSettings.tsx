// Settings → Appearance: per-device look & feel. Every change applies at once
// (the app behind the dialog is the live preview) and is never synced.

import { useState, type DragEvent, type ReactNode } from "react";
import { displayTitle, getPage, pageMeta } from "../../../shared/model.ts";
import {
  ACCENT_PRESETS,
  FONT_LABELS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_STACKS,
  HEX_COLOR,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_NAV,
  THEME_PRESETS,
  WALLPAPERS,
  orderFavorites,
  presetOnly,
  type ThemePreset,
} from "../../lib/appearance.ts";
import { useApp, usePages } from "../../lib/hooks.ts";
import { defaultAppearance, updateAppearance, updateSettings, useSettings, type UiFont } from "../../lib/settings.ts";
import { useTheme } from "../../lib/theme.ts";
import { lensSupported } from "../../lib/liquidGlass.ts";
import { Icon, Segmented, Toggle } from "../ui.tsx";
import { DesignGallery } from "./DesignGallery.tsx";
import { PageIcon } from "./PageIcon.tsx";
import { fileToWallpaperDataUrl } from "./image.ts";

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="ap-group" aria-label={title}>
      <h4 className="ap-title">{title}</h4>
      {hint && <p className="small muted ap-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** A miniature of the app painted with a preset's own tokens. */
function PresetCard({ preset, active, dark, onClick }: { preset: ThemePreset; active: boolean; dark: boolean; onClick: () => void }) {
  const only = presetOnly(preset.id);
  const t = (only === "dark" ? preset.dark : only === "light" ? preset.light : dark ? preset.dark : preset.light)!;
  return (
    <button
      className={`ap-preset${active ? " active" : ""}`}
      role="radio"
      aria-checked={active}
      onClick={onClick}
      title={preset.description}
    >
      <span
        className="ap-preset-art"
        style={{
          background: preset.id === "glass" ? `${t["--glass-sheet"] ?? t["--bg"]}` : t["--bg"],
          backgroundImage: preset.id === "glass" ? (dark ? WALLPAPERS[0].dark : WALLPAPERS[0].light) : undefined,
          borderColor: t["--border"],
        }}
        aria-hidden
      >
        <span className="ap-art-side" style={{ background: t["--bg-soft"], borderColor: t["--border"] }}>
          <i style={{ background: t["--text-faint"] }} />
          <i style={{ background: t["--accent-soft"], width: "80%" }} />
          <i style={{ background: t["--text-faint"] }} />
        </span>
        <span className="ap-art-main">
          <i style={{ background: t["--text"], width: "60%", height: 5 }} />
          <i style={{ background: t["--text-muted"] }} />
          <i style={{ background: t["--text-muted"], width: "75%" }} />
          <b style={{ background: t["--accent"] }} />
        </span>
      </span>
      <span className="ap-preset-name">
        <span className="ellipsis">{preset.name}</span>
        {only && <span className="ap-only">{only === "dark" ? "Dark" : "Light"}</span>}
      </span>
    </button>
  );
}

/** Liquid Glass: the backdrop behind the glass, and a solid-surfaces option. */
function GlassOptions({ dark }: { dark: boolean }) {
  const a = useSettings().appearance;
  const [error, setError] = useState("");
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      updateAppearance({ wallpaper: "image", wallpaperImage: await fileToWallpaperDataUrl(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <Group title="Liquid Glass" hint="The backdrop the glass floats over, and how the glass bends and frosts it. Images stay on this device.">
      <div className="ap-wallpapers" role="radiogroup" aria-label="Wallpaper">
        {WALLPAPERS.map((w) => (
          <button
            key={w.id}
            role="radio"
            aria-checked={a.wallpaper === w.id}
            className={`ap-wallpaper${a.wallpaper === w.id ? " active" : ""}`}
            onClick={() => updateAppearance({ wallpaper: w.id })}
          >
            <span className="ap-wallpaper-art" style={{ background: dark ? w.dark : w.light }} aria-hidden />
            <span className="small">{w.name}</span>
          </button>
        ))}
        <label className={`ap-wallpaper${a.wallpaper === "image" ? " active" : ""}`} role="radio" aria-checked={a.wallpaper === "image"}>
          <span
            className="ap-wallpaper-art ap-wallpaper-upload"
            style={a.wallpaperImage ? { backgroundImage: `url("${a.wallpaperImage}")` } : undefined}
            aria-hidden
          >
            {!a.wallpaperImage && <Icon name="upload" size={16} />}
          </span>
          <span className="small">{a.wallpaperImage ? "Your image" : "Upload…"}</span>
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {a.wallpaperImage && (
        <div className="row small">
          {a.wallpaper !== "image" && (
            <button className="btn btn-sm" onClick={() => updateAppearance({ wallpaper: "image" })}>
              Use my image
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => updateAppearance({ wallpaperImage: "", wallpaper: a.wallpaper === "image" ? "aurora" : a.wallpaper })}>
            Remove image
          </button>
        </div>
      )}
      {error && <span className="small" style={{ color: "var(--danger)" }}>{error}</span>}
      <label className="ap-slider">
        <span className="grow">Refraction</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={a.refraction}
          disabled={a.reduceTransparency}
          onChange={(e) => updateAppearance({ refraction: Number(e.target.value) })}
        />
        <span className="ap-value mono">{a.refraction}</span>
      </label>
      <label className="ap-slider">
        <span className="grow">Frost</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={a.frost}
          disabled={a.reduceTransparency}
          onChange={(e) => updateAppearance({ frost: Number(e.target.value) })}
        />
        <span className="ap-value mono">{a.frost}</span>
      </label>
      {!lensSupported() && a.refraction > 0 && !a.reduceTransparency && (
        <span className="small muted">
          Refraction (glass that bends what's behind it) shows in Chrome, Edge, Android and the desktop app; this browser
          shows frosted glass.
        </span>
      )}
      <div className="cz-line">
        <span className="grow">Corners</span>
        <Segmented<"subtle" | "round">
          label="Corners"
          value={a.corners}
          onChange={(corners) => updateAppearance({ corners })}
          options={[
            { value: "subtle", label: "Subtle" },
            { value: "round", label: "Round" },
          ]}
        />
      </div>
      <Toggle
        label="Reduce transparency"
        hint="Solid surfaces instead of glass — easier to read and lighter on older phones and laptops"
        checked={a.reduceTransparency}
        onChange={(reduceTransparency) => updateAppearance({ reduceTransparency })}
      />
    </Group>
  );
}

export function AppearanceSettings() {
  const { ws } = useApp();
  const settings = useSettings();
  const a = settings.appearance;
  const dark = useTheme() === "dark";
  const pages = usePages(ws);
  const favorites = orderFavorites(
    pages.filter((p) => p.favorite).map((p) => p.id),
    a.favoriteOrder,
  );
  const [dragFav, setDragFav] = useState<string | null>(null);
  const [cssDraft, setCssDraft] = useState(a.customCss);
  const only = presetOnly(a.preset);

  const moveFav = (id: string, to: number) => {
    const list = favorites.filter((f) => f !== id);
    list.splice(Math.max(0, Math.min(to, list.length)), 0, id);
    updateAppearance({ favoriteOrder: list });
  };

  return (
    <div className="appearance col">
      <Group title="Design" hint="Pick a complete look. Everything below fine-tunes it.">
        <DesignGallery />
      </Group>

      <Group title="Theme">
        <div className="row wrap" style={{ gap: 10 }}>
          <Segmented<"system" | "light" | "dark">
            label="Color mode"
            value={settings.theme}
            disabled={!!only}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: <><Icon name="sun" size={13} /> Light</> },
              { value: "dark", label: <><Icon name="moon" size={13} /> Dark</> },
            ]}
          />
          {only && <span className="small muted">This theme is {only}-only.</span>}
        </div>
        <div className="ap-presets" role="radiogroup" aria-label="Theme preset">
          {THEME_PRESETS.map((p) => (
            <PresetCard key={p.id} preset={p} active={a.preset === p.id} dark={dark} onClick={() => updateAppearance({ preset: p.id })} />
          ))}
        </div>
      </Group>

      {a.preset === "glass" && <GlassOptions dark={dark} />}

      <Group title="Accent color">
        <div className="cz-swatches ap-accents" role="radiogroup" aria-label="Accent color">
          <button
            role="radio"
            aria-checked={!a.accent}
            className={`cz-swatch default${!a.accent ? " selected" : ""}`}
            title="Theme accent"
            aria-label="Theme accent"
            onClick={() => updateAppearance({ accent: "" })}
          />
          {ACCENT_PRESETS.map((c) => (
            <button
              key={c.color}
              role="radio"
              aria-checked={a.accent === c.color}
              className={`cz-swatch${a.accent.toLowerCase() === c.color ? " selected" : ""}`}
              style={{ background: c.color }}
              title={c.name}
              aria-label={c.name}
              onClick={() => updateAppearance({ accent: c.color })}
            />
          ))}
          <label
            className={`cz-swatch custom${HEX_COLOR.test(a.accent) && !ACCENT_PRESETS.some((c) => c.color === a.accent.toLowerCase()) ? " selected" : ""}`}
            title="Custom color"
            style={HEX_COLOR.test(a.accent) && !ACCENT_PRESETS.some((c) => c.color === a.accent.toLowerCase()) ? { background: a.accent } : undefined}
          >
            <input type="color" aria-label="Custom accent color" value={HEX_COLOR.test(a.accent) ? a.accent : "#5b5bd6"} onChange={(e) => updateAppearance({ accent: e.target.value })} />
          </label>
          <input
            className="input mono ap-hex"
            aria-label="Accent hex value"
            placeholder="#5b5bd6"
            maxLength={7}
            key={a.accent}
            defaultValue={a.accent}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) updateAppearance({ accent: "" });
              else if (HEX_COLOR.test(v)) updateAppearance({ accent: v.toLowerCase() });
              else e.target.value = a.accent;
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <div className="ap-sample">
          <button className="btn btn-primary btn-sm" tabIndex={-1}>
            Primary
          </button>
          <span className="link-button">A link</span>
          <input type="checkbox" checked readOnly tabIndex={-1} aria-label="Sample checkbox" />
          <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            Selected
          </span>
        </div>
      </Group>

      <Group title="Text">
        <div className="cz-fonts" role="radiogroup" aria-label="Interface font">
          {(Object.keys(FONT_LABELS) as UiFont[]).map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={a.uiFont === f}
              className={`cz-font${a.uiFont === f ? " active" : ""}`}
              style={{ fontFamily: FONT_STACKS[f] }}
              onClick={() => updateAppearance({ uiFont: f })}
            >
              <span className="cz-font-sample">Ag</span>
              <span className="small">{f === "sans" ? "Default" : FONT_LABELS[f]}</span>
            </button>
          ))}
        </div>
        <label className="ap-slider">
          <span className="grow">Font size</span>
          <input
            type="range"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            value={a.fontSize}
            onChange={(e) => updateAppearance({ fontSize: Number(e.target.value) })}
          />
          <span className="ap-value mono">{a.fontSize}px</span>
        </label>
        <div className="cz-line">
          <span className="grow">Density</span>
          <Segmented<"comfortable" | "compact">
            label="Density"
            value={a.density}
            onChange={(density) => updateAppearance({ density })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </div>
        <Toggle
          label="Reduce motion"
          hint="Turns off animations and transitions (your system setting is always respected)"
          checked={a.reduceMotion}
          onChange={(reduceMotion) => updateAppearance({ reduceMotion })}
        />
      </Group>

      <Group title="Sidebar" hint="You can also drag the sidebar’s right edge; double-click it to reset.">
        <label className="ap-slider">
          <span className="grow">Width</span>
          <input
            type="range"
            min={SIDEBAR_MIN}
            max={SIDEBAR_MAX}
            step={4}
            value={a.sidebarWidth}
            onChange={(e) => updateAppearance({ sidebarWidth: Number(e.target.value) })}
          />
          <span className="ap-value mono">{a.sidebarWidth}px</span>
        </label>
        <div className="ap-subtitle small muted">Show in sidebar</div>
        <div className="ap-nav-grid">
          {SIDEBAR_NAV.map((n) => {
            const shown = !a.hiddenNav.includes(n.id);
            return (
              <label key={n.id} className="ap-check">
                <input
                  type="checkbox"
                  checked={shown}
                  onChange={() =>
                    updateAppearance({ hiddenNav: shown ? [...a.hiddenNav, n.id] : a.hiddenNav.filter((x) => x !== n.id) })
                  }
                />
                <Icon name={n.icon} size={15} />
                <span>{n.label}</span>
              </label>
            );
          })}
        </div>
        <div className="ap-subtitle small muted">Favorites order</div>
        {favorites.length === 0 ? (
          <div className="small faint">Star pages to pin them to the sidebar; then drag to reorder them here or in the sidebar.</div>
        ) : (
          <ol className="ap-favs" aria-label="Favorites order">
            {favorites.map((id, i) => {
              const page = getPage(ws.doc, id);
              if (!page) return null;
              const meta = pageMeta(page);
              return (
                <li
                  key={id}
                  className={`ap-fav${dragFav === id ? " dragging" : ""}`}
                  draggable
                  onDragStart={(e: DragEvent) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", id);
                    setDragFav(id);
                  }}
                  onDragEnd={() => setDragFav(null)}
                  onDragOver={(e) => dragFav && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFav && dragFav !== id) moveFav(dragFav, favorites.indexOf(id));
                    setDragFav(null);
                  }}
                >
                  <span className="ap-grip" aria-hidden>
                    <Icon name="grip" size={14} stroke={3} />
                  </span>
                  <PageIcon meta={meta} className="ap-fav-icon" />
                  <span className="grow ellipsis">{displayTitle(meta)}</span>
                  <button className="icon-btn" disabled={i === 0} aria-label={`Move ${displayTitle(meta)} up`} onClick={() => moveFav(id, i - 1)}>
                    <Icon name="up" size={14} />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={i === favorites.length - 1}
                    aria-label={`Move ${displayTitle(meta)} down`}
                    onClick={() => moveFav(id, i + 1)}
                  >
                    <Icon name="down" size={14} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Group>

      <Group
        title="Custom CSS"
        hint={
          <>
            An Obsidian-style snippet for fine-tuning. It applies <strong>only on this device</strong> and is never synced
            or shared. Design tokens like <code>--accent</code>, <code>--bg</code> and <code>--font</code> are good starting points.
          </>
        }
      >
        <Toggle
          label="Enable snippet"
          checked={a.customCssEnabled}
          onChange={(customCssEnabled) => updateAppearance({ customCssEnabled, customCss: cssDraft })}
        />
        <textarea
          className="textarea mono ap-css"
          aria-label="Custom CSS"
          spellCheck={false}
          rows={7}
          placeholder={`/* Example */\n.page-title-input { letter-spacing: -0.03em; }\n:root { --radius: 4px; }`}
          value={cssDraft}
          onChange={(e) => {
            setCssDraft(e.target.value);
            updateAppearance({ customCss: e.target.value });
          }}
        />
      </Group>

      <div className="row ap-reset">
        <span className="small muted grow">Appearance settings are stored on this device only.</span>
        <button
          className="btn btn-sm"
          onClick={() => {
            const d = defaultAppearance();
            updateSettings({
              theme: "system",
              appearance: { ...d, favoriteOrder: a.favoriteOrder, customCss: a.customCss, customCssEnabled: false },
            });
          }}
        >
          <Icon name="reset" size={13} /> Reset appearance
        </button>
      </div>
    </div>
  );
}

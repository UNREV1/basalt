// The design gallery: complete looks with a live miniature of each, painted
// with that design's own colors, backdrop and font. One click applies it.

import { FONT_STACKS, WALLPAPERS, getPreset, presetOnly } from "../../lib/appearance.ts";
import { DESIGNS, closestDesign, designMatches, type Design } from "../../lib/designs.ts";
import { updateAppearance, updateSettings, useSettings, type UiFont } from "../../lib/settings.ts";
import { useTheme } from "../../lib/theme.ts";
import { Icon } from "../ui.tsx";

function Miniature({ design, dark }: { design: Design; dark: boolean }) {
  const a = design.appearance;
  const preset = getPreset(a.preset ?? "glass");
  const only = presetOnly(preset.id);
  const useDark = only ? only === "dark" : dark;
  const t = (useDark ? preset.dark : preset.light) ?? preset.light ?? preset.dark!;
  const glass = preset.id === "glass";
  const wallpaper = WALLPAPERS.find((w) => w.id === a.wallpaper) ?? WALLPAPERS[0];
  const radius = a.corners === "round" ? 10 : 6;
  const gap = a.density === "compact" ? 4 : 6;
  const font = FONT_STACKS[(a.uiFont ?? "sans") as UiFont];
  const pane = (fill: string) =>
    glass
      ? { background: fill, border: `1px solid ${t["--glass-edge"] ?? t["--border"]}`, borderRadius: radius, margin: 5 }
      : { background: fill };
  return (
    <span
      className={`dg-art${glass ? " glass" : ""}`}
      style={{ background: glass ? (useDark ? wallpaper.dark : wallpaper.light) : t["--bg"], fontFamily: font, color: t["--text"] }}
      aria-hidden
    >
      <span
        className="dg-side"
        style={{ ...pane(glass ? t["--glass-fill-strong"] : t["--bg-soft"]), borderRight: glass ? undefined : `1px solid ${t["--border"]}`, gap }}
      >
        <i style={{ background: t["--text-faint"], width: "70%" }} />
        <i className="on" style={{ background: t["--accent-soft"] }}>
          <em style={{ background: t["--accent"] }} />
        </i>
        <i style={{ background: t["--text-faint"], width: "55%" }} />
        <i style={{ background: t["--text-faint"], width: "62%" }} />
      </span>
      <span className="dg-main" style={{ ...pane(glass ? t["--glass-sheet"] : t["--bg"]), gap }}>
        <span className="dg-title">Learn</span>
        <i style={{ background: t["--text-muted"], width: "85%" }} />
        <i style={{ background: t["--text-muted"], width: "60%" }} />
        <span className="dg-card" style={{ background: glass ? t["--glass-lens"] : t["--bg-soft"], borderColor: t["--border"], borderRadius: radius - 2 }}>
          <i style={{ background: t["--text-faint"], width: "50%" }} />
          <b style={{ background: t["--accent"], borderRadius: radius }} />
        </span>
      </span>
    </span>
  );
}

export function DesignGallery() {
  const settings = useSettings();
  const dark = useTheme() === "dark";
  const tuned = closestDesign(settings);

  const choose = (d: Design) => {
    updateAppearance(d.appearance);
    if (d.theme) updateSettings({ theme: d.theme });
  };

  return (
    <div className="dg-grid" role="radiogroup" aria-label="Design">
      {DESIGNS.map((d) => {
        const exact = designMatches(d, settings);
        const current = exact || tuned?.id === d.id;
        const only = presetOnly(d.appearance.preset ?? "glass");
        return (
          <button key={d.id} className={`dg-card-btn${current ? " active" : ""}`} role="radio" aria-checked={current} onClick={() => choose(d)}>
            <Miniature design={d} dark={dark} />
            <span className="dg-meta">
              <span className="dg-name">
                {d.name}
                {current && (
                  <span className="dg-badge">
                    <Icon name="check" size={11} stroke={2.6} /> {exact ? "In use" : "Tuned"}
                  </span>
                )}
                {!current && only && <span className="dg-mode">{only === "dark" ? "Dark" : "Light"}</span>}
              </span>
              <span className="dg-tagline">{d.tagline}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Obsidian-style graph of pages and their [[links]]: a force-directed layout on
// a canvas, with search, filters, a kind legend, and a local (neighborhood) mode.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildLinkGraph, getPage, pagesMap, PAGE_KINDS, templateSubtree, type PageKind } from "../../../shared/model.ts";
import { useApp, useLatest, usePages } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { buildGraphData } from "./graph-model.ts";
import { GraphRenderer, type GraphColors } from "./graph-renderer.ts";
import { themedColor } from "../../../shared/skills.ts";
import { usePalette } from "../../lib/theme.ts";
import "./GraphView.css";

export interface GraphViewProps {
  ws: Workspace;
  /** Show the neighborhood of this page ("local graph"). */
  focusPageId?: string;
  /** Small embeddable panel: fills its parent, only a depth control. */
  compact?: boolean;
}

interface StoredSettings {
  orphans: boolean;
  hierarchy: boolean;
  labels: boolean;
  depth: number;
  hiddenKinds: PageKind[];
  panelOpen: boolean;
}

const SETTINGS_KEY = "basalt:graph-view";
const DEFAULTS: StoredSettings = { orphans: true, hierarchy: false, labels: true, depth: 1, hiddenKinds: [], panelOpen: true };

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Storage may be unavailable (private mode); defaults are fine.
  }
  return { ...DEFAULTS, panelOpen: !matchMedia("(max-width: 720px)").matches };
}

/**
 * Page kinds by color: plain pages stay neutral, the rest take a color slot
 * (stored as the classic color), shown in this device's palette like the skill map.
 */
const KIND_SLOTS: Record<PageKind, string | null> = {
  // Legacy paint pages are canvases now, so they share the canvas color; chats take the free slot.
  doc: null,
  database: "#2a78d6",
  board: "#eb6834",
  paint: "#eb6834",
  notebook: "#eda100",
  course: "#e87ba4",
  chat: "#1baf7a",
};

function kindColors(dark: boolean): Record<PageKind, string> {
  const out = {} as Record<PageKind, string>;
  for (const [kind, hex] of Object.entries(KIND_SLOTS) as [PageKind, string | null][]) {
    out[kind] = hex ? themedColor(hex, dark) : dark ? "#8f8e8a" : "#8b8a86";
  }
  return out;
}

const isDarkNow = () => document.documentElement.dataset.theme === "dark";

function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkNow);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkNow()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** [[link]] graph, recomputed at most about once a second while pages are edited. */
function useLinkGraph(ws: Workspace) {
  const [graph, setGraph] = useState(() => buildLinkGraph(ws.doc));
  useEffect(() => {
    const map = pagesMap(ws.doc);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const run = () => {
      timer = null;
      last = Date.now();
      setGraph(buildLinkGraph(ws.doc));
    };
    const onChange = () => {
      if (timer) return;
      timer = setTimeout(run, Math.max(150, 1000 - (Date.now() - last)));
    };
    map.observeDeep(onChange);
    setGraph(buildLinkGraph(ws.doc));
    return () => {
      map.unobserveDeep(onChange);
      if (timer) clearTimeout(timer);
    };
  }, [ws]);
  return graph;
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="gv-toggle" title={hint}>
      <span className="grow">{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="gv-switch" aria-hidden="true" />
    </label>
  );
}

function DepthControl({ depth, onChange }: { depth: number; onChange: (d: number) => void }) {
  return (
    <div className="gv-depth" role="radiogroup" aria-label="Link depth">
      {[1, 2, 3].map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={depth === d}
          className={depth === d ? "active" : ""}
          onClick={() => onChange(d)}
          title={`Show pages up to ${d} link${d > 1 ? "s" : ""} away`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

const ZoomIn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const ZoomOut = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M5 12h14" />
  </svg>
);
const FitIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
const SlidersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

export default function GraphView({ ws, focusPageId, compact = false }: GraphViewProps) {
  const { openPage } = useApp();
  const allPages = usePages(ws);
  // Templates are scaffolding, not knowledge: keep them out of the graph.
  const pages = useMemo(() => {
    const templates = templateSubtree(ws.doc);
    return templates.size ? allPages.filter((p) => !templates.has(p.id)) : allPages;
  }, [ws, allPages]);
  const linkGraph = useLinkGraph(ws);
  const dark = useDarkMode();
  const palette = usePalette();
  const kinds = useMemo(() => kindColors(dark), [dark, palette]);
  const [settings, setSettings] = useState(loadSettings);
  const [search, setSearch] = useState("");
  const [localMode, setLocalMode] = useState(true);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GraphRenderer | null>(null);
  const openRef = useLatest(openPage);

  const update = (patch: Partial<StoredSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Not persisted; the view still works.
      }
      return next;
    });

  const focusExists = !!focusPageId && pages.some((p) => p.id === focusPageId);
  const focusId = focusExists && (compact || localMode) ? focusPageId : undefined;
  const hiddenKinds = useMemo(() => new Set(settings.hiddenKinds), [settings.hiddenKinds]);
  const data = useMemo(
    () =>
      buildGraphData(pages, linkGraph, {
        orphans: settings.orphans,
        hierarchy: settings.hierarchy,
        hiddenKinds: compact ? new Set<PageKind>() : hiddenKinds,
        focusId,
        depth: settings.depth,
      }),
    [pages, linkGraph, settings.orphans, settings.hierarchy, hiddenKinds, compact, focusId, settings.depth],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    const r = new GraphRenderer(canvas, { onOpen: (id) => openRef.current(id), onHover: setHoverId });
    rendererRef.current = r;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) r.resize(width, height);
    });
    ro.observe(canvas.parentElement!);
    return () => {
      ro.disconnect();
      r.destroy();
      rendererRef.current = null;
    };
  }, [openRef]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const css = getComputedStyle(root);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const colors: GraphColors = {
      text: v("--text", "#2b2a27"),
      textMuted: v("--text-muted", "#787774"),
      halo: v("--bg", "#ffffff"),
      edge: v("--border-strong", "#d3d2ce"),
      accent: v("--accent", "#5b5bd6"),
      font: v("--font", "sans-serif"),
      kinds,
    };
    rendererRef.current?.setColors(colors);
    // (kinds changes with the palette, which also brings its accent.)
  }, [dark, kinds]);

  // Re-fit when the neighborhood definition changes, not on every live edit.
  const fitKey = `${focusId ?? ""}|${settings.depth}|${settings.orphans}|${settings.hierarchy}|${settings.hiddenKinds.join(",")}`;
  const lastFitKey = useRef(fitKey);
  useEffect(() => {
    const refit = lastFitKey.current !== fitKey;
    lastFitKey.current = fitKey;
    rendererRef.current?.setData(data, refit);
  }, [data, fitKey]);

  // Keep the fitted graph clear of the floating panel on wide screens.
  const panelRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const r = rendererRef.current;
    if (!r) return;
    // The compact bar sits over the bottom edge.
    if (!panel) return r.setInset(compact ? { bottom: 36 } : {});
    // Wide screens: the panel floats at the right. Phones: it spans the top.
    const sync = () =>
      r.setInset(
        (rootRef.current?.clientWidth ?? 0) > 720 ? { right: panel.offsetWidth + 16 } : { top: panel.offsetTop + panel.offsetHeight },
      );
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(panel);
    if (rootRef.current) ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, [compact]);

  useEffect(() => {
    rendererRef.current?.setOptions({ labels: settings.labels || compact, search, focusId });
  }, [settings.labels, compact, search, focusId]);

  const matchCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? data.nodes.filter((n) => n.title.toLowerCase().includes(q)).length : 0;
  }, [search, data.nodes]);

  const hoverTitle = hoverId ? data.nodes.find((n) => n.id === hoverId) : undefined;
  const linkCount = data.edges.filter((e) => e.type === "link").length;
  const focusTitle = focusPageId ? (getPage(ws.doc, focusPageId)?.get("title") as string | undefined)?.trim() || "Untitled" : "";
  const kindsPresent = PAGE_KINDS.filter((k) => !k.legacy && (data.kindCounts.get(k.kind) ?? 0) > 0);

  const toggleKind = (kind: PageKind) =>
    update({ hiddenKinds: hiddenKinds.has(kind) ? settings.hiddenKinds.filter((k) => k !== kind) : [...settings.hiddenKinds, kind] });

  const empty = pages.length === 0 ? "No pages yet" : data.nodes.length === 0 ? "Nothing matches these filters" : null;
  const lonely = !!focusId && data.nodes.length === 1;

  return (
    <div ref={rootRef} className={`gv-root${compact ? " gv-compact" : ""}`}>
      <div className="gv-stage">
        <canvas
          ref={canvasRef}
          className="gv-canvas"
          tabIndex={0}
          role="img"
          aria-label={`Graph of ${data.nodes.length} pages and ${data.edges.length} connections. Use +, − and 0 to zoom, arrow keys to pan.`}
        />
      </div>

      {/* Screen-reader and keyboard access to what the canvas shows. */}
      <ul className="gv-sr-only" aria-label="Pages in graph">
        {data.nodes.slice(0, 300).map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => openPage(n.id)}>
              {n.title} ({n.degree} connection{n.degree === 1 ? "" : "s"})
            </button>
          </li>
        ))}
      </ul>

      {(empty || lonely) && (
        <div className="gv-empty">
          {empty ?? (
            <>
              No links yet.
              <br />
              <span className="faint">Add [[links]] to connect this page.</span>
            </>
          )}
        </div>
      )}

      {compact ? (
        <div className="gv-compact-bar">
          {focusId && <DepthControl depth={settings.depth} onChange={(depth) => update({ depth })} />}
          <span className="spacer" />
          <button type="button" className="gv-icon" onClick={() => rendererRef.current?.fit()} title="Fit to view" aria-label="Fit to view">
            <FitIcon />
          </button>
        </div>
      ) : (
        <>
          <div ref={panelRef} className={`gv-panel${settings.panelOpen ? " open" : ""}`}>
            <button
              type="button"
              className="gv-panel-head"
              onClick={() => update({ panelOpen: !settings.panelOpen })}
              aria-expanded={settings.panelOpen}
            >
              <SlidersIcon />
              <span className="grow">{focusId ? `Local graph · ${focusTitle}` : "Graph"}</span>
              <span className="gv-chevron" aria-hidden="true" />
            </button>
            {settings.panelOpen && (
              <div className="gv-panel-body">
                <div className="gv-search">
                  <SearchIcon />
                  <input
                    className="gv-search-input"
                    placeholder="Search pages…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const first = rendererRef.current?.matchIds[0];
                        if (first) rendererRef.current?.focusNode(first);
                      } else if (e.key === "Escape") setSearch("");
                    }}
                    aria-label="Search pages in graph"
                  />
                  {search && <span className="gv-match-count">{matchCount}</span>}
                </div>

                {focusExists && (
                  <Toggle label="Local graph" checked={localMode} onChange={setLocalMode} hint="Only pages near the current page" />
                )}
                {focusId && (
                  <div className="gv-row">
                    <span className="grow">Depth</span>
                    <DepthControl depth={settings.depth} onChange={(depth) => update({ depth })} />
                  </div>
                )}
                {!focusId && <Toggle label="Orphans" checked={settings.orphans} onChange={(orphans) => update({ orphans })} hint="Pages without links" />}
                <Toggle
                  label="Parent → child links"
                  checked={settings.hierarchy}
                  onChange={(hierarchy) => update({ hierarchy })}
                  hint="Connect sub-pages to their parent (dashed)"
                />
                <Toggle label="Labels" checked={settings.labels} onChange={(labels) => update({ labels })} hint="Show titles when zoomed in" />

                <div className="gv-legend" aria-label="Page kinds">
                  {kindsPresent.map((k) => {
                    const hidden = hiddenKinds.has(k.kind);
                    return (
                      <button
                        key={k.kind}
                        type="button"
                        className={`gv-legend-item${hidden ? " off" : ""}`}
                        onClick={() => toggleKind(k.kind)}
                        aria-pressed={!hidden}
                        title={hidden ? `Show ${k.label.toLowerCase()} pages` : `Hide ${k.label.toLowerCase()} pages`}
                      >
                        <span className="gv-swatch" style={{ background: kinds[k.kind] }} />
                        <span className="grow">{k.label}</span>
                        <span className="gv-count">{data.kindCounts.get(k.kind)}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="gv-stats">
                  {data.nodes.length} page{data.nodes.length === 1 ? "" : "s"} · {linkCount} link{linkCount === 1 ? "" : "s"}
                </div>
              </div>
            )}
          </div>

          <div className="gv-zoom">
            <button type="button" className="gv-icon" onClick={() => rendererRef.current?.zoomBy(1.3)} title="Zoom in" aria-label="Zoom in">
              <ZoomIn />
            </button>
            <button type="button" className="gv-icon" onClick={() => rendererRef.current?.zoomBy(1 / 1.3)} title="Zoom out" aria-label="Zoom out">
              <ZoomOut />
            </button>
            <button type="button" className="gv-icon" onClick={() => rendererRef.current?.fit()} title="Fit to view (0)" aria-label="Fit to view">
              <FitIcon />
            </button>
          </div>

          {hoverTitle && (
            <div className="gv-hover" aria-hidden="true">
              <span className="gv-swatch" style={{ background: kinds[hoverTitle.kind] }} />
              {hoverTitle.icon && <span>{hoverTitle.icon}</span>}
              <span className="ellipsis">{hoverTitle.title}</span>
              <span className="faint">
                {hoverTitle.degree} link{hoverTitle.degree === 1 ? "" : "s"} · click to open
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

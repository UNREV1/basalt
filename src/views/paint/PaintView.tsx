// Paint studio page view: a realtime-collaborative, pressure-sensitive SVG
// painting app with layers, Krita-style brushes, symmetry, selection
// transforms, eyedropper and export.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import * as Y from "yjs";
import { useApp, useMediaQuery } from "../../lib/hooks.ts";
import { useSettings } from "../../lib/settings.ts";
import type { PageViewProps } from "../types.ts";
import { BrushPreview, BrushSettingsEditor, PresetGrid } from "./BrushPanel.tsx";
import { ColorPanel } from "./ColorPanel.tsx";
import { PopupPalette } from "./PopupPalette.tsx";
import { LayersPanel, type LayerOps } from "./LayersPanel.tsx";
import { CanvasDialog, ShortcutsDialog } from "./dialogs.tsx";
import { loadBrushSettings, presetById, saveBrushSettings } from "./brushes.ts";
import { hexToHsva, hsvaToHex } from "./color.ts";
import {
  addLayer,
  clearLayer,
  deleteLayer,
  duplicateLayer,
  ensureCanvasPaint,
  ensureInitialized,
  hasPaint,
  hasPaper,
  layersOf,
  mergeDown,
  metaOf,
  moveLayer,
  nextLayerName,
  readLayers,
  readMeta,
  setMeta,
  strokesOf,
  updateLayer,
} from "./doc.ts";
import { PaintEngine, type EngineHost, type EngineState } from "./engine.ts";
import { copyPngToClipboard, downloadBlob, fileSafeName, renderPng, svgBlob } from "./exporter.ts";
import { Icon } from "./icons.tsx";
import {
  DEFAULT_META,
  type BrushSettings,
  type HSVA,
  type LayerData,
  type PaintMeta,
  type ShapeFill,
  type Stroke,
  type Symmetry,
  type SymmetryMode,
  type ToolId,
  type ViewState,
} from "./types.ts";
import { KSlider, PopButton, Segmented, Switch } from "./widgets.tsx";
import "./paint.css";

// ---- persisted per-device preferences ----------------------------------------------------

const UI_KEY = "basalt:paint:ui";
const COLOR_KEY = "basalt:paint:colors";

interface UiPrefs {
  tool: ToolId;
  brushId: string;
  eraserId: string;
  shapeFill: ShapeFill;
  shapeOutline: boolean;
  shapeKind: "line" | "rect" | "ellipse";
  symmetry: Symmetry;
  docker: boolean;
  sections: Record<string, boolean>;
}

const DEFAULT_PREFS: UiPrefs = {
  tool: "brush",
  brushId: "ink",
  eraserId: "eraser",
  shapeFill: "none",
  shapeOutline: true,
  shapeKind: "rect",
  symmetry: { mode: "none", count: 6 },
  docker: true,
  sections: { color: true, layers: true, brush: true, settings: false },
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-essential.
  }
}

interface ColorPrefs {
  fg: HSVA;
  bg: string;
  recent: string[];
}

const DEFAULT_COLORS: ColorPrefs = { fg: { h: 220, s: 0.72, v: 0.2, a: 1 }, bg: "#ffffff", recent: [] };

const TOOLS: { id: ToolId; icon: string; label: string; key: string }[] = [
  { id: "brush", icon: "brush", label: "Brush", key: "B" },
  { id: "eraser", icon: "eraser", label: "Eraser", key: "E" },
  { id: "line", icon: "line", label: "Line", key: "U" },
  { id: "rect", icon: "rect", label: "Rectangle", key: "U" },
  { id: "ellipse", icon: "ellipse", label: "Ellipse", key: "U" },
  { id: "lasso", icon: "lasso", label: "Lasso fill", key: "L" },
  { id: "eyedropper", icon: "eyedropper", label: "Eyedropper", key: "I" },
  { id: "move", icon: "move", label: "Select & transform", key: "V" },
  { id: "pan", icon: "hand", label: "Pan", key: "H" },
];

const SYMMETRY_OPTIONS: { mode: SymmetryMode; label: string; icon: string }[] = [
  { mode: "none", label: "Off", icon: "symmetry" },
  { mode: "x", label: "Mirror horizontally", icon: "flipH" },
  { mode: "y", label: "Mirror vertically", icon: "flipV" },
  { mode: "xy", label: "Mirror both ways", icon: "symmetry" },
  { mode: "radial", label: "Radial", icon: "radial" },
  { mode: "snowflake", label: "Snowflake (radial + mirror)", icon: "radial" },
];

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function Section({
  id,
  title,
  open,
  onToggle,
  children,
  extra,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className={`pv-section ${open ? "open" : ""}`}>
      <header className="pv-section-head">
        <button type="button" className="pv-section-toggle" aria-expanded={open} onClick={() => onToggle(id)}>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
          {title}
        </button>
        {extra}
      </header>
      {open && <div className="pv-section-body">{children}</div>}
    </section>
  );
}

function VSlider({
  value,
  min,
  max,
  exp,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  exp?: boolean;
  label: string;
  onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const toT = (v: number) => (exp ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min));
  const fromT = (t: number) => (exp ? min * Math.pow(max / min, t) : min + t * (max - min));
  const t = Math.min(1, Math.max(0, toT(value)));
  const set = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const tt = Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height));
    onChange(Math.round(fromT(tt) * 100) / 100);
  };
  return (
    <div
      ref={ref}
      className="pv-vslider"
      role="slider"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        active.current = true;
        set(e.clientY);
      }}
      onPointerMove={(e) => active.current && set(e.clientY)}
      onPointerUp={() => (active.current = false)}
    >
      <div className="pv-vslider-fill" style={{ height: `${t * 100}%` }} />
      <div className="pv-vslider-thumb" style={{ bottom: `calc(${t * 100}% - 7px)` }} />
    </div>
  );
}

/**
 * Canvas mode: the painting lives inside the whiteboard (see BoardView). Layers
 * render under or over the whiteboard's shapes, the whiteboard owns the camera,
 * and the paint tools only take the pointer while paint mode is on.
 */
export interface PaintEmbed {
  /** Host under the whiteboard's shapes. */
  under: HTMLElement;
  /** Host over them: pointer input, overlay and "over" layers. */
  over: HTMLElement;
  /** Host for the floating paint panels. */
  ui: HTMLElement;
  /** Paint mode: paint tools take the pointer; otherwise it goes to the whiteboard. */
  active: boolean;
  onExit(): void;
  camera: {
    view(): ViewState;
    request(v: ViewState): void;
    subscribe(cb: (v: ViewState) => void): () => void;
  };
}

const boxString = (b: { x0: number; y0: number; x1: number; y1: number }) => `${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}`;

export default function PaintView({ ws, pageId, page, locked = false, embed }: PageViewProps & { embed?: PaintEmbed }) {
  const { toast } = useApp();
  const identity = useSettings().identity;
  const phone = useMediaQuery("(max-width: 720px)");
  const narrow = useMediaQuery("(max-width: 1180px)");
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const underRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef(embed);
  embedRef.current = embed;
  const isEmbed = !!embed;
  const painting = !!embed?.active && !locked;
  const fileRef = useRef<HTMLInputElement>(null);
  const origin = useMemo(() => ({ paint: pageId }), [pageId]);
  const prefs0 = useMemo(() => loadJson(UI_KEY, DEFAULT_PREFS), []);
  const colors0 = useMemo(() => loadJson(COLOR_KEY, DEFAULT_COLORS), []);

  // The page whose containers are initialized; a different page means "not ready yet".
  const [readyPage, setReadyPage] = useState<Y.Map<any> | null>(null);
  const ready = readyPage === page;
  const [engine, setEngine] = useState<PaintEngine | null>(null);
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [meta, setMetaState] = useState<PaintMeta>(DEFAULT_META);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [tool, setToolState] = useState<ToolId>(prefs0.tool);
  const [tempTool, setTempTool] = useState<ToolId | null>(null);
  const [brushId, setBrushId] = useState(presetById(prefs0.brushId).kind === "brush" ? prefs0.brushId : "ink");
  const [eraserId, setEraserId] = useState(presetById(prefs0.eraserId).kind === "erase" ? prefs0.eraserId : "eraser");
  const [brushSettings, setBrushSettings] = useState<Record<string, BrushSettings>>(loadBrushSettings);
  const [fg, setFg] = useState<HSVA>(colors0.fg);
  const [bg, setBg] = useState(colors0.bg);
  const [recent, setRecent] = useState<string[]>(colors0.recent);
  const [symmetry, setSymmetry] = useState<Symmetry>(prefs0.symmetry);
  const [shapeFill, setShapeFill] = useState<ShapeFill>(prefs0.shapeFill);
  const [shapeOutline, setShapeOutline] = useState(prefs0.shapeOutline);
  const [shapeKind, setShapeKind] = useState(prefs0.shapeKind);
  const [view, setView] = useState<ViewState>({ tx: 0, ty: 0, scale: 1, rotation: 0, mirror: false });
  const [selCount, setSelCount] = useState(0);
  const [undoState, setUndoState] = useState({ undo: false, redo: false });
  const [docker, setDocker] = useState(prefs0.docker);
  const [sections, setSections] = useState<Record<string, boolean>>(prefs0.sections);
  const [sheet, setSheet] = useState<"color" | "layers" | "brush" | null>(null);
  const [hideUI, setHideUI] = useState(false);
  const [dialog, setDialog] = useState<"canvas" | "shortcuts" | null>(null);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [penSeen, setPenSeen] = useState(false);
  const [palette, setPalette] = useState<{ x: number; y: number } | null>(null);
  const undoRef = useRef<Y.UndoManager | null>(null);

  const effectiveTool = tempTool ?? tool;
  const fgHex = hsvaToHex(fg);
  const brush = presetById(brushId);
  const eraser = presetById(eraserId);
  const activePresetId = effectiveTool === "eraser" ? eraserId : brushId;
  const activeSettings = brushSettings[activePresetId];
  const activeLayer = layers.find((l) => l.id === activeLayerId) ?? null;

  const stateRef = useRef<EngineState>(null!);
  stateRef.current = {
    tool: effectiveTool,
    brush,
    brushSettings: brushSettings[brushId],
    eraser,
    eraserSettings: brushSettings[eraserId],
    fg: fgHex,
    fgAlpha: fg.a,
    bg,
    symmetry,
    activeLayerId,
    shapeFill,
    shapeOutline,
    userName: identity.name,
  };

  // ---- persistence ----
  useEffect(() => {
    saveJson(UI_KEY, { tool, brushId, eraserId, shapeFill, shapeOutline, shapeKind, symmetry, docker, sections });
  }, [tool, brushId, eraserId, shapeFill, shapeOutline, shapeKind, symmetry, docker, sections]);
  useEffect(() => {
    const t = setTimeout(() => saveJson(COLOR_KEY, { fg, bg, recent }), 300);
    return () => clearTimeout(t);
  }, [fg, bg, recent]);
  useEffect(() => {
    const t = setTimeout(() => saveBrushSettings(brushSettings), 300);
    return () => clearTimeout(t);
  }, [brushSettings]);

  const showNotice = useCallback((text: string) => setNotice({ text, id: Date.now() }), []);
  const closePalette = useCallback(() => setPalette(null), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2400);
    return () => clearTimeout(t);
  }, [notice]);

  const addRecent = useCallback((hex: string) => {
    setRecent((r) => [hex, ...r.filter((c) => c !== hex)].slice(0, 16));
  }, []);

  // ---- initialize the page containers once local (and, if connecting, remote) data is in ----
  useEffect(() => {
    if (isEmbed) return;
    let cancelled = false;
    (async () => {
      await ws.ready;
      const prov = ws.provider;
      if (prov && (prov.status === "connecting" || prov.status === "syncing")) {
        await Promise.race([prov.whenSynced(3000).catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
      }
      if (cancelled) return;
      ensureInitialized(ws.doc, page);
      setReadyPage(page);
    })();
    return () => {
      cancelled = true;
    };
  }, [ws, page, isEmbed]);

  // Canvas mode: paint containers appear the first time someone paints (here or on another device).
  useEffect(() => {
    if (!isEmbed) return;
    let cancelled = false;
    const check = () => {
      if (!cancelled && hasPaint(page)) setReadyPage(page);
    };
    const onKeys = (ev: Y.YMapEvent<unknown>) => {
      if (ev.keysChanged.has("layers") || ev.keysChanged.has("strokes")) check();
    };
    page.observe(onKeys);
    (async () => {
      await ws.ready;
      const prov = ws.provider;
      if (painting && !hasPaint(page) && prov && (prov.status === "connecting" || prov.status === "syncing")) {
        await Promise.race([prov.whenSynced(3000).catch(() => {}), new Promise((r) => setTimeout(r, 3000))]);
      }
      if (cancelled) return;
      if (painting) ensureCanvasPaint(ws.doc, page);
      check();
    })();
    return () => {
      cancelled = true;
      page.unobserve(onKeys);
    };
  }, [ws, page, isEmbed, painting]);

  // ---- engine + Y wiring ----
  useEffect(() => {
    if (!ready || !stageRef.current || !canvasRef.current) return;
    const layersY = layersOf(page);
    const strokesY = strokesOf(page);
    const metaY = metaOf(page);
    const um = new Y.UndoManager(metaY ? [strokesY, layersY, metaY] : [strokesY, layersY], {
      trackedOrigins: new Set([origin]),
      captureTimeout: 400,
    });
    undoRef.current = um;
    const syncUndo = () => setUndoState({ undo: um.undoStack.length > 0, redo: um.redoStack.length > 0 });
    um.on("stack-item-added", syncUndo);
    um.on("stack-item-popped", syncUndo);
    um.on("stack-cleared", syncUndo);

    let viewRaf = 0;
    let latestView: ViewState | null = null;
    let countTimer: ReturnType<typeof setTimeout> | null = null;
    const host: EngineHost = {
      ws,
      pageId,
      page,
      origin,
      getState: () => stateRef.current,
      undoStop: () => um.stopCapturing(),
      undo: () => um.undo(),
      redo: () => um.redo(),
      onView: (v) => {
        // The UI only shows zoom, rotation and mirroring; plain panning skips React.
        const shown = latestView;
        latestView = v;
        if (shown && shown.scale === v.scale && shown.rotation === v.rotation && shown.mirror === v.mirror) return;
        if (!viewRaf)
          viewRaf = requestAnimationFrame(() => {
            viewRaf = 0;
            if (latestView) setView(latestView);
          });
      },
      onSelection: setSelCount,
      onPick: (hex, _alpha, target, final) => {
        if (target === "fg") setFg((prev) => ({ ...(hexToHsva(hex, prev.h) ?? prev), a: prev.a }));
        else setBg(hex);
        if (final) addRecent(hex);
      },
      onNotice: showNotice,
      onPen: () => setPenSeen(true),
      onColorUsed: addRecent,
      onActiveLayer: setActiveLayerId,
      onTool: (t) => setToolState(t),
      onPalette: (x, y) => {
        const el = stageRef.current;
        const w = el?.clientWidth ?? 0;
        const h = el?.clientHeight ?? 0;
        // Keep the whole ring on screen.
        setPalette({ x: Math.max(142, Math.min(w - 142, x)), y: Math.max(142, Math.min(h - 142, y)) });
      },
      camera: isEmbed ? { request: (v) => embedRef.current?.camera.request(v) } : undefined,
    };
    const eng = new PaintEngine(stageRef.current, canvasRef.current, host, { under: underRef.current ?? undefined });
    const r = eng.renderer;
    const refreshCounts = () => {
      if (countTimer) return;
      countTimer = setTimeout(() => {
        countTimer = null;
        const c: Record<string, number> = {};
        for (const l of readLayers(layersY)) c[l.id] = r.layerStrokes(l.id).length;
        setCounts(c);
      }, 250);
    };
    const prevOnChange = r.onChange;
    r.onChange = () => {
      prevOnChange?.();
      refreshCounts();
    };

    const m = readMeta(metaY);
    r.setMeta(m);
    setMetaState(m);
    if (isEmbed) {
      r.setPaper(hasPaper(page));
      eng.applyExternalView(embedRef.current!.camera.view());
    }
    const unfollow = isEmbed ? embedRef.current!.camera.subscribe((v) => eng.applyExternalView(v)) : null;
    const ls = readLayers(layersY);
    r.setLayers(ls);
    setLayers(ls);
    const initial: [string, Stroke][] = [];
    strokesY.forEach((s, id) => initial.push([id, s]));
    r.applyStrokes(initial);
    eng.fit();

    const onStrokes = (ev: Y.YMapEvent<Stroke>) => {
      r.applyStrokes([...ev.keysChanged].map((k) => [k, strokesY.get(k)] as [string, Stroke | undefined]));
    };
    const onLayers = () => {
      const next = readLayers(layersY);
      r.setLayers(next);
      setLayers(next);
    };
    const onMeta = () => {
      const next = readMeta(metaY);
      r.setMeta(next);
      setMetaState(next);
    };
    strokesY.observe(onStrokes);
    layersY.observeDeep(onLayers);
    metaY?.observe(onMeta);
    setEngine(eng);
    return () => {
      unfollow?.();
      strokesY.unobserve(onStrokes);
      layersY.unobserveDeep(onLayers);
      metaY?.unobserve(onMeta);
      cancelAnimationFrame(viewRaf);
      if (countTimer) clearTimeout(countTimer);
      eng.destroy();
      um.destroy();
      undoRef.current = null;
      setEngine(null);
    };
  }, [ready, ws, page, pageId, origin, addRecent, showNotice, isEmbed]);

  // Keep a valid active layer (layers can be removed by undo or by peers).
  useEffect(() => {
    if (!layers.length) return;
    if (!activeLayerId || !layers.some((l) => l.id === activeLayerId)) setActiveLayerId(layers[layers.length - 1].id);
  }, [layers, activeLayerId]);

  useEffect(() => {
    engine?.onLayerChanged();
  }, [engine, activeLayerId]);

  useEffect(() => {
    engine?.refresh();
  }, [engine, effectiveTool, brushId, eraserId, brushSettings, fgHex, symmetry, activeLayerId, shapeFill]);

  // ---- actions ----
  const setTool = useCallback((t: ToolId) => {
    setToolState(t);
    setTempTool(null);
    if (t === "line" || t === "rect" || t === "ellipse") setShapeKind(t);
  }, []);

  const pickPreset = (id: string) => {
    const p = presetById(id);
    if (p.kind === "erase") {
      setEraserId(id);
      setTool("eraser");
    } else {
      setBrushId(id);
      if (!["brush", "line", "rect", "ellipse", "lasso"].includes(tool)) setTool("brush");
    }
  };

  const updatePreset = (id: string, patch: Partial<BrushSettings>) => {
    setBrushSettings((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const undo = () => undoRef.current?.undo();
  const redo = () => undoRef.current?.redo();
  const stop = () => undoRef.current?.stopCapturing();

  const layerOps: LayerOps = {
    select: setActiveLayerId,
    add: () => {
      stop();
      const idx = activeLayer ? layers.indexOf(activeLayer) + 1 : layers.length;
      const id = addLayer(ws.doc, page, origin, idx, nextLayerName(layers));
      setActiveLayerId(id);
      stop();
    },
    remove: (id) => {
      stop();
      if (!deleteLayer(ws.doc, page, origin, id)) showNotice("A painting needs at least one layer");
      stop();
    },
    duplicate: (id) => {
      stop();
      const nid = duplicateLayer(ws.doc, page, origin, id);
      if (nid) setActiveLayerId(nid);
      stop();
    },
    mergeDown: (id) => {
      const idx = layers.findIndex((l) => l.id === id);
      if (idx <= 0) return;
      if (!layers[idx].visible || !layers[idx - 1].visible) {
        showNotice("Show both layers to merge them");
        return;
      }
      if (layers[idx - 1].locked) {
        showNotice(`“${layers[idx - 1].name}” is locked`);
        return;
      }
      stop();
      const lower = mergeDown(ws.doc, page, origin, id);
      if (lower) setActiveLayerId(lower);
      stop();
    },
    clear: (id) => {
      const l = layers.find((x) => x.id === id);
      if (l?.locked) {
        showNotice(`“${l.name}” is locked`);
        return;
      }
      stop();
      clearLayer(ws.doc, page, origin, id);
      stop();
    },
    move: (id, to) => {
      stop();
      moveLayer(ws.doc, page, origin, id, to);
      stop();
    },
    update: (id, patch) => {
      // Opacity drags merge into one undo step; other changes are their own.
      if (!("opacity" in patch)) stop();
      updateLayer(ws.doc, page, origin, id, patch);
      if (!("opacity" in patch)) stop();
    },
  };

  const title = String(page.get("title") ?? "") || "Painting";
  const exportSvg = () => {
    if (!engine) return;
    downloadBlob(svgBlob(engine.renderer), `${fileSafeName(title)}.svg`);
  };
  const exportPng = async (scale: number) => {
    if (!engine) return;
    try {
      const blob = await renderPng(engine.renderer, scale);
      downloadBlob(blob, `${fileSafeName(title)}${scale > 1 ? `@${scale}x` : ""}.png`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed");
    }
  };
  const copyPng = async () => {
    if (!engine) return;
    try {
      await copyPngToClipboard(engine.renderer);
      toast("Copied PNG to clipboard");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't copy the image");
    }
  };

  const applyCanvas = (m: PaintMeta) => {
    stop();
    setMeta(ws.doc, page, origin, m);
    stop();
    setDialog(null);
    requestAnimationFrame(() => engine?.fit());
  };

  const swapColors = () => {
    const oldFg = fgHex;
    const nextFg = hexToHsva(bg, fg.h);
    if (nextFg) setFg({ ...nextFg, a: fg.a });
    setBg(oldFg);
  };
  const resetColors = () => {
    setFg({ h: fg.h, s: 0, v: 0, a: 1 });
    setBg("#ffffff");
  };

  const adjustSize = (dir: 1 | -1) => {
    const cur = brushSettings[activePresetId].size;
    const next = Math.min(500, Math.max(0.5, Math.round(cur * (dir > 0 ? 1.18 : 1 / 1.18) * 10) / 10));
    updatePreset(activePresetId, { size: next === cur ? cur + dir * 0.5 : next });
  };
  const adjustOpacity = (dir: 1 | -1) => {
    const cur = brushSettings[activePresetId].opacity;
    updatePreset(activePresetId, { opacity: Math.min(1, Math.max(0.01, Math.round((cur + dir * 0.1) * 100) / 100)) });
  };

  const importFiles = (files: FileList | null) => {
    const f = files && [...files].find((x) => x.type.startsWith("image/"));
    if (f && engine) void engine.importImage(f, f.name.replace(/\.[^.]+$/, ""));
  };

  // ---- keyboard ----
  const paintingRef = useRef(painting);
  paintingRef.current = painting;
  const keyRef = useRef<(e: KeyboardEvent, down: boolean) => void>(() => {});
  keyRef.current = (e, down) => {
    const eng = engine;
    if (!eng) return;
    if (!down) {
      if (e.key === " ") {
        eng.keys.space = false;
        eng.updateCursor();
      }
      if (e.key === "Alt") setTempTool(null);
      eng.keys.shift = e.shiftKey;
      return;
    }
    if (isTyping(e.target) || dialog) return;
    // Another app-level dialog (search, settings…) is open.
    if (document.querySelector(".modal-backdrop")) return;
    // Canvas mode: shortcuts belong to the whiteboard unless paint mode is on.
    if (isEmbed && !painting) return;
    // Shortcuts apply when nothing else in the app has focus, or focus is inside the studio.
    const target = e.target as Node | null;
    const inside = (n: Node) =>
      !!rootRef.current?.contains(n) || !!(embed && (embed.over.contains(n) || embed.ui.contains(n)));
    if (target && target !== document.body && target !== document.documentElement && !inside(target)) return;
    if (isEmbed) {
      if (e.key === "Escape" && !eng.busy && !eng.selection.size) {
        e.preventDefault();
        embed?.onExit();
        return;
      }
      // No paper to fit, rotate or mirror on an infinite canvas; Tab stays for focus.
      if (!e.ctrlKey && !e.metaKey && ["m", "M", "r", "R", "4", "5", "6", "0", "Tab"].includes(e.key)) return;
    }
    eng.keys.shift = e.shiftKey;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const mod = e.ctrlKey || e.metaKey;
    // Keys that operate a focused control (button, slider, list) stay with it.
    const focused = document.activeElement;
    const onControl = focused instanceof HTMLElement && focused !== document.body && !!focused.closest("button, a, [role], [tabindex]");
    if (onControl && [" ", "Enter", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(k)) return;
    if (k === " ") {
      e.preventDefault();
      if (!e.repeat) {
        eng.keys.space = true;
        eng.updateCursor();
      }
      return;
    }
    if (k === "Alt") {
      e.preventDefault();
      if (!eng.busy && ["brush", "eraser", "line", "rect", "ellipse", "lasso"].includes(tool)) setTempTool("eyedropper");
      return;
    }
    if (mod) {
      let handled = true;
      if (lower === "z") (e.shiftKey ? redo : undo)();
      else if (lower === "y") redo();
      else if (lower === "d") eng.duplicateSelection();
      else if (lower === "a") {
        if (e.shiftKey) eng.setSelection([]);
        else {
          setTool("move");
          eng.selectAll();
        }
      } else if (lower === "c") handled = eng.copySelection();
      else if (lower === "x") handled = eng.copySelection(true);
      else if (lower === "0") eng.fit();
      else if (k === "=" || k === "+") eng.zoomBy(1.25);
      else if (k === "-") eng.zoomBy(0.8);
      else if (lower === "e" && activeLayerId) layerOps.mergeDown(activeLayerId);
      else if (lower === "j" && activeLayerId) layerOps.duplicate(activeLayerId);
      else if (lower === "n" && e.shiftKey) layerOps.add();
      else handled = false;
      if (handled) e.preventDefault();
      return;
    }
    if (e.altKey) return;
    let handled = true;
    switch (k === "{" ? "[" : k === "}" ? "]" : lower) {
      case "b":
        setTool("brush");
        break;
      case "e":
        setTool(tool === "eraser" ? "brush" : "eraser");
        break;
      case "u": {
        const order: ("line" | "rect" | "ellipse")[] = ["line", "rect", "ellipse"];
        const cur = tool === "line" || tool === "rect" || tool === "ellipse" ? tool : null;
        setTool(cur ? order[(order.indexOf(cur) + 1) % 3] : shapeKind);
        break;
      }
      case "l":
        setTool("lasso");
        break;
      case "i":
        setTool("eyedropper");
        break;
      case "v":
        setTool("move");
        break;
      case "h":
        setTool("pan");
        break;
      case "[":
        if (e.shiftKey) adjustOpacity(-1);
        else adjustSize(-1);
        break;
      case "]":
        if (e.shiftKey) adjustOpacity(1);
        else adjustSize(1);
        break;
      case "x":
        swapColors();
        break;
      case "d":
        resetColors();
        break;
      case "m":
        eng.toggleMirror();
        break;
      case "r":
      case "5":
        eng.setRotation(0);
        break;
      case "4":
        eng.setRotation(eng.view.rotation - 15);
        break;
      case "6":
        eng.setRotation(eng.view.rotation + 15);
        break;
      case "0":
        eng.fit();
        break;
      case "1":
        eng.zoomTo(1);
        break;
      case "=":
      case "+":
        eng.zoomBy(1.25);
        break;
      case "-":
        eng.zoomBy(0.8);
        break;
      case "Tab":
        setHideUI((h) => !h);
        break;
      case "Insert":
        layerOps.add();
        break;
      case "Delete":
      case "Backspace":
        if (eng.selection.size) eng.deleteSelection();
        else handled = false;
        break;
      case "Escape":
        if (!eng.cancelAction()) eng.setSelection([]);
        break;
      case "?":
        setDialog("shortcuts");
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        if (!eng.selection.size) {
          handled = false;
          break;
        }
        const d = e.shiftKey ? 10 : 1;
        eng.nudgeSelection(k === "ArrowLeft" ? -d : k === "ArrowRight" ? d : 0, k === "ArrowUp" ? -d : k === "ArrowDown" ? d : 0);
        break;
      }
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => keyRef.current(e, true);
    const up = (e: KeyboardEvent) => keyRef.current(e, false);
    const blur = () => {
      setTempTool(null);
      if (engine) {
        engine.keys.space = false;
        engine.keys.shift = false;
        engine.updateCursor();
      }
    };
    const paste = (e: ClipboardEvent) => {
      if (!engine || isTyping(e.target) || document.querySelector(".modal-backdrop")) return;
      // Canvas mode: pastes go to the whiteboard unless paint mode is on.
      if (isEmbed && !paintingRef.current) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      let handled = false;
      if (file) {
        e.preventDefault();
        void engine.importImage(file, "Pasted image");
        handled = true;
      } else if (engine.pasteClipboard()) {
        e.preventDefault();
        handled = true;
      }
      // Don't let the whiteboard paste it too.
      if (handled && isEmbed) e.stopImmediatePropagation();
    };
    // Canvas mode listens in the capture phase so it runs before the whiteboard's own paste.
    const capture = isEmbed;
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    window.addEventListener("paste", paste, capture);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      window.removeEventListener("paste", paste, capture);
    };
  }, [engine, isEmbed]);

  const toggleSection = (id: string) => setSections((s) => ({ ...s, [id]: !s[id] }));

  // ---- pieces ----
  const presetButtonFace = (
    <>
      <span className="pv-preset-btn-preview">
        <BrushPreview
          preset={effectiveTool === "eraser" ? eraser : brush}
          settings={activeSettings}
          color={fgHex}
          width={56}
          height={24}
          maxSize={9}
        />
      </span>
      <span className="pv-preset-btn-name">{(effectiveTool === "eraser" ? eraser : brush).name}</span>
      <Icon name="chevronDown" size={14} />
    </>
  );
  // On phones the preset button opens the Brush sheet (presets + settings).
  const presetButton = phone ? (
    <button
      type="button"
      className={`pv-preset-btn ${sheet === "brush" ? "active" : ""}`}
      title="Brushes"
      aria-label="Brushes"
      aria-expanded={sheet === "brush"}
      onClick={() => setSheet(sheet === "brush" ? null : "brush")}
    >
      {presetButtonFace}
    </button>
  ) : (
    <PopButton className="pv-preset-btn" title="Brush presets" popClassName="pv-pop-presets" button={presetButtonFace}>
      {(close) => (
        <PresetGrid
          brushId={brushId}
          eraserId={eraserId}
          tool={effectiveTool}
          settings={brushSettings}
          color={fgHex}
          onPick={(id) => {
            pickPreset(id);
            close();
          }}
        />
      )}
    </PopButton>
  );

  const symmetryButton = (
    <PopButton
      className="pv-btn pv-btn-label"
      title="Symmetry / multibrush"
      active={symmetry.mode !== "none"}
      align="center"
      button={
        <>
          <Icon name={SYMMETRY_OPTIONS.find((o) => o.mode === symmetry.mode)?.icon ?? "symmetry"} />
          {!phone && (
            <span>
              {symmetry.mode === "none"
                ? "Symmetry"
                : symmetry.mode === "radial" || symmetry.mode === "snowflake"
                  ? `${symmetry.count}×`
                  : symmetry.mode.toUpperCase()}
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <div className="pv-menu">
          <div className="menu-label">Symmetry</div>
          {SYMMETRY_OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              className={`menu-item ${symmetry.mode === o.mode ? "selected" : ""}`}
              onClick={() => {
                setSymmetry({ ...symmetry, mode: o.mode });
                if (o.mode !== "radial" && o.mode !== "snowflake") close();
              }}
            >
              <Icon name={o.icon} size={16} />
              {o.label}
              {symmetry.mode === o.mode && <Icon name="check" size={14} className="pv-menu-check" />}
            </button>
          ))}
          <div className="pv-menu-pad">
            <KSlider
              label="Copies"
              value={symmetry.count}
              min={2}
              max={24}
              step={1}
              disabled={symmetry.mode !== "radial" && symmetry.mode !== "snowflake"}
              onChange={(v) => setSymmetry({ ...symmetry, count: v })}
            />
          </div>
        </div>
      )}
    </PopButton>
  );

  const viewButton = (
    <PopButton
      className="pv-btn pv-btn-label pv-zoom-btn"
      title="View: zoom, rotation, mirror"
      align="end"
      button={<span>{Math.round(view.scale * 100)}%</span>}
    >
      {() => (
        <div className="pv-menu pv-view-menu">
          <div className="menu-label">View</div>
          <div className="pv-menu-pad col">
            <KSlider
              label="Zoom"
              value={Math.round(view.scale * 100)}
              min={3}
              max={3200}
              exp
              format={(v) => `${Math.round(v)}%`}
              onChange={(v) => engine?.zoomTo(v / 100, undefined, true)}
            />
            <KSlider
              label="Rotation"
              value={Math.round(view.rotation)}
              min={-180}
              max={180}
              step={1}
              format={(v) => `${v}°`}
              onChange={(v) => engine?.setRotation(v)}
            />
          </div>
          <button type="button" className="menu-item" onClick={() => engine?.fit()}>
            <Icon name="fit" size={16} /> Fit to screen <span className="spacer" /> <kbd className="kbd">0</kbd>
          </button>
          <button type="button" className="menu-item" onClick={() => engine?.zoomTo(1)}>
            <Icon name="zoomIn" size={16} /> Actual pixels <span className="spacer" /> <kbd className="kbd">1</kbd>
          </button>
          <button type="button" className="menu-item" onClick={() => engine?.setRotation(0)}>
            <Icon name="rotate" size={16} /> Reset rotation <span className="spacer" /> <kbd className="kbd">R</kbd>
          </button>
          <button type="button" className={`menu-item ${view.mirror ? "selected" : ""}`} onClick={() => engine?.toggleMirror()}>
            <Icon name="mirror" size={16} /> Mirror view <span className="spacer" /> <kbd className="kbd">M</kbd>
          </button>
        </div>
      )}
    </PopButton>
  );

  const exportButton = (
    <PopButton className="pv-btn" title="Export" align="end" button={<Icon name="download" />}>
      {(close) => (
        <div className="pv-menu">
          <div className="menu-label">Export</div>
          <button type="button" className="menu-item" onClick={() => (exportPng(1), close())}>
            PNG <span className="spacer" /> <span className="muted small">{meta.width}×{meta.height}</span>
          </button>
          <button type="button" className="menu-item" onClick={() => (exportPng(2), close())}>
            PNG @2× <span className="spacer" /> <span className="muted small">{meta.width * 2}×{meta.height * 2}</span>
          </button>
          <button type="button" className="menu-item" onClick={() => (exportSvg(), close())}>
            SVG <span className="spacer" /> <span className="muted small">vector</span>
          </button>
          <div className="menu-sep" />
          <button type="button" className="menu-item" onClick={() => (copyPng(), close())}>
            <Icon name="copy" size={16} /> Copy PNG to clipboard
          </button>
        </div>
      )}
    </PopButton>
  );

  const toolOptions = (() => {
    if (effectiveTool === "line" || effectiveTool === "rect" || effectiveTool === "ellipse") {
      return (
        <div className="pv-tool-opts">
          {effectiveTool !== "line" && (
            <>
              <span className="pv-opt-label">Fill</span>
              <Segmented
                label="Shape fill"
                value={shapeFill}
                onChange={setShapeFill}
                options={[
                  { value: "none", label: "None" },
                  { value: "fg", label: <span className="pv-dot" style={{ background: fgHex }} />, title: "Foreground color" },
                  { value: "bg", label: <span className="pv-dot" style={{ background: bg }} />, title: "Background color" },
                ]}
              />
              <Switch checked={shapeOutline} onChange={setShapeOutline} label="Outline" />
            </>
          )}
          {!phone && <span className="pv-hint">Shift constrains · Alt from center</span>}
        </div>
      );
    }
    if (phone) return null;
    const hints: Partial<Record<ToolId, string>> = {
      lasso: "Draw a shape to fill it with the foreground color",
      eyedropper: "Click to pick · Shift+click picks the background color",
      move: selCount ? `${selCount} selected · drag handles to scale, knob to rotate` : "Click or lasso strokes on the active layer · Shift adds",
      pan: "Drag to pan · Ctrl+wheel to zoom",
    };
    const h = hints[effectiveTool];
    return h ? <div className="pv-tool-opts"><span className="pv-hint">{h}</span></div> : null;
  })();

  const brushSliders = (
    <>
      <KSlider
        className="pv-top-slider"
        label="Size"
        value={activeSettings.size}
        min={0.5}
        max={500}
        exp
        format={(v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}`}
        onChange={(v) => updatePreset(activePresetId, { size: v })}
      />
      <KSlider
        className="pv-top-slider"
        label="Opacity"
        value={Math.round(activeSettings.opacity * 100)}
        min={1}
        max={100}
        step={1}
        format={(v) => `${v}%`}
        onChange={(v) => updatePreset(activePresetId, { opacity: v / 100 })}
      />
      {!narrow && (
        <KSlider
          className="pv-top-slider"
          label="Stabilizer"
          value={activeSettings.stabilizer}
          min={0}
          max={200}
          step={1}
          format={(v) => (v ? `${v}` : "Off")}
          onChange={(v) => updatePreset(activePresetId, { stabilizer: v })}
        />
      )}
    </>
  );

  const colorPanel = (
    <ColorPanel
      fg={fg}
      bg={bg}
      recent={recent}
      onFg={setFg}
      onBg={setBg}
      onSwap={swapColors}
      onReset={resetColors}
      onCommit={addRecent}
      compact={phone}
    />
  );

  const layersPanel = engine ? (
    <LayersPanel
      layers={layers}
      activeId={activeLayerId}
      ops={layerOps}
      meta={meta}
      contentId={(id) => engine.renderer.contentId(id)}
      counts={counts}
      canvas={isEmbed}
      thumbBox={isEmbed ? boxString(engine.renderer.contentBox()) : undefined}
    />
  ) : null;

  const brushPanel = (
    <>
      <PresetGrid brushId={brushId} eraserId={eraserId} tool={effectiveTool} settings={brushSettings} color={fgHex} onPick={pickPreset} />
    </>
  );

  const settingsPanel = (
    <BrushSettingsEditor
      presetId={activePresetId}
      settings={activeSettings}
      onChange={(patch) => updatePreset(activePresetId, patch)}
      onReset={() => updatePreset(activePresetId, presetById(activePresetId).defaults)}
    />
  );

  const shapeTool = effectiveTool === "line" || effectiveTool === "rect" || effectiveTool === "ellipse" ? effectiveTool : shapeKind;
  const bottomTools: ToolId[] = ["brush", "eraser", shapeTool, "lasso", "eyedropper", "move"];

  const selBar =
    effectiveTool === "move" && selCount > 0 && !hideUI ? (
      <div className="pv-selbar" onPointerDown={(e) => e.stopPropagation()}>
        <span className="pv-selbar-count">{selCount} selected</span>
        <button type="button" className="pv-btn" title="Duplicate (Ctrl+D)" onClick={() => engine?.duplicateSelection()}>
          <Icon name="copy" />
        </button>
        <button type="button" className="pv-btn" title="Flip horizontally" onClick={() => engine?.flipSelection("x")}>
          <Icon name="flipH" />
        </button>
        <button type="button" className="pv-btn" title="Flip vertically" onClick={() => engine?.flipSelection("y")}>
          <Icon name="flipV" />
        </button>
        <button type="button" className="pv-btn" title="Rotate 90°" onClick={() => engine?.rotateSelection(90)}>
          <Icon name="rotate" />
        </button>
        <button type="button" className="pv-btn pv-danger" title="Delete (Del)" onClick={() => engine?.deleteSelection()}>
          <Icon name="trash" />
        </button>
        <button type="button" className="pv-btn" title="Deselect (Esc)" onClick={() => engine?.setSelection([])}>
          <Icon name="deselect" />
        </button>
      </div>
    ) : null;

  const paletteEl = palette ? (
    <PopupPalette
      x={palette.x}
      y={palette.y}
      activeId={activePresetId}
      settings={brushSettings}
      fg={fgHex}
      recent={recent}
      onPreset={pickPreset}
      onColor={(hex) => {
        const c = hexToHsva(hex, fg.h);
        if (c) setFg({ ...c, a: fg.a });
      }}
      onUndo={undo}
      onRedo={redo}
      onClose={closePalette}
    />
  ) : null;

  const dockerSections = (
    <>
      <Section id="color" title="Color" open={!!sections.color} onToggle={toggleSection}>
        {colorPanel}
      </Section>
      <Section
        id="layers"
        title="Layers"
        open={!!sections.layers}
        onToggle={toggleSection}
        extra={
          <button type="button" className="icon-btn pv-section-action" title="New layer" aria-label="New layer" onClick={layerOps.add}>
            <Icon name="plus" size={15} />
          </button>
        }
      >
        {layersPanel}
      </Section>
      <Section id="brush" title="Brush presets" open={!!sections.brush} onToggle={toggleSection}>
        {brushPanel}
      </Section>
      <Section id="settings" title={`Brush settings · ${presetById(activePresetId).name}`} open={!!sections.settings} onToggle={toggleSection}>
        {settingsPanel}
      </Section>
    </>
  );

  const toolbarContent = (
    <>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`pv-tool ${effectiveTool === t.id ? "active" : ""} ${tool === t.id && tempTool ? "latent" : ""}`}
          title={`${t.label} (${t.key})`}
          aria-label={t.label}
          aria-pressed={effectiveTool === t.id}
          onClick={() => setTool(t.id)}
        >
          <Icon name={t.icon} size={19} />
        </button>
      ))}
      <div className="pv-toolbar-sep" />
      <button type="button" className="pv-tool" title="Import image (or drop / paste one)" aria-label="Import image" onClick={() => fileRef.current?.click()}>
        <Icon name="image" size={19} />
      </button>
      <span className="pv-grow" />
      <div className="pv-mini-colors" title="Foreground / background (X swaps)">
        <button type="button" className="pv-mini-bg" style={{ background: bg }} onClick={swapColors} aria-label="Swap colors" />
        <button
          type="button"
          className="pv-mini-fg"
          style={{ background: fgHex }}
          onClick={() => {
            setDocker(true);
            setSections((s) => ({ ...s, color: true }));
          }}
          aria-label="Foreground color"
        />
      </div>
    </>
  );

  const doneButton = embed ? (
    <button type="button" className="pv-btn pv-btn-label pv-done" title="Back to the whiteboard tools (Esc)" onClick={embed.onExit}>
      <Icon name="done" />
      <span>Done</span>
    </button>
  ) : null;

  const phoneChrome = (
    <>
      {sheet && (
        <div className="pv-sheet" role="dialog" aria-label={sheet}>
          <div className="pv-sheet-head">
            <span className="pv-sheet-grip" />
            <strong>{sheet === "color" ? "Color" : sheet === "layers" ? "Layers" : "Brush"}</strong>
            <span className="spacer" />
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setSheet(null)}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="pv-sheet-body">
            {sheet === "color" && colorPanel}
            {sheet === "layers" && layersPanel}
            {sheet === "brush" && (
              <>
                {brushPanel}
                <div className="pv-sheet-sub">Settings · {presetById(activePresetId).name}</div>
                {settingsPanel}
              </>
            )}
          </div>
        </div>
      )}
      <nav className="pv-bottombar" aria-label="Tools">
        <div className="pv-bottom-tools">
          {bottomTools.map((id) => {
            const t = TOOLS.find((x) => x.id === id)!;
            return (
              <button
                key={id}
                type="button"
                className={`pv-tool ${effectiveTool === id ? "active" : ""}`}
                aria-label={t.label}
                onClick={() => {
                  if (id === shapeTool && effectiveTool === id) {
                    const order: ("line" | "rect" | "ellipse")[] = ["line", "rect", "ellipse"];
                    setTool(order[(order.indexOf(shapeTool) + 1) % 3]);
                  } else setTool(id);
                }}
              >
                <Icon name={t.icon} size={20} />
              </button>
            );
          })}
        </div>
        <div className="pv-bottom-panels">
          {doneButton}
          <button type="button" className={`pv-tool ${sheet === "layers" ? "active" : ""}`} aria-label="Layers" onClick={() => setSheet(sheet === "layers" ? null : "layers")}>
            <Icon name="layers" size={20} />
          </button>
          <button
            type="button"
            className={`pv-color-btn ${sheet === "color" ? "active" : ""}`}
            aria-label="Color"
            style={{ background: fgHex }}
            onClick={() => setSheet(sheet === "color" ? null : "color")}
          />
        </div>
      </nav>
    </>
  );

  // ---- canvas mode: painting inside the whiteboard -------------------------------------
  if (embed) {
    const undoRedo = (
      <>
        <button type="button" className="pv-btn" title="Undo painting (Ctrl+Z)" aria-label="Undo" disabled={!undoState.undo} onClick={undo}>
          <Icon name="undo" />
        </button>
        <button type="button" className="pv-btn" title="Redo painting (Ctrl+Shift+Z)" aria-label="Redo" disabled={!undoState.redo} onClick={redo}>
          <Icon name="redo" />
        </button>
      </>
    );
    return (
      <>
        {createPortal(<div ref={underRef} className="pv-canvas pv-embed-under" />, embed.under)}
        {createPortal(
          <div
            ref={stageRef}
            className={`pv-stage pv-embed-stage${painting ? " active" : ""}`}
            data-tool={effectiveTool}
            data-testid="paint-stage"
            aria-label="Paint"
          >
            <div ref={canvasRef} className="pv-canvas" />
            {painting && notice && (
              <div key={notice.id} className="pv-notice" role="status">
                {notice.text}
              </div>
            )}
            {painting && selBar}
            {painting && paletteEl}
          </div>,
          embed.over,
        )}
        {painting &&
          createPortal(
            <div
              ref={rootRef}
              className={["pv-root", "pv-embedded", phone ? "pv-phone" : "", narrow ? "pv-narrow" : ""].join(" ")}
              data-tool={effectiveTool}
            >
              <div className="pv-topbar pv-float-top">
                {presetButton}
                {!phone && <div className="pv-sep" />}
                {!phone && brushSliders}
                {toolOptions}
                <span className="pv-grow" />
                {symmetryButton}
                <div className="pv-sep" />
                {undoRedo}
                {!phone && (
                  <button
                    type="button"
                    className={`pv-btn ${docker ? "active" : ""}`}
                    title="Color, layers and brushes"
                    aria-label="Toggle panels"
                    aria-pressed={docker}
                    onClick={() => setDocker((d) => !d)}
                  >
                    <Icon name="panel" />
                  </button>
                )}
                {exportButton}
                {!phone && doneButton}
              </div>
              {!phone && (
                <nav className="pv-toolbar pv-float-left" aria-label="Paint tools">
                  {toolbarContent}
                </nav>
              )}
              {!phone && docker && (
                <aside className="pv-docker pv-float-right" aria-label="Paint panels">
                  {dockerSections}
                </aside>
              )}
              {phone && phoneChrome}
            </div>,
            embed.ui,
          )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="pv-hidden-input"
          onChange={(e) => {
            importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
      </>
    );
  }

  const rootClass = ["pv-root", phone ? "pv-phone" : "", narrow ? "pv-narrow" : "", hideUI ? "pv-hide-ui" : ""].join(" ");

  return (
    <div ref={rootRef} className={rootClass} data-tool={effectiveTool}>
      {!hideUI && (
        <div className="pv-topbar">
          {presetButton}
          {!phone && <div className="pv-sep" />}
          {!phone && brushSliders}
          {!phone && <div className="pv-sep" />}
          {toolOptions}
          <span className="pv-grow" />
          {symmetryButton}
          <div className="pv-sep" />
          <button type="button" className="pv-btn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!undoState.undo} onClick={undo}>
            <Icon name="undo" />
          </button>
          <button type="button" className="pv-btn" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!undoState.redo} onClick={redo}>
            <Icon name="redo" />
          </button>
          <div className="pv-sep" />
          {viewButton}
          {!phone && (
            <button
              type="button"
              className={`pv-btn ${view.mirror ? "active" : ""}`}
              title="Mirror view (M)"
              aria-label="Mirror view"
              aria-pressed={view.mirror}
              onClick={() => engine?.toggleMirror()}
            >
              <Icon name="mirror" />
            </button>
          )}
          {exportButton}
          {phone ? (
            <PopButton className="pv-btn" title="More" align="end" button={<Icon name="more" />}>
              {(close) => (
                <div className="pv-menu">
                  <button type="button" className="menu-item" onClick={() => (setDialog("canvas"), close())}>
                    <Icon name="canvas" size={16} /> Canvas size & background
                  </button>
                  <button type="button" className="menu-item" onClick={() => (fileRef.current?.click(), close())}>
                    <Icon name="image" size={16} /> Import image
                  </button>
                  <button type="button" className="menu-item" onClick={() => (setTool("pan"), close())}>
                    <Icon name="hand" size={16} /> Pan tool
                  </button>
                  <button type="button" className="menu-item" onClick={() => (setHideUI(true), close())}>
                    <Icon name="panel" size={16} /> Hide panels
                  </button>
                </div>
              )}
            </PopButton>
          ) : (
            <>
              <button type="button" className="pv-btn" title="Canvas size & background" aria-label="Canvas settings" onClick={() => setDialog("canvas")}>
                <Icon name="canvas" />
              </button>
              <button type="button" className="pv-btn" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setDialog("shortcuts")}>
                <Icon name="help" />
              </button>
              <button
                type="button"
                className={`pv-btn ${docker ? "active" : ""}`}
                title="Toggle panels"
                aria-label="Toggle panels"
                aria-pressed={docker}
                onClick={() => setDocker((d) => !d)}
              >
                <Icon name="panel" />
              </button>
            </>
          )}
        </div>
      )}
      <div className="pv-main">
        {!hideUI && !phone && (
          <nav className="pv-toolbar" aria-label="Tools">
            {toolbarContent}
          </nav>
        )}
        <div
          ref={stageRef}
          className="pv-stage"
          data-testid="paint-stage"
          aria-label="Canvas"
        >
          <div ref={canvasRef} className="pv-canvas" />
          {!ready && (
            <div className="pv-loading">
              <div className="spinner" />
            </div>
          )}
          {notice && (
            <div key={notice.id} className="pv-notice" role="status">
              {notice.text}
            </div>
          )}
          {selBar}
          {(phone || narrow) && !hideUI && ["brush", "eraser", "line", "rect", "ellipse"].includes(effectiveTool) && (
            <div className="pv-quick" onPointerDown={(e) => e.stopPropagation()}>
              <VSlider label="Brush size" value={activeSettings.size} min={0.5} max={500} exp onChange={(v) => updatePreset(activePresetId, { size: v })} />
              <div className="pv-quick-sep" />
              <VSlider label="Brush opacity" value={activeSettings.opacity} min={0.01} max={1} onChange={(v) => updatePreset(activePresetId, { opacity: v })} />
            </div>
          )}
          {hideUI && (
            <button type="button" className="pv-showui" onClick={() => setHideUI(false)} title="Show panels (Tab)">
              <Icon name="panel" size={16} /> Show panels
            </button>
          )}
          {penSeen && !phone && !hideUI && <div className="pv-pen-badge" title="Pen detected: touches pan and zoom only">✎ Pen</div>}
          {paletteEl}
        </div>
        {!hideUI && !phone && docker && (
          <aside className="pv-docker" aria-label="Panels">
            {dockerSections}
          </aside>
        )}
      </div>
      {!hideUI && phone && phoneChrome}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="pv-hidden-input"
        onChange={(e) => {
          importFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {dialog === "canvas" && <CanvasDialog meta={meta} onApply={applyCanvas} onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

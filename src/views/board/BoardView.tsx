// Canvas page view: Excalidraw bound to the page's Y maps, with live
// cursors/selections of everyone on the board and in-app page links — plus the
// paint studio's layers and brushes on the same infinite canvas (paint mode).

import "./assets.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  getVisibleSceneBounds,
  zoomToFitBounds,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
  LibraryItems,
  NormalizedZoomValue,
  UIAppState,
} from "@excalidraw/excalidraw/types";
import type { NonDeletedExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import * as Y from "yjs";
import { displayTitle, migrateToCanvas } from "../../../shared/model.ts";
import { usePage, usePeers } from "../../lib/hooks.ts";
import { useTheme } from "../../lib/theme.ts";
import type { Workspace } from "../../lib/workspace.ts";
import type { PageViewProps } from "../types.ts";
import { Icon, type Anchor } from "../../components/ui.tsx";
import { PageLinkButton, PagePicker, hasLinkTargets } from "./PageLinkButton.tsx";
import { PresencePublisher, boardPresenceOf, collaboratorsFor } from "./presence.ts";
import { BoardBinding } from "./sync.ts";
import PaintView, { type PaintEmbed } from "../paint/PaintView.tsx";
import { Icon as PaintIcon } from "../paint/icons.tsx";
import type { ViewState } from "../paint/types.ts";
import "./board.css";

const UI_OPTIONS: ExcalidrawProps["UIOptions"] = {
  canvasActions: {
    // The canvas colour is per-viewer app state, not part of the shared board.
    changeViewBackgroundColor: false,
    saveToActiveFile: false,
    loadScene: true,
    export: { saveFileToDisk: true },
    saveAsImage: true,
    clearCanvas: true,
  },
};

const LIBRARY_KEY = "basalt:board-library";
const viewportKey = (pageId: string) => `basalt:board-viewport:${pageId}`;
/** Whether this device last used the canvas for painting or for the whiteboard. */
const modeKey = (pageId: string) => `basalt:canvas-mode:${pageId}`;

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: viewport/library just won't persist.
  }
}

/** `#/...` route for links that point inside this app, else null. */
function inAppHash(link: string): string | null {
  const l = link.trim();
  if (l.startsWith("#/")) return l;
  try {
    const url = new URL(l, location.href);
    if (url.origin === location.origin && url.pathname === location.pathname && url.hash.startsWith("#/")) return url.hash;
  } catch {
    // Not a URL; let Excalidraw handle it.
  }
  return null;
}

const pageKeys = new WeakMap<object, number>();
let nextPageKey = 1;
function objectKey(o: object): number {
  let k = pageKeys.get(o);
  if (!k) pageKeys.set(o, (k = nextPageKey++));
  return k;
}

export default function BoardView(props: PageViewProps) {
  // The editor, binding and presence are tied to one page Y.Map for their
  // whole life; remount if the shell hands us a different one.
  return <Board key={`${props.ws.id}:${props.pageId}:${objectKey(props.page)}`} {...props} />;
}

/** Excalidraw scroll/zoom as the paint engine's view transform (same scene coordinates). */
function toView(scrollX: number, scrollY: number, zoom: number): ViewState {
  return { tx: scrollX * zoom, ty: scrollY * zoom, scale: zoom, rotation: 0, mirror: false };
}

function strokeCount(page: Y.Map<any>): number {
  const strokes = page.get("strokes");
  return strokes instanceof Y.Map ? strokes.size : 0;
}

function Board({ ws, pageId, page, locked = false }: PageViewProps) {
  const theme = useTheme();
  const { meta } = usePage(ws, pageId);
  const [binding] = useState(() => new BoardBinding(ws.doc, page));
  const [publisher] = useState(() => new PresencePublisher(ws, pageId));
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [hasPeers, setHasPeers] = useState(false);
  const [picker, setPicker] = useState<Anchor | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef<number | null>(null);
  // Paint mode: brushes and layers on this canvas (see PaintView's canvas mode).
  // Opens the way it was last used here; new paintings open ready to paint.
  const [paintMode, setPaintModeState] = useState(() => {
    const saved = readJSON(modeKey(pageId));
    return saved === "paint" || (saved === null && page.get("canvasMode") === "paint");
  });
  const setPaintMode = useCallback(
    (on: boolean) => {
      setPaintModeState(on);
      writeJSON(modeKey(pageId), on ? "paint" : "draw");
    },
    [pageId],
  );
  const painting = paintMode && !locked;
  const [hosts, setHosts] = useState<{ under: HTMLElement; over: HTMLElement } | null>(null);
  const [uiHost, setUiHost] = useState<HTMLDivElement | null>(null);
  const [painted, setPainted] = useState(() => strokeCount(page) > 0);
  const camListeners = useRef(new Set<(v: ViewState) => void>());

  // Paintings made before paint and whiteboard were one canvas become canvases.
  useEffect(() => migrateToCanvas(page), [page]);

  // The welcome screen only makes sense on a blank canvas.
  useEffect(() => {
    const update = () => setPainted(strokeCount(page) > 0);
    page.observeDeep(update);
    return () => page.unobserveDeep(update);
  }, [page]);

  useEffect(() => {
    binding.start();
    return () => binding.stop();
  }, [binding]);

  useEffect(() => {
    publisher.start();
    return () => publisher.stop();
  }, [publisher]);

  useEffect(() => {
    if (!api) return;
    return api.onUserFollow(({ userToFollow, action }) => {
      const id = action === "FOLLOW" ? Number(userToFollow.socketId) : null;
      followingRef.current = Number.isFinite(id) ? id : null;
      publisher.setFollowing(followingRef.current);
    });
  }, [api, publisher]);

  const getApi = useCallback(() => apiRef.current, []);

  // Paint layers live inside Excalidraw's stacking context: under its canvas and over it.
  useEffect(() => {
    if (!api) return;
    const root = rootRef.current?.querySelector<HTMLElement>(".excalidraw");
    if (!root) return;
    const under = document.createElement("div");
    under.className = "cv-host cv-host-under";
    const over = document.createElement("div");
    over.className = "cv-host cv-host-over";
    root.prepend(under);
    root.append(over);
    setHosts({ under, over });
    return () => {
      under.remove();
      over.remove();
      setHosts(null);
    };
  }, [api]);

  // One camera: Excalidraw's. The paint engine follows it and asks it to move.
  const camera = useMemo<PaintEmbed["camera"]>(
    () => ({
      view: () => {
        const st = apiRef.current?.getAppState();
        return st ? toView(st.scrollX, st.scrollY, st.zoom.value) : toView(0, 0, 1);
      },
      request: (v) =>
        apiRef.current?.updateScene({
          appState: { scrollX: v.tx / v.scale, scrollY: v.ty / v.scale, zoom: { value: v.scale as NormalizedZoomValue } },
          captureUpdate: CaptureUpdateAction.NEVER,
        }),
      subscribe: (cb) => {
        camListeners.current.add(cb);
        return () => void camListeners.current.delete(cb);
      },
    }),
    [],
  );

  const enterPaint = useCallback(() => {
    const a = apiRef.current;
    if (!a || locked) return;
    // Put the whiteboard in a neutral state so its shape panel gets out of the way.
    a.setActiveTool({ type: "selection" });
    a.updateScene({ appState: { selectedElementIds: {} }, captureUpdate: CaptureUpdateAction.NEVER });
    setPaintMode(true);
  }, [locked, setPaintMode]);
  const exitPaint = useCallback(() => setPaintMode(false), [setPaintMode]);

  const onApi = useCallback(
    (a: ExcalidrawImperativeAPI) => {
      apiRef.current = a;
      binding.setApi(a);
      // Called from Excalidraw's constructor (during render): defer the state update.
      queueMicrotask(() => setApi(a));
    },
    [binding],
  );

  const initialData = useCallback((): ExcalidrawInitialDataState => {
    const scene = binding.initialScene();
    const saved = readJSON(viewportKey(pageId)) as { scrollX?: number; scrollY?: number; zoom?: number } | null;
    const hasViewport =
      !!saved && Number.isFinite(saved.scrollX) && Number.isFinite(saved.scrollY) && Number.isFinite(saved.zoom);
    const library = readJSON(LIBRARY_KEY);
    return {
      elements: scene.elements,
      files: scene.files,
      appState: {
        // Transparent so paint layers under the shapes show through (the page provides the paper color).
        viewBackgroundColor: "transparent",
        ...(hasViewport
          ? { scrollX: saved.scrollX!, scrollY: saved.scrollY!, zoom: { value: saved.zoom as NormalizedZoomValue } }
          : {}),
      },
      scrollToContent: !hasViewport,
      libraryItems: Array.isArray(library) ? (library as LibraryItems) : undefined,
    };
  }, [binding, pageId]);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      binding.onChange(elements, files);
      publisher.setSelection(Object.keys(appState.selectedElementIds).sort());
    },
    [binding, publisher],
  );

  const onPointerUpdate = useCallback<NonNullable<ExcalidrawProps["onPointerUpdate"]>>(
    ({ pointer, button }) => publisher.setPointer(pointer.x, pointer.y, pointer.tool, button),
    [publisher],
  );

  const saveViewportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (saveViewportTimer.current && clearTimeout(saveViewportTimer.current)), []);
  const onScrollChange = useCallback(
    (scrollX: number, scrollY: number, zoom: AppState["zoom"]) => {
      if (saveViewportTimer.current) clearTimeout(saveViewportTimer.current);
      saveViewportTimer.current = setTimeout(
        () => writeJSON(viewportKey(pageId), { scrollX, scrollY, zoom: zoom.value }),
        400,
      );
      const a = apiRef.current;
      if (a) publisher.viewportChanged(() => getVisibleSceneBounds(a.getAppState()));
      const v = toView(scrollX, scrollY, zoom.value);
      for (const cb of camListeners.current) cb(v);
    },
    [pageId, publisher],
  );

  const onLinkOpen = useCallback<NonNullable<ExcalidrawProps["onLinkOpen"]>>(
    (element: NonDeletedExcalidrawElement, event) => {
      const hash = element.link ? inAppHash(element.link) : null;
      if (!hash) return;
      event.preventDefault();
      if (location.hash !== hash) location.hash = hash;
    },
    [],
  );

  const onLibraryChange = useCallback((items: LibraryItems) => writeJSON(LIBRARY_KEY, items), []);

  // Phones have no room next to Excalidraw's toolbar; they use the main menu entry.
  const pickerOpen = picker !== null;
  const renderTopRightUI = useCallback(
    (isMobile: boolean, appState: UIAppState) => (
      <>
        {!appState.viewModeEnabled &&
          (isMobile ? (
            // Phones: no room for both; the paint bar's Done comes back.
            <div className="cv-mode">
              <button type="button" className="cv-mode-btn cv-paint-trigger" aria-label="Paint" title="Paint: pressure brushes, colors and layers" onClick={enterPaint}>
                <PaintIcon name="brush" size={16} />
              </button>
            </div>
          ) : (
            <div className="cv-mode" role="radiogroup" aria-label="Canvas tools">
              <button
                type="button"
                role="radio"
                aria-checked={!painting}
                className={`cv-mode-btn${painting ? "" : " on"}`}
                title="Whiteboard: shapes, arrows, text, sticky notes"
                onClick={exitPaint}
              >
                <PaintIcon name="shapes" size={16} />
                <span className="cv-mode-label">Whiteboard</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={painting}
                className={`cv-mode-btn cv-paint-trigger${painting ? " on" : ""}`}
                title="Paint: pressure brushes, colors and layers"
                onClick={enterPaint}
              >
                <PaintIcon name="brush" size={16} />
                <span className="cv-mode-label">Paint</span>
              </button>
            </div>
          ))}
        {!isMobile && <PageLinkButton appState={appState} open={pickerOpen} onToggle={setPicker} />}
      </>
    ),
    [pickerOpen, painting, enterPaint, exitPaint],
  );

  const openPickerFromMenu = useCallback(() => {
    const a = apiRef.current;
    if (!hasLinkTargets(a)) {
      a?.setToast({ message: "Select shapes first, then link them to a page", duration: 2500, closable: false });
      return;
    }
    const trigger = rootRef.current?.querySelector(".board-link-trigger");
    const box = rootRef.current?.getBoundingClientRect();
    setPicker(trigger ? trigger.getBoundingClientRect() : { x: (box?.left ?? 0) + 16, y: (box?.top ?? 0) + 64 });
  }, []);

  // Stable children: Excalidraw's memo re-renders the whole editor when they change.
  const children = useMemo(
    () => (
      <>
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          <MainMenu.Item icon={<Icon name="link" size={16} stroke={2} />} onSelect={openPickerFromMenu}>
            Link to page…
          </MainMenu.Item>
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ClearCanvas />
        </MainMenu>
        {!painted && !painting && <WelcomeScreen>
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Hints.HelpHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Heading>
              Sketch, diagram, paint and brainstorm together.
              <br />
              Everyone on this page sees changes live.
            </WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItemLoadScene />
              <WelcomeScreen.Center.MenuItemHelp />
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
        </WelcomeScreen>}
      </>
    ),
    [openPickerFromMenu, painted, painting],
  );

  return (
    <div
      ref={rootRef}
      className={`board-view${painting ? " cv-painting" : ""}`}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") publisher.clearPointer();
      }}
    >
      <div className="board-canvas">
        <Excalidraw
          excalidrawAPI={onApi}
          initialData={initialData}
          onChange={onChange}
          onPointerUpdate={onPointerUpdate}
          onScrollChange={onScrollChange}
          onLinkOpen={onLinkOpen}
          onLibraryChange={onLibraryChange}
          renderTopRightUI={renderTopRightUI}
          theme={theme}
          viewModeEnabled={locked}
          name={meta ? displayTitle(meta) : "Whiteboard"}
          isCollaborating={hasPeers}
          UIOptions={UI_OPTIONS}
        >
          {children}
        </Excalidraw>
      </div>
      <div ref={setUiHost} className="cv-paint-ui" />
      {hosts && uiHost && (
        <PaintView
          ws={ws}
          pageId={pageId}
          page={page}
          locked={locked}
          embed={{ under: hosts.under, over: hosts.over, ui: uiHost, active: painting, onExit: exitPaint, camera }}
        />
      )}
      {picker && <PagePicker ws={ws} pageId={pageId} anchor={picker} getApi={getApi} onClose={() => setPicker(null)} />}
      <Collaborators
        ws={ws}
        pageId={pageId}
        api={api}
        publisher={publisher}
        followingRef={followingRef}
        onPresenceChange={setHasPeers}
      />
    </div>
  );
}

/** Mirrors peers on this board into Excalidraw (cursors, selections, follow mode). */
function Collaborators({
  ws,
  pageId,
  api,
  publisher,
  followingRef,
  onPresenceChange,
}: {
  ws: Workspace;
  pageId: string;
  api: ExcalidrawImperativeAPI | null;
  publisher: PresencePublisher;
  followingRef: RefObject<number | null>;
  onPresenceChange: (hasPeers: boolean) => void;
}) {
  const peers = usePeers(ws);
  const signature = useRef("");
  const followedViewport = useRef("");

  useEffect(() => {
    if (!api) return;
    const { map, signature: next } = collaboratorsFor(peers, pageId);
    if (next !== signature.current) {
      signature.current = next;
      api.updateScene({ collaborators: map });
    }
    onPresenceChange(map.size > 0);

    // Someone follows us: keep our visible area published for them.
    const followed = peers.some((p) => boardPresenceOf(p, pageId)?.following === ws.doc.clientID);
    publisher.setFollowed(followed, () => getVisibleSceneBounds(api.getAppState()));

    // We follow someone: track their visible area.
    const target = followingRef.current;
    const viewport =
      target === null ? null : boardPresenceOf(peers.find((p) => p.clientId === target), pageId)?.viewport;
    const key = viewport ? viewport.join(",") : "";
    if (viewport && key !== followedViewport.current) {
      const { appState } = zoomToFitBounds({
        bounds: viewport,
        appState: api.getAppState(),
        fitToViewport: true,
        viewportZoomFactor: 1,
      });
      api.updateScene({
        appState: { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
    followedViewport.current = key;
  }, [peers, api, pageId, ws, publisher, followingRef, onPresenceChange]);

  return null;
}

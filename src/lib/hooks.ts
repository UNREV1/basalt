// React bindings for Yjs data and workspace state.

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as Y from "yjs";
import {
  getPage,
  getProps,
  listPages,
  listTypes,
  pageMeta,
  pagesMap,
  typesMap,
  type ObjectType,
  type PageMeta,
} from "../../shared/model.ts";
import type { PresenceState, Workspace, WorkspaceStatus } from "./workspace.ts";

export interface AppContextValue {
  ws: Workspace;
  openPage: (pageId: string) => void;
  /** Create a page and open it. Returns the new id. */
  createAndOpen: (input: Parameters<typeof import("../../shared/model.ts").createPage>[1]) => string;
  toast: (msg: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}

export function useForceUpdate(): () => void {
  const [, force] = useReducer((x: number) => x + 1, 0);
  return force;
}

/** Re-render when a Y type changes (shallow by default). */
export function useY<T extends Y.AbstractType<any> | undefined>(type: T, deep = false): T {
  const force = useForceUpdate();
  useEffect(() => {
    if (!type) return;
    const fn = () => force();
    if (deep) type.observeDeep(fn);
    else type.observe(fn);
    return () => {
      if (deep) type.unobserveDeep(fn);
      else type.unobserve(fn);
    };
  }, [type, deep, force]);
  return type;
}

function rafThrottle(fn: () => void): () => void {
  let scheduled = false;
  return () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn();
    });
  };
}

/** Is this deep event about page metadata (not rich-text/canvas content)? */
function isMetaEvent(e: Y.YEvent<any>): boolean {
  return e.path.length <= 1 || (e.path.length === 2 && e.path[1] === "props");
}

/** All non-deleted pages' metadata, updated when metadata changes. */
export function usePages(ws: Workspace, includeDeleted = false): PageMeta[] {
  const [pages, setPages] = useState(() => listPages(ws.doc, { includeDeleted }));
  useEffect(() => {
    const map = pagesMap(ws.doc);
    const update = rafThrottle(() => setPages(listPages(ws.doc, { includeDeleted })));
    const fn = (events: Y.YEvent<any>[]) => {
      if (events.some(isMetaEvent)) update();
    };
    map.observeDeep(fn);
    update();
    return () => map.unobserveDeep(fn);
  }, [ws, includeDeleted]);
  return pages;
}

/** Map of pageId -> PageMeta for quick lookups. */
export function usePageIndex(ws: Workspace): Map<string, PageMeta> {
  const pages = usePages(ws, true);
  return useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
}

/** A single page's Y.Map and metadata; re-renders on metadata/props changes. */
export function usePage(ws: Workspace, pageId: string | null | undefined) {
  const page = pageId ? getPage(ws.doc, pageId) : undefined;
  const force = useForceUpdate();
  useEffect(() => {
    if (!pageId) return;
    const map = pagesMap(ws.doc);
    let current = getPage(ws.doc, pageId);
    const onPage = () => force();
    const attach = () => {
      current?.observe(onPage);
      (current?.get("props") as Y.Map<any> | undefined)?.observe(onPage);
    };
    const detach = () => {
      current?.unobserve(onPage);
      (current?.get("props") as Y.Map<any> | undefined)?.unobserve(onPage);
    };
    attach();
    // The page may arrive later via sync, or be replaced.
    const onPages = (e: Y.YMapEvent<any>) => {
      if (e.keysChanged.has(pageId)) {
        detach();
        current = getPage(ws.doc, pageId);
        attach();
        force();
      }
    };
    map.observe(onPages);
    return () => {
      detach();
      map.unobserve(onPages);
    };
  }, [ws, pageId, force]);
  return {
    page,
    meta: page ? pageMeta(page) : undefined,
    props: page ? getProps(page) : {},
  };
}

export function useTypes(ws: Workspace): ObjectType[] {
  useY(typesMap(ws.doc));
  return listTypes(ws.doc);
}

export function useWorkspaceStatus(ws: Workspace): WorkspaceStatus {
  const force = useForceUpdate();
  useEffect(() => ws.subscribe(force), [ws, force]);
  return ws.status;
}

export interface Peer {
  clientId: number;
  state: PresenceState;
}

/** Other people currently connected to this workspace. */
export function usePeers(ws: Workspace): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);
  useEffect(() => {
    const update = () => {
      const out: Peer[] = [];
      ws.awareness.getStates().forEach((state, clientId) => {
        if (clientId !== ws.doc.clientID && state?.user) out.push({ clientId, state: state as PresenceState });
      });
      setPeers(out);
    };
    ws.awareness.on("change", update);
    update();
    return () => ws.awareness.off("change", update);
  }, [ws]);
  return peers;
}

/** Keep a value in a ref that always points to the latest render's value. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const fn = () => setMatch(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, [q]);
  return match;
}

export { getPage };

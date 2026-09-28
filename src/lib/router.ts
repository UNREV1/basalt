// Tiny hash router.
//   #/w/<workspaceId>                  home
//   #/w/<workspaceId>/p/<pageId>       page
//   #/w/<workspaceId>/<view>           graph | learn | skills | trash | types | memory
//   #/join/<key>?s=<server>&n=<name>   join a shared workspace

import { useSyncExternalStore } from "react";

export type ViewName = "home" | "graph" | "learn" | "skills" | "trash" | "types" | "memory";

export type Route =
  | { name: "none" }
  | { name: "join"; key: string; server: string | null; wsName: string | null }
  | { name: "view"; wsId: string; view: ViewName; deck?: string }
  | { name: "page"; wsId: string; pageId: string };

// Retired views ("tutor", "ask") fall through to home.
const VIEWS: ViewName[] = ["home", "graph", "learn", "skills", "trash", "types", "memory"];

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const [path, query = ""] = h.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "join" && parts[1]) {
    const q = new URLSearchParams(query);
    return { name: "join", key: parts[1], server: q.get("s"), wsName: q.get("n") };
  }
  if (parts[0] === "w" && parts[1]) {
    if (parts[2] === "p" && parts[3]) return { name: "page", wsId: parts[1], pageId: parts[3] };
    const view = (VIEWS as string[]).includes(parts[2]) ? (parts[2] as ViewName) : "home";
    const deck = new URLSearchParams(query).get("deck") ?? undefined;
    return deck ? { name: "view", wsId: parts[1], view, deck } : { name: "view", wsId: parts[1], view };
  }
  return { name: "none" };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case "join":
      return `#/join/${route.key}`;
    case "view":
      if (route.view === "home") return `#/w/${route.wsId}`;
      return `#/w/${route.wsId}/${route.view}${route.deck ? `?deck=${encodeURIComponent(route.deck)}` : ""}`;
    case "page":
      return `#/w/${route.wsId}/p/${route.pageId}`;
    default:
      return "#/";
  }
}

export function navigate(route: Route, replace = false) {
  const hash = routeToHash(route);
  if (replace) history.replaceState(null, "", hash);
  else if (location.hash !== hash) location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function pageHref(wsId: string, pageId: string) {
  return `#/w/${wsId}/p/${pageId}`;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    () => location.hash,
  );
  return parseHash(hash);
}

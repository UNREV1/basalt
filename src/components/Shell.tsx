import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPage } from "../../shared/model.ts";
import { AppContext, useMediaQuery, usePage, type AppContextValue } from "../lib/hooks.ts";
import { navigate, type Route, type ViewName } from "../lib/router.ts";
import { getSettings } from "../lib/settings.ts";
import type { Workspace } from "../lib/workspace.ts";
import {
  CANVAS_KINDS,
  GraphView,
  Lazy,
  LearnView,
  MemoryView,
  SkillTreeView,
  TodayView,
  TypesView,
} from "../views/registry.tsx";
import { PageView } from "./PageView.tsx";
import { QuickSwitcher } from "./QuickSwitcher.tsx";
import { SettingsDialog } from "./SettingsDialog.tsx";
import { ShareDialog } from "./ShareDialog.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TopBar } from "./TopBar.tsx";
import { TrashView } from "./TrashView.tsx";
import { TabBar } from "./TabBar.tsx";
import { Companion } from "../assistant/Companion.tsx";
import { openAssistant, toggleAssistant, useAssistant } from "../assistant/store.ts";
import { updateSettings } from "../lib/settings.ts";

// The chat panel (and the agent behind it) loads the first time it opens.
const AssistantPanel = lazy(() => import("../assistant/AssistantPanel.tsx"));

const VIEW_TITLES: Record<ViewName, string> = {
  home: "Today",
  graph: "Graph",
  learn: "Flashcards",
  skills: "Skill tree",
  trash: "Trash",
  types: "Types",
  memory: "Claude memory",
};

function useToasts() {
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);
  return { toasts, toast };
}

function ViewBody({ view, ws, onShare, deck }: { view: ViewName; ws: Workspace; onShare: () => void; deck?: string }) {
  let body: ReactNode;
  switch (view) {
    case "graph":
      body = <GraphView ws={ws} />;
      break;
    case "learn":
      body = <LearnView key={deck ?? "all"} ws={ws} deckPageId={deck} />;
      break;
    case "skills":
      body = <SkillTreeView ws={ws} />;
      break;
    case "types":
      body = <TypesView ws={ws} />;
      break;
    case "memory":
      body = <MemoryView ws={ws} />;
      break;
    case "trash":
      return <TrashView />;
    default:
      body = <TodayView ws={ws} onShare={onShare} />;
  }
  const fill = view === "graph" || view === "skills";
  return (
    <div className={fill ? "page-canvas" : "main-scroll"}>
      <Lazy>{body}</Lazy>
    </div>
  );
}

function assistantOpen(): boolean {
  return !!document.querySelector(".as-panel");
}

function AssistantMount() {
  const { open } = useAssistant();
  return open ? (
    <Suspense fallback={null}>
      <AssistantPanel />
    </Suspense>
  ) : null;
}

export function Shell({ ws, route }: { ws: Workspace; route: Route }) {
  const mobile = useMediaQuery("(max-width: 800px)");
  const [sidebarOpen, setSidebarOpen] = useState(() => !matchMedia("(max-width: 800px)").matches);
  const [switcher, setSwitcher] = useState(false);
  const [share, setShare] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | null>(null);
  const { toasts, toast } = useToasts();
  const pageId = route.name === "page" ? route.pageId : null;
  const { meta } = usePage(ws, pageId);

  useEffect(() => setSidebarOpen(!mobile), [mobile]);

  const openPage = useCallback(
    (id: string) => {
      navigate({ name: "page", wsId: ws.id, pageId: id });
      if (matchMedia("(max-width: 800px)").matches) setSidebarOpen(false);
    },
    [ws],
  );

  const ctx: AppContextValue = useMemo(
    () => ({
      ws,
      openPage,
      toast,
      createAndOpen: (input) => {
        const id = createPage(ws.doc, { createdBy: getSettings().identity.name, ...input });
        openPage(id);
        return id;
      },
    }),
    [ws, openPage, toast],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "k" || e.key === "p") && !e.shiftKey) {
        e.preventDefault();
        setSwitcher((v) => !v);
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (mod && e.altKey && (e.key === "n" || e.code === "KeyN")) {
        e.preventDefault();
        ctx.createAndOpen({});
      } else if (mod && !e.shiftKey && !e.altKey && (e.key === "j" || e.code === "KeyJ")) {
        // The assistant: Ctrl/⌘+J (also brings a hidden companion back).
        e.preventDefault();
        const a = getSettings().assistant;
        if (!a.character) updateSettings({ assistant: { ...a, character: true } });
        toggleAssistant();
      } else if (e.key === "Escape" && assistantOpen() && (e.target as HTMLElement | null)?.closest?.(".as-panel")) {
        openAssistant(false);
      }
    };
    const onSettings = (e: Event) => setSettingsTab((e as CustomEvent).detail?.tab ?? "profile");
    window.addEventListener("keydown", onKey);
    window.addEventListener("basalt:open-settings", onSettings);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("basalt:open-settings", onSettings);
    };
  }, [ctx]);

  useEffect(() => {
    document.title = meta ? `${meta.title || "Untitled"} · Basalt` : `${ws.info.name} · Basalt`;
  }, [meta, ws.info.name]);

  useEffect(() => {
    if (!pageId) ws.setPresence({ pageId: undefined });
  }, [ws, pageId]);

  const view: ViewName = route.name === "view" ? route.view : "home";
  // Canvases (whiteboard, paint, graph, skill tree) keep the bottom edge for their own tools.
  const showTabBar =
    mobile && !(meta && CANVAS_KINDS.includes(meta.kind)) && !(route.name === "view" && (view === "graph" || view === "skills"));

  return (
    <AppContext.Provider value={ctx}>
      <div className={`app${sidebarOpen ? " sidebar-open" : " sidebar-closed"}${showTabBar ? " has-tabbar" : ""}`}>
        {sidebarOpen && mobile && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
        <Sidebar
          onSearch={() => setSwitcher(true)}
          onOpenSettings={(tab) => setSettingsTab(tab ?? "profile")}
          onShare={() => setShare(true)}
          onNavigate={() => mobile && setSidebarOpen(false)}
        />
        <main className="main">
          <TopBar
            meta={meta}
            title={pageId ? "" : VIEW_TITLES[view]}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onShare={() => setShare(true)}
          />
          {pageId ? <PageView key={pageId} pageId={pageId} /> : <ViewBody view={view} ws={ws} deck={route.name === "view" ? route.deck : undefined} onShare={() => setShare(true)} />}
        </main>
        {showTabBar && <TabBar active={route.name === "view" ? view : null} onSearch={() => setSwitcher(true)} />}
      </div>
      {switcher && (
        <QuickSwitcher
          onClose={() => setSwitcher(false)}
          onOpenSettings={() => setSettingsTab("profile")}
          onShare={() => setShare(true)}
        />
      )}
      {share && <ShareDialog onClose={() => setShare(false)} />}
      <AssistantMount />
      <Companion />
      {settingsTab && <SettingsDialog initialTab={settingsTab} onClose={() => setSettingsTab(null)} />}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

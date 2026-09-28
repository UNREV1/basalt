import { createContext, useContext, useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  CREATE_OPTIONS,
  TEMPLATES_SYSTEM,
  childrenOf,
  createPage,
  displayTitle,
  getPage,
  isPageLocked,
  isTemplatePage,
  movePage,
  trashPage,
  updatePage,
  type PageKind,
  type PageMeta,
} from "../../shared/model.ts";
import { useApp, usePages, useWorkspaceStatus, type AppContextValue } from "../lib/hooks.ts";
import { MOD, copyText } from "../lib/platform.ts";
import { navigate, useRoute, type ViewName } from "../lib/router.ts";
import { loadRegistry, type WorkspaceInfo } from "../lib/workspace.ts";
import { getSettings, updateAppearance, useSettings } from "../lib/settings.ts";
import { SIDEBAR_NAV, orderFavorites } from "../lib/appearance.ts";
import { useDueCount } from "../views/registry.tsx";
import { toggleAssistant, useAssistant } from "../assistant/store.ts";
import {
  PageDialogsHost,
  duplicateAndOpen,
  newFromTemplate,
  openMovePicker,
  openTemplatePicker,
  saveTemplate,
} from "./customize/actions.tsx";
import { PageIcon } from "./customize/PageIcon.tsx";
import { SidebarResizer } from "./customize/SidebarResizer.tsx";
import { Icon, Menu, type Anchor, type MenuItem } from "./ui.tsx";
import { Dock } from "./dock/Dock.tsx";

const EXPANDED_KEY = "basalt:expanded";
const MORE_KEY = "basalt:nav-more";
const MORE_VIEWS: ViewName[] = ["graph", "types", "memory", "trash"];

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function NewPageMenu({
  anchor,
  parentId,
  onClose,
}: {
  anchor: Anchor;
  parentId: string | null;
  onClose: () => void;
}) {
  const { createAndOpen } = useApp();
  const items: MenuItem[] = [
    { label: "Create", heading: true },
    ...CREATE_OPTIONS.map((o) => ({
      label: o.label,
      icon: <span>{o.icon}</span>,
      onClick: () => createAndOpen({ ...o.input, parentId }),
    })),
    { separator: true, label: "" },
    { label: "From template…", icon: <Icon name="template" />, onClick: () => openTemplatePicker(parentId) },
  ];
  return <Menu anchor={anchor} items={items} onClose={onClose} />;
}

function TreeItem({
  meta,
  pages,
  depth,
  activeId,
  expanded,
  toggle,
  onContext,
  dragState,
  renaming,
  setRenaming,
}: {
  meta: PageMeta;
  pages: PageMeta[];
  depth: number;
  activeId: string | null;
  expanded: Set<string>;
  toggle: (id: string, open?: boolean) => void;
  onContext: (meta: PageMeta, anchor: Anchor) => void;
  dragState: { dragging: string | null; setDragging: (id: string | null) => void };
  renaming: string | null;
  setRenaming: (id: string | null) => void;
}) {
  const { ws, openPage } = useApp();
  const kids = childrenOf(pages, meta.id);
  const open = expanded.has(meta.id);
  const [drop, setDrop] = useState<"before" | "inside" | "after" | null>(null);
  const [adding, setAdding] = useState<Anchor | null>(null);

  const onDragOver = (e: DragEvent) => {
    if (!dragState.dragging || dragState.dragging === meta.id) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    setDrop(y < 0.25 ? "before" : y > 0.75 ? "after" : "inside");
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const id = dragState.dragging;
    setDrop(null);
    dragState.setDragging(null);
    if (!id || id === meta.id) return;
    if (drop === "inside") {
      movePage(ws.doc, id, meta.id);
      toggle(meta.id, true);
    } else {
      const siblings = childrenOf(pages, meta.parentId).filter((p) => p.id !== id);
      const idx = siblings.findIndex((p) => p.id === meta.id);
      const neighbor = drop === "before" ? siblings[idx - 1] : siblings[idx + 1];
      const order =
        neighbor === undefined ? meta.order + (drop === "before" ? -1 : 1) : (meta.order + neighbor.order) / 2;
      movePage(ws.doc, id, meta.parentId, order);
    }
  };

  return (
    <div>
      <div
        className={`tree-row${activeId === meta.id ? " active" : ""}${drop ? ` drop-${drop}` : ""}`}
        data-page-id={meta.id}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", meta.id);
          dragState.setDragging(meta.id);
        }}
        onDragEnd={() => {
          dragState.setDragging(null);
          setDrop(null);
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
        onClick={() => openPage(meta.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContext(meta, { x: e.clientX, y: e.clientY });
        }}
      >
        <button
          className={`tree-toggle${kids.length ? "" : " leaf"}${open ? " open" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggle(meta.id);
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          <Icon name="chevron" size={12} stroke={2.4} />
        </button>
        <PageIcon meta={meta} className="tree-icon" />
        {renaming === meta.id ? (
          <input
            className="tree-rename"
            autoFocus
            defaultValue={meta.title}
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              updatePage(ws.doc, meta.id, { title: e.target.value });
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <span
            className="tree-title ellipsis"
            onDoubleClick={() => !isPageLocked(getPage(ws.doc, meta.id)) && setRenaming(meta.id)}
          >
            {displayTitle(meta)}
          </span>
        )}
        <span className="tree-actions">
          <button
            className="icon-btn"
            title="More"
            onClick={(e) => {
              e.stopPropagation();
              onContext(meta, (e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
          >
            <Icon name="dots" />
          </button>
          <button
            className="icon-btn"
            title="Add inside"
            onClick={(e) => {
              e.stopPropagation();
              setAdding((e.currentTarget as HTMLElement).getBoundingClientRect());
              toggle(meta.id, true);
            }}
          >
            <Icon name="plus" />
          </button>
        </span>
      </div>
      {adding && <NewPageMenu anchor={adding} parentId={meta.id} onClose={() => setAdding(null)} />}
      {open &&
        kids.map((k) => (
          <TreeItem
            key={k.id}
            meta={k}
            pages={pages}
            depth={depth + 1}
            activeId={activeId}
            expanded={expanded}
            toggle={toggle}
            onContext={onContext}
            dragState={dragState}
            renaming={renaming}
            setRenaming={setRenaming}
          />
        ))}
      {open && kids.length === 0 && (
        <div className="tree-empty small faint" style={{ paddingLeft: 30 + depth * 14 }}>
          No pages inside
        </div>
      )}
    </div>
  );
}

function StatusDot({ ws }: { ws: ReturnType<typeof useApp>["ws"] }) {
  const status = useWorkspaceStatus(ws);
  const label: Record<string, string> = {
    local: "Local only",
    offline: "Offline — changes saved on this device",
    connecting: "Connecting…",
    syncing: "Syncing…",
    synced: "Synced · end-to-end encrypted",
    error: ws.provider?.lastError || "Sync error",
  };
  return (
    <span className={`status-dot status-${status}`} title={label[status]}>
      <span className="dot" />
      <span className="small ellipsis">{label[status]}</span>
    </span>
  );
}

function WorkspaceSwitcher({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { ws } = useApp();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [list, setList] = useState<WorkspaceInfo[]>(loadRegistry);
  useEffect(() => {
    const fn = () => setList(loadRegistry());
    window.addEventListener("basalt:registry", fn);
    return () => window.removeEventListener("basalt:registry", fn);
  }, []);
  const items: MenuItem[] = [
    { label: "Workspaces", heading: true },
    ...list
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .map((w) => ({
        label: w.name || "Untitled workspace",
        icon: <span>{w.icon || "🪨"}</span>,
        hint: w.id === ws.id ? "✓" : undefined,
        onClick: () => navigate({ name: "view", wsId: w.id, view: "home" }),
      })),
    { separator: true, label: "" },
    { label: "New workspace…", icon: <Icon name="plus" />, onClick: () => (location.hash = "#/new") },
    { label: "Workspace settings", icon: <Icon name="settings" />, onClick: onOpenSettings },
  ];
  return (
    <>
      <button className="ws-switcher" onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}>
        <span className="ws-icon">{ws.info.icon || "🪨"}</span>
        <span className="ellipsis grow">{ws.info.name || "Workspace"}</span>
        <Icon name="down" size={14} />
      </button>
      {anchor && <Menu anchor={anchor} items={items} onClose={() => setAnchor(null)} />}
    </>
  );
}

/** Things the dock panels need from the shell. */
interface ShellActions {
  onSearch: () => void;
  onOpenSettings: (tab?: string) => void;
  onNavigate: () => void;
}
const ShellActionsContext = createContext<ShellActions>({ onSearch: () => {}, onOpenSettings: () => {}, onNavigate: () => {} });
export const ShellActionsProvider = ShellActionsContext.Provider;
export const useShellActions = () => useContext(ShellActionsContext);

export function Sidebar({
  onSearch,
  onOpenSettings,
  onShare,
  onNavigate,
}: {
  onSearch: () => void;
  onOpenSettings: (tab?: string) => void;
  onShare: () => void;
  onNavigate: () => void;
}) {
  const { ws } = useApp();
  const actions = useMemo(() => ({ onSearch, onOpenSettings, onNavigate }), [onSearch, onOpenSettings, onNavigate]);
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <WorkspaceSwitcher onOpenSettings={() => onOpenSettings("workspace")} />
      </div>
      <div className="sidebar-scroll">
        <ShellActionsProvider value={actions}>
          <Dock side="left" />
        </ShellActionsProvider>
      </div>
      <div className="sidebar-bottom">
        <StatusDot ws={ws} />
        <span className="spacer" />
        <button className="icon-btn" title="Share & sync" onClick={onShare}>
          <Icon name="users" />
        </button>
        <button className="icon-btn" title="Settings" onClick={() => onOpenSettings()}>
          <Icon name="settings" />
        </button>
      </div>
      <SidebarResizer />
      <PageDialogsHost />
    </aside>
  );
}

/** Search, Today, the assistant, skills, flashcards, and "More". */
export function NavPanel() {
  const { ws } = useApp();
  const { onSearch, onOpenSettings, onNavigate } = useShellActions();
  const route = useRoute();
  const settings = useSettings();
  const appearance = settings.appearance;
  const activeView = route.name === "view" ? route.view : null;
  const due = useDueCount(ws);
  const assistant = useAssistant();
  const [navMenu, setNavMenu] = useState<{ id: string; label: string; anchor: Anchor } | null>(null);
  const [moreOpen, setMoreOpen] = useState(() => localStorage.getItem(MORE_KEY) === "1");
  const showMore = moreOpen || (activeView !== null && MORE_VIEWS.includes(activeView));
  const hidden = new Set(appearance.hiddenNav);

  const go = (view: ViewName) => {
    navigate({ name: "view", wsId: ws.id, view });
    onNavigate();
  };
  const onNavContext = (id: string, label: string) => (e: ReactMouseEvent) => {
    e.preventDefault();
    setNavMenu({ id, label, anchor: { x: e.clientX, y: e.clientY } });
  };
  const navItem = (view: ViewName, icon: string, label: string, badge?: number) =>
    hidden.has(view) ? null : (
      <button
        className={`nav-item${activeView === view ? " active" : ""}`}
        data-nav={view}
        onClick={() => go(view)}
        onContextMenu={view === "home" || view === "trash" ? undefined : onNavContext(view, label)}
      >
        <Icon name={icon} />
        <span className="grow">{label}</span>
        {badge ? <span className="nav-badge">{badge > 999 ? "999+" : badge}</span> : null}
      </button>
    );
  const nav = (id: string, badge?: number) => {
    const n = SIDEBAR_NAV.find((x) => x.id === id)!;
    return navItem(id as ViewName, n.icon, n.label, badge);
  };

  return (
    <div className="dock-nav">
      <button className="nav-item" onClick={onSearch}>
        <Icon name="search" />
        <span className="grow">Search</span>
        <span className="kbd">{MOD} K</span>
      </button>
      {navItem("home", "home", "Today")}
      {!hidden.has("assistant") && (
        <button
          className={`nav-item${assistant.open ? " active" : ""}`}
          data-nav="assistant"
          onClick={() => {
            toggleAssistant();
            onNavigate();
          }}
          onContextMenu={onNavContext("assistant", settings.assistant.name)}
        >
          <Icon name="sparkle" />
          <span className="grow ellipsis">{settings.assistant.name}</span>
          <span className="kbd">{MOD} J</span>
        </button>
      )}
      {nav("skills")}
      {nav("learn", due)}
      <button
        className="nav-item nav-more"
        aria-expanded={showMore}
        onClick={() => {
          localStorage.setItem(MORE_KEY, showMore ? "0" : "1");
          setMoreOpen(!showMore);
        }}
      >
        <span className={`sidebar-more-chevron${showMore ? " open" : ""}`}>
          <Icon name="chevron" size={12} stroke={2.4} />
        </span>
        <span className="grow">More</span>
      </button>
      {showMore && (
        <div className="nav-more-items">
          {nav("graph")}
          {nav("types")}
          {nav("memory")}
          {navItem("trash", "trash", "Trash")}
        </div>
      )}
      {navMenu && (
        <Menu
          anchor={navMenu.anchor}
          onClose={() => setNavMenu(null)}
          items={[
            {
              label: `Hide “${navMenu.label}”`,
              icon: <Icon name="eye" />,
              onClick: () => updateAppearance({ hiddenNav: [...appearance.hiddenNav, navMenu.id] }),
            },
            { label: "Customize sidebar…", icon: <Icon name="sliders" />, onClick: () => onOpenSettings("appearance") },
          ]}
        />
      )}
    </div>
  );
}

/** Starred pages, in the order you drag them into. */
export function FavoritesPanel() {
  const app = useApp();
  const { ws, openPage } = app;
  const { onNavigate } = useShellActions();
  const pages = usePages(ws);
  const route = useRoute();
  const appearance = useSettings().appearance;
  const activeId = route.name === "page" ? route.pageId : null;
  const [favDrag, setFavDrag] = useState<{ id: string; over?: string; after?: boolean } | null>(null);
  const [ctx, setCtx] = useState<{ meta: PageMeta; anchor: Anchor } | null>(null);
  const favorites = useMemo(() => {
    const byId = new Map(pages.filter((p) => p.favorite).map((p) => [p.id, p]));
    return orderFavorites([...byId.keys()], appearance.favoriteOrder).map((id) => byId.get(id)!);
  }, [pages, appearance.favoriteOrder]);

  const dropFavorite = (targetId: string, after: boolean) => {
    const id = favDrag?.id;
    setFavDrag(null);
    if (!id || id === targetId) return;
    const list = favorites.map((f) => f.id).filter((f) => f !== id);
    const at = list.indexOf(targetId) + (after ? 1 : 0);
    list.splice(at, 0, id);
    updateAppearance({ favoriteOrder: list });
  };

  if (!favorites.length) return <div className="dock-empty small faint">Star a page (☆ in its top bar) to pin it here.</div>;
  return (
    <div>
      {favorites.map((f) => (
        <button
          key={f.id}
          className={`nav-item fav-item${activeId === f.id ? " active" : ""}${
            favDrag?.over === f.id ? (favDrag.after ? " drop-after" : " drop-before") : ""
          }${favDrag?.id === f.id ? " dragging" : ""}`}
          onClick={() => {
            openPage(f.id);
            onNavigate();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtx({ meta: f, anchor: { x: e.clientX, y: e.clientY } });
          }}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", f.id);
            setFavDrag({ id: f.id });
          }}
          onDragEnd={() => setFavDrag(null)}
          onDragOver={(e) => {
            if (!favDrag || favDrag.id === f.id) return;
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            const after = e.clientY > r.top + r.height / 2;
            if (favDrag.over !== f.id || favDrag.after !== after) setFavDrag({ ...favDrag, over: f.id, after });
          }}
          onDrop={(e) => {
            if (!favDrag) return;
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            dropFavorite(f.id, e.clientY > r.top + r.height / 2);
          }}
        >
          <PageIcon meta={f} className="tree-icon" />
          <span className="grow ellipsis">{displayTitle(f)}</span>
        </button>
      ))}
      {ctx && (
        <Menu
          anchor={ctx.anchor}
          items={pageContextItems(app, ctx.meta, pages, { onRename: () => openPage(ctx.meta.id) })}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}

/** "+" in the Pages panel header. */
export function NewPageButton() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  return (
    <>
      <button
        className="icon-btn"
        title="New page"
        aria-label="New page"
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget.getBoundingClientRect());
        }}
      >
        <Icon name="plus" />
      </button>
      {anchor && <NewPageMenu anchor={anchor} parentId={null} onClose={() => setAnchor(null)} />}
    </>
  );
}

/** Every page as a tree you can drag pages around in. */
export function PagesPanel() {
  const app = useApp();
  const { ws, openPage } = app;
  const pages = usePages(ws);
  const route = useRoute();
  const activeId = route.name === "page" ? route.pageId : null;
  const [expanded, setExpanded] = useState(loadExpanded);
  const [dragging, setDragging] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ meta: PageMeta; anchor: Anchor } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  // Reveal the active page in the tree.
  useEffect(() => {
    if (!activeId) return;
    const byId = new Map(pages.map((p) => [p.id, p]));
    let cur = byId.get(activeId)?.parentId ?? null;
    const add: string[] = [];
    while (cur) {
      add.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    if (add.some((id) => !expanded.has(id))) {
      setExpanded((prev) => {
        const next = new Set(prev);
        add.forEach((id) => next.add(id));
        localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
        return next;
      });
    }
  }, [activeId, pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string, open?: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const shouldOpen = open ?? !next.has(id);
      if (shouldOpen) next.add(id);
      else next.delete(id);
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const roots = useMemo(() => childrenOf(pages, null), [pages]);

  return (
    <div>
      <div
        className="tree"
        onDragOver={(e) => dragging && e.preventDefault()}
        onDrop={(e) => {
          // Dropping on empty space moves the page to the top level.
          if (e.target === e.currentTarget && dragging) {
            e.stopPropagation();
            movePage(ws.doc, dragging, null);
            setDragging(null);
          }
        }}
      >
        {roots.map((p) => (
          <TreeItem
            key={p.id}
            meta={p}
            pages={pages}
            depth={0}
            activeId={activeId}
            expanded={expanded}
            toggle={toggle}
            onContext={(meta, anchor) => setCtx({ meta, anchor })}
            dragState={{ dragging, setDragging }}
            renaming={renaming}
            setRenaming={setRenaming}
          />
        ))}
        {roots.length === 0 && <div className="tree-empty small faint">No pages yet</div>}
      </div>
      <div className="new-page-row">
        <button
          className="nav-item faint grow"
          onClick={() => {
            const id = createPage(ws.doc, { createdBy: getSettings().identity.name });
            openPage(id);
          }}
        >
          <Icon name="plus" />
          <span className="grow">New page</span>
        </button>
        <button className="icon-btn" title="New from template" aria-label="New from template" onClick={() => openTemplatePicker(null)}>
          <Icon name="template" />
        </button>
      </div>
      {ctx && (
        <Menu
          anchor={ctx.anchor}
          items={pageContextItems(app, ctx.meta, pages, { onRename: () => setRenaming(ctx.meta.id) })}
          onClose={() => setCtx(null)}
        />
      )}
    </div>
  );
}

/** Page actions shared by the tree and favorites context menus. */
function pageContextItems(
  app: AppContextValue,
  meta: PageMeta,
  pages: PageMeta[],
  opts: { onRename: () => void },
): MenuItem[] {
  const { ws, toast } = app;
  const locked = isPageLocked(getPage(ws.doc, meta.id));
  const hasChildren = pages.some((p) => p.parentId === meta.id);
  const template = isTemplatePage(ws.doc, meta.id);
  const templatesRoot = meta.system === TEMPLATES_SYSTEM;
  const items: MenuItem[] = [
    {
      label: meta.favorite ? "Remove from favorites" : "Add to favorites",
      icon: <Icon name="star" />,
      onClick: () => updatePage(ws.doc, meta.id, { favorite: !meta.favorite }),
    },
    { label: "Rename", icon: <Icon name="edit" />, disabled: locked, onClick: opts.onRename },
    {
      label: "Copy link",
      icon: <Icon name="link" />,
      onClick: () => {
        void copyText(`${location.origin}${location.pathname}#/w/${ws.id}/p/${meta.id}`);
        toast("Link copied — works for workspace members");
      },
    },
    { separator: true, label: "" },
  ];
  if (template) {
    items.push({ label: "New page from template", icon: <Icon name="plus" />, onClick: () => newFromTemplate(app, meta.id, null) });
  }
  if (!templatesRoot) {
    items.push({ label: "Duplicate", icon: <Icon name="copy" />, onClick: () => duplicateAndOpen(app, meta.id) });
    if (hasChildren) {
      items.push({ label: "Duplicate with sub-pages", icon: <Icon name="copy" />, onClick: () => duplicateAndOpen(app, meta.id, true) });
    }
  }
  items.push(
    { label: "Move to…", icon: <Icon name="move" />, onClick: () => openMovePicker(meta.id) },
    {
      label: "Move to top level",
      icon: <Icon name="back" />,
      disabled: meta.parentId === null,
      onClick: () => movePage(ws.doc, meta.id, null),
    },
  );
  if (!template && !templatesRoot) {
    items.push({ label: "Save as template", icon: <Icon name="template" />, onClick: () => saveTemplate(app, meta.id) });
  }
  items.push(
    { separator: true, label: "" },
    {
      label: "Move to trash",
      icon: <Icon name="trash" />,
      danger: true,
      onClick: () => {
        trashPage(ws.doc, meta.id);
        toast(`Moved “${displayTitle(meta)}” to trash`);
      },
    },
  );
  return items;
}

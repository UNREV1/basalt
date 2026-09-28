import { useEffect, useRef, useState } from "react";
import {
  TEMPLATES_SYSTEM,
  displayTitle,
  getPage,
  getPageStyle,
  isTemplatePage,
  listPages,
  pageMeta,
  setPageStyle,
  trashPage,
  updatePage,
  type PageMeta,
} from "../../shared/model.ts";
import { useApp, usePageIndex, usePeers } from "../lib/hooks.ts";
import { copyText } from "../lib/platform.ts";
import { pageToMarkdown, downloadText } from "../lib/markdown.ts";
import { useTheme } from "../lib/theme.ts";
import { useSettings } from "../lib/settings.ts";
import { safeFileName } from "../../shared/markdown.ts";
import {
  CUSTOMIZE_EVENT,
  duplicateAndOpen,
  newFromTemplate,
  openMovePicker,
  saveTemplate,
} from "./customize/actions.tsx";
import { CustomizePanel } from "./customize/CustomizePanel.tsx";
import { PageIcon } from "./customize/PageIcon.tsx";
import { pageScopeProps } from "./customize/palette.ts";
import { Avatar, Icon, Menu, timeAgo, type Anchor, type MenuItem } from "./ui.tsx";

function Breadcrumbs({ meta }: { meta: PageMeta }) {
  const { ws, openPage } = useApp();
  const index = usePageIndex(ws);
  const chain: PageMeta[] = [];
  let cur: PageMeta | undefined = meta;
  while (cur && chain.length < 12) {
    chain.unshift(cur);
    cur = cur.parentId ? index.get(cur.parentId) : undefined;
  }
  const shown = chain.length > 3 ? [chain[0], null, ...chain.slice(-2)] : chain;
  return (
    <nav className="breadcrumbs">
      {shown.map((p, i) => (
        <span key={p ? p.id : `gap${i}`} className="crumb-wrap">
          {i > 0 && <span className="crumb-sep">/</span>}
          {p ? (
            <button className="crumb" onClick={() => openPage(p.id)}>
              <PageIcon meta={p} className="crumb-icon" />
              <span className="ellipsis">{displayTitle(p)}</span>
            </button>
          ) : (
            <span className="crumb faint">…</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Presence({ pageId }: { pageId?: string }) {
  const { ws } = useApp();
  const peers = usePeers(ws);
  if (!peers.length) return null;
  const sorted = [...peers].sort((a, b) => Number(b.state.pageId === pageId) - Number(a.state.pageId === pageId));
  return (
    <div className="presence">
      {sorted.slice(0, 5).map((p) => {
        const here = pageId && p.state.pageId === pageId;
        const where = p.state.pageId ? getPage(ws.doc, p.state.pageId) : undefined;
        const title = `${p.state.user.name}${(p.state as { agent?: string }).agent === "claude" ? " (AI)" : ""}${
          where ? ` — on “${displayTitle(pageMeta(where))}”` : ""
        }`;
        return (
          <span key={p.clientId} className={`presence-avatar${here ? " here" : ""}`}>
            <Avatar name={p.state.user.name} color={p.state.user.color} size={26} title={title} />
          </span>
        );
      })}
      {peers.length > 5 && <span className="badge">+{peers.length - 5}</span>}
    </div>
  );
}

export function TopBar({
  meta,
  title,
  onToggleSidebar,
  onShare,
}: {
  meta?: PageMeta;
  title?: string;
  onToggleSidebar: () => void;
  onShare: () => void;
}) {
  const app = useApp();
  const { ws, toast } = app;
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [customize, setCustomize] = useState<Anchor | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const dark = useTheme() === "dark";
  const page = meta ? getPage(ws.doc, meta.id) : undefined;
  const style = getPageStyle(page);
  const locked = !!style.locked;
  const canvas = meta?.kind === "board" || meta?.kind === "paint";
  // Only needed while the menu is open.
  const hasChildren = !!menu && !!meta && listPages(ws.doc).some((p) => p.parentId === meta.id);
  const template = meta ? isTemplatePage(ws.doc, meta.id) : false;
  const templatesRoot = meta?.system === TEMPLATES_SYSTEM;

  // Ctrl+K "Customize page…" and other components can ask for the panel.
  const pageId = meta?.id;
  useEffect(() => {
    const onCustomize = (e: Event) => {
      if (pageId && (e as CustomEvent).detail?.pageId === pageId && moreRef.current) {
        setCustomize(moreRef.current.getBoundingClientRect());
      }
    };
    window.addEventListener(CUSTOMIZE_EVENT, onCustomize);
    return () => window.removeEventListener(CUSTOMIZE_EVENT, onCustomize);
  }, [pageId]);
  useEffect(() => setCustomize(null), [pageId]);

  const items: MenuItem[] = meta
    ? [
        {
          label: "Customize page…",
          icon: <Icon name="sliders" />,
          onClick: () => moreRef.current && setCustomize(moreRef.current.getBoundingClientRect()),
        },
        {
          label: locked ? "Unlock page" : "Lock page",
          icon: <Icon name={locked ? "unlock" : "lock"} />,
          onClick: () => {
            setPageStyle(ws.doc, meta.id, { locked: !locked });
            toast(locked ? "Page unlocked" : "Page locked — read-only for everyone");
          },
        },
        { separator: true, label: "" },
        {
          label: meta.favorite ? "Remove from favorites" : "Add to favorites",
          icon: <Icon name="star" />,
          onClick: () => updatePage(ws.doc, meta.id, { favorite: !meta.favorite }),
        },
        {
          label: "Copy link",
          icon: <Icon name="link" />,
          onClick: () => {
            void copyText(location.href);
            toast("Link copied — works for workspace members");
          },
        },
        ...(template
          ? [{ label: "New page from this template", icon: <Icon name="plus" />, onClick: () => newFromTemplate(app, meta.id, null) }]
          : []),
        ...(templatesRoot
          ? []
          : [
              { label: "Duplicate", icon: <Icon name="copy" />, onClick: () => duplicateAndOpen(app, meta.id) },
              ...(hasChildren
                ? [{ label: "Duplicate with sub-pages", icon: <Icon name="copy" />, onClick: () => duplicateAndOpen(app, meta.id, true) }]
                : []),
            ]),
        { label: "Move to…", icon: <Icon name="move" />, onClick: () => openMovePicker(meta.id) },
        ...(template || templatesRoot
          ? []
          : [{ label: "Save as template", icon: <Icon name="template" />, onClick: () => saveTemplate(app, meta.id) }]),
        {
          label: "Export as Markdown",
          icon: <Icon name="download" />,
          disabled: meta.kind !== "doc" && meta.kind !== "course",
          onClick: () =>
            downloadText(
              `${safeFileName(displayTitle(meta))}.md`,
              `# ${displayTitle(meta)}\n\n${pageToMarkdown(ws, meta.id)}`,
            ),
        },
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
        { separator: true, label: "" },
        {
          label: `Edited ${timeAgo(meta.updatedAt)}${meta.createdBy ? ` · created by ${meta.createdBy}` : ""}`,
          heading: true,
        },
      ]
    : [];

  // The bar shares the page's tint so the page reads as one surface.
  const scope = meta && !canvas && style.tint ? pageScopeProps({ tint: style.tint }, dark) : null;

  const showCompanion = useSettings().assistant.character;
  return (
    <header className={`topbar${scope ? " page-scope-bar" : ""}`} style={scope?.style} {...(scope?.data ?? {})}>
      <button className="icon-btn sidebar-toggle" onClick={onToggleSidebar} title="Toggle sidebar (Ctrl+\)">
        <Icon name="menu" />
      </button>
      {meta ? <Breadcrumbs meta={meta} /> : <div className="topbar-title ellipsis">{title}</div>}
      <span className="spacer" />
      <Presence pageId={meta?.id} />
      {showCompanion && <span className="cp-dock" aria-hidden="true" />}
      <button className="btn btn-sm btn-ghost" onClick={onShare}>
        <Icon name="share" size={14} />
        <span className="hide-mobile">Share</span>
      </button>
      {meta && locked && (
        <button
          className="lock-chip"
          title="This page is locked. Click to unlock."
          onClick={() => {
            setPageStyle(ws.doc, meta.id, { locked: null });
            toast("Page unlocked");
          }}
        >
          <Icon name="lock" size={13} />
          <span className="hide-mobile">Locked</span>
        </button>
      )}
      {meta && (
        <>
          <button
            className={`icon-btn${meta.favorite ? " active" : ""}`}
            title="Favorite"
            onClick={() => updatePage(ws.doc, meta.id, { favorite: !meta.favorite })}
          >
            <Icon name="star" />
          </button>
          <button
            ref={moreRef}
            className="icon-btn"
            title="More"
            aria-label="Page options"
            onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
          >
            <Icon name="dots" />
          </button>
        </>
      )}
      {menu && <Menu anchor={menu} items={items} onClose={() => setMenu(null)} />}
      {customize && meta && (
        <CustomizePanel pageId={meta.id} kind={meta.kind} anchor={customize} onClose={() => setCustomize(null)} />
      )}
    </header>
  );
}

// A dock: a column of panels you can reorder, move to the other dock,
// collapse and hide. Drag a panel by its header, or use its ⋯ menu (which
// also works on touch screens, where dragging isn't reliable).

import { Suspense, lazy, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  PANELS,
  hidePanel,
  movePanel,
  nudgePanel,
  panelInfo,
  resetLayout,
  toggleCollapsed,
  useLayout,
  REVEAL_EVENT,
  type DockSide,
  type PanelId,
} from "../../lib/layout.ts";
import { ErrorBoundary } from "../../views/registry.tsx";
import { Icon, Menu, type Anchor, type MenuItem } from "../ui.tsx";
import { FavoritesPanel, NavPanel, NewPageButton, PagesPanel } from "../Sidebar.tsx";
import { BacklinksPanel, GraphPanel, OutlinePanel } from "./panels.tsx";
import "./dock.css";

const QuestsPanel = lazy(() => import("./QuestsPanel.tsx"));
const AssistantDockPanel = lazy(() => import("../../assistant/DockedAssistant.tsx"));

const MIME = "application/x-basalt-panel";

function PanelBody({ id }: { id: PanelId }) {
  switch (id) {
    case "nav":
      return <NavPanel />;
    case "favorites":
      return <FavoritesPanel />;
    case "pages":
      return <PagesPanel />;
    case "outline":
      return <OutlinePanel />;
    case "backlinks":
      return <BacklinksPanel />;
    case "graph":
      return <GraphPanel />;
    case "quests":
      return <QuestsPanel />;
    case "assistant":
      return <AssistantDockPanel />;
  }
}

/** Extra buttons in a panel's header. */
function HeaderActions({ id }: { id: PanelId }): ReactNode {
  return id === "pages" ? <NewPageButton /> : null;
}

type Drop = { index: number } | null;

export function Dock({ side }: { side: DockSide }) {
  const layout = useLayout();
  const ids = layout[side];
  const [drop, setDrop] = useState<Drop>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Scroll a revealed panel into view.
  useEffect(() => {
    const onReveal = (e: Event) => {
      const { id, side: at } = (e as CustomEvent<{ id: PanelId; side: DockSide }>).detail;
      if (at !== side) return;
      requestAnimationFrame(() => rootRef.current?.querySelector(`[data-panel="${id}"]`)?.scrollIntoView({ block: "nearest" }));
    };
    window.addEventListener(REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(REVEAL_EVENT, onReveal);
  }, [side]);

  const isPanelDrag = (e: DragEvent) => e.dataTransfer.types.includes(MIME);
  const indexAt = (e: DragEvent): number => {
    const sections = [...(rootRef.current?.querySelectorAll<HTMLElement>(":scope > .dock-panel") ?? [])];
    for (let i = 0; i < sections.length; i++) {
      const r = sections[i].getBoundingClientRect();
      if (e.clientY < r.top + Math.min(r.height / 2, 40)) return i;
    }
    return sections.length;
  };

  return (
    <div
      ref={rootRef}
      className={`dock dock-${side}${drop ? " dropping" : ""}`}
      onDragOver={(e) => {
        if (!isPanelDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const index = indexAt(e);
        if (drop?.index !== index) setDrop({ index });
      }}
      onDragLeave={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setDrop(null);
      }}
      onDrop={(e) => {
        if (!isPanelDrag(e)) return;
        e.preventDefault();
        const id = e.dataTransfer.getData(MIME) as PanelId;
        const index = indexAt(e);
        setDrop(null);
        if (id) movePanel(id, side, index);
      }}
    >
      {ids.map((id, i) => (
        <DockPanel key={id} id={id} side={side} first={i === 0} last={i === ids.length - 1} dropBefore={drop?.index === i} />
      ))}
      {drop?.index === ids.length && <div className="dock-drop-line" />}
      {ids.length === 0 && <div className="dock-empty-zone small faint">Drag panels here</div>}
      <AddPanel side={side} />
    </div>
  );
}

function DockPanel({ id, side, first, last, dropBefore }: { id: PanelId; side: DockSide; first: boolean; last: boolean; dropBefore: boolean }) {
  const layout = useLayout();
  const info = panelInfo(id);
  const collapsed = layout.collapsed.includes(id);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [dragging, setDragging] = useState(false);
  const other: DockSide = side === "left" ? "right" : "left";

  const items: MenuItem[] = [
    { label: "Move up", icon: <Icon name="up" />, disabled: first, onClick: () => nudgePanel(id, -1) },
    { label: "Move down", icon: <Icon name="down" />, disabled: last, onClick: () => nudgePanel(id, 1) },
    {
      label: `Move to the ${other} side`,
      icon: <Icon name="move" />,
      onClick: () => movePanel(id, other, layout[other].length),
    },
    { separator: true, label: "" },
    { label: collapsed ? "Expand" : "Collapse", icon: <Icon name="chevron" />, onClick: () => toggleCollapsed(id) },
    ...(info.required ? [] : [{ label: "Hide panel", icon: <Icon name="eye" />, onClick: () => hidePanel(id) }]),
  ];

  return (
    <>
      {dropBefore && <div className="dock-drop-line" />}
      <section className={`dock-panel${collapsed ? " collapsed" : ""}${info.grow ? " grow" : ""}${dragging ? " dragging" : ""}`} data-panel={id} aria-label={info.title}>
        <header
          className="dock-head"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(MIME, id);
            e.dataTransfer.effectAllowed = "move";
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
          onClick={() => toggleCollapsed(id)}
          title="Drag to move · click to collapse"
        >
          <span className="dock-grip" aria-hidden>
            <Icon name="grip" size={12} />
          </span>
          <span className="dock-title grow ellipsis">{info.title}</span>
          <span className="dock-actions" onClick={(e) => e.stopPropagation()}>
            <HeaderActions id={id} />
            <button className="icon-btn" aria-label={`${info.title} panel options`} title="Move, collapse or hide" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
              <Icon name="dots" />
            </button>
          </span>
          <span className={`dock-chevron${collapsed ? "" : " open"}`} aria-hidden>
            <Icon name="chevron" size={11} stroke={2.4} />
          </span>
        </header>
        {!collapsed && (
          <div className="dock-body">
            <ErrorBoundary>
              <Suspense fallback={<div className="dock-empty small faint">Loading…</div>}>
                <PanelBody id={id} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
        {menu && <Menu anchor={menu} items={items} onClose={() => setMenu(null)} />}
      </section>
    </>
  );
}

/** Bring back hidden panels, or reset the whole layout. */
function AddPanel({ side }: { side: DockSide }) {
  const layout = useLayout();
  const [menu, setMenu] = useState<Anchor | null>(null);
  const placed = new Set([...layout.left, ...layout.right]);
  const hidden = PANELS.filter((p) => !placed.has(p.id));
  const items: MenuItem[] = [
    ...(hidden.length ? [{ label: "Add a panel", heading: true } as MenuItem] : []),
    ...hidden.map((p) => ({
      label: p.title,
      hint: p.description,
      icon: <Icon name={p.icon} />,
      onClick: () => movePanel(p.id, side, layout[side].length),
    })),
    ...(hidden.length ? [{ separator: true, label: "" } as MenuItem] : []),
    { label: "Reset layout", icon: <Icon name="reset" />, onClick: resetLayout },
  ];
  return (
    <>
      <button className="dock-add" onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}>
        <Icon name="plus" size={13} /> {hidden.length ? "Add panel" : "Layout"}
      </button>
      {menu && <Menu anchor={menu} items={items} onClose={() => setMenu(null)} />}
    </>
  );
}

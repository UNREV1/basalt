// Panels about the open page: its outline, what links to it, and its
// neighbourhood in the graph.

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { useApp, usePage } from "../../lib/hooks.ts";
import { useRoute } from "../../lib/router.ts";
import { readHeadings, type Heading } from "../../views/doc/Outline.tsx";
import { GraphView, Lazy } from "../../views/registry.tsx";
import { Backlinks } from "../Backlinks.tsx";

function useOpenPageId(): string | null {
  const route = useRoute();
  return route.name === "page" ? route.pageId : null;
}

const Empty = ({ children }: { children: string }) => <div className="dock-empty small faint">{children}</div>;

export function OutlinePanel() {
  const { ws } = useApp();
  const pageId = useOpenPageId();
  const { page, meta } = usePage(ws, pageId);
  const fragment = meta?.kind === "doc" ? (page?.get("content") as Y.XmlFragment | undefined) : undefined;
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    if (!fragment) {
      setHeadings([]);
      return;
    }
    setHeadings(readHeadings(fragment));
    let t: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        setHeadings(readHeadings(fragment));
      }, 300);
    };
    fragment.observeDeep(update);
    return () => {
      fragment.unobserveDeep(update);
      if (t) clearTimeout(t);
    };
  }, [fragment]);

  if (!pageId) return <Empty>Open a page to see its outline.</Empty>;
  if (!headings.length) return <Empty>No headings on this page yet.</Empty>;
  const min = Math.min(...headings.map((h) => h.level));
  return (
    <nav className="dock-outline" aria-label="Outline">
      {headings.map((h) => (
        <button
          key={h.id}
          className="nav-item dock-outline-item"
          style={{ paddingLeft: 8 + (h.level - min) * 14 }}
          title={h.text}
          onClick={() => document.querySelector(`[data-id="${h.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <span className="ellipsis">{h.text}</span>
        </button>
      ))}
    </nav>
  );
}

export function BacklinksPanel() {
  const pageId = useOpenPageId();
  if (!pageId) return <Empty>Open a page to see what links to it.</Empty>;
  return (
    <div className="dock-backlinks">
      <Backlinks key={pageId} pageId={pageId} />
    </div>
  );
}

export function GraphPanel() {
  const { ws } = useApp();
  const pageId = useOpenPageId();
  if (!pageId) return <Empty>Open a page to see its connections.</Empty>;
  return (
    <div className="dock-graph">
      <Lazy>
        <GraphView key={pageId} ws={ws} focusPageId={pageId} compact />
      </Lazy>
    </div>
  );
}

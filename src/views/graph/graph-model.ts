// Builds the visible node/edge set for the graph view from page metadata and
// the [[link]] graph, applying filters and local-graph (neighborhood) mode.

import type { LinkGraph, PageKind, PageMeta } from "../../../shared/model.ts";

export interface GraphNode {
  id: string;
  title: string;
  icon: string;
  kind: PageKind;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** "link" = [[link]] (either direction), "tree" = parent → child. */
  type: "link" | "tree";
}

export interface GraphFilters {
  orphans: boolean;
  hierarchy: boolean;
  hiddenKinds: ReadonlySet<PageKind>;
  focusId?: string;
  depth: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Kind counts before kind filtering, for the legend. */
  kindCounts: Map<PageKind, number>;
}

export function buildGraphData(pages: PageMeta[], links: LinkGraph, f: GraphFilters): GraphData {
  const kindCounts = new Map<PageKind, number>();
  const byId = new Map<string, PageMeta>();
  for (const p of pages) {
    byId.set(p.id, p);
    kindCounts.set(p.kind, (kindCounts.get(p.kind) ?? 0) + 1);
  }
  const visible = (id: string) => {
    const p = byId.get(id);
    return !!p && (!f.hiddenKinds.has(p.kind) || id === f.focusId);
  };

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, type: GraphEdge["type"]) => {
    if (a === b || !visible(a) || !visible(b)) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source: a, target: b, type });
  };
  for (const [src, targets] of links.outgoing) for (const t of targets) add(src, t, "link");
  if (f.hierarchy) for (const p of pages) if (p.parentId) add(p.parentId, p.id, "tree");

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }

  let keep: Set<string>;
  if (f.focusId && byId.has(f.focusId)) {
    // Breadth-first neighborhood of the focused page.
    keep = new Set([f.focusId]);
    let frontier = [f.focusId];
    for (let d = 0; d < f.depth && frontier.length; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const n of adj.get(id) ?? []) {
          if (!keep.has(n)) {
            keep.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
  } else {
    keep = new Set(pages.filter((p) => visible(p.id)).map((p) => p.id));
    if (!f.orphans) for (const id of [...keep]) if (!adj.get(id)?.length) keep.delete(id);
  }

  const keptEdges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  const degree = new Map<string, number>();
  for (const e of keptEdges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  const nodes: GraphNode[] = [...keep].map((id) => {
    const p = byId.get(id)!;
    return { id, title: p.title.trim() || "Untitled", icon: p.icon, kind: p.kind, degree: degree.get(id) ?? 0 };
  });
  return { nodes, edges: keptEdges, kindCounts };
}

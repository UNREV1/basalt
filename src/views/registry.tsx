// Lazy-loaded views, so heavy modules (Excalidraw, CodeMirror, Pyodide
// glue, BlockNote) only download when first used.

import { Component, lazy, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import type { PageKind } from "../../shared/model.ts";
import type { PageViewProps } from "./types.ts";
import type { Workspace } from "../lib/workspace.ts";

const loaders = import.meta.glob<{ default: ComponentType<any> }>([
  "./doc/DocEditor.tsx",
  "./board/BoardView.tsx",
  "./paint/PaintView.tsx",
  "./notebook/NotebookView.tsx",
  "./database/DatabaseView.tsx",
  "./course/CourseView.tsx",
  "./chat/ChatView.tsx",
  "./graph/GraphView.tsx",
  "./learn/LearnView.tsx",
  "./skills/SkillTreeView.tsx",
  "./types/TypesView.tsx",
  "./memory/MemoryView.tsx",
  "./today/TodayView.tsx",
  "./skills/SkillHeader.tsx",
]);

function Missing({ name }: { name: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">🧱</div>
      <div>The “{name}” module isn’t available in this build.</div>
    </div>
  );
}

const cache = new Map<string, ComponentType<any>>();

function load<P>(path: string, name: string): ComponentType<P> {
  let C = cache.get(path);
  if (!C) {
    const loader = loaders[path];
    C = loader ? lazy(loader) : () => <Missing name={name} />;
    cache.set(path, C);
  }
  return C as ComponentType<P>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="empty">
      <div className="spinner" />
      <div className="small">{label}</div>
    </div>
  );
}

/** Keeps a crashing module from taking down the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[basalt] view crashed", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty">
        <div className="empty-icon">⚠️</div>
        <div>Something went wrong while showing this.</div>
        <div className="small mono faint">{this.state.error.message}</div>
        <button className="btn btn-sm" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

export function Lazy({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

const KIND_VIEWS: Record<PageKind, [string, string]> = {
  doc: ["./doc/DocEditor.tsx", "Page"],
  board: ["./board/BoardView.tsx", "Canvas"],
  // Legacy paint pages open as canvases (and are migrated on open).
  paint: ["./board/BoardView.tsx", "Canvas"],
  notebook: ["./notebook/NotebookView.tsx", "Notebook"],
  database: ["./database/DatabaseView.tsx", "Database"],
  course: ["./course/CourseView.tsx", "Course"],
  chat: ["./chat/ChatView.tsx", "Chat"],
};

export function pageViewFor(kind: PageKind): ComponentType<PageViewProps> {
  const [path, name] = KIND_VIEWS[kind] ?? KIND_VIEWS.doc;
  return load<PageViewProps>(path, name);
}

/** Canvas kinds fill the viewport and hide the document header. */
export const CANVAS_KINDS: PageKind[] = ["board", "paint"];

export const TodayView = load<{ ws: Workspace; onShare: () => void }>("./today/TodayView.tsx", "Today");
export const GraphView = load<{ ws: Workspace; focusPageId?: string; compact?: boolean }>("./graph/GraphView.tsx", "Graph");
export const LearnView = load<{ ws: Workspace; deckPageId?: string }>("./learn/LearnView.tsx", "Learn");
export const SkillTreeView = load<{ ws: Workspace }>("./skills/SkillTreeView.tsx", "Skill tree");
export const SkillHeader = load<{ ws: Workspace; pageId: string }>("./skills/SkillHeader.tsx", "Skill");
export const TypesView = load<{ ws: Workspace }>("./types/TypesView.tsx", "Types");
export const MemoryView = load<{ ws: Workspace }>("./memory/MemoryView.tsx", "Claude memory");

// Optional named exports from feature modules (resolved at build time).
const properties = import.meta.glob<{ PropertiesPanel: ComponentType<{ ws: Workspace; pageId: string }> }>(
  "../components/properties/PropertiesPanel.tsx",
);
export const PropertiesPanel: ComponentType<{ ws: Workspace; pageId: string }> = (() => {
  const loader = properties["../components/properties/PropertiesPanel.tsx"];
  return loader ? lazy(() => loader().then((m) => ({ default: m.PropertiesPanel }))) : () => null;
})();

const importExport = import.meta.glob<{ ImportExportPanel: ComponentType<{ ws: Workspace }> }>(
  "../components/import-export/ImportExportPanel.tsx",
);
export const ImportExportPanel: ComponentType<{ ws: Workspace }> = (() => {
  const loader = importExport["../components/import-export/ImportExportPanel.tsx"];
  return loader ? lazy(() => loader().then((m) => ({ default: m.ImportExportPanel }))) : () => <Missing name="Import & export" />;
})();

const dueCount = import.meta.glob<{ useDueCount: (ws: Workspace) => number }>("./learn/useDueCount.ts", { eager: true });
export const useDueCount: (ws: Workspace) => number = dueCount["./learn/useDueCount.ts"]?.useDueCount ?? (() => 0);

export interface SkillSummary {
  /** Character level across all skills. */
  level: number;
  /** Sum of skill levels. */
  totalLevel: number;
  skills: number;
  /** Highest rank name reached, e.g. "Adept" ("" when there are no skills). */
  topRank: string;
}

type RawSkillStats = { level: number; totalLevel: number; skills: number; topRank: { name: string } | null };
const skillStats = import.meta.glob<{ useSkillStats: (ws: Workspace) => RawSkillStats }>("./skills/useSkillXp.ts", {
  eager: true,
});
const rawSkillStats = skillStats["./skills/useSkillXp.ts"]?.useSkillStats;
export function useSkillStats(ws: Workspace): SkillSummary {
  const s = rawSkillStats ? rawSkillStats(ws) : { level: 0, totalLevel: 0, skills: 0, topRank: null };
  return { level: s.level, totalLevel: s.totalLevel, skills: s.skills, topRank: s.topRank?.name ?? "" };
}

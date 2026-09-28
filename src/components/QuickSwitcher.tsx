// Ctrl/Cmd+K: search pages by title and content, and run commands.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { displayTitle, listPages, listTemplates, openDailyNote, pageText, type PageMeta } from "../../shared/model.ts";
import { useApp } from "../lib/hooks.ts";
import { navigate, useRoute } from "../lib/router.ts";
import { getSettings, updateSettings, applyTheme } from "../lib/settings.ts";
import { newFromStarter, newFromTemplate, openCustomize, openTemplatePicker } from "./customize/actions.tsx";
import { PageIcon } from "./customize/PageIcon.tsx";
import { STARTER_TEMPLATES } from "./customize/starters.ts";
import { Icon, timeAgo } from "./ui.tsx";
import { openAssistant } from "../assistant/store.ts";

interface Result {
  key: string;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  run: () => void;
  score: number;
}

function fuzzyScore(text: string, q: string): number {
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  const i = t.indexOf(q);
  if (i >= 0) return 300 - Math.min(i, 200);
  let j = 0;
  let gaps = 0;
  for (let k = 0; k < t.length && j < q.length; k++) {
    if (t[k] === q[j]) j++;
    else if (j > 0) gaps++;
  }
  return j === q.length ? Math.max(1, 100 - gaps) : 0;
}

export function QuickSwitcher({
  onClose,
  onOpenSettings,
  onShare,
}: {
  onClose: () => void;
  onOpenSettings: () => void;
  onShare: () => void;
}) {
  const app = useApp();
  const { ws, openPage, createAndOpen } = app;
  const route = useRoute();
  const currentPage = route.name === "page" ? route.pageId : null;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Page text is extracted once per open; fine for thousands of pages.
  const corpus = useMemo(
    () => listPages(ws.doc).map((p) => ({ p, text: pageText(ws.doc, p.id) })),
    [ws],
  );

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out: Result[] = [];
    const pageResult = (p: PageMeta, score: number, subtitle?: string): Result => ({
      key: p.id,
      icon: <PageIcon meta={p} />,
      title: displayTitle(p),
      subtitle,
      score,
      run: () => openPage(p.id),
    });
    if (!query) {
      for (const { p } of [...corpus].sort((a, b) => b.p.updatedAt - a.p.updatedAt).slice(0, 8)) {
        out.push(pageResult(p, 1, `Edited ${timeAgo(p.updatedAt)}`));
      }
    } else {
      for (const { p, text } of corpus) {
        const ts = fuzzyScore(displayTitle(p), query);
        if (ts > 0) {
          out.push(pageResult(p, ts + 50));
          continue;
        }
        const i = text.toLowerCase().indexOf(query);
        if (i >= 0) {
          const start = Math.max(0, i - 40);
          const snippet = `${start > 0 ? "…" : ""}${text.slice(start, i + query.length + 60).replace(/\n/g, " ")}`;
          out.push(pageResult(p, 40, snippet));
        }
      }
    }
    const commands: Omit<Result, "score">[] = [
      { key: "cmd:new", icon: <Icon name="plus" />, title: q.trim() ? `Create page “${q.trim()}”` : "New page", run: () => createAndOpen({ title: q.trim() }) },
      { key: "cmd:today", icon: <Icon name="calendar" />, title: "Open today’s daily note", run: () => openPage(openDailyNote(ws.doc, getSettings().identity.name)) },
      { key: "cmd:graph", icon: <Icon name="graph" />, title: "Open graph view", run: () => navigate({ name: "view", wsId: ws.id, view: "graph" }) },
      { key: "cmd:skills", icon: <Icon name="tree" />, title: "Open my skill tree", run: () => navigate({ name: "view", wsId: ws.id, view: "skills" }) },
      { key: "cmd:learn", icon: <Icon name="cards" />, title: "Study flashcards", run: () => navigate({ name: "view", wsId: ws.id, view: "learn" }) },
      { key: "cmd:course", icon: <Icon name="cap" />, title: "Learn a new topic (new course)", run: () => createAndOpen({ kind: "course", icon: "🎓", title: q.trim() }) },
      { key: "cmd:ask", icon: <Icon name="sparkle" />, title: `Ask ${getSettings().assistant.name}`, run: () => openAssistant(true) },
      { key: "cmd:board", icon: <span>🎨</span>, title: "New whiteboard (shapes, diagrams)", run: () => createAndOpen({ kind: "board", title: q.trim() }) },
      { key: "cmd:paint", icon: <span>🖌️</span>, title: "New painting (brushes, layers)", run: () => createAndOpen({ kind: "board", canvasMode: "paint", icon: "🖌️", title: q.trim() }) },
      { key: "cmd:db", icon: <span>🗂️</span>, title: "New database", run: () => createAndOpen({ kind: "database", title: q.trim() }) },
      { key: "cmd:nb", icon: <span>📓</span>, title: "New notebook", run: () => createAndOpen({ kind: "notebook", title: q.trim() }) },
      { key: "cmd:template", icon: <Icon name="template" />, title: "New page from template…", run: () => openTemplatePicker(null) },
      ...listTemplates(ws.doc).map((t) => ({
        key: `tpl:${t.id}`,
        icon: <PageIcon meta={t} />,
        title: `New from template: ${displayTitle(t)}`,
        run: () => newFromTemplate(app, t.id, null),
      })),
      ...STARTER_TEMPLATES.map((s) => ({
        key: `starter:${s.id}`,
        icon: <span>{s.icon}</span>,
        title: `New from template: ${s.name}`,
        run: () => newFromStarter(app, s, null),
      })),
      ...(currentPage
        ? [{ key: "cmd:customize", icon: <Icon name="sliders" />, title: "Customize this page…", run: () => openCustomize(currentPage) }]
        : []),
      {
        key: "cmd:design",
        icon: <Icon name="palette" />,
        title: "Change design…",
        run: () => window.dispatchEvent(new CustomEvent("basalt:open-settings", { detail: { tab: "appearance" } })),
      },
      {
        key: "cmd:appearance",
        icon: <Icon name="sliders" />,
        title: "Appearance: theme, accent, fonts…",
        run: () => window.dispatchEvent(new CustomEvent("basalt:open-settings", { detail: { tab: "appearance" } })),
      },
      { key: "cmd:share", icon: <Icon name="users" />, title: "Share workspace / sync devices", run: onShare },
      {
        key: "cmd:theme",
        icon: <Icon name="moon" />,
        title: "Toggle dark mode",
        run: () => {
          const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
          updateSettings({ theme });
          applyTheme(theme);
        },
      },
      { key: "cmd:settings", icon: <Icon name="settings" />, title: "Settings", run: onOpenSettings },
      { key: "cmd:memory", icon: <Icon name="brain" />, title: "Claude memory & connect Claude Desktop / Claude Code", run: () => navigate({ name: "view", wsId: ws.id, view: "memory" }) },
      { key: "cmd:trash", icon: <Icon name="trash" />, title: "Open trash", run: () => navigate({ name: "view", wsId: ws.id, view: "trash" }) },
    ];
    for (const c of commands) {
      // Per-template commands only surface when searched for.
      if (!query && (c.key.startsWith("tpl:") || c.key.startsWith("starter:"))) continue;
      const s = query ? fuzzyScore(c.title, query) : 0.5;
      if (s > 0 || c.key === "cmd:new") out.push({ ...c, score: c.key === "cmd:new" && query ? 45 : s * 0.3 });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 40);
  }, [q, corpus, ws, app, currentPage, openPage, createAndOpen, onOpenSettings, onShare]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(".qs-item.selected")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    r.run();
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal quick-switcher" role="dialog" aria-modal>
        <div className="qs-input-row">
          <Icon name="search" />
          <input
            ref={inputRef}
            className="qs-input"
            placeholder="Search pages or type a command…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(results[sel]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>
        <div className="qs-list" ref={listRef}>
          {results.map((r, i) => (
            <button
              key={r.key}
              className={`qs-item${i === sel ? " selected" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(r)}
            >
              <span className="qs-icon">{r.icon}</span>
              <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
                <span className="ellipsis">{r.title}</span>
                {r.subtitle && <span className="small muted ellipsis">{r.subtitle}</span>}
              </span>
              {i === sel && <span className="kbd">↵</span>}
            </button>
          ))}
          {results.length === 0 && <div className="empty small">No matches</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

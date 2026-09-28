import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { getPageStyle, getType, pagesMap, restorePage, setPageStyle, updatePage } from "../../shared/model.ts";
import { pageCards } from "../../shared/flashcards.ts";
import { SKILL_TYPE_ID, SKILLS_SYSTEM } from "../../shared/skills.ts";
import { navigate } from "../lib/router.ts";
import { useApp, usePage } from "../lib/hooks.ts";
import { useTheme } from "../lib/theme.ts";
import { CANVAS_KINDS, ErrorBoundary, GraphView, Lazy, PropertiesPanel, SkillHeader, SkillTreeView, pageViewFor } from "../views/registry.tsx";
import type { PageViewProps } from "../views/types.ts";
import { Backlinks } from "./Backlinks.tsx";
import { CustomizePanel } from "./customize/CustomizePanel.tsx";
import { setPageEmoji, setPageIconImage } from "./customize/iconActions.ts";
import { useLockGuard } from "./customize/lock.ts";
import { COVER_GRADIENTS, pageScopeProps } from "./customize/palette.ts";
import { PageCover } from "./customize/PageCover.tsx";
import { PageIcon } from "./customize/PageIcon.tsx";
import "./customize/customize.css";
import { EmojiPicker, Icon, timeAgo, type Anchor } from "./ui.tsx";

/** Views may accept `locked` to switch to a read-only mode (see customize/lock.ts). */
type LockableView = ComponentType<PageViewProps & { locked?: boolean }>;

function TitleInput({
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  // Follow remote renames unless the user is typing.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  return (
    <textarea
      ref={ref}
      className="page-title-input"
      rows={1}
      value={draft}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-label="Page title"
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        if (draft !== value) onChange(draft);
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, "");
        setDraft(v);
        onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          // Move focus into the editor below.
          const editable = document.querySelector<HTMLElement>(".page-body .ProseMirror");
          editable?.focus();
        }
      }}
    />
  );
}

export function PageView({ pageId }: { pageId: string }) {
  const { ws, toast } = useApp();
  const { page, meta } = usePage(ws, pageId);
  const dark = useTheme() === "dark";
  const [iconAnchor, setIconAnchor] = useState<Anchor | null>(null);
  const [customize, setCustomize] = useState<Anchor | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const style = getPageStyle(page);
  const locked = !!style.locked;
  useLockGuard(bodyRef, locked);
  useLockGuard(canvasRef, locked, { canvas: true });

  useEffect(() => {
    ws.setPresence({ pageId });
  }, [ws, pageId]);

  if (!page || !meta) {
    return (
      <div className="empty" style={{ marginTop: "15vh" }}>
        <div className="empty-icon">🔍</div>
        <div>This page doesn’t exist yet on this device.</div>
        <div className="small">If it was just shared with you, it will appear once sync completes.</div>
      </div>
    );
  }

  const View = pageViewFor(meta.kind) as LockableView;
  const canvas = CANVAS_KINDS.includes(meta.kind);
  const type = getType(ws.doc, meta.typeId);
  const lockAttr = locked ? "" : undefined;

  const trashedBanner = meta.deletedAt ? (
    <div className="trash-banner">
      <span>This page is in the trash.</span>
      <button className="btn btn-sm" onClick={() => restorePage(ws.doc, pageId)}>
        Restore
      </button>
    </div>
  ) : null;

  // The Skills page is your skill tree: all your Skill pages, as a tree.
  if (meta.system === SKILLS_SYSTEM) {
    return (
      <div className="page-canvas">
        {trashedBanner}
        <Lazy>
          <SkillTreeView ws={ws} />
        </Lazy>
      </div>
    );
  }

  if (canvas) {
    return (
      <div className="page-canvas" ref={canvasRef} data-locked={lockAttr}>
        {trashedBanner}
        <Lazy>
          <View key={pageId} ws={ws} pageId={pageId} page={page} locked={locked} />
        </Lazy>
      </div>
    );
  }

  const hasIcon = !!(meta.icon || style.iconImage);
  const scope = pageScopeProps(style, dark);
  const openIconPicker = () => {
    const el = headerRef.current?.querySelector<HTMLElement>(".page-icon, .page-affordances");
    if (el) setIconAnchor(el.getBoundingClientRect());
  };

  return (
    <div
      className={`main-scroll page-scope${style.cover ? " has-cover" : ""}`}
      style={scope.style}
      {...scope.data}
      data-kind={meta.kind}
    >
      {trashedBanner}
      {style.cover && <PageCover pageId={pageId} style={style} locked={locked} />}
      <div className={`page-column${meta.kind === "database" || meta.kind === "notebook" ? " wide" : ""}`}>
        <div ref={headerRef} className={`page-header${hasIcon ? " has-icon" : ""}`}>
          {hasIcon && (
            <button
              className="page-icon"
              title={locked ? undefined : "Change icon"}
              aria-label="Change icon"
              disabled={locked}
              onClick={(e) => setIconAnchor(e.currentTarget.getBoundingClientRect())}
            >
              <PageIcon meta={meta} fallback={false} />
            </button>
          )}
          <div className="page-affordances">
            {!hasIcon && !locked && (
              <button className="affordance" onClick={openIconPicker}>
                <Icon name="smile" size={15} /> Add icon
              </button>
            )}
            {!style.cover && !locked && (
              <button
                className="affordance"
                onClick={() => {
                  const g = COVER_GRADIENTS[Math.floor(Math.random() * COVER_GRADIENTS.length)];
                  setPageStyle(ws.doc, pageId, { cover: { type: "gradient", value: g.id } });
                }}
              >
                <Icon name="image" size={15} /> Add cover
              </button>
            )}
            <button className="affordance" onClick={(e) => setCustomize(e.currentTarget.getBoundingClientRect())}>
              <Icon name={locked ? "lock" : "sliders"} size={15} /> {locked ? "Locked" : "Customize"}
            </button>
          </div>
          <TitleInput
            value={meta.title}
            placeholder={meta.kind === "course" ? "What are you learning?" : "Untitled"}
            readOnly={locked}
            onChange={(title) => updatePage(ws.doc, pageId, { title })}
          />
          {!style.hideMeta && (
            <div className="page-meta small faint">
              {type && type.id !== "page" && (
                <span>
                  {type.icon} {type.name} ·{" "}
                </span>
              )}
              <span>Edited {timeAgo(meta.updatedAt)}</span>
              {meta.kind === "doc" && <CardCount pageId={pageId} />}
            </div>
          )}
          {!style.hideProperties && (
            <div className="page-props" inert={locked}>
              <Lazy>
                <PropertiesPanel ws={ws} pageId={pageId} />
              </Lazy>
            </div>
          )}
        </div>
        {meta.typeId === SKILL_TYPE_ID && !meta.deletedAt && (
          <div className="page-skill" inert={locked}>
            <ErrorBoundary>
              <Suspense fallback={null}>
                <SkillHeader ws={ws} pageId={pageId} />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
        <div className="page-body" ref={bodyRef} data-locked={lockAttr}>
          <Lazy>
            <View key={pageId} ws={ws} pageId={pageId} page={page} locked={locked} />
          </Lazy>
        </div>
        {meta.kind === "doc" && !style.hideBacklinks && <Backlinks pageId={pageId} />}
        {meta.kind === "doc" && !style.hideLocalGraph && <LocalGraph pageId={pageId} />}
      </div>
      {iconAnchor && (
        <EmojiPicker
          anchor={iconAnchor}
          onPick={(icon) => setPageEmoji(ws, pageId, icon)}
          onUploadImage={(file) => setPageIconImage(ws, pageId, file, toast)}
          onClose={() => setIconAnchor(null)}
        />
      )}
      {customize && <CustomizePanel pageId={pageId} kind={meta.kind} anchor={customize} onClose={() => setCustomize(null)} />}
    </div>
  );
}

/** Collapsible Obsidian-style local graph under a document. */
function LocalGraph({ pageId }: { pageId: string }) {
  const { ws } = useApp();
  const [open, setOpen] = useState(() => localStorage.getItem("basalt:local-graph") === "1");
  return (
    <section className="local-graph">
      <button
        className="backlinks-head as-button"
        onClick={() => {
          localStorage.setItem("basalt:local-graph", open ? "0" : "1");
          setOpen(!open);
        }}
      >
        {open ? "▾" : "▸"} Local graph
      </button>
      {open && (
        <div className="local-graph-frame">
          <Lazy>
            <GraphView ws={ws} focusPageId={pageId} compact />
          </Lazy>
        </div>
      )}
    </section>
  );
}

/** "12 flashcards · Study" when a page contains cards. */
function CardCount({ pageId }: { pageId: string }) {
  const { ws } = useApp();
  const [count, setCount] = useState(() => pageCards(ws.doc, pageId).length);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        setCount(pageCards(ws.doc, pageId).length);
      }, 1500);
    };
    const map = pagesMap(ws.doc);
    map.observeDeep(update);
    return () => {
      map.unobserveDeep(update);
      if (t) clearTimeout(t);
    };
  }, [ws, pageId]);
  if (!count) return null;
  return (
    <span>
      {" · "}
      <button
        className="link-button"
        onClick={() => navigate({ name: "view", wsId: ws.id, view: "learn", deck: pageId })}
        title="Review this page's flashcards"
      >
        🃏 {count} flashcard{count === 1 ? "" : "s"} · Study
      </button>
    </span>
  );
}

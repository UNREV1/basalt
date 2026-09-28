// Database page kind: objects of one type (Anytype "set" semantics by default,
// or only this page's children like a Notion database) shown as a table,
// board, gallery, list or calendar. View settings live in page.get("view").

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { DEFAULT_TYPE_ID, createPage, getPage, type ObjectType } from "../../../shared/model.ts";
import { EmojiPicker, Icon } from "../../components/properties/PropertiesPanel.tsx";
import {
  createType,
  defaultDatabaseProps,
  plural,
  toDateKey,
  typeCounts,
} from "../../components/properties/propUtils.ts";
import { usePage, usePages, useTypes, useY } from "../../lib/hooks.ts";
import { getSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import type { PageViewProps } from "../types.ts";
import BoardLayout from "./BoardLayout.tsx";
import CalendarLayout from "./CalendarLayout.tsx";
import { GalleryLayout, ListLayout } from "./GalleryLayout.tsx";
import { applyView, collectRows, defaultsFromFilters, readView, type Scope, type ViewSettings } from "./query.ts";
import { EmptyRows, type LayoutProps, type NewRowInit, type ViewStore } from "./shared.tsx";
import { ObjectTable } from "./TableLayout.tsx";
import { Toolbar } from "./Toolbar.tsx";
import "./database.css";

const VIEW_ORIGIN = "basalt:db-view";

export default function DatabaseView({ ws, pageId, page }: PageViewProps) {
  const { meta } = usePage(ws, pageId);
  const livePage = getPage(ws.doc, pageId) ?? page;
  const viewMap = livePage.get("view") as Y.Map<any> | undefined;
  useY(viewMap);
  const types = useTypes(ws);
  const pages = usePages(ws);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Pages created before the database container existed (or converted from another kind) get one lazily.
  useEffect(() => {
    if (viewMap) return;
    ws.doc.transact(() => {
      if (!livePage.get("view")) livePage.set("view", new Y.Map());
    }, VIEW_ORIGIN);
  }, [ws, livePage, viewMap]);

  const settings = readView(viewMap);
  const update = useCallback(
    (patch: Partial<ViewSettings>) => {
      const map = livePage.get("view") as Y.Map<any> | undefined;
      if (!map) return;
      ws.doc.transact(() => {
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === null) map.delete(k);
          else map.set(k, v);
        }
      }, VIEW_ORIGIN);
    },
    [ws, livePage],
  );
  const view: ViewStore = { settings, update };
  const type = settings.typeId ? types.find((t) => t.id === settings.typeId) : undefined;

  const rows = useMemo(
    () => (type ? collectRows(ws.doc, pages, type.id, settings.scope, pageId) : []),
    [ws, pages, type, settings.scope, pageId],
  );
  const queryKey = JSON.stringify([settings.filters, settings.sort]);
  const shown = useMemo(
    () => (type ? applyView(ws.doc, rows, type, settings, search) : []),
    // `queryKey` captures filters/sort by value (readView returns fresh arrays each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws, rows, type, queryKey, search],
  );

  if (!type) {
    return (
      <div className="db-root">
        <DatabaseSetup
          ws={ws}
          title={meta?.title ?? ""}
          missing={!!settings.typeId}
          onPick={(typeId, extra) => update({ typeId, ...extra })}
        />
      </div>
    );
  }

  const createRow = (init?: NewRowInit) => {
    const defaults = defaultsFromFilters(type, settings.filters);
    const id = createPage(ws.doc, {
      typeId: type.id,
      parentId: pageId,
      title: init?.title ?? defaults.title ?? "",
      props: { ...init?.fallbackProps, ...defaults.props, ...init?.props },
      createdBy: getSettings().identity.name,
    });
    setEditingId(id);
    if (search) setSearch("");
    return id;
  };

  // Toolbar "New": land the item somewhere visible in the current layout, unless a filter already decides.
  const onNew = () => {
    const fallbackProps: Record<string, unknown> = {};
    if (settings.layout === "calendar") {
      const date = type.props.find((p) => p.id === settings.dateProp && p.kind === "date") ?? type.props.find((p) => p.kind === "date");
      if (date) fallbackProps[date.id] = toDateKey(new Date());
    } else if (settings.layout === "board") {
      const group = type.props.find((p) => p.id === settings.groupBy && p.kind === "select") ?? type.props.find((p) => p.kind === "select");
      const first = group?.options?.[0];
      if (group && first) fallbackProps[group.id] = first.id;
    }
    createRow({ fallbackProps });
  };

  const filtered = !!search.trim() || shown.length !== rows.length;
  const layoutProps: LayoutProps = { ws, type, rows: shown, view, createRow, editingId, setEditingId };

  let body;
  switch (settings.layout) {
    case "board":
      body = <BoardLayout {...layoutProps} />;
      break;
    case "gallery":
      body = <GalleryLayout {...layoutProps} />;
      break;
    case "list":
      body = <ListLayout {...layoutProps} />;
      break;
    case "calendar":
      body = <CalendarLayout {...layoutProps} />;
      break;
    default:
      body = <ObjectTable {...layoutProps} filtered={filtered} />;
  }
  // Table renders its own "no results"; board and calendar keep their grid visible.
  const showEmpty = filtered && !shown.length && (settings.layout === "gallery" || settings.layout === "list");

  return (
    <div className={`db-root db-layout-${settings.layout}`}>
      <Toolbar
        ws={ws}
        type={type}
        view={view}
        shown={shown.length}
        total={rows.length}
        search={search}
        setSearch={setSearch}
        onNew={onNew}
      />
      {showEmpty && <EmptyRows typeName={type.name} />}
      {body}
    </div>
  );
}

// ---- first-open setup -------------------------------------------------------------------

function DatabaseSetup({
  ws,
  title,
  missing,
  onPick,
}: {
  ws: Workspace;
  title: string;
  missing: boolean;
  onPick: (typeId: string, extra?: Partial<ViewSettings>) => void;
}) {
  const types = useTypes(ws);
  const pages = usePages(ws);
  const counts = useMemo(() => typeCounts(pages), [pages]);
  const [name, setName] = useState(() => suggestTypeName(title));
  const [touched, setTouched] = useState(false);
  const [icon, setIcon] = useState("📋");
  const [scope, setScope] = useState<Scope>("type");
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!touched) setName(suggestTypeName(title));
  }, [title, touched]);
  const existing = types.filter((t) => t.id !== DEFAULT_TYPE_ID);

  const create = () => {
    const props = defaultDatabaseProps();
    const id = createType(ws.doc, { name: name.trim() || "Item", icon, props });
    onPick(id, {
      scope,
      groupBy: props.find((p) => p.kind === "select")?.id,
      dateProp: props.find((p) => p.kind === "date")?.id,
    });
  };

  return (
    <div className="db-setup">
      <div className="db-setup-head">
        <Icon name="layers" size={22} className="pp-accent" />
        <div>
          <h2>{missing ? "This database's type was deleted" : "What will this database collect?"}</h2>
          <p className="muted">
            A database shows objects of one type — tasks, books, people… Create a new type or reuse one; its properties
            become the columns.
          </p>
        </div>
      </div>

      <section className="db-setup-card">
        <div className="db-setup-label">New type</div>
        <div className="row db-setup-new">
          <button type="button" className="pp-icon-btn-lg" aria-label="Choose icon" onClick={(e) => setEmojiAnchor(e.currentTarget)}>
            {icon}
          </button>
          <input
            className="input grow"
            value={name}
            aria-label="Type name"
            placeholder="Item"
            onChange={(e) => {
              setTouched(true);
              setName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
          <button type="button" className="btn btn-primary" onClick={create}>
            Create
          </button>
        </div>
        <div className="db-setup-props">
          <span className="faint small">Starts with</span>
          <span className="db-setup-prop">
            <Icon name="select" size={13} /> Status
          </span>
          <span className="db-setup-prop">
            <Icon name="multi" size={13} /> Tags
          </span>
          <span className="db-setup-prop">
            <Icon name="calendar" size={13} /> Date
          </span>
        </div>
      </section>

      {existing.length > 0 && (
        <section>
          <div className="db-setup-label">Or show an existing type</div>
          <div className="db-setup-types">
            {existing.map((t) => (
              <TypeTile key={t.id} type={t} count={counts.get(t.id) ?? 0} onClick={() => onPick(t.id, { scope })} />
            ))}
          </div>
        </section>
      )}

      <label className="db-setup-scope">
        <input
          type="checkbox"
          checked={scope === "children"}
          onChange={(e) => setScope(e.target.checked ? "children" : "type")}
        />
        <span>
          Only show pages created inside this database
          <span className="faint small"> — otherwise every object of the type in the workspace appears here</span>
        </span>
      </label>

      {emojiAnchor && <EmojiPicker anchor={emojiAnchor} onClose={() => setEmojiAnchor(null)} onPick={setIcon} />}
    </div>
  );
}

function TypeTile({ type, count, onClick }: { type: ObjectType; count: number; onClick: () => void }) {
  return (
    <button type="button" className="db-type-tile" onClick={onClick}>
      <span className="db-type-tile-icon">{type.icon}</span>
      <span className="db-type-tile-name">{type.name}</span>
      <span className="faint small">
        {plural(count, "object")} · {plural(type.props.length, "property", "properties")}
      </span>
    </button>
  );
}

function suggestTypeName(title: string): string {
  const t = title.trim();
  if (!t) return "Item";
  // "Projects" -> "Project": a type names one object.
  if (t.length > 4 && /ies$/i.test(t)) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && /s$/i.test(t) && !/(ss|us|is|os)$/i.test(t)) return t.slice(0, -1);
  return t;
}

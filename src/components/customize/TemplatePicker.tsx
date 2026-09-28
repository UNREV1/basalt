// "New from template": the workspace's own templates (pages under the
// Templates system page) plus built-in starters.

import { useMemo } from "react";
import {
  PAGE_KINDS,
  TEMPLATES_SYSTEM,
  displayTitle,
  findSystemPage,
  getPage,
  pageMeta,
  pageText,
} from "../../../shared/model.ts";
import { useApp, usePages } from "../../lib/hooks.ts";
import { Icon, Modal } from "../ui.tsx";
import { newFromStarter, newFromTemplate } from "./actions.tsx";
import { PageIcon } from "./PageIcon.tsx";
import { STARTER_TEMPLATES } from "./starters.ts";

export function TemplatePicker({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const app = useApp();
  const { ws, openPage } = app;
  const pages = usePages(ws);
  const root = findSystemPage(ws.doc, TEMPLATES_SYSTEM);
  const templates = useMemo(
    () =>
      pages
        .filter((p) => root && p.parentId === root)
        .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
        .map((p) => ({ meta: p, snippet: pageText(ws.doc, p.id).replace(/\s+/g, " ").slice(0, 110) })),
    [pages, root, ws],
  );
  const parent = parentId ? getPage(ws.doc, parentId) : undefined;

  const pick = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <Modal
      title={
        <>
          <Icon name="template" /> New from template
          {parent && <span className="small muted ellipsis" style={{ fontWeight: 400 }}>in {displayTitle(pageMeta(parent))}</span>}
        </>
      }
      onClose={onClose}
      width={680}
    >
      <div className="tpl-section-head">
        <span className="menu-label">Your templates</span>
        {root && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => pick(() => openPage(root))}
            title="Templates are ordinary pages inside “Templates” — edit them like any page"
          >
            Manage
          </button>
        )}
      </div>
      {templates.length === 0 ? (
        <div className="tpl-empty small muted">
          Turn any page into a reusable template with <strong>••• → Save as template</strong>. Templates keep their
          content, sub-pages, properties, cover and style.
        </div>
      ) : (
        <div className="tpl-grid">
          {templates.map(({ meta, snippet }) => (
            <div key={meta.id} className="tpl-card-wrap">
              <button className="tpl-card" onClick={() => pick(() => newFromTemplate(app, meta.id, parentId))}>
                <span className="tpl-icon">
                  <PageIcon meta={meta} />
                </span>
                <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                  <strong className="ellipsis">{displayTitle(meta)}</strong>
                  <span className="small muted tpl-snippet">
                    {snippet || PAGE_KINDS.find((k) => k.kind === meta.kind)?.description}
                  </span>
                </span>
              </button>
              <button
                className="icon-btn tpl-edit"
                title={`Edit “${displayTitle(meta)}” template`}
                aria-label={`Edit ${displayTitle(meta)} template`}
                onClick={() => pick(() => openPage(meta.id))}
              >
                <Icon name="edit" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="tpl-section-head">
        <span className="menu-label">Starter templates</span>
      </div>
      <div className="tpl-grid">
        {STARTER_TEMPLATES.map((s) => (
          <button key={s.id} className="tpl-card" onClick={() => pick(() => newFromStarter(app, s, parentId))}>
            <span className="tpl-icon">{s.icon}</span>
            <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
              <strong className="ellipsis">{s.name}</strong>
              <span className="small muted tpl-snippet">{s.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

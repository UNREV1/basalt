import { useMemo } from "react";
import { deletePageForever, displayTitle, restorePage } from "../../shared/model.ts";
import { useApp, usePages } from "../lib/hooks.ts";
import { timeAgo } from "./ui.tsx";
import { PageIcon } from "./customize/PageIcon.tsx";

export function TrashView() {
  const { ws, openPage, toast } = useApp();
  const all = usePages(ws, true);
  // Only show the roots of trashed subtrees (children go with their parent).
  const trashed = useMemo(() => {
    const byId = new Map(all.map((p) => [p.id, p]));
    return all
      .filter((p) => p.deletedAt)
      .filter((p) => {
        const parent = p.parentId ? byId.get(p.parentId) : undefined;
        return !parent || parent.deletedAt !== p.deletedAt;
      })
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
  }, [all]);

  return (
    <div className="main-scroll">
      <div className="page-column">
        <div className="view-header">
          <h1>Trash</h1>
          <span className="spacer" />
          {trashed.length > 0 && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (!confirm(`Permanently delete ${trashed.length} page(s) for everyone?`)) return;
                trashed.forEach((p) => deletePageForever(ws.doc, p.id));
                toast("Trash emptied");
              }}
            >
              Empty trash
            </button>
          )}
        </div>
        {trashed.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🗑️</div>
            <div>Trash is empty</div>
          </div>
        ) : (
          <div className="col" style={{ gap: 4 }}>
            {trashed.map((p) => (
              <div key={p.id} className="trash-row">
                <button className="row grow" style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", minWidth: 0 }} onClick={() => openPage(p.id)}>
                  <PageIcon meta={p} />
                  <span className="ellipsis">{displayTitle(p)}</span>
                  <span className="small faint">deleted {timeAgo(p.deletedAt ?? 0)}</span>
                </button>
                <button className="btn btn-sm" onClick={() => restorePage(ws.doc, p.id)}>
                  Restore
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    if (confirm(`Permanently delete “${displayTitle(p)}” for everyone?`)) deletePageForever(ws.doc, p.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

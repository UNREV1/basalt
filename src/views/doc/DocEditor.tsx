// Notion-style block editor with Obsidian-style [[links]], collaborative
// cursors, LaTeX math and inline images. Content lives in page.get("content").

import { useContext, useEffect, useMemo, useState } from "react";
import type * as Y from "yjs";
import "@blocknote/mantine/style.css";
import { combineByGroup, filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from "@blocknote/core";
import { SuggestionMenu } from "@blocknote/core/extensions";
import { withCollaboration } from "@blocknote/core/yjs";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { createPage, defaultIcon, displayTitle, listPages, type PageKind } from "../../../shared/model.ts";
import { useApp, useLatest } from "../../lib/hooks.ts";
import { getSettings } from "../../lib/settings.ts";
import { fileToStoredUrl } from "../../lib/files.ts";
import { useTheme } from "../../lib/theme.ts";
import type { PageViewProps } from "../types.ts";
import { editorSchema, type EditorSchema } from "./blocks.tsx";
import { Outline } from "./Outline.tsx";
import { EMBED_KINDS, EmbedChain } from "./PageEmbed.tsx";
import { PageIcon } from "../../components/customize/PageIcon.tsx";
import "./doc.css";

type Editor = BlockNoteEditor<EditorSchema["blockSchema"], EditorSchema["inlineContentSchema"], EditorSchema["styleSchema"]>;

function scoreTitle(title: string, q: string): number {
  const t = title.toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 50;
  const i = t.indexOf(q);
  if (i >= 0) return 30 - Math.min(i, 20);
  // Subsequence match ("mlnts" -> "my lecture notes")
  let j = 0;
  for (const ch of t) if (ch === q[j]) j++;
  return j === q.length ? 5 : 0;
}

export default function DocEditor({ ws, pageId, page, locked = false }: PageViewProps) {
  const fragment = page.get("content") as Y.XmlFragment;
  const theme = useTheme();
  const app = useApp();
  const appRef = useLatest(app);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const chain = useContext(EmbedChain);
  const embedChain = useMemo(() => [...chain, pageId], [chain, pageId]);

  const editor = useCreateBlockNote(
    withCollaboration({
      schema: editorSchema,
      collaboration: {
        fragment,
        user: { ...getSettings().identity },
        provider: { awareness: ws.awareness },
        showCursorLabels: "activity" as const,
      },
      uploadFile: async (file: File) => {
        try {
          setUploadError(null);
          return await fileToStoredUrl(file);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : String(err));
          throw err;
        }
      },
    }),
    [fragment],
  ) as unknown as Editor;

  // Keep "last edited" fresh for local edits only (remote peers stamp their own).
  useEffect(() => {
    let last = 0;
    const onChange = (_e: unknown, tr: Y.Transaction) => {
      if (!tr.local) return;
      const now = Date.now();
      if (now - last < 3000) return;
      last = now;
      page.set("updatedAt", now);
    };
    fragment.observeDeep(onChange);
    return () => fragment.unobserveDeep(onChange);
  }, [fragment, page]);

  useEffect(() => {
    ws.setPresence({ pageId });
  }, [ws, pageId]);

  const insertLink = (ed: Editor, id: string, title: string) => {
    ed.insertInlineContent([{ type: "pageLink", props: { pageId: id, title } }, " "]);
  };

  const pageItems = useMemo(
    () =>
      async (query: string): Promise<DefaultReactSuggestionItem[]> => {
        const q = query.trim().toLowerCase();
        const scored = listPages(ws.doc)
          .filter((p) => p.id !== pageId)
          .map((p) => ({ p, s: scoreTitle(displayTitle(p), q) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s || b.p.updatedAt - a.p.updatedAt)
          .slice(0, 8);
        const items: DefaultReactSuggestionItem[] = scored.map(({ p }) => ({
          title: displayTitle(p),
          icon: <PageIcon meta={p} className="suggest-icon" />,
          onItemClick: () => insertLink(editor, p.id, displayTitle(p)),
        }));
        const exact = scored.some(({ p }) => displayTitle(p).toLowerCase() === q);
        if (query.trim() && !exact) {
          items.push({
            title: `Create “${query.trim()}”`,
            subtext: "New page inside this one",
            icon: <span className="suggest-icon">＋</span>,
            onItemClick: () => {
              const id = createPage(ws.doc, {
                title: query.trim(),
                parentId: pageId,
                createdBy: getSettings().identity.name,
              });
              insertLink(editor, id, query.trim());
            },
          });
        }
        return items;
      },
    [ws, pageId, editor],
  );

  const slashItems = useMemo(() => {
    const subPage = (kind: PageKind, title: string, aliases: string[], subtext: string): DefaultReactSuggestionItem => ({
      title,
      subtext,
      aliases,
      group: "Pages",
      icon: <span className="suggest-icon">{defaultIcon(kind)}</span>,
      onItemClick: () => {
        const id = createPage(ws.doc, { kind, parentId: pageId, createdBy: getSettings().identity.name });
        // Canvases, databases and notebooks live right here in the page;
        // a sub-page is a link you open.
        if (EMBED_KINDS.includes(kind)) {
          insertOrUpdateBlockForSlashMenu(editor, { type: "embed", props: { pageId: id } } as never);
          return;
        }
        insertLink(editor, id, "Untitled");
        appRef.current.openPage(id);
      },
    });
    const custom: DefaultReactSuggestionItem[] = [
      {
        title: "Link to page",
        subtext: "Type [[ to link any page",
        aliases: ["link", "wikilink", "mention", "[["],
        group: "Pages",
        icon: <span className="suggest-icon">🔗</span>,
        onItemClick: () => editor.getExtension(SuggestionMenu)?.openSuggestionMenu("[["),
      },
      subPage("doc", "Sub-page", ["page", "subpage", "child"], "Nested page"),
      subPage("database", "Database", ["table", "board", "kanban", "db"], "A table / board right in this page"),
      subPage("board", "Whiteboard", ["canvas", "excalidraw", "draw", "diagram", "sketch", "shapes"], "Shapes, arrows and diagrams right in this page"),
      {
        title: "Painting",
        subtext: "Pressure brushes and layers right in this page",
        aliases: ["paint", "krita", "brush", "draw", "art", "svg", "canvas"],
        group: "Pages",
        icon: <span className="suggest-icon">🖌️</span>,
        onItemClick: () => {
          const id = createPage(ws.doc, { kind: "board", canvasMode: "paint", icon: "🖌️", parentId: pageId, createdBy: getSettings().identity.name });
          insertOrUpdateBlockForSlashMenu(editor, { type: "embed", props: { pageId: id } } as never);
        },
      },
      subPage("notebook", "Code notebook", ["code", "jupyter", "python", "javascript", "run"], "Runnable code cells in this page"),
      {
        title: "Embed a page",
        subtext: "Show another page inside this one",
        aliases: ["embed", "include", "transclude", "![["],
        group: "Pages",
        icon: <span className="suggest-icon">⧉</span>,
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "embed", props: { pageId: "" } } as never),
      },
      {
        title: "Equation",
        subtext: "Display math (LaTeX)",
        aliases: ["math", "latex", "formula", "katex", "tex"],
        group: "Advanced",
        icon: <span className="suggest-icon">∑</span>,
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "math" }),
      },
      {
        title: "Inline equation",
        subtext: "Math inside text",
        aliases: ["inline math", "latex", "$"],
        group: "Advanced",
        icon: <span className="suggest-icon">𝑥</span>,
        onItemClick: () => editor.insertInlineContent([{ type: "inlineMath", props: { latex: "" } }]),
      },
      {
        title: "Flashcard",
        subtext: "Question :: Answer (spaced repetition)",
        aliases: ["card", "flashcard", "anki", "srs", "quiz"],
        group: "Learning",
        icon: <span className="suggest-icon">🃏</span>,
        onItemClick: () => {
          const block = insertOrUpdateBlockForSlashMenu(editor, {
            type: "paragraph",
            content: [{ type: "text", text: "Question :: Answer", styles: {} }],
          } as never);
          editor.setTextCursorPosition(block, "start");
        },
      },
      {
        title: "Cloze deletion",
        subtext: "Hide {{c1::part}} of a sentence",
        aliases: ["cloze", "fill in", "blank"],
        group: "Learning",
        icon: <span className="suggest-icon">▭</span>,
        onItemClick: () => {
          insertOrUpdateBlockForSlashMenu(editor, {
            type: "paragraph",
            content: [{ type: "text", text: "The mitochondria is the {{c1::powerhouse}} of the cell.", styles: {} }],
          } as never);
        },
      },
    ];
    return (query: string) =>
      Promise.resolve(filterSuggestionItems(combineByGroup(getDefaultReactSlashMenuItems(editor as any), custom), query));
  }, [editor, ws, pageId, appRef]);

  return (
    <EmbedChain.Provider value={embedChain}>
      <div className="doc-editor">
        <Outline fragment={fragment} />
        {uploadError && (
          <div className="doc-upload-error" onClick={() => setUploadError(null)}>
            {uploadError}
          </div>
        )}
        <BlockNoteView editor={editor} theme={theme} slashMenu={false} editable={!locked}>
          <SuggestionMenuController triggerCharacter="/" getItems={slashItems} />
          <SuggestionMenuController triggerCharacter="[[" getItems={pageItems} />
          <SuggestionMenuController triggerCharacter="@" getItems={pageItems} />
        </BlockNoteView>
      </div>
    </EmbedChain.Provider>
  );
}

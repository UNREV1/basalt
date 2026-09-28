// React implementations of Basalt's custom BlockNote nodes. Configs come from
// shared/schema.ts so the stored structure matches headless conversion.

import { useEffect, useRef, useState } from "react";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import katex from "katex";
import "katex/dist/katex.min.css";
import { embedBlockConfig, inlineMathConfig, mathBlockConfig, pageLinkConfig } from "../../../shared/schema.ts";
import { displayTitle } from "../../../shared/model.ts";
import { PageIcon } from "../../components/customize/PageIcon.tsx";
import { useApp, usePage } from "../../lib/hooks.ts";
import { pageHref } from "../../lib/router.ts";
import { PageEmbed } from "./PageEmbed.tsx";

function Katex({ latex, display }: { latex: string; display: boolean }) {
  const html = katex.renderToString(latex || "\\;", { displayMode: display, throwOnError: false, output: "html" });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function PageLinkChip({ pageId, fallback }: { pageId: string; fallback: string }) {
  const { ws, openPage } = useApp();
  const { meta } = usePage(ws, pageId);
  const missing = !meta || !!meta.deletedAt;
  return (
    <a
      className={`page-link${missing ? " missing" : ""}`}
      href={pageHref(ws.id, pageId)}
      contentEditable={false}
      onClick={(e) => {
        e.preventDefault();
        if (!missing) openPage(pageId);
      }}
      title={missing ? "This page was deleted" : undefined}
    >
      <span className="page-link-icon">{meta ? <PageIcon meta={meta} /> : "📄"}</span>
      <span className="page-link-title">{meta ? displayTitle(meta) : fallback || "Missing page"}</span>
    </a>
  );
}

export const PageLink = createReactInlineContentSpec(pageLinkConfig, {
  render: ({ inlineContent }) => (
    <PageLinkChip pageId={inlineContent.props.pageId} fallback={inlineContent.props.title} />
  ),
});

function MathEditor({
  initial,
  display,
  onDone,
}: {
  initial: string;
  display: boolean;
  onDone: (latex: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div className="math-editor" contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
      <textarea
        ref={ref}
        className="textarea mono"
        rows={display ? 3 : 1}
        value={value}
        placeholder={display ? "\\int_0^1 x^2\\,dx = \\tfrac13" : "e^{i\\pi}+1=0"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onDone(null);
          if (e.key === "Enter" && (!display || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onDone(value);
          }
        }}
      />
      <div className="math-editor-preview">
        <Katex latex={value} display={display} />
      </div>
      <div className="row">
        <span className="small muted">{display ? "Ctrl+Enter to save" : "Enter to save"} · Esc to cancel</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => onDone(value)}>
          Done
        </button>
      </div>
    </div>
  );
}

export const InlineMath = createReactInlineContentSpec(inlineMathConfig, {
  render: function InlineMathView({ inlineContent, updateInlineContent, editor }) {
    const [editing, setEditing] = useState(!inlineContent.props.latex);
    return (
      <span className="inline-math" contentEditable={false}>
        <span
          className="inline-math-render"
          onClick={() => editor.isEditable && setEditing(true)}
          title="Click to edit equation"
        >
          {inlineContent.props.latex ? <Katex latex={inlineContent.props.latex} display={false} /> : <span className="faint">math</span>}
        </span>
        {editing && (
          <span className="inline-math-popover">
            <MathEditor
              initial={inlineContent.props.latex}
              display={false}
              onDone={(latex) => {
                setEditing(false);
                if (latex !== null) updateInlineContent({ type: "inlineMath", props: { latex } });
              }}
            />
          </span>
        )}
      </span>
    );
  },
});

export const MathBlock = createReactBlockSpec(mathBlockConfig, {
  render: function MathBlockView({ block, editor }) {
    const [editing, setEditing] = useState(!block.props.latex);
    return (
      <div className="math-block" contentEditable={false}>
        <div className="math-block-render" onClick={() => editor.isEditable && setEditing(true)}>
          {block.props.latex ? (
            <Katex latex={block.props.latex} display />
          ) : (
            <span className="faint">Click to add an equation (LaTeX)</span>
          )}
        </div>
        {editing && (
          <MathEditor
            initial={block.props.latex}
            display
            onDone={(latex) => {
              setEditing(false);
              if (latex !== null) editor.updateBlock(block, { props: { latex } });
            }}
          />
        )}
      </div>
    );
  },
});

export const EmbedBlock = createReactBlockSpec(embedBlockConfig, {
  // Not selectable: the embedded view gets every event, never the editor
  // around it (typing in a database cell must not edit this page).
  meta: { selectable: false },
  render: ({ block, editor }) => (
    <div className="embed-block" contentEditable={false}>
      <PageEmbed
        pageId={block.props.pageId}
        height={block.props.height}
        editable={editor.isEditable}
        onChange={(props) => editor.updateBlock(block, { props })}
      />
    </div>
  ),
});

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, math: MathBlock(), embed: EmbedBlock() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, pageLink: PageLink, inlineMath: InlineMath },
});

export type EditorSchema = typeof editorSchema;

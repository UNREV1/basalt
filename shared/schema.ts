// BlockNote schema pieces shared by the browser editor, headless converters
// and the Node MCP server. The React editor re-implements `render` with live
// components, but the configs (and thus the stored Yjs structure) are identical.
// Any custom node stored in documents MUST be registered here, or headless
// conversion of pages containing it will fail.

import {
  BlockNoteSchema,
  createBlockSpec,
  createInlineContentSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";

export const pageLinkConfig = {
  type: "pageLink",
  propSchema: {
    pageId: { default: "" },
    /** Title at the time the link was made; used only as a fallback. */
    title: { default: "" },
  },
  content: "none",
} as const;

export const inlineMathConfig = {
  type: "inlineMath",
  propSchema: { latex: { default: "" } },
  content: "none",
} as const;

export const mathBlockConfig = {
  type: "math",
  propSchema: { latex: { default: "" } },
  content: "none",
} as const;

/**
 * Another page shown live inside this one (a canvas, database, notebook…).
 * Markdown: `![[Title]]` on its own line, as in Obsidian.
 */
export const embedBlockConfig = {
  type: "embed",
  propSchema: {
    pageId: { default: "" },
    /** Height in px for canvases (below 500 Excalidraw switches to its phone layout); other kinds size to their content. */
    height: { default: 520 },
  },
  content: "none",
} as const;

const pageLinkDomSpec = createInlineContentSpec(pageLinkConfig, {
  render: (ic) => {
    const span = document.createElement("span");
    span.className = "bn-page-link";
    span.dataset.pageId = ic.props.pageId;
    span.textContent = `[[${ic.props.title || ic.props.pageId}]]`;
    return { dom: span };
  },
});

const inlineMathDomSpec = createInlineContentSpec(inlineMathConfig, {
  render: (ic) => {
    const span = document.createElement("span");
    span.textContent = `$${ic.props.latex}$`;
    return { dom: span };
  },
});

const mathBlockDomSpec = createBlockSpec(mathBlockConfig, {
  render: (block) => {
    const p = document.createElement("p");
    p.textContent = `$$${block.props.latex}$$`;
    return { dom: p };
  },
});

const embedBlockDomSpec = createBlockSpec(embedBlockConfig, {
  render: (block) => {
    const p = document.createElement("p");
    p.dataset.pageId = block.props.pageId;
    p.textContent = `![[${block.props.pageId}]]`;
    return { dom: p };
  },
});

/** Schema without React; use for headless conversion (browser or server). */
export const headlessSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, math: mathBlockDomSpec(), embed: embedBlockDomSpec() },
  inlineContentSpecs: { ...defaultInlineContentSpecs, pageLink: pageLinkDomSpec, inlineMath: inlineMathDomSpec },
});

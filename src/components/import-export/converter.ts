// Browser BlockConverter for the shared vault logic: a headless BlockNote
// editor with the app's schema (same stored structure as the live editor).

import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYXmlFragment, yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import type * as Y from "yjs";
import { headlessSchema } from "../../../shared/schema.ts";
import type { BlockConverter } from "../../../shared/vault.ts";

let editor: BlockNoteEditor<any, any, any> | null = null;

function getEditor(): BlockNoteEditor<any, any, any> {
  editor ??= BlockNoteEditor.create({ schema: headlessSchema });
  return editor;
}

export function browserConverter(): BlockConverter {
  return {
    parseMarkdown: (md: string) => getEditor().tryParseMarkdownToBlocks(md) as unknown[],
    blocksToMarkdown: (blocks: unknown[]) => getEditor().blocksToMarkdownLossy(blocks as any),
    fragmentToBlocks: (fragment: Y.XmlFragment) => yXmlFragmentToBlocks(getEditor(), fragment) as unknown[],
    blocksToFragment: (blocks: unknown[], fragment: Y.XmlFragment) => {
      blocksToYXmlFragment(getEditor(), blocks as any, fragment);
    },
  };
}

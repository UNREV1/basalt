// BlockNote conversion in Node via @blocknote/server-util, using the same
// schema as the app so page links and math survive the round trip.

import type * as Y from "yjs";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { headlessSchema } from "../shared/schema.ts";
import type { BlockConverter } from "../shared/vault.ts";

let editor: ServerBlockNoteEditor<any, any, any> | null = null;

function getEditor(): ServerBlockNoteEditor<any, any, any> {
  editor ??= ServerBlockNoteEditor.create({ schema: headlessSchema }) as ServerBlockNoteEditor<any, any, any>;
  return editor;
}

export function nodeConverter(): BlockConverter {
  return {
    parseMarkdown: (md: string) => getEditor().tryParseMarkdownToBlocks(md),
    blocksToMarkdown: (blocks: unknown[]) => getEditor().blocksToMarkdownLossy(blocks as any),
    fragmentToBlocks: (fragment: Y.XmlFragment) => getEditor().yXmlFragmentToBlocks(fragment),
    blocksToFragment: (blocks: unknown[], fragment: Y.XmlFragment) => {
      getEditor().blocksToYXmlFragment(blocks as any, fragment);
    },
  };
}

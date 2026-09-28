import { setPageStyle, updatePage } from "../../../shared/model.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { fileToIconDataUrl } from "./image.ts";

/** Emoji icon (or "" to remove); clears any image icon. */
export function setPageEmoji(ws: Workspace, pageId: string, emoji: string) {
  ws.doc.transact(() => {
    updatePage(ws.doc, pageId, { icon: emoji });
    setPageStyle(ws.doc, pageId, { iconImage: null });
  });
}

/** Image icon, downscaled to 128px. The emoji stays as a fallback for text-only places (exports, MCP). */
export async function setPageIconImage(ws: Workspace, pageId: string, file: File, toast: (msg: string) => void) {
  try {
    setPageStyle(ws.doc, pageId, { iconImage: await fileToIconDataUrl(file) });
  } catch (err) {
    toast(err instanceof Error ? err.message : "Couldn’t use that image");
  }
}

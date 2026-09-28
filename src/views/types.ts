import type * as Y from "yjs";
import type { Workspace } from "../lib/workspace.ts";

/** Props every page-kind view receives (doc, board, paint, notebook, database, course). */
export interface PageViewProps {
  ws: Workspace;
  pageId: string;
  /** The page's Y.Map (see shared/model.ts for its layout). */
  page: Y.Map<any>;
  /** The page is locked (read-only for everyone); see Customize → Lock. */
  locked?: boolean;
  /** Shown inside another page (an embed block), not as the open page. */
  embedded?: boolean;
}

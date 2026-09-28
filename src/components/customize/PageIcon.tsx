// A page's icon as shown in lists, breadcrumbs and chips: the uploaded image
// icon (page style) when there is one, else the emoji, else the kind's default.

import { defaultIcon, getPage, getPageStyle, type PageMeta } from "../../../shared/model.ts";
import { useApp } from "../../lib/hooks.ts";

export function PageIcon({
  meta,
  className,
  fallback = true,
}: {
  meta: Pick<PageMeta, "id" | "icon" | "kind">;
  className?: string;
  /** Show the kind's default emoji when the page has no icon. */
  fallback?: boolean;
}) {
  const { ws } = useApp();
  const image = getPageStyle(getPage(ws.doc, meta.id)).iconImage;
  if (image) {
    return (
      <span className={`page-icon-glyph${className ? ` ${className}` : ""}`}>
        <img className="page-icon-img" src={image} alt="" draggable={false} />
      </span>
    );
  }
  const text = meta.icon || (fallback ? defaultIcon(meta.kind) : "");
  return text ? <span className={className}>{text}</span> : null;
}

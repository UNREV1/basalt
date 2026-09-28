// Page utilities shared by the top bar, sidebar, home and Ctrl+K: duplicate,
// templates, move and customize. Dialogs are requested with window events and
// rendered by <PageDialogsHost/> (mounted once, in the sidebar), so any
// component — even one that is about to unmount, like the quick switcher —
// can open them.

import { useEffect, useState } from "react";
import {
  TEMPLATES_SYSTEM,
  createFromTemplate,
  createPage,
  displayTitle,
  duplicatePage,
  findSystemPage,
  getPage,
  isTemplatePage,
  pageMeta,
  saveAsTemplate,
  setPageStyle,
} from "../../../shared/model.ts";
import type { AppContextValue } from "../../lib/hooks.ts";
import { setPageMarkdown } from "../../lib/markdown.ts";
import { getSettings } from "../../lib/settings.ts";
import { MovePagePicker } from "./MovePagePicker.tsx";
import type { StarterTemplate } from "./starters.ts";
import { TemplatePicker } from "./TemplatePicker.tsx";

export const TEMPLATE_EVENT = "basalt:new-from-template";
export const MOVE_EVENT = "basalt:move-page";
export const CUSTOMIZE_EVENT = "basalt:customize-page";

export function openTemplatePicker(parentId: string | null = null) {
  window.dispatchEvent(new CustomEvent(TEMPLATE_EVENT, { detail: { parentId } }));
}

export function openMovePicker(pageId: string) {
  window.dispatchEvent(new CustomEvent(MOVE_EVENT, { detail: { pageId } }));
}

/** Ask the top bar to open "Customize page" for the current page. */
export function openCustomize(pageId: string) {
  window.dispatchEvent(new CustomEvent(CUSTOMIZE_EVENT, { detail: { pageId } }));
}

const me = () => getSettings().identity.name;

export function duplicateAndOpen(app: AppContextValue, id: string, includeChildren = false) {
  const copy = duplicatePage(app.ws.doc, id, { includeChildren, createdBy: me() });
  if (!copy) return;
  app.openPage(copy);
  app.toast(includeChildren ? "Duplicated with sub-pages" : "Duplicated");
}

const TEMPLATES_INTRO = [
  "Every page inside **Templates** is a reusable template. Pick one from **New from template** in the sidebar, on Home or with Ctrl/⌘ K.",
  "",
  "Templates copy their content, sub-pages, properties, cover and page style. Edit them here like any other page.",
].join("\n");

export function saveTemplate(app: AppContextValue, id: string) {
  const { ws } = app;
  const page = getPage(ws.doc, id);
  if (!page) return;
  const hadRoot = !!findSystemPage(ws.doc, TEMPLATES_SYSTEM);
  const tpl = saveAsTemplate(ws.doc, id, me());
  if (!tpl) return;
  if (!hadRoot) {
    const root = findSystemPage(ws.doc, TEMPLATES_SYSTEM);
    if (root) setPageMarkdown(ws, root, TEMPLATES_INTRO);
  }
  app.toast(`Saved “${displayTitle(pageMeta(page))}” as a template`);
}

export function newFromTemplate(app: AppContextValue, templateId: string, parentId: string | null) {
  const id = createFromTemplate(app.ws.doc, templateId, { parentId, createdBy: me() });
  if (id) app.openPage(id);
}

export function newFromStarter(app: AppContextValue, starter: StarterTemplate, parentId: string | null) {
  const { ws } = app;
  const id = createPage(ws.doc, { icon: starter.icon, parentId, createdBy: me() });
  setPageMarkdown(ws, id, starter.markdown());
  if (starter.style) setPageStyle(ws.doc, id, starter.style);
  app.openPage(id);
}

export function isTemplate(app: AppContextValue, id: string) {
  return isTemplatePage(app.ws.doc, id);
}

export function PageDialogsHost() {
  const [template, setTemplate] = useState<{ parentId: string | null } | null>(null);
  const [move, setMove] = useState<string | null>(null);
  useEffect(() => {
    const onTemplate = (e: Event) => setTemplate({ parentId: (e as CustomEvent).detail?.parentId ?? null });
    const onMove = (e: Event) => setMove((e as CustomEvent).detail?.pageId ?? null);
    window.addEventListener(TEMPLATE_EVENT, onTemplate);
    window.addEventListener(MOVE_EVENT, onMove);
    return () => {
      window.removeEventListener(TEMPLATE_EVENT, onTemplate);
      window.removeEventListener(MOVE_EVENT, onMove);
    };
  }, []);
  return (
    <>
      {template && <TemplatePicker parentId={template.parentId} onClose={() => setTemplate(null)} />}
      {move && <MovePagePicker pageId={move} onClose={() => setMove(null)} />}
    </>
  );
}

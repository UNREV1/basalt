// Read-only enforcement for locked pages, applied around any page view.
//
// Views should ideally honor the lock themselves (the DocEditor via
// BlockNoteView's `editable`, Excalidraw via `viewModeEnabled`); this guard
// makes a lock effective even for views that don't, by swallowing editing
// input in the capture phase before the view's own handlers see it.

import { useEffect, type RefObject } from "react";

const NAV_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
  "Escape", "Tab", "Shift", "Control", "Alt", "Meta", "CapsLock", "ContextMenu",
]);
// Copy, select all, find, plus the app's global shortcuts.
const MOD_KEYS = new Set(["c", "a", "f", "k", "p", "\\", "=", "-", "0"]);

function allowedKey(e: KeyboardEvent): boolean {
  if (NAV_KEYS.has(e.key) || /^F\d+$/.test(e.key)) return true;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.altKey && e.code === "KeyN") return true;
  return mod && !e.altKey && MOD_KEYS.has(e.key.toLowerCase());
}

export function useLockGuard(ref: RefObject<HTMLElement | null>, locked: boolean, opts: { canvas?: boolean } = {}) {
  const canvas = !!opts.canvas;
  useEffect(() => {
    const root = ref.current;
    if (!root || !locked) return;
    const swallow = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      // Tab would indent list items: hide it from the editor but keep focus navigation.
      if (e.key === "Tab" && (e.target as HTMLElement | null)?.isContentEditable) e.stopPropagation();
      else if (!allowedKey(e)) swallow(e);
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t instanceof HTMLInputElement && (t.type === "checkbox" || t.type === "radio")) swallow(e);
    };
    const onPointer = (e: PointerEvent) => {
      // Canvas views draw on pointerdown; wheel/trackpad panning still works.
      if (e.button === 0 || e.pointerType !== "mouse") swallow(e);
    };
    const blocked: [string, EventListener][] = [
      ["keydown", onKey as EventListener],
      ["beforeinput", swallow],
      ["paste", swallow],
      ["cut", swallow],
      ["drop", swallow],
      ["dragstart", swallow],
      ["click", onClick as EventListener],
    ];
    if (canvas) blocked.push(["pointerdown", onPointer as EventListener]);
    for (const [type, fn] of blocked) root.addEventListener(type, fn, true);

    // Keep phone keyboards from opening on editable content while locked.
    const quiet = () => {
      root.querySelectorAll<HTMLElement>('[contenteditable="true"]:not([data-lock-quiet])').forEach((el) => {
        el.dataset.lockQuiet = el.getAttribute("inputmode") ?? "";
        el.setAttribute("inputmode", "none");
      });
    };
    quiet();
    const mo = new MutationObserver(quiet);
    mo.observe(root, { childList: true, subtree: true });
    const active = document.activeElement as HTMLElement | null;
    if (active && root.contains(active) && active.isContentEditable) active.blur();

    return () => {
      for (const [type, fn] of blocked) root.removeEventListener(type, fn, true);
      mo.disconnect();
      root.querySelectorAll<HTMLElement>("[data-lock-quiet]").forEach((el) => {
        const prev = el.dataset.lockQuiet;
        if (prev) el.setAttribute("inputmode", prev);
        else el.removeAttribute("inputmode");
        delete el.dataset.lockQuiet;
      });
    };
  }, [ref, locked, canvas]);
}

// Drag handle on the sidebar's right edge (desktop). Width is per device.

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { SIDEBAR_MAX, SIDEBAR_MIN } from "../../lib/appearance.ts";
import { defaultAppearance, updateAppearance, useSettings } from "../../lib/settings.ts";

const clamp = (w: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));

export function SidebarResizer() {
  const width = useSettings().appearance.sidebarWidth;

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const root = document.documentElement;
    const startX = e.clientX;
    let w = width;
    root.classList.add("resizing-sidebar");
    // Live width goes on <html> inline (outranks the appearance stylesheet) and is committed on release.
    const move = (ev: PointerEvent) => {
      w = clamp(width + ev.clientX - startX);
      root.style.setProperty("--sidebar-w", `${w}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      root.classList.remove("resizing-sidebar");
      root.style.removeProperty("--sidebar-w");
      if (w !== width) updateAppearance({ sidebarWidth: w });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = width - step;
    else if (e.key === "ArrowRight") next = width + step;
    else if (e.key === "Home") next = SIDEBAR_MIN;
    else if (e.key === "End") next = SIDEBAR_MAX;
    if (next === null) return;
    e.preventDefault();
    updateAppearance({ sidebarWidth: clamp(next) });
  };

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onDoubleClick={() => updateAppearance({ sidebarWidth: defaultAppearance().sidebarWidth })}
      onKeyDown={onKeyDown}
    />
  );
}

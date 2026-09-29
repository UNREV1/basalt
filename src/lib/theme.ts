import { useSyncExternalStore } from "react";

/** Current resolved theme, tracking changes to <html data-theme>. */
export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
  );
}

/**
 * The active color palette's id (see shared/palette.ts), tracking changes.
 * Components that draw ability colors call it so they redraw in a new palette.
 */
export function usePalette(): string {
  return useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-palette"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.palette ?? "",
  );
}

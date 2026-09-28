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

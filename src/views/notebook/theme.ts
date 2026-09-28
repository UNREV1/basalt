import { useEffect, useState } from "react";

const isDarkNow = () => document.documentElement.dataset.theme === "dark";

/** Tracks the app theme (html[data-theme]) for things CSS variables can't reach, like syntax colors. */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkNow);
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkNow()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    setDark(isDarkNow());
    return () => obs.disconnect();
  }, []);
  return dark;
}

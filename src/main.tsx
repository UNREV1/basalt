import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { applyAppearance } from "./lib/appearance.ts";
import { getSettings, subscribeSettings } from "./lib/settings.ts";
import "./styles.css";
import "./shell.css";
import "./glass.css";
import "./desktop.css";

// Theme, presets, accent, fonts, density… (index.html applied the cached copy before first paint).
applyAppearance(getSettings());
subscribeSettings(() => applyAppearance(getSettings()));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyAppearance(getSettings()));
matchMedia("(prefers-reduced-transparency: reduce)").addEventListener?.("change", () => applyAppearance(getSettings()));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is optional (e.g. not available over plain http on a LAN).
    });
  });
}

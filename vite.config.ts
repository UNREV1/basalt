import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const SYNC_PORT = Number(process.env.BASALT_PORT ?? 8787);

// Oldest browsers we support: iOS/iPadOS/macOS Safari 16, and evergreen
// Chromium/Firefox from late 2022. CSS gets the -webkit- prefixes Safari
// still needs (user-select, backdrop-filter, mask…) automatically.
const version = (major: number) => major << 16;
const CSS_TARGETS = {
  safari: version(16),
  ios_saf: version(16),
  chrome: version(107),
  edge: version(107),
  firefox: version(104),
};

/** Ship Excalidraw's fonts with the app so whiteboards render offline. */
function excalidrawFonts(): Plugin {
  let outDir = "dist";
  return {
    name: "basalt-excalidraw-fonts",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const src = path.resolve("node_modules/@excalidraw/excalidraw/dist/prod/fonts");
      if (fs.existsSync(src)) fs.cpSync(src, path.join(outDir, "excalidraw-assets/fonts"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), excalidrawFonts()],
  css: {
    transformer: "lightningcss",
    lightningcss: { targets: CSS_TARGETS },
  },
  server: {
    host: true,
    proxy: {
      "/sync": { target: `ws://localhost:${SYNC_PORT}`, ws: true },
      "/api": { target: `http://localhost:${SYNC_PORT}` },
    },
  },
  build: {
    outDir: "dist",
    target: ["es2022", "safari16", "chrome107", "edge107", "firefox104"],
    cssMinify: "lightningcss",
    chunkSizeWarningLimit: 4000,
  },
  worker: { format: "es" },
});

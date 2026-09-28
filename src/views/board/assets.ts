// Excalidraw fetches its hand-drawn fonts from `window.EXCALIDRAW_ASSET_PATH`,
// falling back to a public CDN. Point it at our own copy first so boards
// render offline and without third-party requests. This module must be
// imported before "@excalidraw/excalidraw".
//
// Dev: Vite serves the package straight out of node_modules.
// Build: expects dist/prod/fonts copied to `<base>/excalidraw-assets/fonts`
// (if it is missing the browser silently uses the CDN fallback).

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}

if (typeof window !== "undefined" && window.EXCALIDRAW_ASSET_PATH === undefined) {
  window.EXCALIDRAW_ASSET_PATH = import.meta.env.DEV
    ? "/node_modules/@excalidraw/excalidraw/dist/prod/"
    : `${import.meta.env.BASE_URL}excalidraw-assets/`;
}

export {};

// Export (SVG / PNG / clipboard), rasterizing for the eyedropper, and image
// import preparation.

import type { PaintRenderer } from "./renderer.ts";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/** Rasterize SVG markup (filters, masks and blend modes included) onto a canvas. */
export async function rasterizeSvg(markup: string, width: number, height: number, scale = 1): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is not available");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function renderPng(renderer: PaintRenderer, scale: number): Promise<Blob> {
  const { width, height } = renderer.exportSize();
  return rasterizeSvg(renderer.exportSvg(), width, height, scale).then(
    (canvas) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
      ),
  );
}

export function svgBlob(renderer: PaintRenderer): Blob {
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n`, renderer.exportSvg()], { type: "image/svg+xml" });
}

export async function copyPngToClipboard(renderer: PaintRenderer): Promise<void> {
  if (!("ClipboardItem" in window) || !navigator.clipboard?.write) throw new Error("Clipboard images aren't supported in this browser");
  // Pass the promise so Safari keeps the user-activation window open.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": renderPng(renderer, 1) })]);
}

export function fileSafeName(title: string): string {
  return (title.trim() || "painting").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
}

const MAX_IMAGE_SIDE = 2048;

/** Read an image file, downscale huge images and re-encode compactly for the Y.Doc. */
export async function prepareImage(file: Blob): Promise<{ src: string; width: number; height: number }> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
  const img = await loadImage(raw);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("Unsupported image");
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(w, h));
  if (k === 1 && file.size < 1.5 * 1024 * 1024) return { src: raw, width: w, height: h };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { src: raw, width: w, height: h };
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL("image/webp", 0.9);
  const src = webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  return { src, width: canvas.width, height: canvas.height };
}

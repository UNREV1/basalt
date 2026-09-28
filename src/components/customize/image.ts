// Image helpers for page icons and covers.

/** Center-crop an image file to a small square data URL (page icons). */
export async function fileToIconDataUrl(file: File, size = 128): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file for the icon.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("That image looks empty.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const webp = canvas.toDataURL("image/webp", 0.9);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
  } catch (err) {
    throw err instanceof Error && err.message !== "" ? err : new Error("Couldn’t read that image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resolve when an image URL can be displayed (used to validate pasted links). */
export function probeImage(src: string, timeoutMs = 10000): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error("The image took too long to load.")), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Couldn’t load an image from that link."));
    };
    img.referrerPolicy = "no-referrer";
    img.src = src;
  });
}

/** Downscale a photo for use as the Liquid Glass wallpaper (kept in local settings). */
export async function fileToWallpaperDataUrl(file: File, maxEdge = 1920): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file for the wallpaper.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Settings live in localStorage (a few MB), so keep the image compact.
    for (const q of [0.82, 0.7, 0.55]) {
      const out = canvas.toDataURL("image/webp", q);
      const data = out.startsWith("data:image/webp") ? out : canvas.toDataURL("image/jpeg", q);
      if (data.length < 1_400_000) return data;
    }
    throw new Error("That image is too large even after compressing. Try a smaller one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

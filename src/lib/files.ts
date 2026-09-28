// Files are stored inline (as data URLs) inside the encrypted workspace so they
// sync to every device. Images are downscaled to keep workspaces small.

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2000;

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 600 * 1024) return readAsDataUrl(file);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/webp";
    const out = canvas.toDataURL(type, 0.86);
    // PNG screenshots can grow when re-encoded; keep whichever is smaller.
    return out.length < file.size * 1.37 ? out : readAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Convert a user-picked file into a URL that can be stored in the doc. */
export async function fileToStoredUrl(file: File): Promise<string> {
  if (file.type.startsWith("image/") && file.type !== "image/svg+xml" && file.type !== "image/gif") {
    return downscale(file);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than 8 MB. Link to it instead of embedding it.`);
  }
  return readAsDataUrl(file);
}

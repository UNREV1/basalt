// Platform details that change behavior or labels (Apple devices especially).

const nav = typeof navigator !== "undefined" ? navigator : undefined;

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with touch). */
export const isIOS: boolean =
  !!nav && (/iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1));

/** Any Apple platform (macOS, iOS, iPadOS). */
export const isApple: boolean = !!nav && (isIOS || /Mac/.test(nav.platform || nav.userAgent));

/** The modifier key label for shortcuts: ⌘ on Apple, Ctrl elsewhere. */
export const MOD = isApple ? "⌘" : "Ctrl";

/** Running as an installed app (Home Screen / Dock / desktop PWA). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Browsers without a folder picker (iOS/iPadOS Safari). */
export const supportsFolderPicker: boolean =
  typeof document !== "undefined" && !isIOS && "webkitdirectory" in document.createElement("input");

/** Copy text, falling back to a hidden textarea where the async Clipboard API
 * is unavailable (e.g. an iPad opening Basalt over plain http on a LAN). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Ask the browser to keep this site's storage (Safari evicts idle site data otherwise). */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}

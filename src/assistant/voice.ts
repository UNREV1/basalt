// Talking to the assistant: speech recognition for the mic button and speech
// synthesis for spoken replies, both built into the browser (availability
// varies: recognition works in Chrome, Edge and Safari).

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canListen(): boolean {
  return typeof window !== "undefined" && recognitionClass() !== null;
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Start listening. `onText` gets the transcript so far (interim results
 * included); `onDone` fires once with the final text ("" if nothing was heard)
 * or an error message. Returns a function that stops listening.
 */
export function listen(onText: (text: string) => void, onDone: (text: string, error?: string) => void): () => void {
  const Rec = recognitionClass();
  if (!Rec) {
    onDone("", "Voice input isn't supported in this browser.");
    return () => {};
  }
  const rec = new Rec();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  let interim = "";
  let error: string | undefined;
  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onText((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    error =
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone access was blocked."
        : e.error === "no-speech"
          ? undefined
          : e.error === "network"
            ? "Voice input needs an internet connection (and isn't available in every app)."
            : `Voice input failed (${e.error}).`;
  };
  rec.onend = () => onDone((finalText || interim).trim(), error);
  try {
    rec.start();
  } catch {
    onDone("", "Voice input couldn't start.");
  }
  return () => rec.stop();
}

/** Markdown to something pleasant to hear. */
export function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (code) ")
    .replace(/\$\$[\s\S]*?\$\$/g, " (formula) ")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, alias) => alias || t)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function speak(md: string, events: { onStart?: () => void; onEnd?: () => void } = {}) {
  if (!canSpeak()) return;
  const text = speakable(md);
  if (!text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = navigator.language || "en-US";
  u.rate = 1.04;
  u.onstart = () => events.onStart?.();
  u.onend = () => events.onEnd?.();
  u.onerror = () => events.onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

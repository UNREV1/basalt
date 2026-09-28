// Which lesson (or review session) is open in the full-screen player. Any
// view can open one; the player itself is mounted once by the shell.

import { useSyncExternalStore } from "react";

export type PlayerTarget = { mode: "lesson"; courseId: string; lessonId: string; nonce: number } | { mode: "review"; nonce: number };

let current: PlayerTarget | null = null;
let nonce = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function usePlayer(): PlayerTarget | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function openLesson(courseId: string, lessonId: string) {
  current = { mode: "lesson", courseId, lessonId, nonce: ++nonce };
  emit();
}

export function openReview() {
  current = { mode: "review", nonce: ++nonce };
  emit();
}

export function closePlayer() {
  current = null;
  emit();
}

// ---- focused sessions: suggest a break after about 25 minutes (Pomodoro) ------------------

let sessionStart = 0;
let lastActive = 0;

/** Minutes of continuous learning so far (a 20-minute gap starts a new session). */
export function touchSession(now = Date.now()): number {
  if (!sessionStart || now - lastActive > 20 * 60_000) sessionStart = now;
  lastActive = now;
  return (now - sessionStart) / 60_000;
}

export function resetSession() {
  sessionStart = 0;
}

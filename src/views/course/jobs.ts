// Long-running Claude requests (curriculum design, lesson writing, quizzes)
// live here rather than in components, so they keep going while the learner
// navigates around the app, and every view of the course sees their progress.
// Streaming updates are coalesced to one notification per animation frame.

import { useSyncExternalStore } from "react";
import { aiErrorMessage } from "../../lib/ai.ts";

export type JobStatus = "running" | "done" | "error" | "cancelled";

export interface JobState {
  key: string;
  status: JobStatus;
  /** Streamed text so far (text jobs). */
  text: string;
  /** Characters of output received so far (JSON jobs report progress this way). */
  chars: number;
  startedAt: number;
  error?: string;
  /** Result payload for JSON jobs. */
  data?: unknown;
}

export interface JobContext {
  signal: AbortSignal;
  setText: (full: string) => void;
  setChars: (chars: number) => void;
}

const live = new Map<string, JobState>();
const snapshots = new Map<string, JobState>();
const controllers = new Map<string, AbortController>();
const dirty = new Set<string>();
const listeners = new Set<() => void>();
let frame = 0;
/** Bumped whenever any job starts, ends or is cleared (not on streaming deltas). */
let statusVersion = 0;

function flush() {
  frame = 0;
  for (const key of dirty) {
    const job = live.get(key);
    if (job) snapshots.set(key, { ...job });
    else snapshots.delete(key);
  }
  dirty.clear();
  listeners.forEach((l) => l());
}

function touch(key: string, immediate = false) {
  dirty.add(key);
  if (immediate) {
    if (frame) cancelAnimationFrame(frame);
    flush();
  } else if (!frame) {
    frame = requestAnimationFrame(flush);
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getJob(key: string): JobState | undefined {
  return snapshots.get(key);
}

export function useJob(key: string | null | undefined): JobState | undefined {
  return useSyncExternalStore(subscribe, () => (key ? snapshots.get(key) : undefined));
}

/** Re-render when any job starts or finishes (e.g. to show "writing" badges). */
export function useJobStatusVersion(): number {
  return useSyncExternalStore(subscribe, () => statusVersion);
}

export function isRunning(key: string): boolean {
  return live.get(key)?.status === "running";
}

/**
 * Run `fn` as the job `key` unless it is already running. Resolves with the
 * function's result, or undefined when it failed or was cancelled (the job
 * state then carries the error for the UI).
 */
export async function runJob<T>(key: string, fn: (ctx: JobContext) => Promise<T>): Promise<T | undefined> {
  if (isRunning(key)) return undefined;
  const controller = new AbortController();
  controllers.set(key, controller);
  const job: JobState = { key, status: "running", text: "", chars: 0, startedAt: Date.now() };
  live.set(key, job);
  statusVersion++;
  touch(key, true);
  const ctx: JobContext = {
    signal: controller.signal,
    setText: (full) => {
      job.text = full;
      job.chars = full.length;
      touch(key);
    },
    setChars: (chars) => {
      job.chars = chars;
      touch(key);
    },
  };
  try {
    const result = await fn(ctx);
    if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    job.status = "done";
    job.data = result;
    return result;
  } catch (err) {
    if (controller.signal.aborted) {
      job.status = "cancelled";
    } else {
      job.status = "error";
      job.error = aiErrorMessage(err);
    }
    return undefined;
  } finally {
    if (controllers.get(key) === controller) controllers.delete(key);
    statusVersion++;
    touch(key, true);
  }
}

export function cancelJob(key: string) {
  controllers.get(key)?.abort();
}

export function clearJob(key: string) {
  if (isRunning(key)) return;
  live.delete(key);
  statusVersion++;
  touch(key, true);
}

/** Seed a finished job, e.g. to show cached quiz questions (also used by tests). */
export function setJobData(key: string, data: unknown) {
  live.set(key, { key, status: "done", text: "", chars: 0, startedAt: Date.now(), data });
  statusVersion++;
  touch(key, true);
}

export const jobKeys = {
  curriculum: (pageId: string) => `${pageId}:curriculum`,
  lesson: (pageId: string, lessonId: string) => `${pageId}:lesson:${lessonId}`,
  remedial: (pageId: string, lessonId: string) => `${pageId}:remedial:${lessonId}`,
  quiz: (pageId: string, lessonId: string) => `${pageId}:quiz:${lessonId}`,
  placement: (pageId: string) => `${pageId}:placement`,
};

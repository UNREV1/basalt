// Messages between the notebook UI and its kernel workers.

import type { Output } from "../model.ts";

export type KernelRequest = { type: "run"; id: number; code: string; label: string };

export type KernelEvent =
  | { type: "ready"; info?: string }
  /** Transient progress text (e.g. "Loading numpy…"); null clears it. */
  | { type: "status"; id: number | null; text: string | null }
  | { type: "output"; id: number; output: Output }
  | { type: "done"; id: number; ok: boolean }
  /** The kernel could not start (e.g. the Python runtime failed to download). */
  | { type: "fatal"; message: string };

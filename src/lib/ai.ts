// Optional AI features powered by Claude, using the user's own API key
// (bring-your-own-key). The key stays on this device and requests go
// directly from the browser to the Anthropic API.

import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getSettings } from "./settings.ts";

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (best)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (faster, cheaper)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest, cheapest)" },
];

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export class AiUnavailableError extends Error {
  constructor() {
    super("Add your Anthropic API key in Settings → AI to use Claude features.");
  }
}

export function aiAvailable(): boolean {
  return getSettings().anthropicKey.trim().length > 0;
}

export function client(): Anthropic {
  const apiKey = getSettings().anthropicKey.trim();
  if (!apiKey) throw new AiUnavailableError();
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export function modelParams(effort?: Effort) {
  const model = getSettings().model || "claude-opus-5";
  const isHaiku = model.startsWith("claude-haiku");
  const params: Record<string, unknown> = { model };
  if (!isHaiku) {
    params.thinking = { type: "adaptive" };
    if (effort) params.output_config = { effort };
  }
  // Server-side refusal fallbacks are available on the Opus/Fable tier.
  const betas: string[] = [];
  if (model === "claude-opus-5" || model.startsWith("claude-fable")) {
    betas.push("server-side-fallback-2026-07-01");
    params.fallbacks = "default";
  }
  return { params, betas };
}

export interface StreamOptions {
  system: string;
  messages: BetaMessageParam[];
  onText?: (delta: string, full: string) => void;
  signal?: AbortSignal;
  effort?: Effort;
  maxTokens?: number;
}

/** Stream a text response. Resolves with the full text. */
export async function streamText(opts: StreamOptions): Promise<string> {
  const { params, betas } = modelParams(opts.effort);
  const stream = client().beta.messages.stream(
    {
      ...(params as { model: string }),
      max_tokens: opts.maxTokens ?? 32000,
      system: opts.system,
      messages: opts.messages,
      ...(betas.length ? { betas } : {}),
    },
    { signal: opts.signal },
  );
  let full = "";
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      full += event.delta.text;
      opts.onText?.(event.delta.text, full);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("Claude declined this request. Try rephrasing it.");
  }
  return full;
}

export interface JsonOptions {
  system: string;
  prompt: string;
  /** JSON schema for the response (structured outputs). */
  schema: Record<string, unknown>;
  effort?: Effort;
  maxTokens?: number;
  signal?: AbortSignal;
  onProgress?: (chars: number) => void;
}

/** Ask Claude for JSON matching a schema. */
export async function generateJson<T>(opts: JsonOptions): Promise<T> {
  const { params, betas } = modelParams(opts.effort);
  const outputConfig = { ...((params.output_config as object) ?? {}), format: { type: "json_schema", schema: opts.schema } };
  const stream = client().beta.messages.stream(
    {
      ...(params as { model: string }),
      output_config: outputConfig as never,
      max_tokens: opts.maxTokens ?? 32000,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
      ...(betas.length ? { betas } : {}),
    },
    { signal: opts.signal },
  );
  let chars = 0;
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      chars += event.delta.text.length;
      opts.onProgress?.(chars);
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new Error("Claude declined this request. Try rephrasing it.");
  if (final.stop_reason === "max_tokens") throw new Error("The response was too long. Try a narrower request.");
  const text = final.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return JSON.parse(text) as T;
}

/** Human-friendly error text for UI. */
export function aiErrorMessage(err: unknown): string {
  if (err instanceof AiUnavailableError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "Your Anthropic API key was rejected. Check it in Settings → AI.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Wait a moment and retry.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API. Check your connection.";
  if (err instanceof Anthropic.APIError) return `Claude API error: ${err.message}`;
  if (err instanceof Error && err.name === "AbortError") return "Cancelled.";
  return err instanceof Error ? err.message : String(err);
}

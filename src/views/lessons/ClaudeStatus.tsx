// Where the app can't start Claude itself (browsers, phones), hand the same
// request to Claude Code or Claude Desktop instead: copy it and paste it there
// (with Basalt connected), and the lessons appear here as Claude writes them.

import { useState } from "react";
import { Icon } from "../../components/ui.tsx";
import { claudeBridge, retryClaudeJob, signInToClaude, type ClaudeJob } from "../../lib/claude.ts";
import { useApp } from "../../lib/hooks.ts";
import type { ClaudeRequest } from "./plan.ts";
import "./path.css";

export function AskClaudeFallback({ request, label = "Copy the request for Claude" }: { request: ClaudeRequest | null; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!request) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(request.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: nothing to do.
    }
  };
  return (
    <div className="cp-fallback">
      <button className="btn" onClick={copy}>
        <Icon name={copied ? "check" : "copy"} size={14} /> {copied ? "Copied" : label}
      </button>
      <span className="cp-end-note">Paste it into Claude Code or Claude Desktop with Basalt connected (More → Claude memory). Open the desktop app to have Claude do it for you.</span>
    </div>
  );
}

/**
 * One line for something Claude is doing: what, and its latest step while it
 * works. When it fails: Claude Code's own words, a way to sign in when that's
 * the problem, and Try again.
 */
export function ClaudeJobLine({
  label,
  job,
  note,
  onRetry,
  onClose,
  className = "",
}: {
  label: string;
  job: ClaudeJob | undefined;
  /** Shown while it works, e.g. "It opens as soon as it's written." */
  note?: string;
  /** Default: run the same request again. */
  onRetry?: () => void;
  onClose?: () => void;
  className?: string;
}) {
  const { toast } = useApp();
  const failed = job?.status === "error";
  const auth = failed && job?.errorCode === "auth";
  const retry = onRetry ?? (job ? () => void retryClaudeJob(job.key) : undefined);
  return (
    <div className={`cj-line${failed ? " error" : ""}${className ? ` ${className}` : ""}`} role={failed ? "alert" : "status"}>
      {failed ? <Icon name={auth ? "lock" : "x"} size={15} /> : <span className="cp-spinner" aria-hidden />}
      <span className="grow cj-text">
        <strong>{failed ? (auth ? "Sign in to Claude Code to continue" : "Claude couldn't finish") : label}</strong>
        <span className="cj-detail">
          {failed ? job?.error : job?.status === "running" ? `${job.activity}…` : job?.status === "done" ? "Done." : "Starting…"}
          {!failed && note ? ` ${note}` : ""}
        </span>
        {failed && (
          <span className="cj-actions">
            {auth && claudeBridge?.signIn && (
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  const res = await signInToClaude();
                  toast(res.ok ? "Sign in in the terminal window, then press Try again" : (res.message ?? "Open a terminal and run `claude` to sign in."));
                }}
              >
                Sign in to Claude Code
              </button>
            )}
            {retry && (
              <button className={`btn btn-sm${auth ? "" : " btn-primary"}`} onClick={retry}>
                Try again
              </button>
            )}
          </span>
        )}
      </span>
      {onClose && (
        <button className="icon-btn" aria-label={failed ? "Dismiss" : "Stop waiting"} onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

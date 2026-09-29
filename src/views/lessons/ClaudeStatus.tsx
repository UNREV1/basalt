// Where the app can't start Claude itself (browsers, phones), hand the same
// request to Claude Code or Claude Desktop instead: copy it and paste it there
// (with Basalt connected), and the lessons appear here as Claude writes them.

import { useState } from "react";
import { Icon } from "../../components/ui.tsx";
import {
  cancelSignIn,
  claudeBridge,
  openSignInPage,
  retryClaudeJob,
  sendSignInCode,
  signInInTerminal,
  signInToClaude,
  useClaudeSignIn,
  type ClaudeJob,
} from "../../lib/claude.ts";
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
        {failed &&
          (auth && claudeBridge?.signIn ? (
            <ClaudeSignInPanel onRetry={retry} />
          ) : (
            retry && (
              <span className="cj-actions">
                <button className="btn btn-sm btn-primary" onClick={retry}>
                  Try again
                </button>
              </span>
            )
          ))}
      </span>
      {onClose && (
        <button className="icon-btn" aria-label={failed ? "Dismiss" : "Stop waiting"} onClick={onClose}>
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * Signing in to Claude Code, right where it's needed: Basalt runs the sign-in
 * and your browser opens. When the browser can't hand the sign-in back, the
 * page shows a code to paste here. Anything waiting on it then goes again.
 */
export function ClaudeSignInPanel({ onRetry }: { onRetry?: () => void }) {
  const { toast } = useApp();
  const st = useClaudeSignIn();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  if (st.status === "waiting") {
    return (
      <span className="cj-signin" role="status">
        <span className="cj-signin-wait">
          <span className="cp-spinner" aria-hidden /> Finish signing in in your browser. Basalt carries on by itself.
        </span>
        {st.url && (
          <>
            <span className="cj-signin-help">
              Browser didn’t open?{" "}
              <button className="cj-link" onClick={() => void openSignInPage()}>
                Open the sign-in page
              </button>
              , then paste the code it shows:
            </span>
            <form
              className="cj-code"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await sendSignInCode(code)) {
                  setCode("");
                  setSent(true);
                }
              }}
            >
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={sent ? "Checking the code…" : "Paste the code"}
                aria-label="Sign-in code"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="btn btn-sm" disabled={!code.trim()}>
                Continue
              </button>
            </form>
          </>
        )}
        <span className="cj-actions">
          <button className="btn btn-sm btn-ghost" onClick={cancelSignIn}>
            Cancel
          </button>
        </span>
      </span>
    );
  }
  return (
    <span className="cj-signin">
      {st.status === "error" && <span className="cj-signin-error">Signing in didn’t finish: {st.error}</span>}
      <span className="cj-actions">
        <button className="btn btn-sm btn-primary" onClick={() => void signInToClaude()}>
          {st.status === "error" ? "Try signing in again" : "Sign in to Claude Code"}
        </button>
        {st.status === "error" && st.fallback && (
          <button
            className="btn btn-sm"
            onClick={async () => {
              const res = await signInInTerminal();
              toast(res.ok ? "Sign in in the terminal window, then press Try again" : (res.message ?? "Open a terminal and run `claude auth login`."));
            }}
          >
            Use a terminal instead
          </button>
        )}
        {onRetry && (
          <button className="btn btn-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </span>
    </span>
  );
}

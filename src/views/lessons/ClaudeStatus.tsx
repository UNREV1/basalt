// Where the app can't start Claude itself (browsers, phones), hand the same
// request to Claude Code or Claude Desktop instead: copy it and paste it there
// (with Basalt connected), and the lessons appear here as Claude writes them.

import { useState } from "react";
import { Icon } from "../../components/ui.tsx";
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

// Shared building blocks for the Claude-powered learning views (tutor home,
// courses, the assistant): the "connect Claude" panel, a streaming-friendly
// markdown renderer, rAF-throttled text state and small progress widgets.

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { copyText } from "../../lib/platform.ts";
import { useSettings } from "../../lib/settings.ts";
import { navigate } from "../../lib/router.ts";
import { renderInlineMarkdown, renderMarkdown } from "../../lib/render-markdown.ts";
import type { Workspace } from "../../lib/workspace.ts";
import "./ai-ui.css";

export function useAiAvailable(): boolean {
  return useSettings().anthropicKey.trim().length > 0;
}

export function openAiSettings() {
  window.dispatchEvent(new CustomEvent("basalt:open-settings", { detail: { tab: "ai" } }));
}

export function openMemoryPage(ws: Workspace) {
  navigate({ name: "view", wsId: ws.id, view: "memory" });
}

// ---- connect-Claude panel -------------------------------------------------------

export function CopyButton({ text, label = "Copy", className = "btn btn-sm" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        copyText(text).then(setCopied);
      }}
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

/**
 * Shown wherever an AI feature needs Claude but no API key is configured.
 * Offers both routes: a BYOK key, or the free route of driving this workspace
 * from Claude Desktop / Claude Code through the Basalt MCP server.
 */
export function NoKeyPanel({
  ws,
  claudePrompt,
  title = "Connect Claude to continue",
  lead = "The tutor is powered by Claude. Pick whichever route suits you:",
  compact = false,
  appHint = "It builds courses, lessons and flashcards right here.",
}: {
  ws: Workspace;
  /** What to say to Claude in the MCP route, e.g. "Teach me linear algebra". */
  claudePrompt?: string;
  title?: string;
  lead?: ReactNode;
  compact?: boolean;
  /** What Claude can do through MCP in this context. */
  appHint?: string;
}) {
  return (
    <section className={`ai-nokey${compact ? " compact" : ""}`} aria-label="Connect Claude">
      <div className="ai-nokey-head">
        <span className="ai-nokey-spark" aria-hidden>
          ✦
        </span>
        <div>
          <div className="ai-nokey-title">{title}</div>
          <div className="ai-nokey-lead">{lead}</div>
        </div>
      </div>
      <div className="ai-nokey-options">
        <div className="ai-nokey-option">
          <div className="ai-nokey-option-title">
            <span aria-hidden>💬</span> Recommended: your Claude subscription, no API key
          </div>
          <p>
            In the Basalt desktop app with Claude Code installed, Claude works right here. Anywhere else, connect Claude
            Code or Claude Desktop to this workspace (setup is on the Claude memory page), then ask Claude. {appHint}
          </p>
          {claudePrompt && (
            <div className="ai-nokey-say">
              <div className="ai-nokey-say-head">
                <span className="ai-nokey-say-label">Then say</span>
                <CopyButton text={claudePrompt} className="btn btn-ghost btn-sm ai-nokey-copy" />
              </div>
              <div className="ai-nokey-say-text">“{claudePrompt}”</div>
            </div>
          )}
          <button type="button" className="btn btn-sm" onClick={() => openMemoryPage(ws)}>
            Set up the MCP connection →
          </button>
        </div>
        <div className="ai-nokey-option">
          <div className="ai-nokey-option-title">
            <span aria-hidden>🔑</span> Or: an Anthropic API key
          </div>
          <ol className="ai-nokey-steps">
            <li>Create a key at console.anthropic.com.</li>
            <li>Paste it in Settings → AI.</li>
            <li>That's it. The key stays on this device; requests go straight from your browser to Anthropic.</li>
          </ol>
          <button type="button" className="btn btn-primary btn-sm" onClick={openAiSettings}>
            Open Settings → AI
          </button>
        </div>
      </div>
    </section>
  );
}

// ---- streaming state --------------------------------------------------------------

/** Text state whose updates are coalesced to one render per animation frame. */
export function useRafText(initial = ""): [string, (full: string) => void, (value?: string) => void] {
  const [text, setText] = useState(initial);
  const latest = useRef(initial);
  const frame = useRef(0);
  const push = useCallback((full: string) => {
    latest.current = full;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setText(latest.current);
    });
  }, []);
  const reset = useCallback((value = "") => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    latest.current = value;
    setText(value);
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return [text, push, reset];
}

// ---- markdown ---------------------------------------------------------------------

/** Split markdown before each heading (outside code fences and display math). */
export function splitSections(md: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let fence: string | null = null;
  let inMath = false;
  for (const line of md.split("\n")) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      cur.push(line);
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f && !inMath) {
      fence = f[1];
      cur.push(line);
      continue;
    }
    if (!inMath && /^#{1,6}\s/.test(line) && cur.some((l) => l.trim())) {
      out.push(cur.join("\n"));
      cur = [];
    }
    cur.push(line);
    if ((line.match(/\$\$/g) ?? []).length % 2 === 1) inMath = !inMath;
  }
  if (cur.length) out.push(cur.join("\n"));
  return out;
}

const SOLUTION_RE = /^(?:✅\s*)?(?:solutions?|answers?|answer key|worked solution)\b/i;
const FLASHCARDS_RE = /^(?:🃏\s*)?flashcards\b/i;
const CARD_RE = /^\s*(?:[-*]\s+)?(.+?)\s+::\s+(.+?)\s*$/;

function escapeAttr(s: string): string {
  return s.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function renderSection(src: string): string {
  const m = src.match(/^(#{1,6})\s+([^\n]*)\n?([\s\S]*)$/);
  if (m) {
    const [, hashes, rawHeading, body] = m;
    const heading = rawHeading.replace(/\s#+\s*$/, "").trim();
    if (SOLUTION_RE.test(heading) && body.trim()) {
      return `<details class="ai-solution"><summary>${renderInlineMarkdown(heading)}</summary><div class="ai-solution-body">${renderMarkdown(body)}</div></details>`;
    }
    if (FLASHCARDS_RE.test(heading)) {
      const cards: string[] = [];
      const rest: string[] = [];
      for (const line of body.split("\n")) {
        const c = line.match(CARD_RE);
        if (c) {
          cards.push(
            `<button type="button" class="ai-fc"><span class="ai-fc-face ai-fc-front">${renderInlineMarkdown(c[1])}</span><span class="ai-fc-face ai-fc-back">${renderInlineMarkdown(c[2])}</span></button>`,
          );
        } else rest.push(line);
      }
      if (cards.length) {
        const level = Math.min(hashes.length, 6);
        return (
          `<h${level}>${renderInlineMarkdown(heading)}</h${level}>` +
          `<p class="ai-fc-hint">Tap a card to flip it. These cards are part of your spaced-repetition deck.</p>` +
          `<div class="ai-fc-grid">${cards.join("")}</div>` +
          (rest.join("\n").trim() ? renderMarkdown(rest.join("\n")) : "")
        );
      }
    }
  }
  return renderMarkdown(src);
}

function linkifyWikilinks(html: string, isKnown?: (title: string) => boolean): string {
  // Leave code untouched: split on <pre>/<code> elements.
  return html
    .split(/(<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|([^\]\n]+))?\]\]/g, (_, title: string, alias?: string) => {
            const t = title.trim();
            const decoded = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
            const missing = isKnown && !isKnown(decoded) ? " missing" : "";
            return `<a class="ai-wikilink${missing}" role="link" tabindex="0" data-title="${escapeAttr(t)}">${alias ?? t}</a>`;
          }),
    )
    .join("");
}

export interface MarkdownProps {
  md: string;
  className?: string;
  /** Called with the (decoded) title when a [[wikilink]] is clicked. */
  onWikiLink?: (title: string) => void;
  /** Mark unresolved [[links]] as missing. */
  isKnownTitle?: (title: string) => boolean;
  /** Show a typing caret after the content. */
  streaming?: boolean;
}

/**
 * Markdown with KaTeX, collapsible "Solution" sections, flip-card rendering of
 * a "Flashcards" section and clickable [[wikilinks]]. Sections are rendered
 * and cached independently so a streaming document only re-renders its tail.
 */
export function Markdown({ md, className = "", onWikiLink, isKnownTitle, streaming }: MarkdownProps) {
  const cache = useRef(new Map<string, string>());
  const cachedFor = useRef(isKnownTitle);
  const sections = useMemo(() => {
    // Link styling depends on which titles exist, so a new resolver invalidates the cache.
    if (cachedFor.current !== isKnownTitle) {
      cache.current = new Map();
      cachedFor.current = isKnownTitle;
    }
    const next = new Map<string, string>();
    const out = splitSections(md).map((src) => {
      const html = cache.current.get(src) ?? linkifyWikilinks(renderSection(src), isKnownTitle);
      next.set(src, html);
      return html;
    });
    cache.current = next;
    return out;
  }, [md, isKnownTitle]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const wiki = target.closest<HTMLElement>(".ai-wikilink");
    if (wiki) {
      e.preventDefault();
      onWikiLink?.(wiki.dataset.title ?? wiki.textContent ?? "");
      return;
    }
    const card = target.closest<HTMLElement>(".ai-fc");
    if (card) {
      card.classList.toggle("flipped");
      return;
    }
    const a = target.closest<HTMLAnchorElement>("a[href]");
    if (a && /^https?:/i.test(a.getAttribute("href") ?? "")) {
      e.preventDefault();
      window.open(a.href, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div
      className={`ai-md${streaming ? " streaming" : ""} ${className}`}
      onClick={onClick}
      onKeyDown={(e) => {
        const wiki = (e.target as HTMLElement).closest<HTMLElement>(".ai-wikilink");
        if (wiki && e.key === "Enter") onWikiLink?.(wiki.dataset.title ?? "");
      }}
    >
      {sections.map((html, i) => (
        <div key={i} className="ai-md-section" dangerouslySetInnerHTML={{ __html: html }} />
      ))}
      {streaming && <span className="ai-caret" aria-hidden />}
    </div>
  );
}

// ---- small widgets ----------------------------------------------------------------

export function ProgressBar({ value, tone = "accent", label }: { value: number; tone?: "accent" | "success"; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`ai-bar ${tone}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="ai-bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ai-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-active)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={v >= 1 ? "var(--success)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
      </svg>
      <div className="ai-ring-label">{children ?? `${Math.round(v * 100)}%`}</div>
    </div>
  );
}

export function ErrorNote({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="ai-error" role="alert">
      <span aria-hidden>⚠️</span>
      <span className="grow">{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Nearest scrollable ancestor (the shell's main scroll area). */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let cur = el?.parentElement ?? null;
  while (cur) {
    const s = getComputedStyle(cur).overflowY;
    if ((s === "auto" || s === "scroll") && cur.scrollHeight > cur.clientHeight) return cur;
    cur = cur.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

export function Dots({ label }: { label?: string }) {
  return (
    <span className="ai-dots" role="status" aria-label={label ?? "Working"}>
      <span />
      <span />
      <span />
    </span>
  );
}

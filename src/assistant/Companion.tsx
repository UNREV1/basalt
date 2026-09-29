// The companion: the assistant as a little character that lives on top of the
// app. It rests in its slot in the top bar (so it never covers what you're
// doing), perches next to the chat panel, flies to whatever it is working on
// (the page in the sidebar, the open page) and watches the pointer. Click to
// chat; drag to move.

import { useEffect, useRef, useState } from "react";
import { useApp, useMediaQuery } from "../lib/hooks.ts";
import { useRoute } from "../lib/router.ts";
import { updateSettings, useSettings } from "../lib/settings.ts";
import { Pebble } from "./Pebble.tsx";
import { toggleAssistant, useAssistant, type AssistantState } from "./store.ts";
import "./assistant.css";

// v2: it used to rest in the bottom corner; positions from then are dropped.
const HOME_KEY = "basalt:companion-home-v2";
const HELLO_KEY = "basalt:companion-hello";
/** How long it stays by a page it just worked on. */
const VISIT_MS = 2600;

type Pt = { x: number; y: number };

function loadHome(): Pt | null {
  try {
    const v = JSON.parse(localStorage.getItem(HOME_KEY) || "null");
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null;
  } catch {
    return null;
  }
}

function visible(el: Element | null): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
  return r;
}

/** Where on screen the page it is working on shows up. */
function pageTarget(pageId: string, openPageId: string | null): { el: Element; rect: DOMRect } | null {
  const row = document.querySelector(`.sidebar [data-page-id="${CSS.escape(pageId)}"]`);
  const rr = visible(row);
  if (row && rr) return { el: row, rect: rr };
  if (pageId === openPageId) {
    const title = document.querySelector(".page-title-input, .page-header, .topbar");
    const tr = visible(title);
    if (title && tr) return { el: title, rect: tr };
  }
  return null;
}


export function Companion() {
  const s = useAssistant();
  const settings = useSettings();
  const { toast } = useApp();
  const route = useRoute();
  const phone = useMediaQuery("(max-width: 800px)");
  const size = phone ? 32 : 34;
  const rootRef = useRef<HTMLDivElement>(null);
  const pupilsRef = useRef<SVGGElement>(null);
  const [hover, setHover] = useState(false);
  const [side, setSide] = useState<"left" | "right">("left");
  const [hello, setHello] = useState(() => {
    try {
      return !localStorage.getItem(HELLO_KEY);
    } catch {
      return false;
    }
  });
  const [recent, setRecent] = useState<"done" | null>(null);

  // Everything the animation loop reads, without re-running it.
  const live = useRef({ s, size, phone, openPageId: route.name === "page" ? route.pageId : null });
  live.current = { s, size, phone, openPageId: route.name === "page" ? route.pageId : null };
  // The loop sleeps once it has settled; anything that could move it wakes it.
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => wakeRef.current(), [s, size, phone, route]);

  useEffect(() => {
    if (!hello) return;
    const t = setTimeout(() => {
      setHello(false);
      try {
        localStorage.setItem(HELLO_KEY, "1");
      } catch {
        // ignore
      }
    }, 7000);
    return () => clearTimeout(t);
  }, [hello]);

  // At rest, a blink every few seconds (a moment's animation instead of an endless one).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let off = 0;
    const t = setInterval(() => {
      el.classList.add("cp-blink");
      off = window.setTimeout(() => el.classList.remove("cp-blink"), 320);
    }, 5200);
    return () => {
      clearInterval(t);
      clearTimeout(off);
    };
  }, [settings.assistant.character]);

  // "Done!" for a moment after a reply finishes while the panel is closed.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !s.running && !s.error && !s.open) {
      setRecent("done");
      const t = setTimeout(() => setRecent(null), 2200);
      wasRunning.current = s.running;
      return () => clearTimeout(t);
    }
    wasRunning.current = s.running;
  }, [s.running, s.error, s.open]);

  // ---- motion -------------------------------------------------------------------------

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pos: Pt = loadHome() ?? { x: innerWidth - 90, y: innerHeight - 110 };
    let vel: Pt = { x: 0, y: 0 };
    let pointer: Pt = { x: innerWidth / 2, y: innerHeight / 2 };
    let drag: { dx: number; dy: number; moved: boolean; id: number } | null = null;
    let glowEl: Element | null = null;
    let lastSide: "left" | "right" = "left";
    let lastBelow = false;
    let raf = 0;
    let running = false;
    let lastTransform = "";
    let lastPupils = "";
    let lastFlying = false;
    // Only runs while something is moving; asleep, it costs nothing (no frames, no layout reads).
    const wake = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;
    // Eyes: at what it's working on, else at the pointer.
    const lookAt = (look: Pt) => {
      const { size } = live.current;
      const dx = look.x - (pos.x + size / 2);
      const dy = look.y - (pos.y + size / 2);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 160);
      const pupils = `translate(${((dx / d) * 2.6 * k).toFixed(1)} ${((dy / d) * 2.4 * k).toFixed(1)})`;
      if (pupils !== lastPupils) {
        lastPupils = pupils;
        pupilsRef.current?.setAttribute("transform", pupils);
      }
    };

    const clamp = (p: Pt): Pt => {
      const { size } = live.current;
      return { x: Math.max(6, Math.min(innerWidth - size - 6, p.x)), y: Math.max(6, Math.min(innerHeight - size - 6, p.y)) };
    };
    const home = (): Pt => {
      const { size, phone } = live.current;
      const saved = loadHome();
      if (saved) return clamp(saved);
      // Its slot in the top bar (TopBar renders .cp-dock).
      const dock = visible(document.querySelector(".main .cp-dock"));
      if (dock) return { x: dock.left + (dock.width - size) / 2, y: dock.top + (dock.height - size) / 2 };
      return clamp({ x: innerWidth - size - 16, y: innerHeight - size - (phone ? 100 : 20) });
    };

    const glow = (target: Element | null) => {
      if (glowEl === target) return;
      glowEl?.classList.remove("as-target-glow");
      glowEl = target;
      glowEl?.classList.add("as-target-glow");
    };

    const target = (now: number): { at: Pt; look: Pt | null } => {
      const { s, size, openPageId } = live.current;
      if (drag) return { at: pos, look: null };
      // Working on a page: fly next to it.
      const act = s.activity;
      if (s.running || (act && now - act.at < VISIT_MS)) {
        if (act?.pageId && Date.now() - act.at < VISIT_MS + 4000) {
          const t = pageTarget(act.pageId, openPageId);
          if (t) {
            glow(t.el);
            const r = t.rect;
            const right = r.right + 12 + size < innerWidth;
            return {
              at: clamp({ x: right ? Math.min(r.right + 10, r.left + 260) : r.left - size - 10, y: r.top + r.height / 2 - size / 2 }),
              look: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
            };
          }
        }
      }
      glow(null);
      // Chat open: perch by the panel.
      if (s.open) {
        const p = visible(document.querySelector(".as-panel"));
        if (p && p.left > size + 20) return { at: clamp({ x: p.left - size - 12, y: p.top + 8 }), look: null };
      }
      return { at: home(), look: null };
    };

    let placed = false;
    const tick = (now: number) => {
      const t = target(now);
      // Start where it rests instead of flying in on every load.
      if (!placed) {
        placed = true;
        pos = t.at;
      }
      if (reduce || drag) {
        pos = t.at;
        vel = { x: 0, y: 0 };
      } else {
        // Critically damped spring: glides in without overshooting off screen.
        vel.x = (vel.x + (t.at.x - pos.x) * 0.05) * 0.66;
        vel.y = (vel.y + (t.at.y - pos.y) * 0.05) * 0.66;
        pos = clamp({ x: pos.x + vel.x, y: pos.y + vel.y });
      }
      const tilt = Math.max(-18, Math.min(18, vel.x * 1.6));
      const transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;
      if (transform !== lastTransform) {
        lastTransform = transform;
        el.style.transform = transform;
      }
      const flying = Math.hypot(vel.x, vel.y) > 2.5;
      if (flying !== lastFlying) {
        lastFlying = flying;
        el.classList.toggle("cp-flying", flying);
      }
      const sideNow = pos.x > innerWidth / 2 ? "left" : "right";
      if (sideNow !== lastSide) {
        lastSide = sideNow;
        setSide(sideNow);
      }
      // Near the top of the screen, speech bubbles open downwards.
      const below = pos.y < 140;
      if (below !== lastBelow) {
        lastBelow = below;
        el.classList.toggle("cp-below", below);
      }
      lookAt(t.look ?? pointer);
      // Keep going while it moves, is dragged, or is busy; otherwise sleep until woken.
      const { s } = live.current;
      const busy = s.running || (!!s.activity && Date.now() - s.activity.at < VISIT_MS + 4000);
      const moving = Math.hypot(t.at.x - pos.x, t.at.y - pos.y) > 0.4 || Math.hypot(vel.x, vel.y) > 0.05;
      if (drag || busy || moving) raf = requestAnimationFrame(tick);
      else running = false;
    };
    wake();
    // Where it rests can move with the layout (its dock in the top bar): look now and then.
    const every = setInterval(wake, 1000);
    addEventListener("resize", wake);
    // The eyes follow the pointer without waking the whole loop (once a frame at most).
    let eyes = 0;

    const onMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (!running && !eyes)
        eyes = requestAnimationFrame(() => {
          eyes = 0;
          lookAt(pointer);
        });
      if (drag && e.pointerId === drag.id) {
        wake();
        const next = clamp({ x: e.clientX - drag.dx, y: e.clientY - drag.dy });
        if (Math.hypot(next.x - pos.x, next.y - pos.y) > 3) drag.moved = true;
        pos = next;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false, id: e.pointerId };
      el.setPointerCapture(e.pointerId);
      wake();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (moved) {
        try {
          localStorage.setItem(HOME_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));
        } catch {
          // ignore
        }
      } else toggleAssistant();
    };
    addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(eyes);
      clearInterval(every);
      removeEventListener("resize", wake);
      wakeRef.current = () => {};
      glow(null);
      removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [settings.assistant.character]);

  if (!settings.assistant.character) return null;

  const name = settings.assistant.name;
  const bubble = bubbleText(s, name, { hover, hello, recent, phone });
  const mood = recent === "done" && s.mood === "idle" ? "happy" : s.mood;
  // Bobbing along only when there's something going on; at rest it sits still (and blinks now
  // and then), so it doesn't redraw every frame behind everything else.
  const alive = hover || s.open || s.running || !!recent || hello || mood !== "idle";

  return (
    <div
      ref={rootRef}
      // On phones the chat covers the screen and its header shows the companion instead.
      className={`companion cp-mood-${mood}${alive ? " cp-alive" : ""}${s.open ? " cp-open" : ""}${s.open && phone ? " cp-hidden" : ""}`}
      style={{ width: size, height: size }}
      role="button"
      tabIndex={0}
      aria-label={s.open ? `Close ${name}` : `Chat with ${name}`}
      title=""
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleAssistant();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        updateSettings({ assistant: { ...settings.assistant, character: false } });
        toast(`${name} is hidden. Bring it back in Settings → Assistant (or press Ctrl+J).`);
      }}
    >
      <Pebble ref={pupilsRef} size={size + 6} mood={mood} />
      {bubble && (
        <div className={`cp-bubble cp-bubble-${side}${bubble.kind === "thought" ? " cp-thought" : ""}`} role="status">
          {bubble.text}
        </div>
      )}
    </div>
  );
}

function bubbleText(
  s: AssistantState,
  name: string,
  o: { hover: boolean; hello: boolean; recent: "done" | null; phone: boolean },
): { text: string; kind: "say" | "thought" } | null {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  if (s.running) {
    if (s.activity && Date.now() - s.activity.at < 6000) return { text: s.activity.text, kind: "say" };
    const th = s.draft?.thinking.trim();
    if (th) {
      const tail = th.replace(/\s+/g, " ").slice(-90);
      return { text: `…${tail.slice(tail.indexOf(" ") + 1)}`, kind: "thought" };
    }
    if (s.open) return null;
    return { text: s.draft?.text ? "Writing…" : "Thinking…", kind: "thought" };
  }
  if (s.error && !s.open) return { text: "Something went wrong. Open the chat to see.", kind: "say" };
  if (o.recent === "done") return { text: "Done!", kind: "say" };
  if (o.hello && !s.open)
    return { text: o.phone ? `Hi, I'm ${name}! Tap me to chat.` : `Hi, I'm ${name}! Click me or press ${mod}+J to chat.`, kind: "say" };
  if (o.hover && !s.open && !o.phone) return { text: `Chat with ${name} (${mod}+J)`, kind: "say" };
  return null;
}

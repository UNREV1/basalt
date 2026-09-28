// Small UI primitives: modal, anchored menu, emoji picker, icons.

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined} role="dialog" aria-modal>
        {title && (
          <div className="modal-header">
            {title}
            <span className="spacer" />
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  hint?: string;
  separator?: boolean;
  heading?: boolean;
  disabled?: boolean;
}

export type Anchor = { x: number; y: number } | DOMRect;

// Open popovers, innermost last: only the top one reacts to outside clicks and
// Escape, so a picker opened from inside a panel doesn't close the panel.
const popoverStack: HTMLElement[] = [];

const isPhone = () => matchMedia("(max-width: 640px)").matches;

/**
 * A floating panel positioned at a point or under a rect, kept inside the
 * viewport. With `sheet`, phones get a bottom sheet instead.
 */
export function Popover({
  anchor,
  onClose,
  children,
  className = "menu",
  align = "start",
  sheet = false,
  label,
  autoFocus = false,
}: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  /** Present as a bottom sheet on phones. */
  sheet?: boolean;
  /** Accessible name (makes the panel a labelled dialog). */
  label?: string;
  /** Move focus into the panel on open and restore it on close. */
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [asSheet] = useState(() => sheet && isPhone());
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || asSheet) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      let left: number;
      let top: number;
      if ("width" in anchor) {
        left = align === "end" ? anchor.right - r.width : anchor.left;
        top = anchor.bottom + 4;
        if (top + r.height > innerHeight - 8) top = Math.max(8, anchor.top - r.height - 4);
        if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8);
      } else {
        left = anchor.x;
        top = anchor.y;
        if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8);
      }
      left = Math.max(8, Math.min(left, innerWidth - r.width - 8));
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    place();
    // Panels whose content grows (sections, tabs) stay inside the viewport.
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor, align, asSheet]);
  useEffect(() => {
    const el = ref.current!;
    popoverStack.push(el);
    const previous = document.activeElement as HTMLElement | null;
    if (autoFocus) requestAnimationFrame(() => el.focus({ preventScroll: true }));
    const isTop = () => popoverStack[popoverStack.length - 1] === el;
    const onDown = (e: PointerEvent) => {
      if (isTop() && !el.contains(e.target as Node)) closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTop()) closeRef.current();
    };
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      popoverStack.splice(popoverStack.indexOf(el), 1);
      if (autoFocus && previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // Mount-only: callers pass fresh closures every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a11y = label ? { role: "dialog", "aria-label": label } : {};
  return createPortal(
    asSheet ? (
      <>
        <div className="sheet-backdrop" />
        <div ref={ref} className={`${className} sheet`} tabIndex={-1} {...a11y}>
          {children}
        </div>
      </>
    ) : (
      <div
        ref={ref}
        className={className}
        tabIndex={-1}
        {...a11y}
        style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, zIndex: 1100 }}
      >
        {children}
      </div>
    ),
    document.body,
  );
}

export function Menu({ anchor, items, onClose }: { anchor: Anchor; items: MenuItem[]; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" />
        ) : it.heading ? (
          <div key={i} className="menu-label">
            {it.label}
          </div>
        ) : (
          <button
            key={i}
            className={`menu-item${it.danger ? " danger" : ""}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
          >
            {it.icon && <span className="menu-icon">{it.icon}</span>}
            <span className="grow">{it.label}</span>
            {it.hint && <span className="kbd">{it.hint}</span>}
          </button>
        ),
      )}
    </Popover>
  );
}

const EMOJI_GROUPS: [string, string][] = [
  ["Common", "📄 📝 📓 📔 📒 📚 📖 🗂️ 📁 🗃️ 📌 📍 ✅ ☑️ 🎯 🚀 ⭐ 🔥 💡 🧠 🎓 🧪 🔬 🧮 📊 📈 🗓️ 📅 ⏰ 🏠 💼 🛠️ ⚙️ 🔒 🔑 🌍 🎨 🖌️ ✏️ 🧩 🎵 🎬 📷 💬 ❤️ 🌱 🍀 ☕"],
  ["Smileys", "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😎 🤓 🧐 🤔 🤗 🤭 😶 😏 😴 🤯 🥳 😤 😭 😱 🥶 🤠 👻 👽 🤖 💩"],
  ["People", "👋 🤚 ✋ 👌 ✌️ 🤞 👍 👎 👏 🙌 🙏 💪 🧑‍💻 🧑‍🎓 🧑‍🏫 🧑‍🔬 🧑‍🎨 🧑‍🚀 🧙 🦸 🧑‍🍳 👀 🧑‍🤝‍🧑"],
  ["Nature", "🐶 🐱 🦊 🐻 🐼 🐨 🦁 🐯 🐸 🐵 🦉 🦋 🐝 🐢 🐙 🐬 🐳 🌵 🌲 🌳 🌴 🍁 🌸 🌻 🌙 ☀️ ⛅ 🌈 ❄️ 🌊 ⚡ 🌋 🪨"],
  ["Food", "🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🥑 🥕 🌽 🥐 🍞 🧀 🍕 🍔 🌮 🍣 🍜 🍩 🍪 🎂 🍫 🍿 🍵 🧃 🍷"],
  ["Objects", "💻 🖥️ ⌨️ 🖱️ 📱 ☎️ 🔋 🔌 💾 💿 🧭 ⏳ 🔭 🔮 🧲 🧰 🔧 🔨 ⛏️ 🧱 🪄 🎁 🎈 🏆 🥇 🎲 ♟️ 🎮 🧸 🪴 🛋️ 🚲 🚗 ✈️ 🚢 🗺️"],
  ["Symbols", "❗ ❓ 💯 ✔️ ❌ ➕ ➖ ➗ ♾️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🔶 🔷 💠 ♻️ ⚠️ 🚫 🔔 🏷️ 🔗 📎 ✂️ 🗑️"],
];

export function EmojiPicker({
  anchor,
  onPick,
  onClose,
  onUploadImage,
}: {
  anchor: Anchor;
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Offer "Upload" for an image icon. */
  onUploadImage?: (file: File) => void;
}) {
  const [custom, setCustom] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Popover anchor={anchor} onClose={onClose} className="menu emoji-picker" sheet label="Choose an icon">
      <div className="row" style={{ padding: 4 }}>
        <input
          className="input grow"
          aria-label="Custom emoji"
          placeholder="Paste any emoji…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              onPick(custom.trim());
              onClose();
            }
          }}
        />
        {onUploadImage && (
          <>
            <button className="btn btn-sm" onClick={() => fileRef.current?.click()} title="Use an image as the icon">
              <Icon name="upload" size={13} /> Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onUploadImage(file);
                  onClose();
                }
              }}
            />
          </>
        )}
        <button
          className="btn btn-sm"
          onClick={() => {
            onPick("");
            onClose();
          }}
        >
          Remove
        </button>
      </div>
      <div className="emoji-scroll">
        {EMOJI_GROUPS.map(([name, list]) => (
          <div key={name}>
            <div className="menu-label">{name}</div>
            <div className="emoji-grid">
              {list.split(" ").map((e) => (
                <button
                  key={e}
                  className="emoji-cell"
                  aria-label={e}
                  onClick={() => {
                    onPick(e);
                    onClose();
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}

const ICONS: Record<string, string> = {
  x: "M6 6l12 12M18 6L6 18",
  pause: "M8 5v14M16 5v14",
  target: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 12.01v-.02",
  flame: "M12 22c4 0 7-2.8 7-6.8 0-3.7-2.6-6.1-4.2-8.2-.5 2.3-1.6 3.6-2.8 4.2C12.3 8.3 11 5 8.5 2.5 8.6 6 5 8.4 5 13.2 5 18.6 8 22 12 22z",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7l1-8z",
  dice: "M12 2l8.66 5v10L12 22l-8.66-5V7L12 2zM12 8l-5 8h10l-5-8zM12 2v6M3.34 7L12 8l8.66-1M7 16l5 6 5-6",
  path: "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15V9a3 3 0 0 1 3-3h6M18 9v6a3 3 0 0 1-3 3H9",
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 1 1 5.3-14 8 8 0 0 1-5.3 14zM21 21l-4.35-4.35",
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  graph: "M6 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M18 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.7 7.2l3 8.9M16.3 8.4l-3.1 7.8M8 6.3l8 .6",
  cards: "M4 7h12v13H4zM8 4h12v13",
  tree: "M12 21v-7M12 14l-5-4M12 14l5-4M7 10V7M17 10V7M7 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M17 7m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 21m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  cap: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5M22 9v6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  shapes: "M4 4h7v7H4zM17.5 7.5m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M4 20l3.5-6 3.5 6zM14 14h7v7h-7z",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z",
  trash: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  chevron: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 6h16M4 12h16M4 18h16",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  copy: "M8 8h12v12H8zM4 16V4h12",
  download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  calendar: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
  types: "M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM13 15.5h7",
  cloud: "M7 18a5 5 0 0 1-.5-10A7 7 0 0 1 20 10a4 4 0 0 1-1 8z",
  cloudoff: "M3 3l18 18M8.5 8.4A5 5 0 0 0 7 18h10.5M20.5 16.5A4 4 0 0 0 18 10a7 7 0 0 0-8.3-5.6",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.1a4 4 0 0 1 0 7.8M22 21v-1a6 6 0 0 0-4-5.7",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  sidebar: "M3 4h18v16H3zM9 4v16",
  back: "M15 18l-6-6 6-6",
  play: "M7 4l13 8-13 8z",
  check: "M5 12l5 5 9-10",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  open: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  upload: "M12 21V9M7 14l5-5 5 5M4 3h16",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 3.5 3.5 2.5-2.5L20 17M15.5 9.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0",
  smile: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  sliders: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  unlock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.6-1.8",
  template: "M4 4h16v5H4zM4 13h7v7H4zM15 13h5M15 17h5",
  move: "M3 6h6l2 2h10v11H3zM11 14h7M15 11l3 3-3 3",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  type: "M5 7V5h14v2M12 5v14M9 19h6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  reset: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  up: "M18 15l-6-6-6 6",
  width: "M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4",
  palette: "M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.2-4-8.3-9-8.3zM7.5 12h.01M9.5 7.8h.01M14.5 7.8h.01M17 11h.01",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  clock: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 7v5l3 2",
  volume: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  volumeOff: "M4 9h4l5-4v14l-5-4H4zM16.5 9.5l5 5M21.5 9.5l-5 5",
};

export function Icon({ name, size = 16, stroke = 1.8 }: { name: keyof typeof ICONS | string; size?: number; stroke?: number }) {
  const d = ICONS[name] ?? ICONS.dots;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

/** Accessible segmented control built on .tabs/.tab. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="tabs segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`tab${value === o.value ? " active" : ""}`}
          title={o.title}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A labelled on/off switch row. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`toggle-row${disabled ? " disabled" : ""}`}>
      <label htmlFor={id} className="grow col" style={{ gap: 0 }}>
        <span>{label}</span>
        {hint && <span className="small muted">{hint}</span>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="toggle"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export function Avatar({ name, color, size = 24, title }: { name: string; color: string; size?: number; title?: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="avatar"
      title={title ?? name}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {initials || "?"}
    </span>
  );
}

export function timeAgo(ts: number): string {
  if (!ts) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ts).toLocaleDateString();
}

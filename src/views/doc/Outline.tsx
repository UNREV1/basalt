// Floating table of contents for long documents (wide screens only).

import { useEffect, useState } from "react";
import * as Y from "yjs";

interface Heading {
  id: string;
  level: number;
  text: string;
}

function readHeadings(fragment: Y.XmlFragment): Heading[] {
  const out: Heading[] = [];
  for (const node of fragment.createTreeWalker((n) => n instanceof Y.XmlElement && n.nodeName === "heading")) {
    const el = node as Y.XmlElement;
    const container = el.parent as Y.XmlElement | null;
    const id = container?.getAttribute("id");
    const text = el
      .toArray()
      .map((c) => (c instanceof Y.XmlText ? (c.toDelta() as { insert: unknown }[]).map((d) => (typeof d.insert === "string" ? d.insert : "")).join("") : ""))
      .join("")
      .trim();
    if (id && text) out.push({ id, level: Number(el.getAttribute("level") ?? 1), text });
  }
  return out;
}

export function Outline({ fragment }: { fragment: Y.XmlFragment }) {
  const [headings, setHeadings] = useState(() => readHeadings(fragment));
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        setHeadings(readHeadings(fragment));
      }, 400);
    };
    fragment.observeDeep(update);
    return () => {
      fragment.unobserveDeep(update);
      if (t) clearTimeout(t);
    };
  }, [fragment]);

  useEffect(() => {
    const scroller = document.querySelector(".main-scroll");
    if (!scroller || headings.length < 3) return;
    const onScroll = () => {
      let current: string | null = null;
      for (const h of headings) {
        const el = document.querySelector(`[data-id="${h.id}"]`);
        if (el && el.getBoundingClientRect().top < 140) current = h.id;
      }
      setActive(current);
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [headings]);

  if (headings.length < 3) return null;
  const minLevel = Math.min(...headings.map((h) => h.level));
  return (
    <nav className="doc-outline" aria-label="Table of contents">
      {headings.map((h) => (
        <button
          key={h.id}
          className={`outline-item${active === h.id ? " active" : ""}`}
          style={{ paddingLeft: 8 + (h.level - minLevel) * 12 }}
          onClick={() => document.querySelector(`[data-id="${h.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}

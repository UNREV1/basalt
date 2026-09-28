// Small stroke icon set (Lucide-style geometry, drawn on a 24px grid) so the
// property/database UI does not depend on an icon font.

import type { CSSProperties, ReactNode } from "react";

const P = (d: string) => <path d={d} />;

const ICONS = {
  plus: [P("M5 12h14"), P("M12 5v14")],
  x: [P("M18 6 6 18"), P("m6 6 12 12")],
  check: [P("M20 6 9 17l-5-5")],
  chevronDown: [P("m6 9 6 6 6-6")],
  chevronLeft: [P("m15 18-6-6 6-6")],
  chevronRight: [P("m9 18 6-6-6-6")],
  arrowLeft: [P("m12 19-7-7 7-7"), P("M19 12H5")],
  search: [<circle key="c" cx="11" cy="11" r="7" />, P("m21 21-4.3-4.3")],
  filter: [P("M3 6h18"), P("M7 12h10"), P("M10 18h4")],
  sort: [P("m21 16-4 4-4-4"), P("M17 20V4"), P("m3 8 4-4 4 4"), P("M7 4v16")],
  arrowUp: [P("m5 12 7-7 7 7"), P("M12 19V5")],
  arrowDown: [P("M12 5v14"), P("m19 12-7 7-7-7")],
  eye: [
    P("M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"),
    <circle key="c" cx="12" cy="12" r="3" />,
  ],
  eyeOff: [
    P("M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"),
    P("M14.08 14.16a3 3 0 0 1-4.24-4.24"),
    P("M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"),
    P("m2 2 20 20"),
  ],
  trash: [P("M3 6h18"), P("M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"), P("M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2")],
  more: [
    <circle key="a" cx="5" cy="12" r="1" />,
    <circle key="b" cx="12" cy="12" r="1" />,
    <circle key="c" cx="19" cy="12" r="1" />,
  ],
  grip: [
    <circle key="a" cx="9" cy="5" r="1" />,
    <circle key="b" cx="9" cy="12" r="1" />,
    <circle key="c" cx="9" cy="19" r="1" />,
    <circle key="d" cx="15" cy="5" r="1" />,
    <circle key="e" cx="15" cy="12" r="1" />,
    <circle key="f" cx="15" cy="19" r="1" />,
  ],
  open: [P("M15 3h6v6"), P("M10 14 21 3"), P("M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")],
  settings: [
    P("M21 4h-7"),
    P("M10 4H3"),
    P("M21 12h-9"),
    P("M8 12H3"),
    P("M21 20h-5"),
    P("M12 20H3"),
    P("M14 2v4"),
    P("M8 10v4"),
    P("M16 18v4"),
  ],
  table: [<rect key="r" x="3" y="3" width="18" height="18" rx="2" />, P("M3 9h18"), P("M3 15h18"), P("M9 9v12")],
  board: [<rect key="r" x="3" y="3" width="18" height="18" rx="2" />, P("M8 7v7"), P("M12 7v4"), P("M16 7v9")],
  gallery: [
    <rect key="a" x="3" y="3" width="7" height="7" rx="1" />,
    <rect key="b" x="14" y="3" width="7" height="7" rx="1" />,
    <rect key="c" x="14" y="14" width="7" height="7" rx="1" />,
    <rect key="d" x="3" y="14" width="7" height="7" rx="1" />,
  ],
  list: [P("M3 6h.01"), P("M3 12h.01"), P("M3 18h.01"), P("M8 6h13"), P("M8 12h13"), P("M8 18h13")],
  calendar: [P("M8 2v4"), P("M16 2v4"), <rect key="r" x="3" y="4" width="18" height="18" rx="2" />, P("M3 10h18")],
  text: [P("M17 6H3"), P("M21 12H3"), P("M15 18H3")],
  number: [P("M4 9h16"), P("M4 15h16"), P("M10 3 8 21"), P("M16 3l-2 18")],
  select: [<circle key="c" cx="12" cy="12" r="9" />, P("m16 10-4 4-4-4")],
  multi: [P("m3 17 2 2 4-4"), P("m3 7 2 2 4-4"), P("M13 6h8"), P("M13 12h8"), P("M13 18h8")],
  checkbox: [<rect key="r" x="3" y="3" width="18" height="18" rx="2" />, P("m9 12 2 2 4-4")],
  url: [
    P("M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"),
    P("M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"),
  ],
  page: [P("M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"), P("M14 3v5h5"), P("M10 15l4-4"), P("M11 11h3v3")],
  type: [
    P("M8.3 10a.7.7 0 0 1-.63-1.08L11.4 3a.7.7 0 0 1 1.2-.04L16.3 8.9a.7.7 0 0 1-.57 1.1Z"),
    <rect key="r" x="3" y="14" width="7" height="7" rx="1" />,
    <circle key="c" cx="17.5" cy="17.5" r="3.5" />,
  ],
  pencil: [P("M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"), P("m15 5 4 4")],
  title: [P("M4 7V5h16v2"), P("M9 19h6"), P("M12 5v14")],
  clock: [<circle key="c" cx="12" cy="12" r="9" />, P("M12 7v5l3 2")],
  layers: [P("m12 2 10 5-10 5L2 7z"), P("m2 17 10 5 10-5"), P("m2 12 10 5 10-5")],
} satisfies Record<string, ReactNode[]>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  className,
  style,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      style={{ flexShrink: 0, ...style }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name].map((el, i) => (
        <g key={i}>{el}</g>
      ))}
    </svg>
  );
}

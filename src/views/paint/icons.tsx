// Line icons for the paint studio (20×20, currentColor).

import type { ReactNode, SVGProps } from "react";

const PATHS: Record<string, ReactNode> = {
  brush: (
    <>
      <path d="M15.5 3.2a1.6 1.6 0 0 1 2.3 2.3L10.6 12.7l-2.3-2.3z" />
      <path d="M8.3 10.4c-1.8 0-3 1.3-3 3 0 1.2-.6 2.2-2 2.6 1 .9 2.3 1.2 3.6 1.2 2.1 0 3.7-1.6 3.7-3.7" />
    </>
  ),
  eraser: (
    <>
      <path d="M7.5 17h9" />
      <path d="M3.9 12.3 11.8 4.4a1.8 1.8 0 0 1 2.5 0l2.3 2.3a1.8 1.8 0 0 1 0 2.5L9.3 16.5a1.8 1.8 0 0 1-1.3.5H6.4a1.8 1.8 0 0 1-1.3-.5l-1.2-1.2a2.1 2.1 0 0 1 0-3z" />
      <path d="m8.2 8.1 4.6 4.6" />
    </>
  ),
  line: <path d="M4 16 16 4" />,
  rect: <rect x="3.5" y="5" width="13" height="10" rx="1.2" />,
  ellipse: <ellipse cx="10" cy="10" rx="6.8" ry="5.2" />,
  shapes: (
    <>
      <rect x="2.8" y="9.2" width="7.5" height="7.5" rx="1" />
      <circle cx="13.2" cy="7" r="4.2" />
    </>
  ),
  lasso: (
    <>
      <path d="M6.1 14.1C3.9 13.1 2.6 11.4 2.6 9.5c0-3.4 3.4-6 7.4-6s7.4 2.6 7.4 6-3.4 6-7.4 6c-.6 0-1.2 0-1.8-.2" />
      <path d="M6.5 14.2c-.2 1.5.5 2.6 2 3" />
      <circle cx="7.3" cy="14.3" r="1.2" fill="currentColor" />
    </>
  ),
  eyedropper: (
    <>
      <path d="m12.2 5.1 2.7 2.7" />
      <path d="M14.2 3.3a1.9 1.9 0 0 1 2.6 2.6l-1.4 1.4-2.6-2.6z" />
      <path d="M12.6 6.4 5.1 13.9 4.3 16.6l.9.9 2.7-.8 7.5-7.5" />
    </>
  ),
  move: (
    <>
      <path d="M4.5 3.5 9.8 16.2l1.9-5.1 5.1-1.9z" />
    </>
  ),
  hand: (
    <>
      <path d="M7 10V4.8a1.2 1.2 0 0 1 2.4 0V9" />
      <path d="M9.4 8.5V3.7a1.2 1.2 0 0 1 2.4 0v4.8" />
      <path d="M11.8 8.6V4.8a1.2 1.2 0 0 1 2.4 0v5.7" />
      <path d="M7 10.2 6 9.1a1.3 1.3 0 0 0-2 1.7l2.5 3.6A5.6 5.6 0 0 0 11.1 17h.6a4.3 4.3 0 0 0 4.3-4.3V7.4a1.2 1.2 0 0 0-2.4 0" />
    </>
  ),
  image: (
    <>
      <rect x="2.8" y="3.8" width="14.4" height="12.4" rx="1.8" />
      <circle cx="7.3" cy="8" r="1.4" />
      <path d="m17 13.2-3.6-3.6-7.4 6.6" />
    </>
  ),
  undo: (
    <>
      <path d="M7.5 5 3.8 8.6l3.7 3.6" />
      <path d="M4 8.6h7.7a4.5 4.5 0 0 1 0 9H9" />
    </>
  ),
  redo: (
    <>
      <path d="m12.5 5 3.7 3.6-3.7 3.6" />
      <path d="M16 8.6H8.3a4.5 4.5 0 0 0 0 9H11" />
    </>
  ),
  layers: (
    <>
      <path d="m10 3 7.2 3.9L10 10.8 2.8 6.9z" />
      <path d="m2.8 10.2 7.2 3.9 7.2-3.9" />
      <path d="m2.8 13.4 7.2 3.9 7.2-3.9" />
    </>
  ),
  eye: (
    <>
      <path d="M1.8 10S4.7 4.6 10 4.6 18.2 10 18.2 10 15.3 15.4 10 15.4 1.8 10 1.8 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M8.2 4.8A8.6 8.6 0 0 1 10 4.6c5.3 0 8.2 5.4 8.2 5.4a14 14 0 0 1-2.2 2.9" />
      <path d="M5.4 5.6A13.8 13.8 0 0 0 1.8 10s2.9 5.4 8.2 5.4a7.8 7.8 0 0 0 4.4-1.3" />
      <path d="M8.3 8.3a2.5 2.5 0 0 0 3.4 3.4" />
      <path d="m2.5 2.5 15 15" />
    </>
  ),
  lock: (
    <>
      <rect x="4.2" y="8.8" width="11.6" height="8.4" rx="1.6" />
      <path d="M6.8 8.8V6.2a3.2 3.2 0 0 1 6.4 0v2.6" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.2" y="8.8" width="11.6" height="8.4" rx="1.6" />
      <path d="M6.8 8.8V6.2a3.2 3.2 0 0 1 6.1-1.4" />
    </>
  ),
  alpha: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M3 10h14M10 3v14" opacity=".45" />
      <path d="M3.4 16.6 16.6 3.4" />
    </>
  ),
  plus: <path d="M10 4.2v11.6M4.2 10h11.6" />,
  minus: <path d="M4.2 10h11.6" />,
  trash: (
    <>
      <path d="M3.8 5.6h12.4" />
      <path d="M8 5.6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.6" />
      <path d="m5.4 5.6.8 10.6a1.4 1.4 0 0 0 1.4 1.3h4.8a1.4 1.4 0 0 0 1.4-1.3l.8-10.6" />
    </>
  ),
  copy: (
    <>
      <rect x="6.6" y="6.6" width="10.2" height="10.2" rx="1.6" />
      <path d="M13.4 6.6V4.8a1.6 1.6 0 0 0-1.6-1.6H4.8a1.6 1.6 0 0 0-1.6 1.6v7a1.6 1.6 0 0 0 1.6 1.6h1.8" />
    </>
  ),
  merge: (
    <>
      <path d="M10 3v8" />
      <path d="m6.8 8 3.2 3.2L13.2 8" />
      <path d="M3.5 13.5 10 17l6.5-3.5" />
    </>
  ),
  clear: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="m7.2 7.2 5.6 5.6M12.8 7.2l-5.6 5.6" />
    </>
  ),
  download: (
    <>
      <path d="M10 3.2v9.4" />
      <path d="m6.4 9.2 3.6 3.6 3.6-3.6" />
      <path d="M3.6 14.2v1.4a1.6 1.6 0 0 0 1.6 1.6h9.6a1.6 1.6 0 0 0 1.6-1.6v-1.4" />
    </>
  ),
  canvas: (
    <>
      <rect x="3" y="4" width="14" height="10.5" rx="1.2" />
      <path d="M7 17.5h6M10 14.5v3" />
    </>
  ),
  help: (
    <>
      <circle cx="10" cy="10" r="7.4" />
      <path d="M7.9 7.8a2.2 2.2 0 0 1 4.2.8c0 1.5-2.1 1.9-2.1 3.1" />
      <circle cx="10" cy="14.3" r=".6" fill="currentColor" />
    </>
  ),
  panel: (
    <>
      <rect x="2.8" y="3.6" width="14.4" height="12.8" rx="1.8" />
      <path d="M12.4 3.6v12.8" />
    </>
  ),
  flipH: (
    <>
      <path d="M10 2.8v14.4" strokeDasharray="1.6 1.6" />
      <path d="M7.4 5.6 3 14h4.4z" />
      <path d="M12.6 5.6 17 14h-4.4z" fill="currentColor" fillOpacity=".25" />
    </>
  ),
  flipV: (
    <>
      <path d="M2.8 10h14.4" strokeDasharray="1.6 1.6" />
      <path d="M5.6 7.4 14 3v4.4z" />
      <path d="M5.6 12.6 14 17v-4.4z" fill="currentColor" fillOpacity=".25" />
    </>
  ),
  rotate: (
    <>
      <path d="M16.2 10a6.2 6.2 0 1 1-1.9-4.5" />
      <path d="M16.4 3.4v3.2h-3.2" />
    </>
  ),
  mirror: (
    <>
      <path d="M10 2.6v14.8" />
      <path d="M7.4 6.2 3.4 10l4 3.8" />
      <path d="m12.6 6.2 4 3.8-4 3.8" />
    </>
  ),
  symmetry: (
    <>
      <path d="M10 2.6v14.8" strokeDasharray="1.6 1.6" />
      <path d="M8 5.4C5.4 6 3.8 8 3.8 10.2S5.4 14 8 14.6" />
      <path d="M12 5.4c2.6.6 4.2 2.6 4.2 4.8S14.6 14 12 14.6" />
    </>
  ),
  radial: (
    <>
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      <path d="M10 2.8v4.4M10 12.8v4.4M2.8 10h4.4M12.8 10h4.4M4.9 4.9l3.1 3.1M12 12l3.1 3.1M15.1 4.9 12 8M8 12l-3.1 3.1" />
    </>
  ),
  fit: (
    <>
      <path d="M3.2 7.2V4.4a1.2 1.2 0 0 1 1.2-1.2h2.8M12.8 3.2h2.8a1.2 1.2 0 0 1 1.2 1.2v2.8M16.8 12.8v2.8a1.2 1.2 0 0 1-1.2 1.2h-2.8M7.2 16.8H4.4a1.2 1.2 0 0 1-1.2-1.2v-2.8" />
      <rect x="6.6" y="6.6" width="6.8" height="6.8" rx="1" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="8.8" cy="8.8" r="5.6" />
      <path d="m13 13 4 4M8.8 6.4v4.8M6.4 8.8h4.8" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="8.8" cy="8.8" r="5.6" />
      <path d="m13 13 4 4M6.4 8.8h4.8" />
    </>
  ),
  swap: (
    <>
      <path d="M5 8.5V6.8A2.2 2.2 0 0 1 7.2 4.6h6" />
      <path d="m11.4 2.6 2 2-2 2" />
      <path d="M15 11.5v1.7a2.2 2.2 0 0 1-2.2 2.2h-6" />
      <path d="m8.6 17.4-2-2 2-2" />
    </>
  ),
  close: <path d="m5 5 10 10M15 5 5 15" />,
  check: <path d="m4.2 10.4 3.6 3.6 8-8" />,
  chevronDown: <path d="m5.5 8 4.5 4.5L14.5 8" />,
  chevronRight: <path d="m8 5.5 4.5 4.5L8 14.5" />,
  more: (
    <>
      <circle cx="4.6" cy="10" r="1.1" fill="currentColor" />
      <circle cx="10" cy="10" r="1.1" fill="currentColor" />
      <circle cx="15.4" cy="10" r="1.1" fill="currentColor" />
    </>
  ),
  palette: (
    <>
      <path d="M10 2.8a7.2 7.2 0 0 0 0 14.4c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.2-1.5-1.2-2.6 0-.8.6-1.5 1.6-1.5h1.8a3.4 3.4 0 0 0 3.4-3.4c0-2.9-3.2-5.3-7.2-5.3z" />
      <circle cx="6.4" cy="9.4" r="1" fill="currentColor" />
      <circle cx="9" cy="6.2" r="1" fill="currentColor" />
      <circle cx="12.9" cy="6.9" r="1" fill="currentColor" />
    </>
  ),
  sliders: (
    <>
      <path d="M3.5 6h8M15.5 6h1M3.5 14h2M9.5 14h7" />
      <circle cx="13.5" cy="6" r="2" />
      <circle cx="7.5" cy="14" r="2" />
    </>
  ),
  reset: (
    <>
      <path d="M3.8 10a6.2 6.2 0 1 0 1.9-4.5" />
      <path d="M3.6 3.4v3.2h3.2" />
    </>
  ),
  cut: (
    <>
      <circle cx="5.6" cy="14.4" r="2.4" />
      <circle cx="14.4" cy="14.4" r="2.4" />
      <path d="M7.4 12.8 15 3M12.6 12.8 5 3" />
    </>
  ),
  deselect: (
    <>
      <path d="M3.5 7V4.8a1.3 1.3 0 0 1 1.3-1.3H7M13 3.5h2.2a1.3 1.3 0 0 1 1.3 1.3V7M16.5 13v2.2a1.3 1.3 0 0 1-1.3 1.3H13M7 16.5H4.8a1.3 1.3 0 0 1-1.3-1.3V13" />
      <path d="m7.5 7.5 5 5M12.5 7.5l-5 5" />
    </>
  ),
  // Layer painted over the whiteboard shapes (front square solid) / under them.
  overShapes: (
    <>
      <rect x="3" y="7.5" width="9" height="9" rx="1.6" strokeDasharray="2 1.8" />
      <rect x="8" y="3.5" width="9" height="9" rx="1.6" fill="currentColor" fillOpacity=".35" />
    </>
  ),
  underShapes: (
    <>
      <rect x="3" y="7.5" width="9" height="9" rx="1.6" fill="currentColor" fillOpacity=".35" />
      <rect x="8" y="3.5" width="9" height="9" rx="1.6" strokeDasharray="2 1.8" />
    </>
  ),
  done: <path d="m4.2 10.4 3.6 3.6 8-8" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}

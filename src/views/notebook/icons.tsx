// Small stroke icons (24px grid) used by the notebook UI.

import type { ReactNode } from "react";

function Icon({ children, size = 16, fill }: { children: ReactNode; size?: number; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IconPlay = ({ size }: P) => (
  <Icon size={size} fill>
    <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l10.6-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14Z" />
  </Icon>
);
export const IconStop = ({ size }: P) => (
  <Icon size={size} fill>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
);
export const IconRestart = ({ size }: P) => (
  <Icon size={size}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);
export const IconRunAll = ({ size }: P) => (
  <Icon size={size}>
    <path d="m5 4 8 6-8 6V4Z" />
    <path d="M17 5v12" />
    <path d="M13 20h8" />
  </Icon>
);
export const IconEraser = ({ size }: P) => (
  <Icon size={size}>
    <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </Icon>
);
export const IconPlus = ({ size }: P) => (
  <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconUp = ({ size }: P) => (
  <Icon size={size}>
    <path d="m18 15-6-6-6 6" />
  </Icon>
);
export const IconDown = ({ size }: P) => (
  <Icon size={size}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);
export const IconTrash = ({ size }: P) => (
  <Icon size={size}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>
);
export const IconMore = ({ size }: P) => (
  <Icon size={size}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Icon>
);
export const IconDownload = ({ size }: P) => (
  <Icon size={size}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </Icon>
);
export const IconUpload = ({ size }: P) => (
  <Icon size={size}>
    <path d="M12 21V9" />
    <path d="m7 14 5-5 5 5" />
    <path d="M5 3h14" />
  </Icon>
);
export const IconKeyboard = ({ size }: P) => (
  <Icon size={size}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 16h6" />
  </Icon>
);
export const IconEdit = ({ size }: P) => (
  <Icon size={size}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
);
export const IconCheck = ({ size }: P) => (
  <Icon size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
export const IconCopy = ({ size }: P) => (
  <Icon size={size}>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);

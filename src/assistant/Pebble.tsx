// The assistant's face: a small glassy pebble with eyes that follow the
// pointer, blinks, and a handful of moods. Pure SVG + CSS (assistant.css).

import { forwardRef, useId } from "react";
import type { Mood } from "./store.ts";

export const Pebble = forwardRef<SVGGElement, { size: number; mood: Mood; className?: string }>(function Pebble(
  { size, mood, className = "" },
  pupilsRef,
) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const body = "M32 5c15.5 0 26 11.5 26 27.5S47.5 59 32 59 6 48.5 6 32.5 16.5 5 32 5z";
  return (
    <svg
      className={`pebble pebble-${mood} ${className}`}
      viewBox="-6 -8 76 80"
      width={size}
      height={(size * 80) / 76}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${id}-body`} cx="36%" cy="28%" r="82%">
          <stop offset="0" className="pebble-stop-hi" />
          <stop offset="0.55" className="pebble-stop-mid" />
          <stop offset="1" className="pebble-stop-lo" />
        </radialGradient>
      </defs>
      <ellipse className="pebble-shadow" cx="32" cy="67" rx="15" ry="3.2" />
      <g className="pebble-bob">
        <g className="pebble-squash">
          <path className="pebble-body" d={body} fill={`url(#${id}-body)`} />
          <path className="pebble-rim" d={body} />
          <ellipse className="pebble-shine" cx="22" cy="16" rx="10" ry="4.8" transform="rotate(-24 22 16)" />
          <g className="pebble-face">
            <g className="pebble-eyes">
              <g className="pebble-eye">
                <ellipse cx="23" cy="31" rx="5.3" ry="6.5" className="pebble-white" />
              </g>
              <g className="pebble-eye">
                <ellipse cx="41" cy="31" rx="5.3" ry="6.5" className="pebble-white" />
              </g>
              <g ref={pupilsRef} className="pebble-pupils">
                <circle cx="23" cy="32" r="3" className="pebble-pupil" />
                <circle cx="41" cy="32" r="3" className="pebble-pupil" />
                <circle cx="21.9" cy="30.4" r="1" className="pebble-glint" />
                <circle cx="39.9" cy="30.4" r="1" className="pebble-glint" />
              </g>
              <path className="pebble-lid" d="M17.4 29.5q5.6-3.4 11.2 0M35.4 29.5q5.6-3.4 11.2 0" />
            </g>
            <g className="pebble-happy-eyes">
              <path d="M18 33q5-6.5 10 0M36 33q5-6.5 10 0" />
            </g>
            <ellipse className="pebble-cheek" cx="15.5" cy="40.5" rx="3.6" ry="2.1" />
            <ellipse className="pebble-cheek" cx="48.5" cy="40.5" rx="3.6" ry="2.1" />
            <path className="pebble-mouth" d="M27.6 43.2q4.4 3.6 8.8 0" />
            <ellipse className="pebble-mouth-open" cx="32" cy="44.4" rx="3.2" ry="2.3" />
          </g>
        </g>
        <g className="pebble-orbit">
          <circle cx="32" cy="-3" r="2.4" />
          <circle cx="32" cy="-3" r="1.8" />
          <circle cx="32" cy="-3" r="1.3" />
        </g>
        <circle className="pebble-ring" cx="32" cy="32" r="30" />
      </g>
    </svg>
  );
});

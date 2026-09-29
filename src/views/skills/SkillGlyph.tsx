// A skill's line icon in a colored disc, as on the skill map (see shared/glyphs.ts).

import { GLYPHS, glyphFor } from "../../../shared/glyphs.ts";
import type { Skill } from "../../../shared/skills.ts";

export function SkillGlyph({
  skill,
  color,
  size = 28,
  locked = false,
}: {
  skill: Pick<Skill, "name" | "glyph" | "category">;
  color: string;
  size?: number;
  locked?: boolean;
}) {
  return (
    <span className={`sk-glyph${locked ? " locked" : ""}`} style={{ ["--c" as string]: color, width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d={GLYPHS[glyphFor(skill)]} />
      </svg>
    </span>
  );
}

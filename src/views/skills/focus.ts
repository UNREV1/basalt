// Hand-off from a skill page to the skill tree: which skill to select when
// the tree opens.

const KEY = "basalt:skills:focus";

export function focusSkill(skillId: string) {
  try {
    sessionStorage.setItem(KEY, skillId);
  } catch {
    // Storage unavailable (private mode): the tree just opens unselected.
  }
}

/** The skill to select, once. */
export function takeSkillFocus(): string | null {
  try {
    const id = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return id;
  } catch {
    return null;
  }
}

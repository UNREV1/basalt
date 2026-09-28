// Learner self-assessment controls shared by the tutor home and course setup.

import { useId } from "react";
import { GOALS, START_LEVELS } from "./levels.ts";
import "./course-form.css";

export interface CourseOptions {
  startLevel: string;
  goal: string;
  notes: string;
}

export function LevelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <fieldset className="tu-field">
      <legend className="tu-label" id={id}>
        Where are you starting?
      </legend>
      <div className="tu-levels" role="radiogroup" aria-labelledby={id}>
        {START_LEVELS.map((l, i) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={value === l.id}
            className={`tu-level${value === l.id ? " selected" : ""}`}
            onClick={() => onChange(l.id)}
          >
            <span className="tu-level-bars" aria-hidden>
              {START_LEVELS.map((_, j) => (
                <span key={j} className={j <= i ? "on" : ""} />
              ))}
            </span>
            <span className="tu-level-name">{l.id}</span>
            <span className="tu-level-hint">{l.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function GoalPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <fieldset className="tu-field">
      <legend className="tu-label" id={id}>
        How deep do you want to go?
      </legend>
      <div className="tu-goals" role="radiogroup" aria-labelledby={id}>
        {GOALS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="radio"
            aria-checked={value === g.id}
            className={`tu-goal${value === g.id ? " selected" : ""}`}
            onClick={() => onChange(g.id)}
          >
            <span className="tu-goal-icon" aria-hidden>
              {g.icon}
            </span>
            <span className="tu-goal-text">
              <span className="tu-goal-name">{g.id}</span>
              <span className="tu-goal-desc">{g.description}</span>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="tu-field">
      <label className="tu-label" htmlFor={id}>
        Anything else? <span className="faint">(optional)</span>
      </label>
      <textarea
        id={id}
        className="textarea tu-notes"
        rows={2}
        value={value}
        placeholder="Your background, what you want to use it for, how you like to learn… e.g. “I know Python and calculus; I prefer visual intuition; preparing for grad school.”"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Sentence to give Claude Desktop / Claude Code when there's no API key. */
export function teachMePrompt(topic: string, opts: Pick<CourseOptions, "startLevel" | "goal">, wsName?: string): string {
  const t = topic.trim() || "<topic>";
  return `Teach me ${t}. I'm ${opts.startLevel.toLowerCase()} and my goal is ${opts.goal.toLowerCase()}. Build the course in my Basalt workspace${wsName ? ` “${wsName}”` : ""}.`;
}

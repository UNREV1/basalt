// Screens shown before a course has a roadmap: the setup form and the
// progress view while Claude designs the curriculum.

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { courseMap, initCourse } from "../../../shared/course.ts";
import { updatePage } from "../../../shared/model.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { ErrorNote, formatCount, NoKeyPanel, ProgressBar } from "../tutor/ai-ui.tsx";
import { GoalPicker, LevelPicker, NotesField, teachMePrompt } from "../tutor/CourseForm.tsx";
import { EXPECTED_CURRICULUM_CHARS } from "./generate.ts";
import { courseInfo, TUTOR_ORIGIN } from "./model.ts";

/** Save the learner's choices into the course map (initializing it if needed). */
export function saveCourseOptions(
  ws: Workspace,
  page: Y.Map<any>,
  pageId: string,
  opts: { topic: string; startLevel: string; goal: string; notes: string },
) {
  const course = courseMap(page);
  ws.doc.transact(() => {
    if (!course.get("createdAt") || !course.get("progress") || !course.get("chats")) {
      initCourse(page, { topic: opts.topic, goal: opts.goal, startLevel: opts.startLevel });
    } else {
      course.set("topic", opts.topic);
      course.set("goal", opts.goal);
      course.set("startLevel", opts.startLevel);
    }
    course.set("notes", opts.notes.trim());
    if (!(page.get("title") as string)?.trim()) updatePage(ws.doc, pageId, { title: opts.topic });
  }, TUTOR_ORIGIN);
}

export function CourseSetup({
  ws,
  page,
  pageId,
  hasKey,
  error,
  interrupted,
  onGenerate,
}: {
  ws: Workspace;
  page: Y.Map<any>;
  pageId: string;
  hasKey: boolean;
  error?: string;
  interrupted?: boolean;
  onGenerate: () => void;
}) {
  const info = courseInfo(page);
  const [topic, setTopic] = useState(info.topic);
  const [startLevel, setStartLevel] = useState(info.startLevel);
  const [goal, setGoal] = useState(info.goal);
  const [notes, setNotes] = useState(info.notes);

  const generate = () => {
    if (!topic.trim() || !hasKey) return;
    saveCourseOptions(ws, page, pageId, { topic: topic.trim(), startLevel, goal, notes });
    onGenerate();
  };

  return (
    <section className="co-setup">
      <div className="co-setup-head">
        <span className="co-setup-icon" aria-hidden>
          🗺️
        </span>
        <div>
          <h2>Design your course</h2>
          <p className="muted">
            Tell your tutor where you're starting and how deep you want to go. Claude maps a path through six levels, from
            the Foundations to the research frontier.
          </p>
        </div>
      </div>
      {interrupted && !error && (
        <div className="co-note">The last attempt to design this course was interrupted before it finished.</div>
      )}
      {error && <ErrorNote message={error} onRetry={hasKey ? generate : undefined} />}
      <div className="tu-field">
        <label className="tu-label" htmlFor="co-setup-topic">
          Topic
        </label>
        <input
          id="co-setup-topic"
          className="input co-setup-topic"
          value={topic}
          placeholder="What do you want to learn?"
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generate()}
        />
      </div>
      <LevelPicker value={startLevel} onChange={setStartLevel} />
      <GoalPicker value={goal} onChange={setGoal} />
      <NotesField value={notes} onChange={setNotes} />
      <div className="co-setup-actions">
        <button type="button" className="btn btn-primary btn-lg" disabled={!hasKey || !topic.trim()} onClick={generate}>
          {error || interrupted ? "Try again" : "Design my curriculum"} →
        </button>
      </div>
      {!hasKey && (
        <NoKeyPanel
          ws={ws}
          title="Connect Claude to design this course"
          claudePrompt={teachMePrompt(topic, { startLevel, goal }, ws.info.name)}
        />
      )}
    </section>
  );
}

const PHASES = [
  "Mapping the field and its prerequisites",
  "Sequencing six levels, Foundations to frontier",
  "Writing modules and lessons",
  "Setting concrete learning objectives",
];

function useElapsed(since: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Live progress while a curriculum is being designed (here or by a collaborator). */
export function CurriculumProgress({
  topic,
  chars,
  startedAt,
  by,
  onCancel,
  compact = false,
}: {
  topic: string;
  chars: number;
  startedAt: number;
  /** Name of the collaborator generating it, when it isn't us. */
  by?: string;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const elapsed = useElapsed(startedAt);
  const frac = chars / EXPECTED_CURRICULUM_CHARS;
  const phase = chars === 0 ? 0 : frac < 0.2 ? 1 : frac < 0.75 ? 2 : 3;
  const value = chars === 0 ? 0 : Math.min(0.97, 0.06 + frac * 0.9);

  if (compact) {
    return (
      <div className="co-regen" role="status">
        <span className="spinner" />
        <span className="grow">
          {by ? `${by} is redesigning the roadmap…` : "Redesigning your roadmap…"} <span className="faint">{PHASES[phase]}</span>
        </span>
        <span className="co-num faint">{elapsed}</span>
        {onCancel && (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="co-generating" role="status" aria-live="polite">
      <div className="co-generating-orb" aria-hidden>
        <span>🗺️</span>
      </div>
      <h2>{by ? `${by} is designing this course` : "Designing your course"}</h2>
      <p className="muted">
        Claude is planning a path through <strong>{topic}</strong>, from first principles to the research frontier.
        {!by && " This usually takes a minute or two; you can keep using Basalt meanwhile."}
      </p>
      <ol className="co-phases">
        {PHASES.map((p, i) => (
          <li key={p} className={i < phase ? "done" : i === phase ? "active" : ""}>
            <span className="co-phase-mark" aria-hidden>
              {i < phase ? "✓" : i === phase ? <span className="spinner" /> : ""}
            </span>
            {p}
          </li>
        ))}
      </ol>
      <div className="co-generating-bar">
        {chars === 0 ? <div className="co-indeterminate" /> : <ProgressBar value={value} label="Curriculum progress" />}
      </div>
      <div className="co-generating-foot">
        <span className="faint co-num">
          {elapsed}
          {chars > 0 && ` · ${formatCount(chars)} characters written`}
        </span>
        {onCancel && (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

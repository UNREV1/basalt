// Course roadmap: overall progress, the "next up" recommendation and a
// vertical ladder of the six levels with expandable modules and lessons.

import { useState, type MouseEvent } from "react";
import type { Curriculum, CurriculumLesson, LessonProgress, LessonStatus } from "../../../shared/course.ts";
import { Menu, type Anchor, type MenuItem } from "../../components/ui.tsx";
import { renderInlineMarkdown } from "../../lib/render-markdown.ts";
import { ProgressBar, ProgressRing } from "../tutor/ai-ui.tsx";
import type { CourseStats, ProgressOf } from "./model.ts";

export interface RoadmapProps {
  curriculum: Curriculum;
  stats: CourseStats;
  progressOf: ProgressOf;
  /** Whether a lesson has a written page. */
  hasPage: (lessonId: string) => boolean;
  /** Lessons currently being written. */
  writing: (lessonId: string) => boolean;
  onOpenLesson: (lessonId: string, opts?: { start?: boolean }) => void;
  onSetStatus: (lessonIds: string[], status: LessonStatus | "reset") => void;
  onOpenLessonPage: (lessonId: string) => void;
  onPlacement: () => void;
  onRegenerate: () => void;
  onOpenChat: () => void;
  /** Suggest skipping the levels below this index (from the learner's self-assessment). */
  suggestedStartLevel: number;
  showPlacementHint: boolean;
  onDismissPlacementHint: () => void;
}

function StatusDot({ status }: { status: LessonStatus }) {
  return (
    <span className={`co-dot ${status}`} aria-hidden>
      {status === "mastered" ? "✓" : status === "skipped" ? "–" : ""}
    </span>
  );
}

const STATUS_TEXT: Record<LessonStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  mastered: "Mastered",
  skipped: "Skipped",
};

export function StatusBadge({ progress }: { progress: LessonProgress }) {
  return (
    <span className={`co-badge ${progress.status}`}>
      <StatusDot status={progress.status} />
      {STATUS_TEXT[progress.status]}
      {progress.quizzes.length > 0 && <span className="co-badge-score">{Math.round(progress.mastery * 100)}%</span>}
    </span>
  );
}

export function nextActionLabel(p: LessonProgress, hasPage: boolean): string {
  if (!hasPage) return "Start lesson";
  if (p.quizzes.length && p.status !== "mastered") return "Review & retake quiz";
  return "Continue lesson";
}

export function Roadmap(props: RoadmapProps) {
  const { curriculum, stats, progressOf } = props;
  const next = stats.nextUp;
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const level = curriculum.levels[stats.currentLevelIndex];
    if (level) {
      s.add(level.id);
      for (const m of level.modules) s.add(m.id);
    }
    return s;
  });
  const [menu, setMenu] = useState<{ anchor: Anchor; items: MenuItem[] } | null>(null);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const lessonMenu = (e: MouseEvent, lesson: CurriculumLesson) => {
    e.stopPropagation();
    const p = progressOf(lesson.id);
    const items: MenuItem[] = [
      { label: "Open lesson", icon: "📖", onClick: () => props.onOpenLesson(lesson.id) },
    ];
    if (props.hasPage(lesson.id)) items.push({ label: "Open as page", icon: "↗", onClick: () => props.onOpenLessonPage(lesson.id) });
    items.push({ label: "", separator: true });
    if (p.status !== "mastered") items.push({ label: "Mark as mastered", icon: "✓", onClick: () => props.onSetStatus([lesson.id], "mastered") });
    if (p.status !== "skipped") items.push({ label: "Skip — I know this", icon: "↷", onClick: () => props.onSetStatus([lesson.id], "skipped") });
    if (p.status !== "in-progress") items.push({ label: "Mark as in progress", icon: "◐", onClick: () => props.onSetStatus([lesson.id], "in-progress") });
    if (p.status !== "not-started" || p.quizzes.length) items.push({ label: "Reset progress", icon: "↺", danger: true, onClick: () => props.onSetStatus([lesson.id], "reset") });
    setMenu({ anchor: (e.currentTarget as HTMLElement).getBoundingClientRect(), items });
  };

  const levelMenu = (e: MouseEvent, levelIndex: number) => {
    e.stopPropagation();
    const ids = curriculum.levels[levelIndex].modules.flatMap((m) => m.lessons.map((l) => l.id));
    const notStarted = ids.filter((id) => progressOf(id).status === "not-started");
    setMenu({
      anchor: (e.currentTarget as HTMLElement).getBoundingClientRect(),
      items: [
        { label: "Level", heading: true },
        {
          label: `Skip ${notStarted.length} unstarted lesson${notStarted.length === 1 ? "" : "s"}`,
          icon: "↷",
          disabled: notStarted.length === 0,
          onClick: () => props.onSetStatus(notStarted, "skipped"),
        },
        {
          label: "Reset level progress",
          icon: "↺",
          danger: true,
          onClick: () => props.onSetStatus(ids, "reset"),
        },
      ],
    });
  };

  const pct = stats.total ? stats.done / stats.total : 0;
  const nextProgress = next ? progressOf(next.lesson.id) : null;
  const suggested = props.suggestedStartLevel;
  const suggestedSkip = curriculum.levels
    .slice(0, suggested)
    .flatMap((l) => l.modules.flatMap((m) => m.lessons))
    .filter((l) => progressOf(l.id).status === "not-started")
    .map((l) => l.id);

  return (
    <div className="co-roadmap">
      <section className="co-overview">
        <div className="co-overview-ring">
          <ProgressRing value={pct} size={84} stroke={8}>
            <span className="co-overview-pct">
              {Math.round(pct * 100)}
              <small>%</small>
            </span>
          </ProgressRing>
        </div>
        <div className="co-overview-head">
          <div className="co-overview-kicker">Your progress</div>
          <div className="co-overview-line">
            <strong>{stats.done}</strong> of {stats.total} lessons complete
            <span className="faint"> · </span>
            {stats.mastered} mastered{stats.skipped ? `, ${stats.skipped} skipped` : ""}
            {stats.averageMastery > 0 && (
              <>
                <span className="faint"> · </span>avg. quiz {Math.round(stats.averageMastery * 100)}%
              </>
            )}
          </div>
        </div>
        {curriculum.overview && <p className="co-overview-text">{curriculum.overview}</p>}
        <div className="co-overview-actions">
          <button type="button" className="btn btn-sm" onClick={props.onPlacement}>
            🧭 Placement test
          </button>
          <button type="button" className="btn btn-sm" onClick={props.onOpenChat}>
            💬 Ask the tutor
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={props.onRegenerate}>
            ↻ Redesign roadmap
          </button>
        </div>
      </section>

      {props.showPlacementHint && (
        <section className="co-hint">
          <span className="co-hint-icon" aria-hidden>
            🧭
          </span>
          <div className="grow">
            <div className="co-hint-title">Already know some of this?</div>
            <div className="muted small">
              Take a 5-minute placement test and skip what you already know
              {suggested > 0 && suggestedSkip.length > 0
                ? `, or skip ${curriculum.levels
                    .slice(0, suggested)
                    .map((l) => l.name)
                    .join(" and ")} based on your self-assessment.`
                : "."}
            </div>
            <div className="co-hint-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={props.onPlacement}>
                Take placement test
              </button>
              {suggested > 0 && suggestedSkip.length > 0 && (
                <button type="button" className="btn btn-sm" onClick={() => props.onSetStatus(suggestedSkip, "skipped")}>
                  Skip {suggestedSkip.length} lessons
                </button>
              )}
            </div>
          </div>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={props.onDismissPlacementHint}>
            ✕
          </button>
        </section>
      )}

      {next && nextProgress ? (
        <section className="co-next" aria-label="Next up">
          <div className="co-next-kicker">
            <span className="co-next-tag">Next up</span>
            <span className="ellipsis">
              {next.level.name} · {next.module.title}
            </span>
          </div>
          <button type="button" className="co-next-title" onClick={() => props.onOpenLesson(next.lesson.id)}>
            <span dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(next.lesson.title) }} />
          </button>
          {next.lesson.objectives.length > 0 && (
            <ul className="co-next-objectives">
              {next.lesson.objectives.slice(0, 3).map((o, i) => (
                <li key={i} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(o) }} />
              ))}
            </ul>
          )}
          <div className="co-next-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => props.onOpenLesson(next.lesson.id, { start: !props.hasPage(next.lesson.id) })}
            >
              {props.writing(next.lesson.id) ? "Writing…" : nextActionLabel(nextProgress, props.hasPage(next.lesson.id))} →
            </button>
            <StatusBadge progress={nextProgress} />
          </div>
        </section>
      ) : (
        <section className="co-next done">
          <div className="co-next-title">🎓 You've completed the whole course.</div>
          <p className="muted">
            From first principles to the research frontier. Keep your knowledge fresh with spaced repetition, or ask the
            tutor where to go next.
          </p>
        </section>
      )}

      <section className="co-ladder" aria-label="Roadmap">
        {curriculum.levels.map((level, li) => {
          const ls = stats.levels[li];
          const open = expanded.has(level.id);
          const complete = ls.total > 0 && ls.done === ls.total;
          const current = li === stats.currentLevelIndex && !complete;
          return (
            <div key={level.id} className={`co-level${complete ? " complete" : ""}${current ? " current" : ""}${open ? " open" : ""}`}>
              <div className="co-level-rail" aria-hidden>
                <span className="co-level-node">{complete ? "✓" : li + 1}</span>
              </div>
              <div className="co-level-body">
                <div className="co-level-head">
                  <button type="button" className="co-level-toggle" aria-expanded={open} onClick={() => toggle(level.id)}>
                    <span className="co-level-name">
                      {level.name}
                      {current && <span className="co-here">You are here</span>}
                    </span>
                    <span className="co-level-summary">{level.summary}</span>
                  </button>
                  <div className="co-level-stat">
                    <ProgressBar value={ls.total ? ls.done / ls.total : 0} tone={complete ? "success" : "accent"} label={`${level.name} progress`} />
                    <span className="co-num">
                      {ls.done}/{ls.total}
                    </span>
                    <button type="button" className="icon-btn co-more" aria-label={`${level.name} options`} onClick={(e) => levelMenu(e, li)}>
                      ⋯
                    </button>
                    <button type="button" className="icon-btn co-chevron" aria-label={open ? "Collapse" : "Expand"} onClick={() => toggle(level.id)}>
                      <span className={`co-caret${open ? " open" : ""}`} />
                    </button>
                  </div>
                </div>
                {open && (
                  <div className="co-modules">
                    {level.modules.map((m, mi) => {
                      const mOpen = expanded.has(m.id);
                      const mDone = m.lessons.filter((l) => {
                        const s = progressOf(l.id).status;
                        return s === "mastered" || s === "skipped";
                      }).length;
                      return (
                        <div key={m.id} className={`co-module${mOpen ? " open" : ""}`}>
                          <button type="button" className="co-module-head" aria-expanded={mOpen} onClick={() => toggle(m.id)}>
                            <span className={`co-caret${mOpen ? " open" : ""}`} />
                            <span className="co-module-index">
                              {li + 1}.{mi + 1}
                            </span>
                            <span className="grow co-module-text">
                              <span className="co-module-title">{m.title}</span>
                              {m.summary && <span className="co-module-summary">{m.summary}</span>}
                            </span>
                            <span className={`co-num co-module-count${mDone === m.lessons.length ? " done" : ""}`}>
                              {mDone === m.lessons.length ? "✓ " : ""}
                              {mDone}/{m.lessons.length}
                            </span>
                          </button>
                          {mOpen && (
                            <ul className="co-lessons">
                              {m.lessons.map((lesson) => {
                                const p = progressOf(lesson.id);
                                const isNext = next?.lesson.id === lesson.id;
                                const writing = props.writing(lesson.id);
                                return (
                                  <li key={lesson.id}>
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      className={`co-lesson ${p.status}${isNext ? " next" : ""}`}
                                      onClick={() => props.onOpenLesson(lesson.id)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          props.onOpenLesson(lesson.id);
                                        }
                                      }}
                                    >
                                      <StatusDot status={p.status} />
                                      <span className="co-lesson-title" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(lesson.title) }} />
                                      <span className="co-lesson-tags">
                                        {writing && (
                                          <span className="co-tag writing">
                                            <span className="spinner" /> Writing
                                          </span>
                                        )}
                                        {isNext && !writing && <span className="co-tag next">Next up</span>}
                                        {!writing && props.hasPage(lesson.id) && p.status !== "mastered" && (
                                          <span className="co-tag page" title="Lesson written">
                                            📘
                                          </span>
                                        )}
                                        {p.quizzes.length > 0 && (
                                          <span className={`co-tag score${p.mastery >= 0.8 ? " good" : ""}`}>{Math.round(p.mastery * 100)}%</span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        className="icon-btn co-more"
                                        aria-label={`Options for ${lesson.title}`}
                                        onClick={(e) => lessonMenu(e, lesson)}
                                      >
                                        ⋯
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </div>
  );
}


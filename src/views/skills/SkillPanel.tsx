// Side panel (bottom sheet on phones) for the selected skill: details, XP,
// practice logging, quests, prerequisites, linked courses and notes, history.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { displayTitle, defaultIcon, type PageMeta } from "../../../shared/model.ts";
import {
  addQuest,
  canAddParent,
  completeQuest,
  deleteSkill,
  ensureSkillPage,
  levelForXp,
  logPractice,
  MAX_LEVEL,
  practiceXp,
  rankForLevel,
  removeQuest,
  removeXpEntry,
  setParents,
  themedColor,
  totalXp,
  undoQuest,
  updateSkill,
  xpEntries,
  courseXp,
  questStatus,
  MAX_PRACTICE_MINUTES,
  type QuestCadence,
  type XpEntry,
  type XpSource,
} from "../../../shared/skills.ts";
import { useApp, usePages } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { EmojiPicker, Icon, Popover, timeAgo, type Anchor } from "../../components/ui.tsx";
import { fmt, plural, type SkillTreeData } from "./useSkillData.ts";
import { levelUpMessage } from "./Overview.tsx";

const SOURCE_LABEL: Record<XpSource, string> = {
  practice: "Practice",
  lesson: "Lesson",
  quiz: "Quiz",
  flashcards: "Flashcards",
  task: "Task",
  manual: "Manual",
  claude: "Claude",
  quest: "Quest",
};

function historyText(e: XpEntry, questTitles: Map<string, string>): string {
  if (e.source === "quest") return questTitles.get(e.note) ?? "Quest";
  return e.note || SOURCE_LABEL[e.source];
}

function historyMeta(e: XpEntry): string {
  const kind = e.source === "quest" ? "Quest" : e.note && e.note !== SOURCE_LABEL[e.source] ? SOURCE_LABEL[e.source] : "";
  return [kind, e.minutes ? `${e.minutes} min` : ""].filter(Boolean).join(" · ");
}

function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="sk-section">
      <header className="sk-section-head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function XpBar({ fraction, color, label }: { fraction: number; color: string; label?: string }) {
  return (
    <div
      className="sk-xpbar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      aria-label={label}
      style={{ ["--c" as string]: color }}
    >
      <div className="sk-xpbar-fill" style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    </div>
  );
}

/** Text input that commits on blur/Enter and follows remote changes while not focused. */
function DraftInput({
  value,
  onCommit,
  className,
  placeholder,
  multiline,
  ariaLabel,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    className,
    placeholder,
    value: draft,
    "aria-label": ariaLabel,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      commit();
    },
  };
  return multiline ? (
    <textarea {...common} rows={3} onChange={(e) => setDraft(e.target.value)} />
  ) : (
    <input
      {...common}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          focused.current = false;
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

function PagePicker({
  anchor,
  pages,
  onPick,
  onClose,
}: {
  anchor: Anchor;
  pages: PageMeta[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pages
      .filter((p) => !needle || displayTitle(p).toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 40);
  }, [pages, q]);
  return (
    <Popover anchor={anchor} onClose={onClose} className="menu sk-picker">
      <input
        className="input"
        autoFocus
        placeholder="Search pages…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && list[0]) {
            onPick(list[0].id);
            onClose();
          }
        }}
      />
      <div className="sk-picker-list">
        {list.length === 0 && <div className="sk-picker-empty muted small">No matching pages</div>}
        {list.map((p) => (
          <button
            key={p.id}
            className="menu-item"
            onClick={() => {
              onPick(p.id);
              onClose();
            }}
          >
            <span>{p.icon || defaultIcon(p.kind)}</span>
            <span className="grow ellipsis">{displayTitle(p)}</span>
          </button>
        ))}
      </div>
    </Popover>
  );
}

export function SkillPanel({
  ws,
  data,
  skillId,
  dark,
  onClose,
  onSelect,
  onAddChild,
}: {
  ws: Workspace;
  data: SkillTreeData;
  skillId: string;
  dark: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const { openPage, createAndOpen, toast } = useApp();
  const pages = usePages(ws);
  const doc = ws.doc;
  const skill = data.byId.get(skillId);
  const stats = data.stats.get(skillId);
  const [emojiAnchor, setEmojiAnchor] = useState<Anchor | null>(null);
  const [notePicker, setNotePicker] = useState<Anchor | null>(null);
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [addingQuest, setAddingQuest] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConfirmDelete(false);
    setAddingQuest(false);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [skillId]);

  const entries = useMemo(() => xpEntries(doc, skillId), [doc, skillId, data.version]);
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);

  if (!skill || !stats) return null;

  const area = data.areas.find((a) => a.id === skill.category);
  const color = themedColor(skill.color || area?.color || "#8b8d98", dark);
  const rank = stats.rank;
  const children = data.skills.filter((s) => s.parents.includes(skill.id));
  const parents = skill.parents.map((p) => data.byId.get(p)).filter((s): s is NonNullable<typeof s> => !!s);
  const parentOptions = data.skills.filter((s) => !skill.parents.includes(s.id) && canAddParent(doc, skill.id, s.id));
  const courses = skill.courseIds.map((id) => ({ id, meta: pageById.get(id), xp: courseXp(doc, id) }));
  const coursePages = pages.filter((p) => p.kind === "course" && !skill.courseIds.includes(p.id));
  const notes = skill.pageIds.map((id) => ({ id, meta: pageById.get(id) })).filter((n) => n.meta);
  const notePages = pages.filter((p) => !skill.pageIds.includes(p.id) && !skill.courseIds.includes(p.id));
  const questTitles = new Map((skill.quests ?? []).map((q) => [q.id, q.title]));

  const celebrate = (before: number) => {
    const msg = levelUpMessage(skill.name, before, levelForXp(totalXp(doc, skill.id)));
    if (msg) toast(msg);
  };

  const log = (mins: number) => {
    if (!(mins > 0)) return;
    const before = stats.level;
    const e = logPractice(doc, skill.id, mins, note.trim());
    if (!e) return;
    setNote("");
    setMinutes("");
    celebrate(before);
  };

  const toggleQuest = (questId: string, done: boolean) => {
    const before = stats.level;
    if (done) undoQuest(doc, skill.id, questId);
    else {
      completeQuest(doc, skill.id, questId);
      celebrate(before);
    }
  };

  const createCourse = () => {
    const id = createAndOpen({ kind: "course", title: skill.name, icon: "🎓" });
    updateSkill(doc, skill.id, { courseIds: [...skill.courseIds, id] });
  };

  const customMinutes = Number(minutes);
  const nextXp = stats.progress.next;

  return (
    <aside className={`sk-panel${expanded ? " expanded" : ""}`} aria-label={`${skill.name} details`} style={{ ["--c" as string]: color }}>
      <button className="sk-sheet-handle" onClick={() => setExpanded((x) => !x)} aria-label={expanded ? "Collapse panel" : "Expand panel"}>
        <span />
      </button>
      <div className="sk-panel-head">
        <button
          className={`sk-panel-badge${stats.unlocked ? "" : " locked"}`}
          onClick={(e) => setEmojiAnchor(e.currentTarget.getBoundingClientRect())}
          aria-label="Change icon"
          title="Change icon"
        >
          <span>{skill.icon}</span>
        </button>
        <div className="grow col" style={{ gap: 4 }}>
          <DraftInput
            className="sk-name-input"
            value={skill.name}
            ariaLabel="Skill name"
            placeholder="Skill name"
            onCommit={(v) => v.trim() && updateSkill(doc, skill.id, { name: v.trim() })}
          />
          <div className="row">
            <label className="sk-area-pick" title="Life area">
              <span className="sk-dot-c" aria-hidden />
              {area ? area.name : skill.category || "Other"}
              <Icon name="down" size={12} />
              <select value={skill.category} aria-label="Life area" onChange={(e) => updateSkill(doc, skill.id, { category: e.target.value })}>
                {!area && <option value={skill.category}>{skill.category || "Other"}</option>}
                {data.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.icon} {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={() => {
            const id = ensureSkillPage(doc, skill.id);
            if (id) openPage(id);
          }}
          title="Open this skill’s page (notes, quests, practice log)"
          aria-label="Open page"
        >
          <Icon name="open" />
        </button>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <Icon name="x" />
        </button>
      </div>

      <div className="sk-panel-body" ref={bodyRef}>
        <div className="sk-level-card">
          <div className="sk-level-row">
            <div>
              <div className="sk-level-num">
                Level {stats.level}
                <span className="sk-rank" title={rank.description}>
                  {rank.name}
                </span>
              </div>
            </div>
            {stats.streak.current > 0 && (
              <div className={`sk-streak${stats.streak.today ? " today" : ""}`} title={`Best: ${plural(stats.streak.best, "day")}${stats.streak.today ? "" : " · practise today to keep it"}`}>
                {stats.streak.current}-day streak
              </div>
            )}
          </div>
          <XpBar fraction={stats.progress.fraction} color={color} label="XP toward next level" />
          <div className="sk-level-foot small">
            {nextXp !== null ? (
              <span>
                <strong>{fmt(stats.xp - stats.progress.floor)}</strong> / {fmt(nextXp - stats.progress.floor)} XP to level {stats.level + 1}
              </span>
            ) : (
              <span>
                <strong>Max level reached</strong>
              </span>
            )}
            <span className="muted" title={stats.courseXp > 0 ? `${fmt(stats.courseXp)} XP from linked courses` : undefined}>
              {fmt(stats.xp)} XP total{stats.courseXp > 0 && ` · ${fmt(stats.courseXp)} from courses`}
            </span>
          </div>
          <label className="sk-goal row small">
            <span className="muted">Goal</span>
            <select
              className="sk-goal-select"
              value={skill.goalLevel ?? ""}
              onChange={(e) => updateSkill(doc, skill.id, { goalLevel: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">No goal</option>
              {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1)
                .filter((l) => l > 1)
                .map((l) => (
                  <option key={l} value={l}>
                    Level {l} · {rankForLevel(l).name}
                  </option>
                ))}
            </select>
            {skill.goalLevel && (
              <span className={stats.goalReached ? "sk-goal-done" : "muted"}>
                {stats.goalReached ? "Reached" : `${plural(Math.max(0, skill.goalLevel - stats.level), "level")} to go`}
              </span>
            )}
          </label>
        </div>

        {!stats.unlocked && (
          <div className="sk-locked-note" role="note">
            <Icon name="lock" size={15} />
            <div>
              <strong>Locked.</strong> Reach{" "}
              {stats.missing.map((m, i) => (
                <span key={m.parentId}>
                  {i > 0 && (i === stats.missing.length - 1 ? " and " : ", ")}
                  <button className="sk-link" onClick={() => onSelect(m.parentId)}>
                    {m.name}
                  </button>{" "}
                  level {m.need} (now {m.have})
                </span>
              ))}{" "}
              to unlock it. Practice still earns XP.
            </div>
          </div>
        )}

        <Section title="Log practice">
          <div className="sk-quick">
            {[15, 30, 60].map((m) => (
              <button key={m} className="sk-quick-btn" onClick={() => log(m)}>
                <strong>{m} min</strong>
                <span>{fmt(practiceXp(m))} XP</span>
              </button>
            ))}
          </div>
          <div className="sk-log-row">
            <input
              className="input sk-min-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_PRACTICE_MINUTES}
              placeholder="Min"
              aria-label="Minutes"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && log(customMinutes)}
            />
            <input
              className="input grow"
              placeholder="What did you practise? (optional)"
              aria-label="Practice note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && customMinutes > 0 && log(customMinutes)}
            />
            <button className="btn btn-primary" disabled={!(customMinutes > 0)} onClick={() => log(customMinutes)}>
              Log{customMinutes > 0 ? ` +${fmt(practiceXp(customMinutes))}` : ""}
            </button>
          </div>
        </Section>

        <Section
          title="Quests"
          aside={
            !addingQuest && (
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingQuest(true)}>
                <Icon name="plus" size={14} /> Add
              </button>
            )
          }
        >
          {(skill.quests ?? []).length === 0 && !addingQuest && (
            <p className="sk-empty-line">Recurring habits that earn XP, like “Run 3× a week” or “Read 20 min daily”.</p>
          )}
          <div className="sk-quest-list">
            {(skill.quests ?? []).map((q) => {
              const st = questStatus(entries, q, data.now);
              return (
                <div key={q.id} className={`sk-quest${st.done ? " done" : ""}`}>
                  <button
                    className="sk-check"
                    role="checkbox"
                    aria-checked={st.done}
                    aria-label={st.done ? `Undo ${q.title}` : `Complete ${q.title}`}
                    onClick={() => toggleQuest(q.id, st.done)}
                  >
                    {st.done ? <Icon name="check" size={14} stroke={2.6} /> : st.count > 0 ? <span className="sk-check-count">{st.count}</span> : null}
                  </button>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis sk-quest-title">{q.title}</div>
                    <div className="small muted">
                      {q.target > 1 ? `${st.count}/${q.target} this ${q.cadence === "daily" ? "day" : "week"}` : q.cadence === "daily" ? "Daily" : "Weekly"}
                      {st.streak > 1 && ` · ${st.streak}-${q.cadence === "daily" ? "day" : "week"} streak`}
                    </div>
                  </div>
                  <span className="sk-quest-xp">{q.xp} XP</span>
                  <button className="icon-btn sk-row-action" aria-label={`Remove quest ${q.title}`} onClick={() => removeQuest(doc, skill.id, q.id)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          {addingQuest && <QuestForm onCancel={() => setAddingQuest(false)} onSave={(q) => (addQuest(doc, skill.id, q), setAddingQuest(false))} />}
        </Section>

        <Section
          title="Prerequisites"
          aside={
            parents.length > 0 && (
              <label className="row small muted" style={{ gap: 6 }}>
                Unlock at level
                <input
                  className="input sk-num"
                  type="number"
                  min={1}
                  max={MAX_LEVEL}
                  value={skill.requiredLevel}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(e.target.value) || 1)));
                    updateSkill(doc, skill.id, { requiredLevel: v });
                  }}
                />
              </label>
            )
          }
        >
          {parents.length === 0 && <p className="sk-empty-line">A root skill: always unlocked.</p>}
          <div className="sk-link-list">
            {parents.map((p) => {
              const ps = data.stats.get(p.id)!;
              const met = ps.level >= skill.requiredLevel;
              return (
                <div key={p.id} className="sk-link-row">
                  <button className="sk-link-main" onClick={() => onSelect(p.id)}>
                    <span className="sk-mini-badge">{p.icon}</span>
                    <span className="grow ellipsis">{p.name}</span>
                    <span className={`small ${met ? "sk-met" : "muted"}`}>
                      Level {ps.level}
                      {met ? "" : ` of ${skill.requiredLevel}`}
                    </span>
                  </button>
                  <button
                    className="icon-btn sk-row-action"
                    aria-label={`Remove prerequisite ${p.name}`}
                    onClick={() => setParents(doc, skill.id, skill.parents.filter((x) => x !== p.id))}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
          {parentOptions.length > 0 && (
            <select
              className="select sk-add-select"
              value=""
              aria-label="Add prerequisite"
              onChange={(e) => e.target.value && setParents(doc, skill.id, [...skill.parents, e.target.value])}
            >
              <option value="">+ Add prerequisite…</option>
              {parentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          )}
        </Section>

        <Section
          title="Leads to"
          aside={
            <button className="btn btn-ghost btn-sm" onClick={() => onAddChild(skill.id)}>
              <Icon name="plus" size={14} /> Sub-skill
            </button>
          }
        >
          {children.length === 0 && <p className="sk-empty-line">Nothing builds on this skill yet.</p>}
          <div className="sk-link-list">
            {children.map((c) => {
              const cs = data.stats.get(c.id)!;
              return (
                <div key={c.id} className="sk-link-row">
                  <button className="sk-link-main" onClick={() => onSelect(c.id)}>
                    <span className="sk-mini-badge">{c.icon}</span>
                    <span className="grow ellipsis">{c.name}</span>
                    <span className="small muted">{cs.unlocked ? `Level ${cs.level}` : `Locked · needs level ${c.requiredLevel}`}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Courses">
          {courses.length === 0 && <p className="sk-empty-line">Link a course: every mastered lesson earns 120 XP.</p>}
          <div className="sk-link-list">
            {courses.map(({ id, meta, xp }) => (
              <div key={id} className="sk-link-row">
                <button className="sk-link-main" disabled={!meta} onClick={() => meta && openPage(id)}>
                  <span className="sk-mini-badge">{meta?.icon || "🎓"}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="ellipsis" style={{ display: "block" }}>
                      {meta ? displayTitle(meta) : "Deleted course"}
                    </span>
                    {xp.total > 0 ? (
                      <span className="sk-course-progress">
                        <XpBar fraction={(xp.mastered + xp.skipped) / xp.total} color={color} />
                        <span className="small muted">
                          {xp.mastered}/{xp.total} mastered{xp.xp > 0 && ` · +${fmt(xp.xp)} XP`}
                        </span>
                      </span>
                    ) : (
                      meta && <span className="small muted">No roadmap yet: open it to design the course</span>
                    )}
                  </span>
                </button>
                <button
                  className="icon-btn sk-row-action"
                  aria-label="Unlink course"
                  onClick={() => updateSkill(doc, skill.id, { courseIds: skill.courseIds.filter((c) => c !== id) })}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn btn-sm" onClick={createCourse}>
              <Icon name="cap" size={14} /> Create a course
            </button>
            {coursePages.length > 0 && (
              <select
                className="select sk-add-select sm"
                value=""
                aria-label="Link existing course"
                onChange={(e) => e.target.value && updateSkill(doc, skill.id, { courseIds: [...skill.courseIds, e.target.value] })}
              >
                <option value="">Link existing…</option>
                {coursePages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon || "🎓"} {displayTitle(p)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </Section>

        <Section
          title="Notes"
          aside={
            <button className="btn btn-ghost btn-sm" onClick={(e) => setNotePicker(e.currentTarget.getBoundingClientRect())}>
              <Icon name="link" size={14} /> Link
            </button>
          }
        >
          {notes.length === 0 && <p className="sk-empty-line">Link pages with your notes, resources and progress.</p>}
          <div className="sk-link-list">
            {notes.map(({ id, meta }) => (
              <div key={id} className="sk-link-row">
                <button className="sk-link-main" onClick={() => openPage(id)}>
                  <span className="sk-mini-badge">{meta!.icon || defaultIcon(meta!.kind)}</span>
                  <span className="grow ellipsis">{displayTitle(meta!)}</span>
                  <Icon name="open" size={14} />
                </button>
                <button
                  className="icon-btn sk-row-action"
                  aria-label="Unlink note"
                  onClick={() => updateSkill(doc, skill.id, { pageIds: skill.pageIds.filter((p) => p !== id) })}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Description">
          <DraftInput
            multiline
            className="textarea sk-desc"
            value={skill.description}
            placeholder="What does mastering this look like?"
            ariaLabel="Description"
            onCommit={(v) => updateSkill(doc, skill.id, { description: v })}
          />
        </Section>

        <Section title="History" aside={entries.length > 0 && <span className="small muted">{plural(entries.length, "entry", "entries")}</span>}>
          {entries.length === 0 && <p className="sk-empty-line">No XP logged yet. Log a practice session to begin.</p>}
          <div className="sk-history">
            {[...entries]
              .reverse()
              .slice(0, 12)
              .map((e: XpEntry, i) => (
                <div key={`${e.at}-${i}`} className="sk-history-row">
                  <span className="grow ellipsis">
                    {historyText(e, questTitles)}
                    {historyMeta(e) && <span className="muted"> · {historyMeta(e)}</span>}
                  </span>
                  <span className={`sk-history-xp${e.amount < 0 ? " neg" : ""}`}>
                    {e.amount >= 0 ? "+" : ""}
                    {fmt(e.amount)} XP
                  </span>
                  <span className="small faint sk-history-time">{timeAgo(e.at)}</span>
                  <button className="icon-btn sk-row-action" aria-label="Remove entry" onClick={() => removeXpEntry(doc, skill.id, e)}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
          </div>
        </Section>

        <div className="sk-danger">
          {confirmDelete ? (
            <div className="sk-confirm">
              <span className="grow small">Move “{skill.name}” and its page to the trash? Restoring the page brings back its XP.</span>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  deleteSkill(doc, skill.id);
                  onClose();
                }}
              >
                Move to trash
              </button>
            </div>
          ) : (
            <>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  updateSkill(doc, skill.id, { archived: true });
                  toast(`Archived “${skill.name}”`);
                  onClose();
                }}
              >
                Archive
              </button>
              <button className="btn btn-sm btn-ghost sk-delete" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={14} /> Delete skill
              </button>
            </>
          )}
        </div>
      </div>

      {emojiAnchor && (
        <EmojiPicker anchor={emojiAnchor} onClose={() => setEmojiAnchor(null)} onPick={(e) => e && updateSkill(doc, skill.id, { icon: e })} />
      )}
      {notePicker && (
        <PagePicker
          anchor={notePicker}
          pages={notePages}
          onClose={() => setNotePicker(null)}
          onPick={(id) => updateSkill(doc, skill.id, { pageIds: [...skill.pageIds, id] })}
        />
      )}
    </aside>
  );
}

export function QuestForm({
  onSave,
  onCancel,
}: {
  onSave: (q: { title: string; cadence: QuestCadence; target: number; xp: number }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<QuestCadence>("daily");
  const [target, setTarget] = useState(1);
  const [xp, setXp] = useState(25);
  const save = () => title.trim() && onSave({ title: title.trim(), cadence, target, xp });
  return (
    <div className="sk-quest-form">
      <input
        className="input"
        autoFocus
        placeholder="e.g. Run 5 km, Read 20 minutes"
        aria-label="Quest title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="row wrap" style={{ gap: 6 }}>
        <div className="tabs" role="radiogroup" aria-label="Cadence">
          {(["daily", "weekly"] as const).map((c) => (
            <button
              key={c}
              className={`tab${cadence === c ? " active" : ""}`}
              role="radio"
              aria-checked={cadence === c}
              onClick={() => {
                setCadence(c);
                setXp(c === "daily" ? 25 : 60);
              }}
            >
              {c === "daily" ? "Daily" : "Weekly"}
            </button>
          ))}
        </div>
        <label className="row small muted" style={{ gap: 4 }}>
          <input
            className="input sk-num"
            type="number"
            min={1}
            max={cadence === "daily" ? 20 : 50}
            value={target}
            aria-label="Times per period"
            onChange={(e) => setTarget(Math.max(1, Math.round(Number(e.target.value) || 1)))}
          />
          × per {cadence === "daily" ? "day" : "week"}
        </label>
        <label className="row small muted" style={{ gap: 4 }}>
          <input
            className="input sk-num"
            type="number"
            min={1}
            max={1000}
            value={xp}
            aria-label="XP per completion"
            onChange={(e) => setXp(Math.max(1, Math.round(Number(e.target.value) || 1)))}
          />
          XP
        </label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
        <button className="btn btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-sm btn-primary" disabled={!title.trim()} onClick={save}>
          Add quest
        </button>
      </div>
    </div>
  );
}

// Overview: a D&D-style character sheet. Overall level and class, the six
// ability scores, today's quests and recent activity.

import { useMemo, useRef, useState } from "react";
import {
  ABILITY_SKILLS,
  completeQuest,
  formatModifier,
  levelForXp,
  rankForLevel,
  scoreProgress,
  themedColor,
  totalXp,
  undoQuest,
  xpEntries,
  type AreaStats,
  type TodayQuest,
  type XpSource,
} from "../../../shared/skills.ts";
import { useApp } from "../../lib/hooks.ts";
import { useSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Avatar, Icon, timeAgo } from "../../components/ui.tsx";
import { XpBar } from "./SkillPanel.tsx";
import { fmt, plural, type SkillTreeData } from "./useSkillData.ts";

/** Quiet toast after a check-off or log that crossed a level. */
export function levelUpMessage(name: string, before: number, after: number): string | null {
  if (after <= before) return null;
  const r0 = rankForLevel(before);
  const r1 = rankForLevel(after);
  return r1.id !== r0.id ? `Level ${after} · ${name} · now ${r1.name}` : `Level ${after} · ${name}`;
}

/** Ability scores on a hexagon: the center is 8, the outer ring 20 (or the best score, if higher). */
function Radar({ areas, dark, onPick }: { areas: AreaStats[]; dark: boolean; onPick: (areaId: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const n = areas.length;
  const size = 360;
  const c = size / 2;
  const R = 108;
  const LOW = 8;
  const top = Math.max(20, ...areas.map((a) => a.score));
  const max = top + (top % 2);
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number) => ({ x: c + Math.cos(angle(i)) * r, y: c + Math.sin(angle(i)) * r });
  const rings = [0.25, 0.5, 0.75, 1];
  const poly = areas.map((a, i) => pt(i, ((Math.min(a.score, max) - LOW) / (max - LOW)) * R));
  const hasData = areas.some((a) => a.xp > 0);
  if (n < 3) {
    return <div className="sk-radar-empty muted small">Add at least three abilities to see your scores.</div>;
  }
  const hovered = hover ? areas[hover.i] : null;
  return (
    <div className="sk-radar" ref={hostRef} onPointerLeave={() => setHover(null)}>
      <svg
        viewBox={`-40 0 ${size + 80} ${size}`}
        role="img"
        aria-label={`Ability scores: ${areas.map((a) => `${a.area.name} ${a.score}, modifier ${formatModifier(a.modifier)}`).join("; ")}`}
      >
        {rings.map((f) => (
          <polygon key={f} className="sk-radar-ring" points={areas.map((_, i) => pt(i, f * R)).map((p) => `${p.x},${p.y}`).join(" ")} />
        ))}
        {areas.map((_, i) => {
          const p = pt(i, R);
          return <line key={i} className="sk-radar-axis" x1={c} y1={c} x2={p.x} y2={p.y} />;
        })}
        <polygon className={`sk-radar-shape${hasData ? "" : " base"}`} points={poly.map((p) => `${p.x},${p.y}`).join(" ")} />
        {areas.map((a, i) => {
          const p = poly[i];
          const color = themedColor(a.area.color, dark);
          const lp = pt(i, R + 26);
          const anchor = Math.abs(lp.x - c) < 8 ? "middle" : lp.x > c ? "start" : "end";
          const show = (e: React.PointerEvent | React.FocusEvent) => {
            const host = hostRef.current?.getBoundingClientRect();
            const r = (e.currentTarget as Element).getBoundingClientRect();
            if (host) setHover({ i, x: r.left + r.width / 2 - host.left, y: r.top - host.top });
          };
          return (
            <g
              key={a.area.id}
              className="sk-radar-point"
              tabIndex={0}
              role="button"
              aria-label={`${a.area.name}: score ${a.score} (${formatModifier(a.modifier)}), ${plural(a.skills, "skill")}. Show in tree`}
              onPointerEnter={show}
              onFocus={show}
              onBlur={() => setHover(null)}
              onClick={() => onPick(a.area.id)}
              onKeyDown={(e) => e.key === "Enter" && onPick(a.area.id)}
            >
              <circle cx={lp.x} cy={lp.y} r={24} className="sk-radar-hit" />
              {hasData && <circle cx={p.x} cy={p.y} r={4} fill={color} className="sk-radar-dot" />}
              <text x={lp.x} y={lp.y - 4} textAnchor={anchor} className="sk-radar-label">
                {a.area.attribute || a.area.name}
              </text>
              <text x={lp.x} y={lp.y + 12} textAnchor={anchor} className="sk-radar-value">
                {a.score} ({formatModifier(a.modifier)})
              </text>
            </g>
          );
        })}
      </svg>
      <div className="sk-radar-caption small faint">
        Center 8 · outer ring {max} · 10 is an average person
      </div>
      {hover && hovered && (
        <div className="sk-radar-tip" style={{ left: hover.x, top: hover.y }}>
          <strong>
            {hovered.area.icon} {hovered.area.name} {hovered.score} ({formatModifier(hovered.modifier)})
          </strong>
          <span>
            {hovered.skills > 0 ? `Level ${hovered.level} · ${fmt(hovered.xp)} XP · ${plural(hovered.skills, "skill")}` : "No skills yet"}
          </span>
        </div>
      )}
    </div>
  );
}

export function QuestCheck({ ws, q, compact }: { ws: Workspace; q: TodayQuest; compact?: boolean }) {
  const { toast } = useApp();
  const st = q.status;
  const toggle = () => {
    if (st.done) {
      undoQuest(ws.doc, q.skill.id, st.quest.id);
      return;
    }
    const before = levelForXp(totalXp(ws.doc, q.skill.id));
    if (!completeQuest(ws.doc, q.skill.id, st.quest.id)) return;
    const msg = levelUpMessage(q.skill.name, before, levelForXp(totalXp(ws.doc, q.skill.id)));
    if (msg) toast(msg);
  };
  const progress = st.target > 1 ? `${st.count}/${st.target}` : null;
  if (compact) {
    return (
      <button
        className={`sk-qchip${st.done ? " done" : ""}`}
        onClick={toggle}
        role="checkbox"
        aria-checked={st.done}
        title={`${st.quest.title} · ${q.skill.name} · ${st.quest.xp} XP${st.done ? " (click to undo)" : ""}`}
      >
        <span className="sk-qchip-check">{st.done ? <Icon name="check" size={11} stroke={3} /> : null}</span>
        <span className="sk-qchip-title">{st.quest.title}</span>
        {progress && <span className="sk-qchip-meta">{progress}</span>}
        {!st.done && <span className="sk-qchip-meta">{st.quest.xp} XP</span>}
      </button>
    );
  }
  return (
    <div className={`sk-quest${st.done ? " done" : ""}`}>
      <button className="sk-check" role="checkbox" aria-checked={st.done} aria-label={st.done ? `Undo ${st.quest.title}` : `Complete ${st.quest.title}`} onClick={toggle}>
        {st.done ? <Icon name="check" size={13} stroke={2.6} /> : st.count > 0 ? <span className="sk-check-count">{st.count}</span> : null}
      </button>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis sk-quest-title">{st.quest.title}</div>
        <div className="small muted ellipsis">
          {q.skill.icon} {q.skill.name} · {st.quest.cadence === "daily" ? "Daily" : "Weekly"}
          {progress && ` · ${progress}`}
          {st.streak > 1 && ` · ${st.streak}-${st.quest.cadence === "daily" ? "day" : "week"} streak`}
        </div>
      </div>
      <span className="sk-quest-xp">{st.quest.xp} XP</span>
    </div>
  );
}

const SOURCE_LABEL: Record<XpSource, string> = {
  practice: "Practice",
  lesson: "Lesson",
  quiz: "Quiz",
  flashcards: "Flashcards",
  task: "Task",
  manual: "XP",
  claude: "Claude",
  quest: "Quest",
};

export function OverviewView({
  ws,
  data,
  dark,
  onShowArea,
  onSelectSkill,
  onEditAreas,
}: {
  ws: Workspace;
  data: SkillTreeData;
  dark: boolean;
  onShowArea: (areaId: string) => void;
  onSelectSkill: (id: string) => void;
  onEditAreas: () => void;
}) {
  const settings = useSettings();
  const { sheet } = data;
  const identity = settings.identity;

  const recent = useMemo(() => {
    const out: { skillId: string; icon: string; name: string; at: number; amount: number; text: string }[] = [];
    for (const s of data.skills) {
      const titles = new Map((s.quests ?? []).map((q) => [q.id, q.title]));
      for (const e of xpEntries(ws.doc, s.id)) {
        const text =
          e.source === "quest"
            ? `Quest · ${titles.get(e.note) ?? "completed"}`
            : e.note || `${SOURCE_LABEL[e.source]}${e.minutes ? ` · ${e.minutes} min` : ""}`;
        out.push({ skillId: s.id, icon: s.icon, name: s.name, at: e.at, amount: e.amount, text });
      }
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 10);
  }, [ws, data]);

  const bestStreak = Math.max(0, ...[...data.stats.values()].map((s) => s.streak.current));
  const questsDone = data.quests.filter((q) => q.status.done).length;

  return (
    <div className="sk-sheet-scroll">
      <div className="sk-sheet">
        <section className="sk-hero">
          <Avatar name={identity.name} color={identity.color} size={52} />
          <div className="sk-hero-text">
            <div className="sk-hero-title">
              Level {sheet.level}
              <span className="sk-rank" title="Rank and class: the class comes from your strongest abilities">
                {sheet.title}
              </span>
            </div>
            <XpBar fraction={sheet.progress.fraction} color="var(--accent)" label="XP toward next level" />
            <div className="small muted">
              {sheet.progress.next !== null
                ? `${fmt(sheet.xp - sheet.progress.floor)} / ${fmt(sheet.progress.next - sheet.progress.floor)} XP to level ${sheet.level + 1} · ${fmt(sheet.xp)} XP total`
                : `${fmt(sheet.xp)} XP · max level`}
            </div>
          </div>
          <dl className="sk-hero-stats">
            <div>
              <dt>Total level</dt>
              <dd>{sheet.totalLevel}</dd>
            </div>
            <div>
              <dt>Skills</dt>
              <dd>{sheet.skills}</dd>
            </div>
            <div>
              <dt>Top rank</dt>
              <dd>{sheet.topRank?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Best streak</dt>
              <dd>{bestStreak > 0 ? plural(bestStreak, "day") : "—"}</dd>
            </div>
          </dl>
        </section>

        <div className="sk-sheet-grid">
          <section className="sk-card sk-card-wide">
            <header className="sk-card-head">
              <h3>Abilities</h3>
              <span className="small faint grow">Scores grow with the XP of their skills</span>
              <button className="btn btn-ghost btn-sm" onClick={onEditAreas}>
                <Icon name="edit" size={14} /> Edit
              </button>
            </header>
            <div className="sk-abilities">
              {sheet.areas.map((a) => {
                const color = themedColor(a.area.color, dark);
                const sp = scoreProgress(a.xp);
                const dnd = ABILITY_SKILLS[a.area.id]?.map((s) => s.name).join(", ");
                return (
                  <button
                    key={a.area.id}
                    className="sk-ability"
                    onClick={() => onShowArea(a.area.id)}
                    style={{ ["--c" as string]: color }}
                    title={a.area.description}
                    aria-label={`${a.area.name} ${a.score}, modifier ${formatModifier(a.modifier)}. Show in tree`}
                  >
                    <span className="sk-ability-abbr">{a.area.attribute || a.area.name.slice(0, 3).toUpperCase()}</span>
                    <span className="sk-ability-mod">{formatModifier(a.modifier)}</span>
                    <span className="sk-ability-score">{a.score}</span>
                    <span className="sk-ability-name ellipsis">
                      {a.area.icon} {a.area.name}
                    </span>
                    <XpBar fraction={a.skills ? sp.fraction : 0} color={color} label={`${a.area.name}: progress to ${a.score + 1}`} />
                    <span className="sk-ability-sub small muted">
                      {a.top && a.xp > 0 ? `${a.top.icon} ${a.top.name} · level ${a.top.level}` : dnd || a.area.description || "No skills yet"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="sk-card">
            <header className="sk-card-head">
              <h3>Ability scores</h3>
            </header>
            <Radar areas={sheet.areas} dark={dark} onPick={onShowArea} />
          </section>

          <section className="sk-card">
            <header className="sk-card-head">
              <h3>Today’s quests</h3>
              {data.quests.length > 0 && (
                <span className="small muted">
                  {questsDone}/{data.quests.length} done
                </span>
              )}
            </header>
            {data.quests.length === 0 ? (
              <p className="sk-empty-line">Add recurring quests to a skill, like “Meditate 10 minutes” daily or “Run 3× a week”, and check them off here.</p>
            ) : (
              <div className="sk-quest-list">
                {data.quests.map((q) => (
                  <QuestCheck key={`${q.skill.id}:${q.status.quest.id}`} ws={ws} q={q} />
                ))}
              </div>
            )}
          </section>

          <section className="sk-card">
            <header className="sk-card-head">
              <h3>Recent activity</h3>
            </header>
            {recent.length === 0 ? (
              <p className="sk-empty-line">Log practice or complete quests to earn XP.</p>
            ) : (
              <div className="sk-history">
                {recent.map((r, i) => (
                  <button key={`${r.at}-${i}`} className="sk-history-row as-button" onClick={() => onSelectSkill(r.skillId)}>
                    <span className="sk-history-icon">{r.icon}</span>
                    <span className="grow ellipsis">
                      {r.name} <span className="muted">· {r.text}</span>
                    </span>
                    <span className={`sk-history-xp${r.amount < 0 ? " neg" : ""}`}>
                      {r.amount >= 0 ? "+" : ""}
                      {fmt(r.amount)} XP
                    </span>
                    <span className="small faint sk-history-time">{timeAgo(r.at)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

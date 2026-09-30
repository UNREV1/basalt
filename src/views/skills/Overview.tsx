// Character-sheet pieces shared by the character panel, the skill pages and
// the Learn home: the ability hexagon, quest check-offs and level-up toasts.

import { useRef, useState } from "react";
import { completeQuest, formatModifier, levelForXp, rankForLevel, themedColor, totalXp, undoQuest, type AreaStats, type TodayQuest } from "../../../shared/skills.ts";
import { useApp } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon } from "../../components/ui.tsx";
import { fmt, plural } from "./useSkillData.ts";

/** Quiet toast after a check-off or log that crossed a level. */
export function levelUpMessage(name: string, before: number, after: number): string | null {
  if (after <= before) return null;
  const r0 = rankForLevel(before);
  const r1 = rankForLevel(after);
  return r1.id !== r0.id ? `Level ${after} · ${name} · now ${r1.name}` : `Level ${after} · ${name}`;
}

/** Ability scores on a hexagon: the center is 8, the outer ring 20 (or the best score, if higher). */
export function Radar({ areas, dark, onPick }: { areas: AreaStats[]; dark: boolean; onPick: (areaId: string) => void }) {
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
  // The labels are HTML over the drawing, so they're the same size as the rest of the app.
  const VB = { x: -30, y: 20, w: size + 60, h: size - 40 };
  const place = (p: { x: number; y: number }) => ({ left: `${((p.x - VB.x) / VB.w) * 100}%`, top: `${((p.y - VB.y) / VB.h) * 100}%` });
  return (
    <div className="sk-radar" ref={hostRef} onPointerLeave={() => setHover(null)}>
      <div className="sk-radar-chart">
        <svg
          viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
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
          {hasData &&
            poly.map((p, i) => (
              <circle key={areas[i].area.id} cx={p.x} cy={p.y} r={4} fill={themedColor(areas[i].area.color, dark)} className="sk-radar-dot" />
            ))}
        </svg>
        {areas.map((a, i) => {
          const lp = pt(i, R + 22);
          const side = Math.abs(lp.x - c) < 8 ? "middle" : lp.x > c ? "start" : "end";
          const show = (e: React.PointerEvent | React.FocusEvent) => {
            const host = hostRef.current?.getBoundingClientRect();
            const r = (e.currentTarget as Element).getBoundingClientRect();
            if (host) setHover({ i, x: r.left + r.width / 2 - host.left, y: r.top - host.top });
          };
          return (
            <button
              key={a.area.id}
              type="button"
              className={`sk-radar-point ${side}`}
              style={place(lp)}
              aria-label={`${a.area.name}: score ${a.score} (${formatModifier(a.modifier)}), ${plural(a.skills, "skill")}. Show in tree`}
              onPointerEnter={show}
              onFocus={show}
              onBlur={() => setHover(null)}
              onClick={() => onPick(a.area.id)}
            >
              <span className="sk-radar-label">{a.area.attribute || a.area.name}</span>
              <span className="sk-radar-value">
                {a.score} ({formatModifier(a.modifier)})
              </span>
            </button>
          );
        })}
      </div>
      <div className="sk-radar-caption small faint">
        From 8 in the middle to {max} at the edge; 10 is average
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

// A planned skill's details: where it sits in the built-in tree (general topic ›
// sub-topic › step), what comes first, the steps inside it and what it leads
// to. Starting it makes it one of your skills (see shared/skill-map.ts).

import { useState } from "react";
import { entryGlyph, missingFor, nextLeaf, nextStep, trail, type MapEntry } from "../../../shared/skill-map.ts";
import { themedColor } from "../../../shared/skills.ts";
import { Icon } from "../../components/ui.tsx";
import { SkillGlyph } from "./SkillGlyph.tsx";
import type { SkillTreeData } from "./useSkillData.ts";

const TIER: Record<string, string> = { general: "Area", field: "Field", sub: "Topic", detail: "Step", advanced: "Advanced skill" };

function Row({ e, color, onSelect }: { e: MapEntry; color: string; onSelect: (id: string) => void }) {
  return (
    <button className="sk-plan-row" onClick={() => onSelect(e.id)}>
      <SkillGlyph path={entryGlyph(e)} color={color} size={24} locked={e.locked} />
      <span className="grow ellipsis">{e.name}</span>
      <span className={`sk-plan-state${e.done ? " done" : e.locked ? " locked" : ""}`}>
        {e.done ? <Icon name="check" size={12} stroke={2.6} /> : e.locked ? <Icon name="lock" size={11} /> : e.real ? "started" : "open"}
      </span>
    </button>
  );
}

export function PlannedPanel({
  data,
  id,
  dark,
  onClose,
  onSelect,
  onStart,
}: {
  data: SkillTreeData;
  id: string;
  dark: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const map = data.map;
  const e = map.byId.get(id);
  if (!e) return null;
  const areaOf = (x: MapEntry) => data.areas.find((a) => a.id === x.ability);
  const colorOf = (x: MapEntry) => themedColor(areaOf(x)?.color ?? "#8b8d98", dark);
  const color = colorOf(e);
  const path = trail(map, id).slice(0, -1);
  const missing = e.locked ? missingFor(map, id) : [];
  const step = e.locked ? nextStep(map, id) : undefined;
  const leaf = e.children.length ? nextLeaf(map, id) : e;
  const inside = e.children.map((c) => map.byId.get(c)!).filter(Boolean);
  const needs = e.needs.map((n) => map.byId.get(n)).filter((n): n is MapEntry => !!n);
  const leadsTo = map.entries.filter((x) => x.needs.includes(id));
  const related = [...e.related, ...map.entries.filter((x) => x.related.includes(id)).map((x) => x.id)]
    .map((r) => map.byId.get(r))
    .filter((r): r is MapEntry => !!r);
  const area = areaOf(e);

  return (
    <aside className={`sk-panel${expanded ? " expanded" : ""}`} aria-label={`${e.name} (planned)`} style={{ ["--c" as string]: color }}>
      <button className="sk-sheet-handle" onClick={() => setExpanded((x) => !x)} aria-label={expanded ? "Collapse panel" : "Expand panel"}>
        <span />
      </button>
      <div className="sk-panel-head">
        <SkillGlyph path={entryGlyph(e)} color={color} size={44} locked={e.locked} />
        <div className="grow col" style={{ gap: 2, minWidth: 0 }}>
          <div className="sk-plan-name">{e.name}</div>
          <div className="small muted">
            {area?.name ?? e.ability} · {TIER[e.tier ?? ""] ?? "Skill"} · {e.done ? "learnt" : "not started"}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <Icon name="x" />
        </button>
      </div>

      <div className="sk-panel-body">
        {path.length > 0 && (
          <nav className="sk-plan-trail" aria-label="Where it is">
            {path.map((p, i) => (
              <span key={p.id}>
                {i > 0 && <span className="faint"> › </span>}
                <button className="sk-link" onClick={() => onSelect(p.id)}>
                  {p.name}
                </button>
              </span>
            ))}
          </nav>
        )}
        {e.description && <p className="small muted">{e.description}</p>}

        <section className="sk-section">
          {e.done ? (
            <p className="sk-learn-done">✓ You've learnt {e.name}.</p>
          ) : e.locked ? (
            <>
              <p className="small">
                <Icon name="lock" size={12} /> Locked: first learn {missing.slice(0, 3).map((m) => m.name).join(", ")}
                {missing.length > 3 ? ` and ${missing.length - 3} more` : ""}.
              </p>
              {step && (
                <button className="btn btn-primary sk-learn-go" onClick={() => onStart(step.id)}>
                  <Icon name="play" size={13} /> Start with {step.name}
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-primary sk-learn-go" onClick={() => onStart(id)}>
              <Icon name="play" size={13} /> {leaf && leaf.id !== id ? `Start with ${leaf.name}` : "Start learning"}
            </button>
          )}
          <p className="small faint sk-learn-note">
            Planned in Basalt's skill tree. Starting it adds it to your skills, and Claude writes its lessons as you reach them.
          </p>
        </section>

        {inside.length > 0 && (
          <section className="sk-section">
            <header className="sk-section-head">
              <h3>{e.tier === "general" ? "Fields" : e.tier === "field" ? "Topics, in order" : "Steps, in order"}</h3>
            </header>
            <div className="sk-plan-list">
              {inside.map((x) => (
                <Row key={x.id} e={x} color={colorOf(x)} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {needs.length > 0 && (
          <section className="sk-section">
            <header className="sk-section-head">
              <h3>Comes after</h3>
            </header>
            <div className="sk-plan-list">
              {needs.map((x) => (
                <Row key={x.id} e={x} color={colorOf(x)} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="sk-section">
            <header className="sk-section-head">
              <h3>Related</h3>
            </header>
            <div className="sk-plan-list">
              {related.map((x) => (
                <Row key={x.id} e={x} color={colorOf(x)} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {leadsTo.length > 0 && (
          <section className="sk-section">
            <header className="sk-section-head">
              <h3>Leads to</h3>
            </header>
            <div className="sk-plan-list">
              {leadsTo.slice(0, 12).map((x) => (
                <Row key={x.id} e={x} color={colorOf(x)} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

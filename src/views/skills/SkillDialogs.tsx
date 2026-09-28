// Dialogs: add a skill, edit life areas, pick a template.

import { useMemo, useState } from "react";
import {
  AREA_PALETTE,
  createArea,
  createSkill,
  createSkillsFromPlan,
  deleteArea,
  MAX_LEVEL,
  saveArea,
  themedColor,
  type Skill,
  type SkillArea,
  type SkillPlanItem,
} from "../../../shared/skills.ts";
import { useApp } from "../../lib/hooks.ts";
import { useTheme } from "../../lib/theme.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { EmojiPicker, Icon, Modal, type Anchor } from "../../components/ui.tsx";
import { SKILL_TEMPLATES, type SkillTemplate } from "./templates.ts";
import { layoutTree } from "./layout.ts";
import { plural, type SkillTreeData } from "./useSkillData.ts";

export function AddSkillModal({
  ws,
  data,
  parentId,
  defaultArea,
  onClose,
  onCreated,
}: {
  ws: Workspace;
  data: SkillTreeData;
  parentId?: string;
  defaultArea?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const dark = useTheme() === "dark";
  const parent = parentId ? data.byId.get(parentId) : undefined;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(parent ? "✨" : "⭐");
  const [area, setAreaState] = useState(parent?.category ?? defaultArea ?? data.areas[0]?.id ?? "");
  const [areaTouched, setAreaTouched] = useState(!!parent || !!defaultArea);
  const setArea = (id: string) => {
    setAreaState(id);
    setAreaTouched(true);
  };
  const [parents, setParents] = useState<string[]>(parentId ? [parentId] : []);
  const [requiredLevel, setRequiredLevel] = useState(parent ? 3 : 1);
  const [description, setDescription] = useState("");
  const [emojiAnchor, setEmojiAnchor] = useState<Anchor | null>(null);

  const create = () => {
    if (!name.trim()) return;
    const s = createSkill(ws.doc, {
      name: name.trim(),
      icon,
      category: area,
      parents,
      requiredLevel: parents.length ? requiredLevel : 1,
      description: description.trim(),
    });
    onCreated(s.id);
    onClose();
  };

  const options = data.skills.filter((s) => !parents.includes(s.id));

  return (
    <Modal
      title={parent ? `New sub-skill of ${parent.icon} ${parent.name}` : "New skill"}
      onClose={onClose}
      width={500}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={create}>
            Add skill
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 10 }}>
        <button
          className="sk-icon-pick"
          aria-label="Choose icon"
          onClick={(e) => setEmojiAnchor(e.currentTarget.getBoundingClientRect())}
        >
          {icon}
        </button>
        <input
          className="input grow"
          autoFocus
          placeholder="e.g. Running, Spanish, Public speaking, Budgeting"
          aria-label="Skill name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </div>
      <label className="sk-field">
        <span>Life area</span>
        <div className="sk-area-chips" role="radiogroup" aria-label="Life area">
          {data.areas.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={area === a.id}
              className={`sk-area-chip${area === a.id ? " active" : ""}`}
              style={{ ["--c" as string]: themedColor(a.color, dark) }}
              onClick={() => setArea(a.id)}
            >
              {a.icon} {a.name}
            </button>
          ))}
        </div>
      </label>
      <div className="sk-field">
        <span>Prerequisites</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {parents.map((p) => {
            const s = data.byId.get(p);
            return (
              s && (
                <span key={p} className="sk-token">
                  {s.icon} {s.name}
                  <button aria-label={`Remove ${s.name}`} onClick={() => setParents(parents.filter((x) => x !== p))}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              )
            );
          })}
          {options.length > 0 && (
            <select
              className="select sk-add-select sm"
              value=""
              aria-label="Add prerequisite"
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setParents([...parents, id]);
                // A new skill usually lives in the same area as what it builds on.
                const p = data.byId.get(id);
                if (!areaTouched && p && data.areas.some((a) => a.id === p.category)) setAreaState(p.category);
              }}
            >
              <option value="">{parents.length ? "+ Another…" : "None (root skill) · add…"}</option>
              {options.map((s: Skill) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {parents.length > 0 && (
          <label className="row small muted" style={{ gap: 6 }}>
            Unlocks when {parents.length > 1 ? "each prerequisite reaches" : "it reaches"} level
            <input
              className="input sk-num"
              type="number"
              min={1}
              max={MAX_LEVEL}
              value={requiredLevel}
              onChange={(e) => setRequiredLevel(Math.max(1, Math.min(MAX_LEVEL, Math.round(Number(e.target.value) || 1))))}
            />
          </label>
        )}
      </div>
      <label className="sk-field">
        <span>Description</span>
        <textarea
          className="textarea"
          rows={2}
          placeholder="What does mastering this look like?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {emojiAnchor && <EmojiPicker anchor={emojiAnchor} onClose={() => setEmojiAnchor(null)} onPick={(e) => e && setIcon(e)} />}
    </Modal>
  );
}

export function AreasModal({ ws, areas, dark, onClose }: { ws: Workspace; areas: SkillArea[]; dark: boolean; onClose: () => void }) {
  const [emoji, setEmoji] = useState<{ id: string; anchor: Anchor } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <Modal
      title="Life areas"
      onClose={onClose}
      width={600}
      footer={
        <>
          <button className="btn" onClick={() => createArea(ws.doc, { name: "New area" })}>
            <Icon name="plus" size={14} /> Add area
          </button>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <p className="muted small" style={{ margin: 0 }}>
        Areas are your character’s attributes. Every skill belongs to one; an area’s level grows with the XP of its skills.
      </p>
      <div className="sk-areas-edit">
        {areas.map((a) => (
          <div key={a.id} className="sk-area-edit">
            <button
              className="sk-icon-pick sm"
              aria-label={`Icon for ${a.name}`}
              onClick={(e) => setEmoji({ id: a.id, anchor: e.currentTarget.getBoundingClientRect() })}
            >
              {a.icon}
            </button>
            <input
              className="input grow"
              aria-label="Area name"
              defaultValue={a.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && saveArea(ws.doc, { ...a, name: e.target.value.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
            <input
              className="input sk-attr-input"
              aria-label="Attribute abbreviation"
              maxLength={4}
              defaultValue={a.attribute ?? ""}
              onBlur={(e) => e.target.value !== (a.attribute ?? "") && saveArea(ws.doc, { ...a, attribute: e.target.value.trim().toUpperCase() })}
            />
            <div className="sk-swatches" role="radiogroup" aria-label={`Color for ${a.name}`}>
              {AREA_PALETTE.map((p) => (
                <button
                  key={p.light}
                  role="radio"
                  aria-checked={a.color.toLowerCase() === p.light.toLowerCase()}
                  aria-label={p.name}
                  className={`sk-swatch${a.color.toLowerCase() === p.light.toLowerCase() ? " active" : ""}`}
                  style={{ background: themedColor(p.light, dark) }}
                  onClick={() => saveArea(ws.doc, { ...a, color: p.light })}
                />
              ))}
            </div>
            {confirm === a.id ? (
              <span className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm" onClick={() => setConfirm(null)}>
                  Keep
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => {
                    deleteArea(ws.doc, a.id);
                    setConfirm(null);
                  }}
                >
                  Remove
                </button>
              </span>
            ) : (
              <button className="icon-btn" aria-label={`Remove ${a.name}`} disabled={areas.length <= 1} onClick={() => setConfirm(a.id)}>
                <Icon name="trash" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {confirm && <p className="small muted" style={{ margin: 0 }}>Skills in a removed area move to the first remaining area.</p>}
      {emoji && (
        <EmojiPicker
          anchor={emoji.anchor}
          onClose={() => setEmoji(null)}
          onPick={(e) => {
            const a = areas.find((x) => x.id === emoji.id);
            if (a && e) saveArea(ws.doc, { ...a, icon: e });
          }}
        />
      )}
    </Modal>
  );
}

/** A small read-only picture of a planned tree (templates and AI previews). */
export function PlanPreview({ items, areas, dark }: { items: SkillPlanItem[]; areas: SkillArea[]; dark: boolean }) {
  const model = useMemo(() => {
    const keys = new Set(items.map((i) => i.key));
    const skills = items.map((it, i) => ({
      id: it.key,
      parents: (it.parentKeys ?? []).filter((p) => keys.has(p) && p !== it.key),
      category: areas.find((a) => a.id === it.category || a.name.toLowerCase() === (it.category ?? "").toLowerCase())?.id ?? it.category ?? "",
      createdAt: i,
    }));
    const layout = layoutTree(skills, areas.map((a) => a.id), 2.4);
    // Labels are short here, so rows can sit closer than on the canvas.
    const pos = new Map([...layout.pos].map(([id, p]) => [id, { x: p.x, y: p.y * 0.62 }]));
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pos.values()) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    return { skills, pos, box: { x: x0 - 70, y: y0 - 40, w: x1 - x0 + 140, h: y1 - y0 + 90 } };
  }, [items, areas]);
  const color = (area: string) => themedColor(areas.find((a) => a.id === area)?.color ?? "#8b8d98", dark);
  if (!items.length) return null;
  const { box, pos } = model;
  return (
    <svg className="sk-preview" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label="Preview of the skill tree">
      {model.skills.map((s) =>
        s.parents.map((p) => {
          const a = pos.get(p)!;
          const b = pos.get(s.id)!;
          const my = (a.y + b.y) / 2;
          return (
            <path
              key={`${p}>${s.id}`}
              d={`M${a.x} ${a.y - 28} C${a.x} ${my} ${b.x} ${my} ${b.x} ${b.y + 28}`}
              className="sk-preview-edge"
              style={{ stroke: color(s.category) }}
            />
          );
        }),
      )}
      {items.map((it, i) => {
        const p = pos.get(it.key)!;
        const s = model.skills[i];
        return (
          <g key={it.key} transform={`translate(${p.x} ${p.y})`}>
            <circle r={28} className="sk-preview-node" style={{ stroke: color(s.category) }} />
            <text className="sk-preview-icon" dy="0.05em">
              {it.icon || "⭐"}
            </text>
            <text className="sk-preview-label" y={48}>
              {it.name.length > 16 ? `${it.name.slice(0, 15)}…` : it.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TemplateGrid({ onPick, compact }: { onPick: (t: SkillTemplate) => void; compact?: boolean }) {
  return (
    <div className={`sk-template-grid${compact ? " compact" : ""}`}>
      {SKILL_TEMPLATES.map((t) => (
        <button key={t.id} className={`sk-template${t.id === "life" ? " featured" : ""}`} onClick={() => onPick(t)}>
          <span className="sk-template-icon">{t.icon}</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <strong>{t.name}</strong>
            <span className="small muted sk-template-blurb">{t.blurb}</span>
            <span className="small faint">
              {plural(t.skills.length, "skill")}
              {t.skills.some((s) => s.quests?.length) && ` · ${plural(t.skills.reduce((n, s) => n + (s.quests?.length ?? 0), 0), "quest")}`}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function TemplatesModal({
  ws,
  data,
  dark,
  onClose,
  onApplied,
}: {
  ws: Workspace;
  data: SkillTreeData;
  dark: boolean;
  onClose: () => void;
  onApplied: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<SkillTemplate | null>(null);
  const { toast } = useApp();
  const apply = (t: SkillTemplate) => {
    const ids = [...applyTemplate(ws, t).values()];
    toast(`Added ${t.skills.length} skills from “${t.name}”`);
    onApplied(ids);
    onClose();
  };
  return (
    <Modal
      title={picked ? `${picked.icon} ${picked.name}` : "Start from a template"}
      onClose={onClose}
      width={720}
      footer={
        picked && (
          <>
            <button className="btn" onClick={() => setPicked(null)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => apply(picked)}>
              Add {picked.skills.length} skills
            </button>
          </>
        )
      }
    >
      {picked ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {picked.blurb}
          </p>
          <PlanPreview items={picked.skills} areas={data.areas} dark={dark} />
        </>
      ) : (
        <TemplateGrid onPick={setPicked} />
      )}
    </Modal>
  );
}

export function applyTemplate(ws: Workspace, t: SkillTemplate): Map<string, string> {
  return createSkillsFromPlan(ws.doc, t.skills);
}

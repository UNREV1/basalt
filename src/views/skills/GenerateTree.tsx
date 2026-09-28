// "Generate tree with AI": describe any life goal, Claude designs a skill
// tree from foundations to mastery, preview it, then add it.

import { useEffect, useRef, useState } from "react";
import { ABILITY_SKILLS, createSkillsFromPlan, type SkillArea, type SkillPlanItem } from "../../../shared/skills.ts";
import { aiErrorMessage, generateJson } from "../../lib/ai.ts";
import { useApp } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { Icon, Modal } from "../../components/ui.tsx";
import { PlanPreview } from "./SkillDialogs.tsx";
import { plural } from "./useSkillData.ts";

const EXAMPLES = [
  "Get fit and run a marathon",
  "Become a data scientist",
  "Be a better parent",
  "Financial independence",
  "Play jazz piano",
  "Speak Japanese fluently",
];

const SIZES = [
  { id: "focused", label: "Focused", hint: "about 12 skills", min: 10, max: 14 },
  { id: "balanced", label: "Balanced", hint: "about 20 skills", min: 16, max: 22 },
  { id: "epic", label: "Epic", hint: "about 30 skills", min: 26, max: 30 },
] as const;

interface GeneratedTree {
  title: string;
  summary: string;
  skills: {
    key: string;
    name: string;
    icon: string;
    area: string;
    description: string;
    parentKeys: string[];
    requiredLevel: number;
    quests: { title: string; cadence: "daily" | "weekly"; target: number; xp: number }[];
  }[];
}

function schema(areaIds: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "skills"],
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      skills: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "name", "icon", "area", "description", "parentKeys", "requiredLevel", "quests"],
          properties: {
            key: { type: "string" },
            name: { type: "string" },
            icon: { type: "string" },
            area: { type: "string", enum: areaIds },
            description: { type: "string" },
            parentKeys: { type: "array", items: { type: "string" } },
            requiredLevel: { type: "integer" },
            quests: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "cadence", "target", "xp"],
                properties: {
                  title: { type: "string" },
                  cadence: { type: "string", enum: ["daily", "weekly"] },
                  target: { type: "integer" },
                  xp: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
  };
}

function systemPrompt(areas: SkillArea[], size: (typeof SIZES)[number]) {
  return `You design personal "life RPG" skill trees. A skill tree is a directed acyclic graph of real-life skills: each skill has prerequisite skills (parentKeys) that must reach a level before it unlocks. Levels run 1-50 and map to ranks: Novice 1-4, Apprentice 5-9, Journeyman 10-17, Adept 18-25, Expert 26-33, Master 34-41, Grandmaster 42-50. The learner earns XP from real practice (10 XP per minute), quests and AI-tutor courses; level 5 takes roughly 3-4 hours of practice, level 10 about 20 hours.

Rules:
- Produce between ${size.min} and ${size.max} skills.
- Foundations first: list skills in dependency order (parents before children). Start with 2-5 root skills a complete beginner can begin today.
- Realistic prerequisites: only add a parent when it is genuinely needed first. Use 1-3 parents; skills may combine several branches.
- requiredLevel is the level each parent needs to unlock the skill: 2-4 for early steps, 5-10 for intermediate, 10-15 for advanced capstones.
- Build an arc from beginner to expert: the deepest skills should reach expert, professional or research level for the goal.
- Like a D&D character, every skill trains one ability. Assign each skill the ability that fits it best (use the id): ${areas.map((a) => `${a.id} = ${a.name} (${a.description ?? ""}${ABILITY_SKILLS[a.id] ? `; D&D skills: ${ABILITY_SKILLS[a.id].map((s) => `${s.name} = ${s.meaning}`).join(", ")}` : ""})`).join("; ")}. Intelligence is academics and memory techniques. Holistic goals span several abilities (a marathon is mostly Constitution, but also Wisdom for recovery know-how and Strength for supporting lifts). Where it fits naturally, a D&D skill name can be a skill (for example "Investigation" for research methods).
- key: a short unique slug like "cardio-base". parentKeys reference other keys in this tree.
- icon: exactly one emoji that fits the skill. name: 1-4 words, title case. description: one sentence about what mastery looks like.
- quests: recurring habits that build the skill. Give 4-8 skills in total one quest each (the most habit-like ones) and leave the rest empty. Daily quests are small (xp 15-40, target 1); weekly quests are bigger (xp 40-120, target 1-4). Titles are concrete actions like "Run 5 km" or "Read 20 minutes".
- title: a short name for the tree. summary: one or two encouraging sentences about the path.`;
}

export function GenerateTreeModal({
  ws,
  areas,
  dark,
  onClose,
  onCreated,
}: {
  ws: Workspace;
  areas: SkillArea[];
  dark: boolean;
  onClose: () => void;
  onCreated: (ids: string[]) => void;
}) {
  const { toast } = useApp();
  const [goal, setGoal] = useState("");
  const [experience, setExperience] = useState("");
  const [size, setSize] = useState<(typeof SIZES)[number]["id"]>("balanced");
  const [busy, setBusy] = useState(false);
  const [chars, setChars] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<GeneratedTree | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const plan: SkillPlanItem[] = (result?.skills ?? []).map((s) => ({
    key: s.key,
    name: s.name,
    icon: s.icon,
    category: s.area,
    description: s.description,
    parentKeys: s.parentKeys,
    requiredLevel: Math.max(1, Math.min(50, s.requiredLevel || 1)),
    quests: s.quests,
  }));

  const generate = async () => {
    if (!goal.trim() || busy) return;
    const sz = SIZES.find((s) => s.id === size)!;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError("");
    setChars(0);
    try {
      const out = await generateJson<GeneratedTree>({
        system: systemPrompt(areas, sz),
        prompt: `Goal: ${goal.trim()}\nCurrent experience: ${experience.trim() || "Complete beginner"}\n\nDesign the skill tree.`,
        schema: schema(areas.map((a) => a.id)),
        effort: "medium",
        maxTokens: 16000,
        signal: ctrl.signal,
        onProgress: setChars,
      });
      if (!out.skills?.length) throw new Error("Claude returned an empty tree. Try describing your goal differently.");
      setResult(out);
    } catch (err) {
      if (!ctrl.signal.aborted) setError(aiErrorMessage(err));
    } finally {
      if (abortRef.current === ctrl) setBusy(false);
    }
  };

  const add = () => {
    const ids = [...createSkillsFromPlan(ws.doc, plan).values()];
    toast(`Added ${ids.length} skills${result?.title ? ` for “${result.title}”` : ""}`);
    onCreated(ids);
    onClose();
  };

  const expected = SIZES.find((s) => s.id === size)!.max * 330;

  return (
    <Modal
      title={
        <>
          <Icon name="sparkle" size={16} /> {result ? result.title : "Generate a skill tree"}
        </>
      }
      onClose={() => {
        abortRef.current?.abort();
        onClose();
      }}
      width={result ? 760 : 560}
      footer={
        result ? (
          <>
            <button className="btn" onClick={() => setResult(null)}>
              Back
            </button>
            <button className="btn" onClick={generate} disabled={busy}>
              {busy ? <span className="spinner" /> : null} Regenerate
            </button>
            <button className="btn btn-primary" onClick={add} disabled={busy}>
              Add {plan.length} skills
            </button>
          </>
        ) : (
          <>
            <button
              className="btn"
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
            >
              Cancel
            </button>
            <button className="btn btn-primary" onClick={generate} disabled={!goal.trim() || busy}>
              {busy ? (
                <>
                  <span className="spinner" /> Designing…
                </>
              ) : (
                "Generate"
              )}
            </button>
          </>
        )
      }
    >
      {result ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {result.summary}
          </p>
          <PlanPreview items={plan} areas={areas} dark={dark} />
          <div className="sk-gen-areas small muted">
            {areas
              .map((a) => ({ a, n: plan.filter((p) => p.category === a.id).length }))
              .filter((x) => x.n > 0)
              .map(({ a, n }) => (
                <span key={a.id} className="badge">
                  {a.icon} {a.name} · {n}
                </span>
              ))}
            <span className="badge">{plural(plan.reduce((n, p) => n + (p.quests?.length ?? 0), 0), "quest")}</span>
          </div>
          {busy && <div className="sk-gen-progress"><div style={{ width: `${Math.min(95, (chars / expected) * 100)}%` }} /></div>}
          {error && <div className="sk-error">{error}</div>}
        </>
      ) : (
        <>
          <label className="sk-field">
            <span>What do you want to become or achieve?</span>
            <textarea
              className="textarea"
              rows={2}
              autoFocus
              placeholder="Any life goal: get fit and run a marathon, become a data scientist, be a better parent…"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
              }}
            />
          </label>
          <div className="row wrap" style={{ gap: 6 }}>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="sk-example" onClick={() => setGoal(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <label className="sk-field">
            <span>Where are you starting from?</span>
            <textarea
              className="textarea"
              rows={2}
              placeholder="e.g. I jog twice a month and have never raced; I know some Python from school"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            />
          </label>
          <div className="sk-field">
            <span>Size</span>
            <div className="tabs" role="radiogroup" aria-label="Tree size">
              {SIZES.map((s) => (
                <button key={s.id} role="radio" aria-checked={size === s.id} className={`tab${size === s.id ? " active" : ""}`} onClick={() => setSize(s.id)}>
                  {s.label} <span className="faint small">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>
          {busy && (
            <div className="sk-gen-progress" aria-label="Generating">
              <div style={{ width: `${Math.min(95, (chars / expected) * 100)}%` }} />
            </div>
          )}
          {error && <div className="sk-error">{error}</div>}
        </>
      )}
    </Modal>
  );
}

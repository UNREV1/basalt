// Learner self-assessment options shared by the tutor home and course setup.

import { LEVELS } from "../../../shared/course.ts";

export interface StartLevelOption {
  id: string;
  hint: string;
  /** Index into LEVELS where this learner most likely belongs. */
  levelIndex: number;
}

export const START_LEVELS: StartLevelOption[] = [
  { id: "Complete beginner", hint: "Starting from zero", levelIndex: 0 },
  { id: "Some background", hint: "Know a few basics", levelIndex: 1 },
  { id: "Solid foundation", hint: "Comfortable with the core", levelIndex: 2 },
  { id: "Advanced", hint: "Studied it seriously", levelIndex: 3 },
  { id: "Expert", hint: "Working knowledge, want the frontier", levelIndex: 4 },
];

export interface GoalOption {
  id: string;
  icon: string;
  description: string;
  /** How the goal should shape the course, for prompts. */
  guidance: string;
}

export const GOALS: GoalOption[] = [
  {
    id: "Get the big picture",
    icon: "🔭",
    description: "Core ideas, intuition and why it matters",
    guidance:
      "Prioritize intuition, the key ideas and their history and applications. Keep formalism light in the lower levels, but still include every level so the learner can go further later.",
  },
  {
    id: "Deep understanding",
    icon: "🧠",
    description: "How and why it works, with rigor",
    guidance:
      "Aim for genuine understanding: derivations, the reasons behind results, and connections between ideas. Balance intuition with rigor at every level.",
  },
  {
    id: "Professional mastery",
    icon: "🛠️",
    description: "Apply it fluently to real problems",
    guidance:
      "Emphasize techniques, problem solving, tools and real-world practice alongside the theory, including the judgment experts use on the job.",
  },
  {
    id: "Research level",
    icon: "🔬",
    description: "Read papers and push the frontier",
    guidance:
      "Build toward research competence: rigorous theory with proofs, the primary literature, open problems and research methods. Make the Graduate and PhD levels especially rich.",
  },
];

export function startLevelIndex(startLevel: string | undefined): number {
  return START_LEVELS.find((s) => s.id === startLevel)?.levelIndex ?? 0;
}

export function goalGuidance(goal: string | undefined): string {
  return GOALS.find((g) => g.id === goal)?.guidance ?? "Aim for deep understanding with a balance of intuition and rigor.";
}

/** What "level N" means, used in curriculum and lesson prompts. */
export const LEVEL_GUIDANCE: Record<(typeof LEVELS)[number], string> = {
  Foundations:
    "Assume no prior knowledge beyond everyday experience and school arithmetic. Cover prerequisites and core vocabulary. Define every term, use short sentences and many concrete examples, and introduce any math gently and in words first.",
  Beginner:
    "Assume the Foundations level. Introduce the core concepts and standard notation gently, emphasizing intuition, worked examples and simple exercises.",
  Intermediate:
    "Undergraduate level. Use standard notation and derivations, balance intuition with rigor, and set exercises that need multi-step reasoning.",
  Advanced:
    "Advanced undergraduate to early graduate level. Give precise statements, derivations and proofs of key results, and connect to applications and neighboring fields.",
  Graduate:
    "Graduate level. Give rigorous definitions and theorems with proofs or careful proof sketches and derivations, at the depth of standard graduate textbooks, with qualifying-exam-level exercises.",
  "PhD / Research frontier":
    "Research level. Cover the state of the art: landmark papers and methods, open problems and live debates, how experts think about the area, and what would count as a new contribution.",
};

export function levelGuidance(name: string): string {
  return (LEVEL_GUIDANCE as Record<string, string>)[name] ?? LEVEL_GUIDANCE.Intermediate;
}

export const TOPIC_SUGGESTIONS = [
  "Linear algebra",
  "Quantum mechanics",
  "Machine learning",
  "Bayesian statistics",
  "Organic chemistry",
  "Music theory",
  "Macroeconomics",
  "Category theory",
  "Neuroscience",
  "Distributed systems",
  "Ancient Rome",
  "Japanese grammar",
];

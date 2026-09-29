// Zod schemas shared by several MCP tools.

import { z } from "zod";
import { LEVELS_HINT } from "./prompts.ts";

const LESSON = z.object({
  id: z.string().optional().describe("Stable id; omit for new lessons (keep existing ids when updating)"),
  title: z.string(),
  objectives: z.array(z.string()).default([]).describe("Concrete, testable learning objectives"),
});
export const MODULE = z.object({
  id: z.string().optional(),
  title: z.string(),
  summary: z.string().default(""),
  lessons: z.array(LESSON).min(1),
});
const LEVEL = z.object({
  id: z.string().optional(),
  name: z.string().describe(LEVELS_HINT),
  summary: z.string().default(""),
  modules: z.array(MODULE).min(1),
});

/** A course outline: levels → modules → lessons (titles and objectives, no content). */
export const CURRICULUM = z.object({
  overview: z.string().default("").describe("2-4 sentences: what the learner will be able to do at the end"),
  levels: z.array(LEVEL).min(1),
});

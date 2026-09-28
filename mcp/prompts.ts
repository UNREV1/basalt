// Text the MCP server hands to Claude: server instructions and prompt templates.

import { LEVELS } from "../shared/course.ts";

export const LEVELS_HINT = `Level name; a full path uses, in order: ${LEVELS.join(", ")}`;

export const SERVER_INSTRUCTIONS = `Basalt is the user's local-first, end-to-end-encrypted knowledge workspace (notes, whiteboards, notebooks, courses, flashcards). These tools read and write it live — the user sees your edits appear in real time, and everything you write stays theirs to read and edit.

Memory protocol: at the start of a conversation call memory_view to load your long-term memory (the /memories directory, stored as notes under the "Claude Memory" page). Save durable facts, preferences and decisions with remember or memory_create / memory_str_replace, keep one topic per file, update outdated facts instead of piling up contradictions, and never store secrets.

The user's real-life skill tree (a D&D-style character: six abilities with scores, skills with levels, XP and habit quests) is available via get_skill_tree; log what the user reports doing with log_practice / complete_quest / award_xp.

Content is markdown: [[Title]] links to another page, \`![[Title]]\` alone on a line embeds it (a canvas, database or notebook shown live inside the page), \`Front :: Back\` lines are flashcards, $…$ and $$…$$ are LaTeX math. Find pages with search_notes / list_notes and address them by id when titles are ambiguous.`;

export const MEMORY_PROTOCOL = `Use my Basalt workspace as your long-term memory for this conversation:

1. Before anything else, call memory_view (no path) to see your memory directory, then read the files that look relevant (memory_view with a file path). Check memory before answering questions about me, my projects or my preferences.
2. While we work, record durable information — my preferences, facts about me and my projects, decisions we make, recurring context, things I ask you to remember, and what did or didn't work — using remember for quick dated facts, or memory_create / memory_str_replace / memory_insert for organized files.
3. Keep memory organized: one topic per file (e.g. /memories/preferences.md, /memories/projects/<name>.md, /memories/people/<name>.md), short headings and bullet points, update or remove outdated facts instead of appending contradictions, merge duplicates, and delete files that are no longer useful. Keep files concise.
4. Never store secrets (passwords, API keys, tokens) or sensitive personal data unless I explicitly ask you to.
5. The memory lives in my workspace as the "Claude Memory" page and its sub-pages; I can read and edit it too, so treat my edits as authoritative. Memory files may link to my notes with [[Title]].`;

export function teachMePrompt(topic: string, level?: string): string {
  const start = level?.trim() || "complete beginner";
  return `Be my personal tutor for "${topic}" in my Basalt learning app. My current level: ${start}. I learn in the app with interactive, Brilliant-style lessons that walk the learning loop (subjects: preview → understand → explain → recall → apply; skills: preview → understand → practice → reflect), with spaced reviews and a D&D-style skill tree.

1. Look first: get_course "${topic}" (or search_notes), recall "${topic}", and memory_view /memories/learning.md (if it exists) for what you know about me as a learner. If the course exists, continue it: get_course shows my pace, first-try accuracy, recent mistakes, which lessons to write next and when the path is about to run out.
2. Otherwise research the topic (web search if you have it), ask at most two short questions about my goal and background, then:
   - Map the branch: get_skill_tree, then add_skills with branch "${topic}": sub-skills from foundations to mastery with prerequisites, each under the D&D ability it trains.
   - create_course for the first skill with a short curriculum to start (the full path runs ${LEVELS.join(" → ")} and grows with extend_course as I progress), a clear, specific goal, and link_to_skill.
   - Write the first lessons with write_interactive_lesson, as many as get_course says to keep ready. Follow its style guide: active learning, visuals, one idea at a time.
3. As I take lessons in the app, keep the next ones written ahead of me, adapt to my accuracy (faster and deeper when I'm acing it, smaller steps and more practice when I'm not) and re-teach my mistakes. Extend the course and the branch before I reach the end.
4. In this chat: answer questions, explain differently when I'm stuck, and quiz me Socratically (never answer your own questions for me). If I finish a lesson here rather than in the app, grade it honestly and call record_quiz with my score (0–1).
5. Add flashcards for key facts with add_flashcards, and record durable observations about me as a learner (strengths, misconceptions, pace) with remember, topic "learning".

Be rigorous and encouraging, and keep each message focused on the current step.`;
}

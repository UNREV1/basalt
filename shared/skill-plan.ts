// The general plan every skill follows, whatever it is: how a subject is
// broken down into the whole tree up front, from absolute zero to mastery,
// as titles only. Lesson content is written later, a few lessons ahead of
// the learner (see shared/learning.ts). Claude plans with it (the MCP tools
// and the app's requests quote it), so every path in the tree has the same
// shape: subject → topics → parts → lessons.

/** The stages of any skill, for fields without natural milestones of their own. */
export const PLAN_STAGES = [
  { name: "Foundations", about: "what it is, the words for things, the very first basics" },
  { name: "Core", about: "the essential techniques or ideas everything else builds on" },
  { name: "Application", about: "using the core on real problems, pieces or situations" },
  { name: "Intermediate", about: "widening and combining: more cases, more speed, fewer mistakes" },
  { name: "Advanced", about: "the hard parts: nuance, style, harder problems" },
  { name: "Mastery", about: "expert practice, creating your own, teaching others, the frontier" },
] as const;

export const GENERAL_PLAN = `THE GENERAL PLAN (the same shape for every skill or subject): general topic → sub-topics → the details between them → advanced skills → expert skills, with nothing skipped.
1. Plan the whole tree now, from absolute zero to the top of the field, as titles only. Every branch goes all the way: each topic leads on to advanced skills, and those to expert ones at the top (PhD level for an academic subject: graduate courses, then research; mastery for a practical one: elite or professional level, coaching it, and the science behind it). Lessons are written later, a few ahead of the learner.
2. The subject is one skill (e.g. "Mathematics"), or the existing skill being planned. Put it where it belongs, general to specific: a broad field (Mathematics, Programming, Cooking) is a general topic of its own; something specialised (Software development, Machine learning, Powerlifting) is an advanced skill that comes after the general topics it builds on, never at the start.
3. Topics are its parts (\`topic\`: the subject): the real milestones of the field, in learning order. Mathematics: Arithmetic, Pre-algebra, Algebra, Geometry, Trigonometry, Precalculus, Calculus, Linear algebra, Probability and statistics. Guitar: First chords, Rhythm and strumming, Barre chords, Scales and lead, Music theory, Improvisation. When a field has no natural milestones, use the stages ${PLAN_STAGES.map((s) => s.name).join(", ")}.
4. Each topic has 3–8 parts (\`topic\`: that topic): concrete sub-skills, each small enough for 3–10 short lessons. Arithmetic: Counting and place value, Addition and subtraction, Multiplication and division, Fractions, Decimals and percentages. A very big topic can be split once more (at most three levels under the subject).
5. Order, with no skipping: the parts are what you learn to advance. Every topic after the first lists the topic before it as its prerequisite, and unlocks once every part of that topic is learnt. Inside a topic, the first part has no prerequisite and every later part lists the part before it. A prerequisite with lessons counts once all its lessons are done, and a topic's parts unlock with their topic, so the path runs: Arithmetic → its parts, one by one → Pre-algebra → its parts → … → the advanced skills.
6. Every part (the skills without parts of their own) gets a course outline: 1–3 modules of 3–6 lessons, each a title and a one-line objective. No lesson content yet.
7. Connections across trees: subjects need each other (Physics needs Algebra and Calculus, Software development needs Programming, Computer science's Algorithms and Discrete mathematics). When a skill needs one from another subject, list it as a prerequisite by its exact name, so the learner has to learn it first. Reuse the skills already in the tree (get_skill_tree); if one doesn't exist yet, add it with add_skills in its own subject and ability before you reference it.
8. Give every skill a fitting emoji, a glyph (its line icon on the map) and the ability it trains, and the same branch (the subject's name). Add a habit quest only to parts that need regular practice.`;

/** The tools to plan with, in the order that lets the learner start soonest. */
export const PLAN_STEPS = `How to plan it with the tools:
a. add_skills with the subject, its topics and the first topic's parts (their \`course\` outlines included), in one call.
b. Write the first lessons of the first part's course with write_interactive_lesson, so the learner can start right away.
c. Then add the remaining topics' parts with add_skills (a call per topic or two, max 80 skills per call), and outline their courses with plan_courses (or \`course\` in add_skills).
d. Check the result with get_skill_tree: every part should have a course.`;

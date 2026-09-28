// Built-in starter templates, turned into pages on demand from Markdown.
// Placeholder text is deliberate: Markdown can't express empty list items.
// Flashcard syntax stays inside `code` so a fresh page doesn't add review cards.

import type { PageStylePatch } from "../../../shared/model.ts";
import { todayKey } from "../../../shared/model.ts";

export interface StarterTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  style?: PageStylePatch;
  markdown: () => string;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "meeting",
    name: "Meeting notes",
    icon: "🤝",
    description: "Agenda, notes, decisions and action items",
    markdown: () =>
      [
        `**Date:** ${todayKey()}`,
        "",
        "**Attendees:** Names",
        "",
        "## Agenda",
        "1. Topic",
        "2. Topic",
        "",
        "## Notes",
        "Key points from the discussion.",
        "",
        "## Decisions",
        "- Decision, and why",
        "",
        "## Action items",
        "- [ ] Owner — task — due date",
      ].join("\n"),
  },
  {
    id: "weekly",
    name: "Weekly review",
    icon: "🗓️",
    description: "Wins, lessons and next week’s priorities",
    style: { cover: { type: "gradient", value: "dawn" } },
    markdown: () =>
      [
        `Week of **${todayKey()}**`,
        "",
        "## Wins",
        "- Something I’m proud of",
        "",
        "## What didn’t go well",
        "- Something to improve",
        "",
        "## What I learned",
        "- An insight worth keeping",
        "",
        "## Priorities for next week",
        "- [ ] Most important thing",
        "- [ ] Second priority",
        "- [ ] Third priority",
        "",
        "## Reflection",
        "How did this week feel? What would I change?",
      ].join("\n"),
  },
  {
    id: "reading",
    name: "Reading notes",
    icon: "📖",
    description: "Summary, key ideas, quotes and flashcards",
    style: { cover: { type: "gradient", value: "sand" }, font: "serif" },
    markdown: () =>
      [
        "**Author:** Name",
        "",
        `**Started:** ${todayKey()} · **Rating:** ☆☆☆☆☆`,
        "",
        "## Summary",
        "What is this book about, in three sentences?",
        "",
        "## Key ideas",
        "1. First idea",
        "2. Second idea",
        "3. Third idea",
        "",
        "## Favorite quotes",
        "> A line worth remembering.",
        "",
        "## Flashcards",
        "Add lines like `Question :: Answer` here — they join your flashcard reviews.",
        "",
        "## How I’ll apply this",
        "- One concrete change",
      ].join("\n"),
  },
  {
    id: "brief",
    name: "Project brief",
    icon: "🚀",
    description: "Goals, scope, milestones and risks",
    style: { cover: { type: "gradient", value: "sea" } },
    markdown: () =>
      [
        "## Overview",
        "One paragraph: what are we building, for whom, and why now?",
        "",
        "## Goals",
        "- Measurable outcome",
        "",
        "## Non-goals",
        "- What we deliberately won’t do",
        "",
        "## Milestones",
        "- [ ] Kickoff",
        "- [ ] First prototype",
        "- [ ] Feedback round",
        "- [ ] Launch",
        "",
        "## Risks & open questions",
        "- Risk — mitigation",
        "",
        "## Team",
        "- Name — role",
      ].join("\n"),
  },
  {
    id: "study",
    name: "Study plan",
    icon: "🎯",
    description: "Goal, resources, schedule and key concepts",
    style: { cover: { type: "gradient", value: "meadow" } },
    markdown: () =>
      [
        "## Goal",
        "What will I be able to do, and by when?",
        "",
        "## Resources",
        "- Book, course or video",
        "",
        "## Schedule",
        "- [ ] Week 1 — foundations",
        "- [ ] Week 2 — practice",
        "- [ ] Week 3 — deeper topics",
        "- [ ] Week 4 — review & project",
        "",
        "## Key concepts",
        "Write `Term :: Definition` lines to turn concepts into flashcards.",
        "",
        "## Progress log",
        `**${todayKey()}** — Started the plan.`,
      ].join("\n"),
  },
];

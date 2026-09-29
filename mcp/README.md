# Basalt × Claude — memory, knowledge vault and tutor over MCP

This folder turns a Basalt workspace into a place where Claude (Claude Code,
Claude Desktop, or any [MCP](https://modelcontextprotocol.io) client) keeps its
**long-term memory**, reads and writes your **notes**, and runs **courses** —
live and end-to-end encrypted. Humans see Claude's edits appear in real time
(and see Claude itself in the workspace's presence list) because the server is
just another collaborator on the same Yjs document.

| File | What it is |
| --- | --- |
| `index.ts` | The MCP server over stdio (`npm run mcp -- --link "<share link>"`). |
| `basalt-mcp.ts` | `createBasaltMcp({ doc, awareness })`: registers every tool and prompt on a live `Y.Doc`. |
| `memory.ts` | `/memories` directory semantics on top of pages. |
| `ops.ts` | Page resolution, formatting and BM25 search. |
| `connect.ts` | Share-link parsing, relay sync, offline cache, flush-on-exit. |
| `vault-cli.ts` | Obsidian-compatible export (optionally live) and import (`npm run vault -- …`). |
| `convert.ts` | Markdown ⇄ BlockNote conversion in Node (same schema as the app). |

Shared, environment-independent logic lives in `shared/vault.ts` (export,
import, frontmatter, properties) and `shared/excalidraw-md.ts` (Excalidraw
files). The app's *Settings → Data* panel uses the same code in the browser.

## The easy way: copy the command from the app

Open **More → Claude memory** in Basalt (desktop app, or `npm start` opened on
the same computer). It shows the Claude Code command and the Claude Desktop
config with your real paths and share link filled in; copy, paste, done.

- **Desktop app:** nothing else to install. The app keeps the connector in its
  data folder and Claude runs it through `Basalt.exe` itself
  (`ELECTRON_RUN_AS_NODE=1`), so no Node.js is needed. Use the installed app
  (`Basalt-Setup.exe` or the AppImage); after an update, restart
  Claude so it picks up the new connector.
- **From source:** the commands point at this checkout's `mcp/index.ts` and
  your Node.js.

Both add `--local <folder>`, an offline copy, so Claude keeps working while
Basalt is closed (after it has connected once); changes sync when Basalt is
open again.

The setup commands below are for doing it by hand, or when the page is opened
from another computer.

## Requirements

- Node.js ≥ 22.18 (runs the TypeScript sources directly).
- A local copy of Basalt with dependencies installed: `npm install`.
- A workspace with sync turned on and its **share link**
  (`https://host/#/join/<key>?s=<wss://host/sync>&n=<name>`).

## Claude Code

```sh
claude mcp add --env "BASALT_LINK=<share link>" --scope user basalt node /path/to/basalt/mcp/index.ts
```

The link goes in `--env` rather than `--link` so the command works in every
shell: PowerShell drops the `--` separator when `claude` was installed with
npm, and Claude Code would then read `--link` as one of its own options.
`--scope user` makes Basalt available in every project. MCP prompts show up as
slash commands: `/mcp__basalt__memory_protocol`, `/mcp__basalt__teach_me <topic>` and `/mcp__basalt__level_up_my_life <goal>`.

## Claude Desktop

Settings → Developer → Edit Config, merge into `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`),
then restart Claude Desktop:

```json
{
  "mcpServers": {
    "basalt": {
      "command": "node",
      "args": ["/path/to/basalt/mcp/index.ts", "--link", "<share link>"]
    }
  }
}
```

If Claude Desktop cannot find `node`, use the absolute path from `which node`.

## Server options

| Flag | Env | Meaning |
| --- | --- | --- |
| `--link <url>` | `BASALT_LINK` | Workspace share link (key + relay + name). |
| `--key <key>` / `--server <wss://…/sync>` | `BASALT_KEY` / `BASALT_SERVER` | Instead of `--link`. |
| `--local <dir>` | `BASALT_LOCAL` | Keep an offline cache (`<dir>/<room>.ydoc`). When the relay is unreachable the server starts from the cache and syncs once the relay is back. |
| `--name <name>` | | Name shown to collaborators (default `Claude`). |
| `--timeout <sec>` | `BASALT_TIMEOUT` | How long to wait for the first sync (default 20). |

stdout is reserved for the MCP protocol; all logs go to stderr. On SIGINT /
SIGTERM or when the client disconnects, pending edits are flushed to the relay
(and the cache) before exiting. Without `--local`, an unreachable relay or a
rejected key is reported on stderr and the process exits with a non-zero code.

## Tools

**Notes**

| Tool | Purpose |
| --- | --- |
| `search_notes(query, limit?)` | BM25 over titles (boosted) and content — including whiteboard text, notebook code and course outlines — with highlighted snippets and ids. |
| `list_notes(parent_id?, depth?)` | Page tree with ids, kinds and object types. |
| `recent_notes(limit?)` | Most recently edited pages. |
| `read_note(id_or_title)` | Header (title, id, kind, type, properties, parent, sub-pages, backlinks, dates) + markdown. Boards show their text, notebooks their cells, courses their outline. |
| `create_note(title, markdown?, parent_id_or_title?, type?, props?, icon?)` | New page from markdown. Reports `[[links]]` that do not resolve yet. |
| `update_note(id_or_title, markdown, mode)` | `append` / `prepend` keep existing blocks untouched; `replace` rewrites. |
| `update_note_meta(id_or_title, title?, parent?, icon?, type?, props?)` | Rename, move (`"root"` for top level), retype, set properties. |
| `trash_note(id_or_title)` | Move to trash (restorable). |
| `get_backlinks(id_or_title)` | Linked pages plus unlinked mentions. |
| `daily_note(append_markdown?)` | Today's journal page (`Journal/YYYY-MM-DD`). |
| `list_types()` | Object types with properties and select options. |

Pages can be referenced by id, exact title (case-insensitive) or a
`Parent/Child` path. Markdown written by Claude supports `[[Title]]` links
(resolved case-insensitively to real page links), LaTeX (`$…$`, `$$…$$`),
checklists, tables, code, images by URL and flashcard lines (`Front :: Back`).
Properties are given by name, e.g. `{"Status": "In progress", "Due": "2026-10-01", "Tags": ["ml"]}`;
unknown tags are added to multi-selects, single-select values must exist.

**Memory** — mirrors Anthropic's memory tool on pages under the system page
*Claude Memory* (created on first write). `/memories/preferences.md` is the page
"preferences"; `/memories/projects/basalt.md` is "basalt" under "projects".

| Tool | Purpose |
| --- | --- |
| `memory_view(path?, view_range?)` | Directory listing, or file content with line numbers. |
| `memory_create(path, content)` | Create or overwrite a file (missing folders are created). |
| `memory_str_replace(path, old_str, new_str)` | Replace text that occurs exactly once. |
| `memory_insert(path, insert_line, insert_text)` | Insert after a line (0 = top). |
| `memory_delete(path)` | Move a file or folder to the trash. |
| `memory_rename(old_path, new_path)` | Rename / move; fails if the destination exists. |
| `remember(fact, topic?)` | Append `- YYYY-MM-DD: fact` to a topic file (default `general`). |
| `recall(query, limit?)` | Search only memory files; returns matching lines. |

Memory files are rich-text pages, so their text is shown normalized (`-`
bullets, no trailing spaces); `memory_str_replace` matches against exactly what
`memory_view` shows.

**Learning**

| Tool | Purpose |
| --- | --- |
| `create_course(topic, goal?, start_level?, curriculum, parent?)` | Course page with levels → modules → lessons (ids assigned). |
| `update_course(course, curriculum?, goal?)` | Revise the path; keep lesson ids to keep progress. |
| `get_course(id_or_title)` | Outline with lesson ids, status, best score, next lesson, the learner's pace and accuracy, which lessons to write next, and whether the path is about to run out. |
| `write_interactive_lesson(course, lesson_id, steps[])` | A Brilliant-style lesson the app plays step by step: explain, explore (slider + live graph), choice, input, slider, order, match, reveal, teach (explain it in your own words) and practice (timed, with self-feedback). Any step can have an SVG or image `figure` and a learning-loop `phase`. Invalid lessons are refused with what to fix. |
| `extend_course(course, level, module)` | Add the next module of lessons without touching progress. |
| `write_lesson(course, lesson_id, markdown)` | Older courses: the lesson as a sub-page. |
| `record_quiz(course, lesson_id, score)` | Score 0–1 (or %); best ≥ 0.8 → mastered. |
| `add_flashcards(page, cards[])` | Appends a `## Flashcards` section of `front :: back` lines for spaced repetition. |

**Skill tree** (real life as a D&D character: six abilities, skills with levels, XP and habit quests)

| Tool | Purpose |
| --- | --- |
| `get_skill_tree()` | Every skill with level, rank, XP, streak, lock state, prerequisites and quests, plus today's quests. |
| `list_life_areas()` | The six abilities (Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma, plus custom ones) and the D&D skills under each. |
| `add_skills(skills[], branch?)` | Add a whole plan at once; prerequisites reference keys in the call or existing skills. `branch` groups them as one learning path the app shows in order. Each skill can have a `topic` (the bigger skill it's part of) and a `course` outline (lesson titles only). |
| `plan_courses(courses[])` | Course outlines for many skills in one call: lesson titles and objectives, no content, each linked to its skill. |
| `update_skill(skill, …)` | Rename, change area/icon/goal, set prerequisites or `topic`, archive. |
| `log_practice(skill, minutes, note?)` | Practice time → XP (10 XP/min); reports level-ups. |
| `award_xp(skill, amount, reason)` | XP for milestones that aren't timed practice (max 1000). |
| `add_quest(skill, title, cadence?, target?, xp?)` / `complete_quest(skill, quest)` | Daily/weekly habit quests with streaks. |
| `link_to_skill(skill, page)` | Link a course (mastered lessons earn XP) or a note to a skill. |

**Prompts**

- `memory_protocol` — load memory at the start of the conversation, record
  durable facts and preferences, keep memory organized, never store secrets.
- `teach_me(topic, level?)` — act as a tutor: research the topic, plan the
  whole path in the skill tree up front with the general plan, write
  interactive lessons ahead of the learner, and adapt to their pace, accuracy
  and mistakes.

**The general plan** (`shared/skill-plan.ts`) is how every skill is planned,
whatever it is. The subject (say Mathematics) is made of topics in learning
order (Arithmetic, Pre-algebra, Algebra, …). Each topic is made of parts,
which are the things you learn to advance (Arithmetic: Counting and place
value, Addition and subtraction, …). Each part has a course outline of lesson
titles. Everything is planned up front as titles only, and lessons are
written a few ahead of the learner. A topic that's a prerequisite unlocks
what needs it once every one of its parts is learnt, and a topic's parts
unlock with the topic, so the path runs topic → its parts → next topic.
- `level_up_my_life(goal?)` — act as a life coach: design or extend the skill
  tree for any goal, set realistic habit quests, link courses, and log what
  you report doing as XP.

The server's `instructions` summarize the memory protocol, so clients that
surface them get the behavior without invoking the prompt.

Every write happens in a Yjs transaction with origin `"claude"`, updates the
page's `updatedAt`, and records `createdBy: "Claude"` on new pages. Claude's
presence (`{ user: { name: "Claude", color: "#d97757" }, agent: "claude",
pageId, activity }`) tells people what it is reading or writing.

## Obsidian vault export / import

```sh
# One-shot or live (--watch) export; only files listed in .basalt-vault.json are ever deleted.
npm run vault -- export --link "<share link>" --out ~/Vaults/Basalt --watch

# Import an Obsidian vault into a new page named after the folder (--into "Title", or --root).
npm run vault -- import --link "<share link>" --dir ~/Vaults/MyVault
```

Export layout: one file per page named after its title; a page with sub-pages
becomes `Title/Title.md` plus its children (folder-note convention); YAML
frontmatter (`id`, `kind`, `type`, `icon`, `created`, `updated`, properties by
name, `title` when the file name differs); `[[wikilinks]]` (folder path when a
name is ambiguous); whiteboards as `.excalidraw` JSON with their images;
notebooks as fenced code with `>` quoted outputs; courses as an outline with
progress; databases as a table; paintings as a placeholder note; embedded files
under `_attachments/<page id>/`; and a `CLAUDE.md` describing the layout so
Claude Code can navigate the folder. With `--watch`, changed pages are
re-rendered incrementally (debounced) and files of deleted pages are removed.

Import: `.md` notes (frontmatter → properties of a matching type, folders →
page hierarchy, folder notes, `[[links]]` resolved after all pages exist,
`![[image.png]]` / `![](path)` → image blocks with data URLs up to 2 MB,
`--max-embed-mb` to change), `.excalidraw` and Obsidian `.excalidraw.md`
drawings (compressed or plain JSON, embedded images resolved from the vault) →
whiteboards.

## Security

- **The share link is the workspace key.** Anyone or any tool holding it can
  read and modify the entire workspace. Keep it out of shared repositories,
  project-scoped `.mcp.json` files that get committed, screenshots and chats.
  Prefer `--scope user` in Claude Code and keep `claude_desktop_config.json`
  private. Keys cannot be revoked; to cut access, move the pages to a new
  workspace.
- Content is encrypted on your machine before it reaches the relay; the relay
  only stores ciphertext. The MCP server and the vault CLI decrypt locally.
- Exported vaults, `.basalt` backups and the `--local` cache are **plaintext**
  (the cache is a Yjs update file) — store them like any other private files.
- Claude can create, edit and trash pages. Trash is recoverable from the app;
  the tools never delete pages permanently.
- Memory is ordinary pages: review and edit what Claude remembers on the
  *Claude memory* page. The memory protocol tells Claude never to store secrets.

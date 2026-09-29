# 🪨 Basalt

**Learn anything by doing, like Brilliant, and level up like a D&D character.** Plus notes and canvases for everything else, free and private, on every device.

- **Interactive lessons:** one idea at a time, with questions, sliders, live graphs, diagrams and hands-on practice, and instant feedback on every answer.
- **A method that works:** every lesson walks the learning loop (preview → understand → explain in your own words → recall → apply), skills add deliberate practice with feedback, you master every part of a skill (and pass its mastery check) before the next one opens, and what you learn comes back for spaced review after 1 day, 3 days, a week and a month.
- **Claude, with your own Claude subscription (no API key):** ask for any skill or topic and Claude researches it, maps the branch you'll follow in your skill tree, builds its courses and keeps lessons written ahead of you at your pace.
- **A D&D character sheet:** six abilities, scores and modifiers that grow with every lesson, a class, a d20 roll for bonus XP.

Basalt combines:

| Like… | You get |
| --- | --- |
| **Notion** | Block editor with `/` commands, nested pages, databases as table · board · gallery · list · calendar |
| **Obsidian** | `[[wiki links]]`, backlinks & unlinked mentions, graph view, daily notes, Markdown import/export of whole vaults |
| **Anytype** | Object types with properties (“Task”, “Book”, “Person”…, or your own), sets across the workspace, local-first + E2E encryption |
| **Excalidraw + Krita** | One infinite canvas: shapes, diagrams and text *and* pressure-sensitive painting (brush engine, layers with blend modes, stabilizer, symmetry), with live cursors and links to pages |
| **Jupyter notebooks** | Runnable JavaScript & Python (Pyodide) cells with shared outputs |
| **Anki** | Spaced repetition (FSRS) from `Question :: Answer` and `{{c1::cloze}}` lines in any page |
| **Brilliant** | Interactive, hands-on lessons with instant feedback, diagrams, sliders and live graphs; a built-in course library, and Claude writes new courses on anything |
| **An RPG — for real life** | A skill tree across every area of life: levels, XP, ranks, habit quests, streaks and unlockable skills — in a calm, non-gamey design |
| **Jarvis** | Your own assistant — Claude with tools, living in the app as a little animated character: it searches, writes and organizes pages, plans skills and quests, builds courses and flashcards, remembers things and looks things up on the web. Talk to it by voice. |
| **Claude memory** | An MCP server so Claude (Desktop / Code) can use your workspace as long-term memory and knowledge vault |

Everything is **free and open source**, works **offline**, and syncs **end-to-end encrypted** — the server only ever sees ciphertext.

---

## Get the desktop app (Windows .exe, Linux)

These links always download the newest version:

| System | Download | How to open |
| --- | --- | --- |
| **Windows 10/11** | **[Basalt-Setup.exe](https://github.com/UNREV1/basalt/releases/latest/download/Basalt-Setup.exe)** | Run it and follow the installer. Basalt appears in the Start menu and on your desktop, and **updates itself**. |
| **Windows (no install)** | [Basalt-Portable.exe](https://github.com/UNREV1/basalt/releases/latest/download/Basalt-Portable.exe) | Double-click it — it runs straight away (e.g. from a USB stick) and tells you when there's a new version. |
| **Linux** | [Basalt-x86_64.AppImage](https://github.com/UNREV1/basalt/releases/latest/download/Basalt-x86_64.AppImage) | `chmod +x Basalt-*.AppImage`, then run it. It updates itself. |

All versions: [Releases](https://github.com/UNREV1/basalt/releases).

First launch, once:

- **Windows** may show *"Windows protected your PC"* because the app isn't code-signed (that costs money) → click **More info → Run anyway**.
- **Windows Firewall** asks whether Basalt may use networks → allow **Private networks**, so your phone and other devices on the same Wi-Fi can sync.

The desktop app is the full Basalt with its sync server built in: your notes live on your computer (Help → *Show data folder*), it works offline, and **Share** gives phones and tablets on your Wi-Fi an invite link / QR code to join. For access from anywhere, see *Put it on the internet for free* below.

**Updates happen by themselves.** Basalt checks for a new version a few seconds after it starts, every hour, and when your computer wakes up. The installed Windows app and the Linux AppImage download it in the background and install it without asking. Basalt restarts into the new version while you're not using it: when you lock the screen, step away for 10 minutes, or leave Basalt in the background for 5 minutes. It never restarts while Claude is working on something, and otherwise it updates when you quit. A small notification then says which version you're on. The portable .exe can't replace itself, so it shows a *Download* prompt instead.

If Basalt is installed for everyone on the computer (in Program Files), Windows has to give permission to change it. Those updates install when you quit, and Windows asks you then. To update without any question, reinstall Basalt and choose *Only for me*. *Help → Check for updates…* checks right away, and *Help → Update automatically* turns automatic updates off. Your notes are never touched by an update.

**Build the .exe yourself** (on Windows; Node.js 22.18+):

```bash
cd basalt && npm install
cd desktop && npm install
npm run dist:win     # → desktop/release/Basalt-Setup.exe and Basalt-Portable.exe
```

`npm run dist:linux` builds the Linux AppImage (on Linux), and `npm start` in `desktop/` opens the app without packaging it. Every push to `main` runs the `desktop` GitHub Actions workflow, which builds both and publishes them as the latest release — that is what installed apps update from.

## Quick start (run it in your browser)

Requirements: **Node.js 22.18+** (it runs the TypeScript server directly).

```bash
cd basalt
npm install
npm run build
npm start          # → http://localhost:8787
```

Open the app, create a workspace, and you're done. For development with hot reload: `npm run dev` (web app on http://localhost:5173, relay on 8787).

### Use it on all your devices

1. Click **Share** (top right) → copy the invite link, or show the QR code.
2. Open it on your phone / tablet / other computer → **Join workspace**.
3. Edits appear everywhere in real time, with live cursors. Each device keeps a full local copy, so it keeps working offline and merges automatically when back online (CRDTs via [Yjs](https://yjs.dev)).

On a phone, use your browser's **Add to Home Screen / Install app** to get an app icon (it's a PWA).

### iPhone and iPad

Basalt is a web app built to feel native on iPhone and iPad (iOS / iPadOS 16.4 and later):

- **Get it on the Home Screen:** in the desktop app, click **Share** and scan the QR code with the iPhone/iPad camera (both on the same Wi-Fi), open the link in Safari → **Join workspace** → **Share → Add to Home Screen**. It opens full-screen with its own icon, and Safari keeps its data (plain Safari tabs can lose website data after a week without use).
- **Over your home Wi-Fi** (an `http://192.168…` address) Safari won't let web apps work offline, so Basalt opens on the iPhone/iPad only while your PC is on and you're on the same Wi-Fi. Your notes are still stored on the device. For offline use and syncing from anywhere, give Basalt an HTTPS address (*Put it on the internet for free*, below) and add that one to the Home Screen instead.
- **Apple Pencil:** the Paint studio reads pressure and tilt, ignores your palm once it has seen the Pencil, and uses two fingers to pan, zoom and rotate. Two- and three-finger taps undo and redo.
- **Importing an Obsidian vault on iPhone/iPad:** Safari can't pick folders, so compress the vault in the Files app (long-press → Compress) and choose the `.zip` in Settings → Import & export.
- **Sharing:** the invite dialog uses the system share sheet (AirDrop, Messages, Mail…).

### Put it on the internet for free

Any of these gives you a public HTTPS address to share:

- **Cloudflare Tunnel (no account needed):** run `npm start`, then `cloudflared tunnel --url http://localhost:8787`.
- **Render (free plan):** fork [UNREV1/basalt](https://github.com/UNREV1/basalt), then *New → Blueprint* and pick the fork (it uses `render.yaml`).
- **Docker anywhere** (home server, Oracle Cloud free VM, Fly.io, a Raspberry Pi…):
  ```bash
  docker build -t basalt basalt
  docker run -p 8787:8787 -v basalt-data:/data basalt
  ```

The relay is a tiny append-only log of encrypted blobs. If it loses its data (e.g. a free host restarts), the next member device that connects re-uploads everything — nothing is lost as long as one device has a copy.

---

## How privacy works

- A workspace is identified by a random 256-bit key that only exists in invite links (after the `#`, which browsers never send to servers) and on member devices.
- Every update and every presence message is encrypted on-device with **XChaCha20-Poly1305** before it leaves.
- The relay routes on a one-way hash of the key and only stores a hash of an auth token, so it can neither read your notes nor let people without the link write to your workspace.
- The invite link grants full access. Treat it like a password.

---

## Features in depth

### Learn
The home screen. *Continue* picks up your next lesson; *Review* brings back what's due; once a week it asks how your learning went. Type any skill or topic into *What do you want to learn?* and (in the desktop app with Claude Code) Claude researches it, plans the whole path in your skill tree (topics, the parts you learn to advance and every lesson title) and writes your first lessons. *Your paths* shows each path's topics, with the parts of the one you're on. *Explore courses* has ready-made courses that work with no AI at all: Memory Palace, Learning How to Learn, Thinking in Probabilities, Cognitive Biases, The Art of Persuasion, The Science of Sleep, Strength Training 101 and Three-Ball Juggling.

**How a lesson works.** Lessons open full screen, one step at a time: a short explanation, then something to do (pick an answer, type one, drag a slider on a live graph, put steps in order, match pairs). Every answer gets instant feedback and the reason why; a miss gives a hint, then the answer, and asks *why* you missed it (didn't know it, misread, slipped, mixed it up), which goes into the course's error log.
- **Subjects** walk *preview → understand → explain → recall → apply*: you predict before you're taught, explain the idea in your own words and compare it with a model answer (Feynman), recall it with no hints, then apply it to something new.
- **Skills** walk *preview → understand → practice → reflect*: a clear goal, just enough technique, a timed practice session with focus points, then honest feedback and one thing to change next time.
- **Mastery before moving on:**
  - A lesson counts only once you've mastered every part of it: every question right first time, every key point of your own explanation covered, and every practice done and gone well.
  - Whatever you missed comes straight back in a short round, each item after the explanation that teaches it, until you get it right.
  - When every lesson of a skill is mastered, its **mastery check** asks one question from each lesson, and you need all of them right. A miss sends that lesson back to master, and you retake the check.
  - Only then is the skill learnt, and what comes after it unlocks.
  - Already know it? *I know this: test out* opens the check straight away. Pass it and every lesson counts as known.
- **Review later:** finished lessons come back after 1 day, 3 days, a week, a month and three months, mixed across courses (interleaving). Questions you got wrong come first; a miss starts the gaps over.
- **Rewards:** stars for first-try accuracy, XP in the skill the course trains (and so your ability score), a d20 roll for bonus XP (a natural 20 doubles it), and a nudge to take a break after 25 minutes.

**The whole skill tree, planned and built in.** The Character map starts with Basalt's full tree, organized from the general to the detailed:
- **Broad areas** for each ability, like Formal sciences, Natural sciences, Technology, Health, Sports, Visual arts and Communication.
- **Fields** inside each area (60 in all), like Mathematics, Physics, Programming, Nutrition, Swimming and Drawing.
- **Topics** inside each field. They branch and join: Pre-algebra leads to both Algebra and Geometry, and Trigonometry needs both.
- **Steps** you learn inside each topic, in order.
- **Advanced skills** after them.
- **Expert skills** at the top of every field:
  - In academic fields, PhD level: Mathematics goes on through Real and Complex analysis to Graduate analysis, algebra and geometry, then Mathematical research.
  - In practical fields, mastery: elite competition, coaching and the science behind it, for example Strength coaching and Strength science.

Every branch goes all the way: each topic leads on to an advanced skill, and each advanced skill leads on to an expert one. That's about 3,300 skills in all.

Nothing is skipped: each step needs the one before it, and a topic needs everything it follows. An advanced skill needs everything it builds on, from any tree: Software development comes after Frontend, Backend and Databases in Programming, Algorithms in Computer science, and Discrete mathematics. Related skills in other trees are linked too, like Baking to Chemistry, without locking anything.

The map has three layouts:
- **Radial:** you in the middle, then evenly spaced rings: your abilities, their areas and the fields in each, every ring evenly filled. From each field its paths run straight out, from the first topic to the expert skills, with every step the same distance apart.
- **Tree:** a left-to-right outline you scroll like a table of contents.
- **Clusters:** each field in its own space inside its area, its topics grouped with their steps.

**Find a skill** searches names, where skills sit and everyday words ("diet" finds Nutrition, "coding" finds Programming), and lists the best matches. Planned skills are light and outlined. Click one to start it: it becomes one of your skills, and Claude writes its lessons as you reach them. **Start the tree over** (the map's ⋯ menu) rebuilds your map from this plan: skills that are in it keep their progress, and the rest are archived, so you can bring them back.

**Claude keeps your path ready.** After each lesson Claude writes the next ones ahead of you, about three days' worth at your pace, adjusted to how often you get things right the first time, what you got wrong, and your weekly reflection. It also extends the course, and your branch of the skill tree, before you reach the end. This runs through Claude Code with your own Claude sign-in: no API key. If Claude Code isn't signed in, or its sign-in expired, Basalt says so in Claude Code's own words. *Sign in to Claude Code* signs in right there: your browser opens (or you paste the code the sign-in page shows), no terminal needed, and whatever was waiting goes again by itself. More → Claude memory shows which account it's signed in as, and spots a broken Claude Code settings file (`~/.claude/settings.json`), which Claude Code otherwise skips entirely: *Fix it* repairs small slips like a stray comma or moves the file aside, always keeping the original. Turn it off in the course path. Outside the desktop app, the same requests can be copied into Claude Code or Claude Desktop with Basalt connected.

The sidebar stays short: Search, Learn, *Ask Claude* (your assistant), Character (the skill tree), Flashcards, then your notes and canvases, and *More* (Graph, Types, Claude memory, Trash). In the desktop app, *Ask Claude* also runs through Claude Code with your own sign-in: no API key.

### Your layout
Everything around the page is made of panels in two docks: the sidebar on the left and a right dock (the ⊟ button in the top bar). Panels: Navigate, Favorites, Pages, Outline, Backlinks, Local graph, Quests and the Assistant. Drag a panel by its header to reorder it or move it to the other side, click the header to collapse it, and use its ⋯ menu to move it up/down, across, or hide it (handy on iPad). *Add panel* brings hidden ones back and *Reset layout* restores the default; drag the right dock's edge to resize it. Put the Assistant in a dock and `Ctrl/⌘ J` opens it there instead of the floating chat. The layout is saved per device.

### Pages, links & databases
- `/` for blocks: headings, lists, to-dos, toggles, tables, code, images, files, **equations (LaTeX)**, sub-pages.
- **Pages hold anything:** `/canvas`, `/database` and `/code notebook` put a live canvas, database or notebook right inside the page (each is also its own page in the sidebar); `/embed a page` shows any other page inline. Canvases can be resized by dragging their bottom edge. In markdown and Obsidian vaults this is `![[Page title]]` on its own line.
- `[[` or `@` to link any page (or create it). Backlinks and unlinked mentions appear at the bottom of each page.
- **Types & properties** (Anytype-style): give any page a type and fill in its properties; manage types in *Types*.
- **Databases** show every object of a type (or only the database's children) as a table, kanban board, gallery, list or calendar, with filters, sorting and grouping.
- **Graph view** of all links, with a local graph mode.
- **Daily notes**: *Today’s note* from `Ctrl/⌘ K`.
- **Search & commands**: `Ctrl/⌘ K`.

### Canvas: draw, diagram and paint in one place
A canvas is one infinite surface with two kinds of tools; switch with **Whiteboard | Paint** at the top right (on phones: the brush button, and *Done* to go back). Create → **Painting** (or `/painting` in a page) makes a canvas that opens ready to paint, and each canvas reopens the way you last used it.
- **Whiteboard tools** (the Excalidraw toolbar): shapes, arrows, text, sticky notes, images, frames, libraries; link shapes to pages.
- **Paint**: a Krita-style vector brush engine — pen pressure & tilt, brush presets (ink, pencil, marker, airbrush, calligraphy, watercolor…), stabilizer, layers with opacity / blend modes / locking / alpha lock, vector eraser, symmetry and radial painting, lasso fill, color wheel, and SVG/PNG export of the painting.

Both share one camera, so painting and diagrams pan and zoom together. Each paint layer sits **under** the shapes (paint a background, then diagram on top) or **over** them (annotate) — toggle it in the Layers panel. *Whiteboard*, *Done* or Esc leaves paint mode. Everyone sees shapes and brush strokes live. Paintings made before canvases existed open as canvases with their paper kept. (Vault export writes the shapes as `.excalidraw`; painted layers stay in Basalt.)

### Notebooks
Run **JavaScript** (in a sandboxed worker) and **Python** (Pyodide, with numpy/pandas/matplotlib auto-loading) cells. Outputs are shared with collaborators.

### Learning
- **Flashcards anywhere**: write `Front :: Back`, `Front ::: Back` (both directions) or `{{c1::cloze}}` in any page. *Flashcards* schedules them with FSRS and shows streaks, a heatmap and a forecast.
- **Courses**: see *Learn* above. Older AI-tutor courses (lessons written as pages, with quizzes) still open as before.
- **Questions about your notes** go to the assistant, which searches and reads your pages and links the ones it used.

The AI features use your own Anthropic API key (Settings → AI; stored only on your device). Everything else is free and works without one. You can also let **Claude Desktop / Claude Code** do the teaching for free-with-your-subscription through the MCP bridge below.

### Your assistant
A little glass pebble lives on top of the app (rename it in Settings → Assistant & AI). Click it or press **Ctrl/⌘ J** and tell it what you want — it acts instead of explaining:

- "Make me a workout plan and add it to my skill tree", "Summarize this page", "Make flashcards from this page", "What should I focus on today?", "Teach me Bayesian statistics from scratch", "Remember that I'm vegetarian".
- It uses the **same tools** Claude Desktop gets through the MCP server (search, read, create and edit pages, memory, courses, flashcards, skills, XP and quests), plus opening pages for you, **web search** and any **remote MCP servers** you add.
- While it works, the character flies to the page it's editing, thinks out loud in a bubble, and cheers when it's done. It watches your cursor, wanders around when idle, and can be dragged anywhere (right-click to hide).
- **Voice:** the mic button for talking (Chrome, Edge, Safari) and optional spoken replies.
- Every conversation is a page under **Chats** — searchable, linkable and synced like everything else.

It uses Claude with your own API key (Settings → Assistant & AI), requests go straight from your device to Anthropic.

### Your life as a D&D character
Real life, with the progression mechanics of D&D (but none of the video-game look):

- **Six abilities**, as on a D&D character sheet, read as real life:
  - **Strength**: athletics, lifting, climbing.
  - **Dexterity**: mobility, hand skills like instruments and drawing.
  - **Constitution**: endurance, sleep, nutrition and concentration.
  - **Intelligence**: academics and memory techniques, such as spaced repetition, memory palaces and mnemonics.
  - **Wisdom**: mindfulness, insight, health know-how, survival and money sense.
  - **Charisma**: persuasion, performance, presence and leadership.

  Every skill trains one ability. An ability's **score** (10 = an average person, 20 = years of practice) and **modifier** grow with the XP of its skills. Your strongest abilities decide your **class**, for example Wizard, Fighter or Paladin.
- **Every skill is a page** (type *Skill*, under *Skills* in the sidebar): the top shows its level, XP, quests, practice log and prerequisites; below is ordinary notes. Rename the page and the skill follows. Give any page the *Skill* type to add it to the tree; move it to the trash to take it out. A skill's page has a *Start lesson* button too, and a topic's parts are pages under its page.
- **Levels, XP and ranks** (Novice → Apprentice → Journeyman → Adept → Expert → Master → Grandmaster). XP comes from real activity: practice you log, daily/weekly **quests** you check off, and lessons you master in linked courses.
- **Prerequisites** unlock advanced skills once their foundations reach a level; **streaks** reward consistency.
- **The skill map** (*Character* in the sidebar) shows every skill at once, with your character beside it.
  - **Click a skill to start its next lesson.** If the lesson isn't written yet, Claude writes it and it opens by itself. A skill with nothing planned yet gets planned by Claude, or starts a matching built-in course (Athletics starts *Strength Training 101*).
  - **Right-click a skill** (or press and hold on a touch screen) for its details: what to learn first, its parts, the practice log, quests and more.
  - **It works like an RPG skill tree:**
    - Each skill is a circle with a line icon. Bigger means a higher level, the color is its ability and a ring fills toward the next level.
    - Skills you can learn now glow, learnt ones get a check, and locked ones are dashed and dim.
    - Arrows run from what to learn first to what it unlocks. Hover a skill to light up everything it needs and leads to.
    - Finishing a lesson that opens new skills shows *Unlocked!*, and the map pulses them.
  - **Topics** like Arithmetic have a double rim, and their badge shows how many parts you've learnt.
  - **Layouts:**
    - **Radial** (default): you in the middle, with evenly spaced rings for your six abilities, their areas and their fields, each ring evenly filled. Every path branches out from there, one equal step further out each time: a subject grows into its topics, and each topic into its parts. Click yourself in the middle for your character.
    - **Tree:** a column per ability, and a planned subject gets a lane per topic.
    - **Clusters:** skills gather around their ability.
  - **Physics like Obsidian's graph:** skills push each other apart and links pull like springs. Drag one and its neighbours follow, then everything settles.
  - **Getting around:** filter by status or path, search, pinch or scroll to zoom. From the keyboard, Tab moves through the skills (the map follows) and Enter starts a lesson.
- **Your character** sits beside the map (a sheet you pull up on a phone). It shows your level and class, what's up next with one-click lessons, your six ability scores and their hexagon, today's quests and recent XP.
- **The general plan: every skill is planned the same way, up front.** Ask for a topic, or click any skill that has no plan yet, and Claude maps the whole tree right away, as titles only:
  - The subject (say Mathematics) is made of topics in learning order: Arithmetic, Pre-algebra, Algebra, Geometry, …
  - Each topic has parts, the things you learn to advance: Counting and place value, Addition and subtraction, Fractions, …
  - Each part has a course outline with every lesson title.

  The next topic unlocks once you've learnt every part of the one before, and a topic's parts unlock with it. Lessons are written just before you reach them. *Plan every skill* on the character panel plans your whole tree this way, one skill after another.
- **You learn what you need to progress:**
  - A prerequisite you learn with lessons counts once all its lessons are done, not just started. Subjects connect: Physics needs Algebra, and Claude links them when it plans.
  - Nothing opens past a locked skill, all the way down the path.
  - A locked skill shows the next step you can take toward it.
  - *I know this already* (or *I know all of this* on a topic) lets you test out of what you know, like skipping ahead in a game.
- Start from templates or describe any goal and let Claude generate a tree. The *D&D character* template has every D&D skill as a real-life skill; the others are Memory & study, fitness, programming, languages, music, art, math, money, social skills, mindfulness and cooking. Skills from before abilities moved to the closest one, for example Mind → Intelligence.

### Liquid Glass design
Basalt's default look is inspired by Apple's Liquid Glass — on **every** platform, because it's the same web app on Windows, Android, macOS, iOS and Linux. The glass really **refracts**: each floating surface (sidebar, menus, toolbars, dialogs, the phone tab bar, whiteboard tools) bends what's behind it at its edges like the rim of a lens, with a lit specular edge, then frosts it. Refraction runs in Chromium — the desktop app, Chrome, Edge and Android; Safari and Firefox show frosted glass.

**Designs:** Settings → Appearance opens with a gallery of complete looks — Calm (default), Windows 11, Clean, Graphite, Liquid Glass, Journal, Nord, Midnight and High contrast — each shown as a live miniature; one click switches, and everything below it fine-tunes the one you picked (also *Change design…* in `Ctrl/⌘ K`).

Settings → Appearance → Liquid Glass: pick a backdrop (Calm by default; Aurora, Sunrise, Ocean, Meadow, Graphite or your own photo), set **Refraction** and **Frost**, choose **Subtle** or **Round** corners, or turn on **Reduce transparency** for solid surfaces (also honored from your OS setting where supported). The classic flat themes (Basalt, Paper, Nord, Solarized, Midnight, High contrast) are still there.

### Make it yours
Every page can have a cover (gradients, colors or your own image), an emoji or image icon, its own font, width, accent color and background tint, and toggles for properties, backlinks, table of contents and more — or be locked. Duplicate pages, save any page as a template, and move pages anywhere. Per device, pick a theme preset, accent color, interface font and size, density, sidebar layout, and even add your own CSS snippet.

### Claude memory & vault
`mcp/` contains an MCP server that joins a workspace (end-to-end encrypted, like any device) so Claude can **search, read and write your notes, keep long-term memories, build courses, and coach you through your skill tree** — and you see Claude editing live in the app. To connect Claude Desktop or Claude Code, open **More → Claude memory** and copy the command it shows: it has your real paths and link filled in, and the desktop app runs the connector itself (no Node.js needed). The vault CLI exports an Obsidian-compatible Markdown vault (with a `CLAUDE.md`) that Claude Code can read, and imports existing Obsidian vaults. Details in [`mcp/README.md`](mcp/README.md).

---

## Project layout

```
basalt/
  server/        relay: static hosting + encrypted append-only room logs (Node, ws); relay.ts is embeddable
  shared/        code shared by browser, server and MCP: protocol, crypto, data model, schema, markdown, course, flashcards, SRS
  src/           React app (Vite)
    lib/         workspace, settings, router, hooks, AI client, markdown conversion
    components/  shell: sidebar, top bar, page view, quick switcher, share, settings…
    views/       doc editor, board, paint, notebook, database, graph, learn, tutor, ask, types, memory
  mcp/           Claude MCP server + vault import/export CLI
  desktop/       Electron desktop app (Windows .exe, macOS .dmg, Linux AppImage) with the relay built in
  test/          node:test suites (sync, SRS, flashcards, MCP, vault)
```

Scripts: `npm run dev` · `npm run build` · `npm start` · `npm test` · `npm run typecheck` · `npm run mcp` · `npm run vault`.

## License

MIT

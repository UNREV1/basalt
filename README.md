# 🪨 Basalt

**One free, private workspace for everything you think, draw, build and learn** — with realtime collaboration on any device.

Basalt combines:

| Like… | You get |
| --- | --- |
| **Notion** | Block editor with `/` commands, nested pages, databases as table · board · gallery · list · calendar |
| **Obsidian** | `[[wiki links]]`, backlinks & unlinked mentions, graph view, daily notes, Markdown import/export of whole vaults |
| **Anytype** | Object types with properties (“Task”, “Book”, “Person”…, or your own), sets across the workspace, local-first + E2E encryption |
| **Excalidraw + Krita** | One infinite canvas: shapes, diagrams and text *and* pressure-sensitive painting (brush engine, layers with blend modes, stabilizer, symmetry), with live cursors and links to pages |
| **Jupyter notebooks** | Runnable JavaScript & Python (Pyodide) cells with shared outputs |
| **Anki** | Spaced repetition (FSRS) from `Question :: Answer` and `{{c1::cloze}}` lines in any page |
| **A private tutor** | AI courses from *scratch to PhD level*: curriculum, lessons, quizzes, mastery tracking, Socratic chat |
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

**Updates:** Basalt checks for a new version a few seconds after it starts and every few hours. The installed Windows app and the Linux AppImage download it in the background and ask to restart (or update when you next quit); the portable .exe shows a *Download* prompt. *Help → Check for updates…* checks right away, and *Help → Update automatically* turns it off. Your notes are never touched by an update.

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

### Today
The home screen. Ask your assistant anything, tick off today's quests, see how many flashcards are due, pick up the course lesson you're on, and open today's daily note. The sidebar stays short: Search, Today, the assistant, Skill tree, Flashcards, your pages, and *More* (Graph, Types, Claude memory, Trash).

### Pages, links & databases
- `/` for blocks: headings, lists, to-dos, toggles, tables, code, images, files, **equations (LaTeX)**, sub-pages.
- **Pages hold anything:** `/canvas`, `/database` and `/code notebook` put a live canvas, database or notebook right inside the page (each is also its own page in the sidebar); `/embed a page` shows any other page inline. Canvases can be resized by dragging their bottom edge. In markdown and Obsidian vaults this is `![[Page title]]` on its own line.
- `[[` or `@` to link any page (or create it). Backlinks and unlinked mentions appear at the bottom of each page.
- **Types & properties** (Anytype-style): give any page a type and fill in its properties; manage types in *Types*.
- **Databases** show every object of a type (or only the database's children) as a table, kanban board, gallery, list or calendar, with filters, sorting and grouping.
- **Graph view** of all links, with a local graph mode.
- **Daily notes**: *Today’s note* on the Today screen.
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
- **Courses**: create a *Course* page (or *Learn something new* on Today), type any topic → Claude builds a six-level curriculum (Foundations → Beginner → Intermediate → Advanced → Graduate → PhD / research frontier), writes each lesson as a page (with math, worked examples and flashcards that feed your reviews), quizzes you, tracks mastery, and tutors you Socratically.
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

### Your life as a skill tree
Real life, with the progression mechanics of an RPG (but none of the video-game look):

- **Every skill is a page** (type *Skill*, under *Skills* in the sidebar): the top shows its level, XP, quests, practice log and prerequisites; below is ordinary notes. Rename the page and the skill follows. Give any page the *Skill* type to add it to the tree; move it to the trash to take it out. Opening *Skills* shows the tree.
- **Skills across nine life areas** — Body, Mind, Craft & Career, Wealth, Social, Heart, Creativity, Home & Life, Adventure (rename them or add your own).
- **Levels, XP and ranks** (Novice → Apprentice → Journeyman → Adept → Expert → Master → Grandmaster). XP comes from real activity: practice you log, daily/weekly **quests** you check off, and lessons you master in linked courses.
- **Prerequisites** unlock advanced skills once their foundations reach a level; **streaks** reward consistency.
- **Overview** shows your character level and a *life balance* chart across areas.
- Start from templates (whole life, fitness, programming, languages, music, art, math…) or describe any goal and let Claude generate a tree.

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

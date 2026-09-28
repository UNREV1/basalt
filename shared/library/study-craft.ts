import type { LibraryCourse } from "./types.ts";

// ---- figures: small inline SVGs (currentColor plus a few accents, so they read in light and dark mode) ----

const SVG = `xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif"`;
const GREEN = "#22c55e";
const RED = "#ef4444";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const PURPLE = "#a855f7";

/** An arrowhead pointing right, placed with its tip at (x, y) and rotated by `deg`. */
const head = (x: number, y: number, deg: number, fill = "currentColor") =>
  `<path d="M0 0l-11-5.5v11z" fill="${fill}" transform="translate(${x} ${y}) rotate(${deg})"/>`;

/** The learning loop: five phases in a row, with spaced review looping back to recall. */
const LOOP_FIG = (() => {
  const phases: [string, string][] = [
    ["Preview", PURPLE],
    ["Understand", BLUE],
    ["Explain", AMBER],
    ["Recall", GREEN],
    ["Apply", RED],
  ];
  let body = "";
  phases.forEach(([label, color], i) => {
    const x = 5 + i * 110;
    body +=
      `<rect x="${x}" y="20" width="90" height="44" rx="10" fill="${color}" fill-opacity=".15" stroke="${color}" stroke-width="2"/>` +
      `<text x="${x + 45}" y="47">${label}</text>`;
    if (i < phases.length - 1)
      body += `<path d="M${x + 96} 42H${x + 101}" stroke="currentColor" stroke-width="2"/><path d="M${x + 107} 42l-8-4.5v9z"/>`;
  });
  body += `<path d="M490 66V96H380V76" fill="none" stroke="${GREEN}" stroke-width="2"/>` + head(380, 66, -90, GREEN);
  body += `<text x="435" y="118">spaced review, days later</text>`;
  return `<svg viewBox="0 0 540 130" ${SVG} font-size="14" text-anchor="middle" fill="currentColor">${body}</svg>`;
})();

/** Scattered facts vs the same facts hung on a structure. */
const MAP_FIG =
  `<svg viewBox="0 0 440 175" ${SVG} font-size="14" text-anchor="middle" fill="currentColor">` +
  `<g fill="${BLUE}">` +
  [
    [40, 40],
    [120, 28],
    [175, 62],
    [62, 98],
    [140, 112],
    [96, 66],
    [188, 124],
    [30, 132],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6"/>`)
    .join("") +
  `</g>` +
  `<path d="M215 10V150" stroke="currentColor" stroke-opacity=".3" stroke-dasharray="4 4"/>` +
  `<g stroke="currentColor" stroke-opacity=".5" stroke-width="1.5"><path d="M330 42L260 64M330 42V64M330 42L400 64M260 90L245 114M260 90L275 114M330 90L315 114M330 90L345 114M400 90L385 114M400 90L415 114"/></g>` +
  `<rect x="280" y="14" width="100" height="28" rx="8" fill="${PURPLE}" fill-opacity=".15" stroke="${PURPLE}"/>` +
  `<text x="330" y="33">big picture</text>` +
  [260, 330, 400].map((x) => `<rect x="${x - 30}" y="64" width="60" height="26" rx="6" fill="none" stroke="currentColor"/><text x="${x}" y="82">idea</text>`).join("") +
  `<g fill="${BLUE}">` +
  [245, 275, 315, 345, 385, 415].map((x) => `<circle cx="${x}" cy="120" r="6"/>`).join("") +
  `</g>` +
  `<text x="105" y="166">facts on their own</text><text x="330" y="166">facts on a map</text>` +
  `</svg>`;

/** Schematic of the rereading vs self-testing crossover (Roediger & Karpicke, 2006). */
const CROSSOVER_FIG =
  `<svg viewBox="0 0 440 210" ${SVG} font-size="14" text-anchor="middle" fill="currentColor">` +
  `<path d="M40 170H420" stroke="currentColor" stroke-width="2"/>` +
  `<rect x="80" y="37" width="38" height="133" fill-opacity=".35"/><rect x="124" y="56" width="38" height="114" fill="${GREEN}"/>` +
  `<rect x="280" y="106" width="38" height="64" fill-opacity=".35"/><rect x="324" y="72" width="38" height="98" fill="${GREEN}"/>` +
  `<text x="121" y="192">5 minutes later</text><text x="321" y="192">1 week later</text>` +
  `<rect x="250" y="12" width="14" height="14" fill-opacity=".35"/><text x="270" y="24" text-anchor="start">Reread</text>` +
  `<rect x="330" y="12" width="14" height="14" fill="${GREEN}"/><text x="350" y="24" text-anchor="start">Self-tested</text>` +
  `<text x="20" y="100" transform="rotate(-90 20 100)">remembered</text>` +
  `</svg>`;

/** Recognizing a page vs recalling it. */
const RECOG_FIG =
  `<svg viewBox="0 0 440 160" ${SVG} text-anchor="middle" fill="currentColor">` +
  `<rect x="10" y="10" width="200" height="140" rx="12" fill="none" stroke="currentColor" stroke-width="2"/>` +
  `<rect x="230" y="10" width="200" height="140" rx="12" fill="none" stroke="${GREEN}" stroke-width="2"/>` +
  `<text x="110" y="36" font-size="16" font-weight="bold">Rereading</text><text x="330" y="36" font-size="16" font-weight="bold">Recalling</text>` +
  `<g fill-opacity=".3"><rect x="40" y="52" width="140" height="8" rx="4"/><rect x="40" y="68" width="120" height="8" rx="4"/><rect x="40" y="84" width="135" height="8" rx="4"/><rect x="40" y="100" width="90" height="8" rx="4"/></g>` +
  `<text x="330" y="104" font-size="44" font-weight="bold" fill="${GREEN}">?</text>` +
  `<text x="110" y="136" font-size="15">“Looks familiar!”</text><text x="330" y="136" font-size="15">“What was it again?”</text>` +
  `</svg>`;

const AXES =
  `<path d="M50 20V180H420" fill="none" stroke="currentColor" stroke-width="2"/>` +
  `<text x="30" y="100" text-anchor="middle" transform="rotate(-90 30 100)">remembered</text>`;

/** The forgetting curve: a steep early drop, then a slow fade. */
const FORGET_FIG =
  `<svg viewBox="0 0 440 215" ${SVG} font-size="14" fill="currentColor">` +
  AXES +
  `<path d="M50 30C70 110 140 148 420 160" fill="none" stroke="${RED}" stroke-width="3"/>` +
  `<text x="90" y="60">fast at first…</text><text x="280" y="120" text-anchor="middle">…then slower and slower</text>` +
  `<text x="420" y="202" text-anchor="end">time since learning →</text>` +
  `</svg>`;

/** Spaced reviews: each one restores the memory and the next fade is slower. */
const REVIEW_FIG =
  `<svg viewBox="0 0 440 215" ${SVG} font-size="14" fill="currentColor">` +
  AXES +
  `<path d="M100 30V180M180 30V180M300 30V180" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="4 4"/>` +
  `<path d="M50 30C62 70 80 92 100 100L100 30C125 62 150 88 180 100L180 30C220 56 260 86 300 100L300 30C350 46 390 58 420 66" fill="none" stroke="${RED}" stroke-width="3" stroke-linejoin="round"/>` +
  `<g fill="${GREEN}"><circle cx="100" cy="30" r="6"/><circle cx="180" cy="30" r="6"/><circle cx="300" cy="30" r="6"/></g>` +
  `<g text-anchor="middle"><text x="100" y="200">review</text><text x="180" y="200">review</text><text x="300" y="200">review</text></g>` +
  `<text x="420" y="200" text-anchor="end">time →</text>` +
  `</svg>`;

/** A simple spacing schedule: 1 day, 3 days, 1 week, 1 month. */
const TIMELINE_FIG =
  `<svg viewBox="0 0 460 100" ${SVG} font-size="14" text-anchor="middle" fill="currentColor">` +
  `<path d="M30 45H440" stroke="currentColor" stroke-width="2"/>` +
  `<circle cx="40" cy="45" r="9" fill="${BLUE}"/>` +
  [120, 200, 290, 420].map((x) => `<circle cx="${x}" cy="45" r="9" fill="${GREEN}"/><text x="${x}" y="24" opacity=".7">review</text>`).join("") +
  `<text x="40" y="78">learn</text><text x="120" y="78">1 day</text><text x="200" y="78">3 days</text><text x="290" y="78">1 week</text><text x="420" y="78">1 month</text>` +
  `</svg>`;

/** The same nine problems, blocked and interleaved. */
const BLOCKS_FIG = (() => {
  const colors: Record<string, string> = { A: "#60a5fa", B: "#fbbf24", C: "#4ade80" };
  const row = (y: number, s: string) =>
    s
      .split("")
      .map(
        (c, i) =>
          `<rect x="${120 + 34 * i}" y="${y}" width="30" height="30" rx="5" fill="${colors[c]}"/>` +
          `<text x="${135 + 34 * i}" y="${y + 21}" text-anchor="middle" font-weight="bold" fill="#111">${c}</text>`,
      )
      .join("");
  return (
    `<svg viewBox="0 0 440 120" ${SVG} font-size="15" fill="currentColor">` +
    `<text x="10" y="39">Blocked</text><text x="10" y="93">Interleaved</text>` +
    row(18, "AAABBBCCC") +
    row(72, "ABCBCACAB") +
    `</svg>`
  );
})();

/** The Feynman technique as a loop. */
const FEYNMAN_FIG = (() => {
  const boxes: [number, number, string, string, string][] = [
    [10, 10, "1. Pick a concept", "write its name down", PURPLE],
    [270, 10, "2. Explain it simply", "plain words, no jargon", BLUE],
    [270, 140, "3. Find the gaps", "where you stall or bluff", RED],
    [10, 140, "4. Review, simplify", "back to the source", GREEN],
  ];
  const body = boxes
    .map(
      ([x, y, title, sub, color]) =>
        `<rect x="${x}" y="${y}" width="200" height="70" rx="12" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="2"/>` +
        `<text x="${x + 100}" y="${y + 30}" font-size="15" font-weight="bold">${title}</text>` +
        `<text x="${x + 100}" y="${y + 52}" font-size="14" opacity=".75">${sub}</text>`,
    )
    .join("");
  return (
    `<svg viewBox="0 0 480 220" ${SVG} text-anchor="middle" fill="currentColor">` +
    body +
    `<path d="M212 45H258M370 82V128M268 175H222" stroke="currentColor" stroke-width="2"/>` +
    head(268, 45, 0) +
    head(370, 138, 90) +
    head(212, 175, 180) +
    `<path d="M180 138L281 87" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"/>` +
    head(290, 82, -27) +
    `<text x="248" y="134" font-size="14" opacity=".7">again</text>` +
    `</svg>`
  );
})();

/** One row of an error log. */
const ERRLOG_FIG =
  `<svg viewBox="0 0 480 115" ${SVG} font-size="14" fill="currentColor">` +
  `<rect x="1" y="1" width="478" height="33" rx="8" fill-opacity=".08"/>` +
  `<rect x="1" y="1" width="478" height="110" rx="8" fill="none" stroke="currentColor" stroke-opacity=".5"/>` +
  `<path d="M1 34H479M150 1V111M315 1V111" stroke="currentColor" stroke-opacity=".5"/>` +
  `<g font-weight="bold" text-anchor="middle"><text x="75" y="23">Mistake</text><text x="232" y="23">Why it happened</text><text x="397" y="23">Fix next time</text></g>` +
  `<text x="12" y="62">Wrote “effect”</text><text x="12" y="82">for “affect”</text>` +
  `<text x="162" y="62">Unsure which one</text><text x="162" y="82">is the verb</text>` +
  `<text x="327" y="62">Affect = action,</text><text x="327" y="82">effect = end result</text>` +
  `</svg>`;

/** Shared settings for the forgetting-curve widgets: recall % = 100 · 0.9^(days / strength). */
const CURVE = {
  min: 1,
  max: 60,
  step: 1,
  start: 3,
  label: "Strength S",
  unit: "days",
  plot: "100*0.9^(x/v)",
  xMin: 0,
  xMax: 60,
  readout: "100*0.9^(30/v)",
  readoutLabel: "Remembered after 30 days (%)",
};

// ---- the course ------------------------------------------------------------------------

const course: LibraryCourse = {
  id: "study-craft",
  title: "Learning How to Learn",
  icon: "📝",
  blurb:
    "The method behind every Basalt lesson: preview, understand, explain, recall, apply, then review spaced over time. See why each step works, and use it on anything you study.",
  ability: "int",
  skill: { name: "Study craft", icon: "📝" },
  lessons: [
    // ------------------------------------------------------------------ 1
    {
      id: "learning-loop",
      title: "The learning loop",
      summary: "Get the big picture first, wake up what you already know, and aim for understanding over memorized facts.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "The loop",
          body:
            "Every Basalt lesson follows the same loop: **Preview → Understand → Explain → Recall → Apply**, then **spaced review** in the days and weeks after. This course shows you why each step works, so you can use the loop on anything.\n\nFirst, the start of the loop: getting the big picture, waking up what you already know, and aiming for understanding rather than memorized facts.",
          figure: LOOP_FIG,
          caption: "The learning loop. Each lesson of this course covers part of it.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "A prediction first. Before reading a new chapter, Sam spends three minutes skimming the headings and trying the questions at the end. He gets most of them wrong. Compared with starting straight at page one, this probably…",
          options: ["Wasted three minutes", "Helps him learn the chapter better", "Only helps if he gets the questions right"],
          answer: [1],
          explain:
            "Research on **pretesting** finds that trying to answer questions *before* studying, even getting them wrong, tends to improve learning of that material, as long as you then study the answers. Skimming the headings also gives him a map of the chapter before the details arrive.",
          hint: "A wrong guess makes you curious about the right answer.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Big picture first",
          body:
            "New facts need somewhere to go. Dive in at page one and each detail arrives on its own, with nothing to attach to. A two-minute **preview** (headings, bold terms, figures, the summary, the questions at the end) builds a rough map first, so every detail has a place to land.\n\nIt's the same reason a jigsaw is easier once you've seen the picture on the box.",
          figure: MAP_FIG,
          caption: "The same facts, loose or hung on a structure.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are good ways to preview a chapter? Select all that apply.",
          options: [
            "Skim the headings and bold terms",
            "Read every word carefully from page one",
            "Look at the figures and the summary",
            "Highlight the first few paragraphs",
            "Try the questions at the end",
          ],
          answer: [0, 2, 4],
          explain:
            "A preview is fast and wide: headings, bold terms, figures, the summary and the end questions show you the shape of the chapter in minutes. Reading every word or highlighting is detail work, which the preview is there to prepare you for.",
          hint: "A preview shows you the shape of the whole, quickly.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Wake up what you know",
          body:
            "What you already know is the hook for everything new: new ideas stick by linking to old ones. So before you start, take a minute to ask: *What do I already know about this? What do I expect it to say?*\n\nEven wrong predictions help. When the material then surprises you, you notice the difference, and that makes the correct version stick.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt:
            "Try it now. Imagine you're about to learn how vaccines work. Take 20 seconds: what do you already know, and what do you expect to learn?",
          body:
            "Maybe: *they contain a weakened, inactivated or harmless piece of a germ (or instructions to make one)*, *your immune system learns to recognize it*, *so it can react faster if the real germ shows up*, *your arm can be sore afterwards*. Right or wrong, those are now hooks. As you read, you'd notice what confirms, extends or corrects them, instead of meeting everything cold.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Understand, don't just memorize",
          body:
            "Facts tied together by **why** and **how** are easier to remember and far easier to use. Asking *\"why is this true?\"* as you study is itself a tested strategy (researchers call it *elaborative interrogation*).\n\nTake *arteries have thick, muscular walls.* You could memorize it. Or understand it: arteries carry blood straight from the heart, under high pressure, so their walls must be strong. Now you could rebuild the fact if you forgot it, and even predict new ones.",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "Use that *why* to predict something new. Veins carry blood back to the heart under **low** pressure, often uphill from your legs. What do many veins have that stops the blood flowing backwards?",
          answers: ["valves", "valve", "one-way valves", "one way valves", "one-way valve"],
          placeholder: "one word",
          explain:
            "**Valves**: one-way flaps that let blood move toward the heart but not back. You could reason your way there from the *why* (low pressure, uphill), which a memorized list of facts would never let you do.",
          hint: "Think of the one-way flaps inside a pump.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each fact to the *why* behind it.",
          pairs: [
            { left: "Ice floats on water", right: "Water expands when it freezes, so ice is less dense" },
            { left: "You see lightning before you hear thunder", right: "Light travels much faster than sound" },
            { left: "Metal feels colder than wood in the same room", right: "Metal draws heat out of your hand faster" },
            { left: "Deserts get cold at night", right: "Dry air and clear skies let heat escape quickly" },
          ],
          explain:
            "Each *why* turns a loose fact into something you can reason from. Notice that two of them are about how heat moves: understanding connects facts to each other, not just to your memory.",
          hint: "For each fact, ask \"why would that happen?\"",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "A friend is about to start a new course. Explain to them, in plain words, why they should spend the first few minutes previewing and asking what they already know, and why asking \"why?\" beats memorizing.",
          keyPoints: [
            "A quick preview gives new details a structure to attach to",
            "What you already know is the hook for new knowledge",
            "Predicting or guessing first, even wrongly, makes the real answer stand out",
            "Knowing why something is true lets you rebuild it, and use it on new problems",
          ],
          model:
            "Don't start at page one. Spend two minutes flicking through: headings, pictures, the summary, the questions at the end. Now you've got a rough map, so each detail has somewhere to go. Then ask yourself what you already know and what you think it'll say. New stuff sticks to old stuff, and when you guess wrong, the right answer jumps out at you. As you read, keep asking \"why is that true?\" A fact you understand is one you can work out again if you forget it, and use on problems you've never seen.",
        },
        {
          type: "order",
          phase: "recall",
          prompt: "From memory: put the learning loop in order.",
          items: ["Preview", "Understand", "Explain", "Recall", "Apply", "Spaced review"],
          explain:
            "Preview for the big picture, understand the ideas, explain them in your own words, recall them from memory, apply them to new problems, then review them spaced out over days and weeks. The rest of this course covers each step.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "Why does asking \"why is this true?\" help you remember a fact?",
          options: [
            "It links the fact to what you already know, so there are more ways to find it, and you can rebuild it",
            "It keeps your eyes on the page for longer",
            "It doesn't; it only feels productive",
          ],
          answer: [0],
          explain:
            "A *why* ties a new fact to knowledge you already have. That gives it more cues to be found by, and if the fact itself slips, you can reason your way back to it. Time on the page alone does little.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "New situation: you're starting an introductory economics course, a subject you've never studied. You have 30 minutes for the first chapter. Which plan follows the start of the loop best?",
          options: [
            "Read the chapter from start to finish, highlighting key terms",
            "Skim the headings, figures and end-of-chapter questions, jot down what you already know about prices and money, then read asking \"why?\" at each big claim",
            "Memorize the glossary first so the chapter makes sense",
            "Watch three videos on the topic back to back before opening the book",
          ],
          answer: [1],
          explain:
            "It previews (headings, figures, questions), wakes up prior knowledge (you know plenty about prices from everyday life), and reads for understanding. Highlighting from page one skips the map, memorizing definitions without context is facts without understanding, and three videos in a row is passive, much like rereading.",
          hint: "Look for the plan that does all three things from this lesson.",
        },
      ],
    },

    // ------------------------------------------------------------------ 2
    {
      id: "active-recall",
      title: "Test yourself, don't reread",
      summary: "Why pulling an idea out of your head beats reading it again, and why rereading feels better than it works.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "You've previewed and understood. Now comes the step most students skip: **recall**, pulling what you learned back out of your head. It's where learning gets locked in, and it's why every Basalt lesson asks you questions instead of just showing you things.\n\nBy the end you'll know why testing yourself beats rereading, and how to do it.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Predict: two students have an hour to learn a textbook chapter. Anna reads it four times. Ben reads it once, then spends the rest of the hour closing the book, writing down everything he can remember, and checking. Who remembers more **a week later**?",
          options: [
            "Anna: more exposure means more learning",
            "Ben, even though he read it less",
            "About the same: they spent the same time",
          ],
          answer: [1],
          explain:
            "This is the classic result (Roediger and Karpicke, 2006): students who read a passage and then practiced recalling it remembered much more a week later than students who spent the same time rereading.",
          hint: "Which student practiced the thing the test will ask him to do?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The testing effect",
          body:
            "Pulling information *out* of memory changes it: each successful retrieval makes it easier to retrieve again. So a test isn't just a measuring stick; it's one of the best ways to learn. This is the **testing effect**, and studying this way is called **active recall** or **retrieval practice**.\n\nA large review of study techniques (Dunlosky and colleagues, 2013) rated practice testing as one of the two most useful, alongside spacing. Rereading and highlighting came out near the bottom.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Here's a twist. In experiments like that one, who did better on a test just **five minutes** after studying?",
          options: ["The rereaders", "The self-testers", "Both the same"],
          answer: [0],
          explain:
            "The rereaders, by a little. Rereading wins in the short term; self-testing wins clearly after a few days. That's exactly why rereading is so tempting: it looks like it works when you check straight away.",
          hint: "The page was fresh in their minds a moment ago.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Why rereading fools you",
          body:
            "In these studies, the rereaders even *predicted* they'd remember more. Rereading makes a page feel familiar and easy to read, and that ease is easy to mistake for knowing it.\n\nThis trap is called the **illusion of fluency** (or illusion of competence). Recognizing something when it's in front of you is much easier than recalling it when it isn't, and exams, conversations and real problems ask for recall.",
          figure: CROSSOVER_FIG,
          caption: "The pattern: rereading wins at five minutes, self-testing wins a week later.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are active recall? Select all that apply.",
          options: [
            "Closing your notes and writing out the main points from memory",
            "Highlighting the key sentences",
            "Answering a flashcard in your head before flipping it",
            "Rereading your notes the night before",
            "Doing past exam questions before looking at the solutions",
          ],
          answer: [0, 2, 4],
          explain:
            "Active recall means producing the answer yourself before seeing it. Highlighting and rereading keep the answer in front of you, so you only ever recognize it, never retrieve it.",
          hint: "In which ones is the answer hidden until you've tried?",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each study moment to what it's really telling you.",
          pairs: [
            { left: "The page feels familiar as you reread it", right: "Recognition, not proof you could recall it" },
            { left: "You struggle, then dig up the answer", right: "Effortful retrieval that strengthens the memory" },
            { left: "You draw a complete blank", right: "A gap to check now and retry later" },
            { left: "You answer instantly and correctly a week later", right: "Good evidence you've learned it" },
          ],
          explain:
            "Familiarity is the weakest signal and struggle is often the most useful. A blank isn't failure; it's a map of what to study next.",
          hint: "Which moment is the most misleading?",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "You try a practice question, get it wrong, then check the answer. Was that attempt wasted?",
          body:
            "No. Studies find that trying to answer, even when you get it wrong, and then seeing the correct answer usually leads to better memory than just studying the answer from the start, as long as you do check. The attempt also shows you exactly where your gaps are, which rereading never does.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "How to do it",
          body:
            "- **Blurt:** close the book and write or say everything you remember, then check.\n- **Turn headings into questions** and answer them without looking.\n- **Flashcards:** answer before you flip. Basalt's flashcards schedule the reviews for you.\n- **Practice problems** before looking at worked solutions.\n\nAlways check your answers afterwards: recall with feedback works better than recall alone. And it should feel a bit hard. The effort is the point.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put a good active-recall study session in order.",
          items: [
            "Read the section once, carefully",
            "Close the book and write down everything you can remember",
            "Check against the book and mark what you missed or got wrong",
            "A day or two later, recall it again, focusing on what you missed",
          ],
          explain:
            "Read, recall, check, recall again later. The check gives feedback, and the later recall brings in spacing, which is the next lesson.",
          hint: "You can't check until you've tried.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "Your friend rereads their notes five times before every test. Explain, kindly and in plain words, why that feels effective but isn't, and what they should do instead.",
          keyPoints: [
            "Rereading makes material feel familiar, and familiarity is easily mistaken for knowing it",
            "Recognizing something is much easier than recalling it",
            "Pulling information out of memory strengthens it (the testing effect)",
            "Instead: close the notes, recall what you can, then check and fix the gaps",
          ],
          model:
            "Rereading feels great because everything looks familiar. But recognizing a page isn't the same as being able to produce it on a blank exam sheet. What actually builds memory is pulling the information out of your head: each time you recall something, it gets easier to recall next time. So read once, then close your notes and write or say everything you remember. Check what you missed, fix it, and try again later. It feels harder, and that's the point.",
        },
        {
          type: "input",
          phase: "recall",
          prompt:
            "From memory: rereading makes a page feel familiar, and that feeling gets mistaken for knowing it. This trap is called the illusion of ___.",
          answers: ["fluency", "competence", "knowing", "illusion of fluency", "illusion of competence", "illusion of knowing"],
          placeholder: "one word",
          explain:
            "The **illusion of fluency**, also called the illusion of competence: easy to *recognize* doesn't mean able to *recall*. The fix is to test yourself.",
          figure: RECOG_FIG,
          caption: "Recognizing a page is far easier than recalling it.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "Which sentence best describes the testing effect?",
          options: [
            "Pulling information out of memory strengthens it more than taking it in again",
            "Tests are mainly useful for measuring what you know",
            "Taking lots of tests makes you less anxious, so you remember more",
          ],
          answer: [0],
          explain:
            "Retrieval is itself a learning event. Tests do measure knowledge, and practice may ease nerves, but the testing effect is about memory: recalling something strengthens it.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "New situation: it's the night before a test on three chapters you've read once. You have 45 minutes. Which plan makes the best use of them?",
          options: [
            "Reread all three chapters, highlighting as you go",
            "For each chapter: glance at the headings, write down everything you remember, then check the book and fix the gaps",
            "Copy your notes out neatly",
            "Read the chapter summaries three times each",
          ],
          answer: [1],
          explain:
            "The headings give you the map (preview, from lesson 1), writing from memory is active recall, and checking gives feedback on exactly what you missed. The others feel productive but are passive. (Better still: start days earlier, which is where the next lesson comes in.)",
          hint: "Which plan makes you pull things out of your head?",
        },
      ],
    },

    // ------------------------------------------------------------------ 3
    {
      id: "spacing",
      title: "Spacing, sleep and focus",
      summary: "Why a little review spread over days beats one long cram, how flashcard apps schedule reviews, and why sleep and focus matter.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Recall locks learning in; **spacing** makes it last. The final step of the loop is spaced review: coming back to what you learned after a day, a few days, a week, a month.\n\nBy the end you'll know how to schedule reviews, how flashcard apps do it for you, and two things that multiply everything else: sleep and focus.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Predict: you have 3 hours to study for an exam two weeks away. Which plan leads to better memory on exam day?",
          options: [
            "One 3-hour session the night before",
            "Six 30-minute sessions spread across the two weeks",
            "No difference: it's the same 3 hours",
          ],
          answer: [1],
          explain:
            "This is the **spacing effect**: the same study time, spread out, leads to much better long-term memory. It's one of the most reliable findings in learning research, replicated in hundreds of studies since Hermann Ebbinghaus first described it in the 1880s.",
          hint: "Total time is equal. What's different is what happens between sessions.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The forgetting curve",
          body:
            "Ebbinghaus memorized lists of nonsense syllables and tested himself after different delays. He forgot fast at first (much of what he lost was gone within a day) and then more and more slowly. That shape is the **forgetting curve**.\n\nMeaningful material fades more slowly than nonsense, but the pattern of a steep early drop is similar.",
          figure: FORGET_FIG,
          caption: "Forgetting: fast at first, then slower.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Cramming the night before often gets people through the next day's test. So what's the catch?",
          options: [
            "Much of it is forgotten within days",
            "There's no catch: it's as good as spacing",
            "It never works, even for the next day",
          ],
          answer: [0],
          explain:
            "Tomorrow's test lands near the top of the curve, before the steep drop, so cramming can get you through. But the memories fade fast, just when the final exam or the next course needs them. For anything you need weeks later, spacing wins by a wide margin.",
          hint: "Where on the curve is tomorrow, and where is next month?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Each review resets the clock",
          body:
            "Each successful review pulls the memory back up, and it also makes it more **durable**: the next drop is slower. So the next review can wait longer.\n\nWhy exactly? Researchers still debate it. One leading idea: recalling something after a gap takes more effort than recalling it right away, and that effort strengthens the memory more.",
          figure: REVIEW_FIG,
          caption: "Each review restores the memory, and the next fade is slower, so the gaps can grow.",
        },
        {
          type: "explore",
          phase: "understand",
          title: "Play with memory strength",
          body:
            "A simple model of one memory: after $t$ days you still remember $100 \\cdot 0.9^{t/S}$ percent of it, where $S$ is the memory's **strength**. Drag the strength and watch the curve and the readout. A weak memory plunges; a strong one barely sags.",
          ...CURVE,
        },
        {
          type: "slider",
          phase: "understand",
          prompt: "Find the strength $S$ at which you'd still remember exactly **90%** after 30 days.",
          ...CURVE,
          answer: 30,
          tolerance: 1.5,
          explain:
            "At $S = 30$ you keep $0.9^{30/30} = 0.9$, so 90%. In this model, **strength is simply the number of days until recall drops to 90%**. A memory of strength 3 is at 90% after 3 days but only about 35% after a month. Every successful review raises the strength, which is why the next review can wait longer.",
          hint: "Watch the readout, not the curve.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Scheduling reviews",
          body:
            "**No app?** A simple rule of thumb: review **1 day, 3 days, 1 week and 1 month** after you first learn something. The gaps grow because each review makes the memory more durable.\n\n**Flashcard apps** do the same thing, tuned to each card. Get a card right and its next gap grows: older schedulers like SM-2 multiply it by about 2.5. Newer ones like FSRS, which Basalt's flashcards use, estimate each card's strength and schedule it for about when your chance of recalling it would dip to 90%.",
          figure: TIMELINE_FIG,
          caption: "A simple spacing schedule (not to scale).",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "A card's gap is 4 days and you get it right. With an SM-2-style multiplier of 2.5, how many days until you see it again?",
          answers: ["10", "ten"],
          placeholder: "days",
          explain:
            "$4 \\times 2.5 = 10$ days. Get it right again and the gap becomes 25 days, then about 62. A handful of reviews covers months.",
          hint: "Multiply the gap by the multiplier.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "At that 10-day review, you've forgotten the card. What does a typical scheduler do?",
          options: [
            "Brings it back soon, then grows the gaps again",
            "Waits 25 days anyway: the schedule is the schedule",
            "Deletes the card, since you clearly can't learn it",
          ],
          answer: [0],
          explain:
            "A forgotten card is a **lapse**. The app shows it again soon (Basalt: after about 10 minutes), then grows the gaps again, usually more cautiously for that card. Forgetting isn't failure; it tells the scheduler where to spend your time.",
          hint: "The scheduler's job is to catch you just before you forget.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Sleep and focus",
          body:
            "**Sleep.** Memories are consolidated during sleep: people who sleep after learning typically remember more than people who stay awake for the same stretch. An all-nighter trades tomorrow's memory for tonight's cramming, and a sleep-deprived brain also struggles to take in anything new.\n\n**Focus.** Short, focused sessions beat long, distracted ones. Try 25–50 minutes with your phone in another room, then a short break. Checking messages mid-study splits your attention, and studies of multitasking find it tends to hurt learning.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which habits make your study time go further? Select all that apply.",
          options: [
            "A few minutes of flashcard reviews most days",
            "Pulling an all-nighter before the exam",
            "25–50 minute focused blocks with your phone in another room",
            "Studying with notifications on, replying as you go",
            "Sleeping properly after a day of learning",
          ],
          answer: [0, 2, 4],
          explain:
            "Little and often uses spacing, focused blocks keep your attention on the material, and sleep consolidates what you learned. All-nighters cut into sleep right when your memories need it, and constant notifications split your attention.",
          hint: "Two of these cost you sleep or attention.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "Explain to a friend why six half-hour study sessions spread over two weeks beat one three-hour cram, and how a flashcard app decides when to show a card again.",
          keyPoints: [
            "We forget fast at first, then more slowly (the forgetting curve)",
            "Each review after a gap restores the memory and makes it fade more slowly",
            "So reviews can be spaced further and further apart, e.g. 1 day, 3 days, 1 week, 1 month",
            "Apps grow a card's gap when you remember it and bring it back soon when you forget",
            "Sleep and short, focused sessions help it all stick",
          ],
          model:
            "Right after you learn something you start forgetting it, fast at first and then more slowly. A cram puts everything at the top of that curve for one day, then it drains away. If you come back after a day, then a few days, then a week, each review pulls the memory back up, and each time it fades more slowly than before, so you can wait longer before the next one. A flashcard app does this card by card: remember it and the next gap gets longer, forget it and it comes back soon. Add proper sleep and short, focused sessions, and the same hours go much further.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each term to its meaning.",
          pairs: [
            { left: "Massed practice", right: "Studying in one long block" },
            { left: "Spaced practice", right: "Spreading the same study time over days" },
            { left: "Forgetting curve", right: "Memory drops fast at first, then more slowly" },
            { left: "Interval", right: "The gap before a card's next review" },
            { left: "Lapse", right: "Forgetting a card you had learned" },
          ],
          explain:
            "Massed practice feels productive but fades fast; spaced practice works with the forgetting curve. Apps manage each card's interval, and a lapse just shortens it again.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt: "New situation: Maya has 20 new vocabulary words to learn and 10 days before her test. Which plan fits everything so far?",
          options: [
            "Day 1: drill all 20 for two hours. Day 10: read the list once more.",
            "Day 1: learn them and test herself. Days 2, 4 and 8: quick self-tests, with extra practice on the ones she missed.",
            "Read the list for 10 minutes every morning, without testing herself.",
            "Wait until day 9, then drill flashcards for two hours.",
          ],
          answer: [1],
          explain:
            "It combines **spacing** (reviews at growing gaps) with **active recall** (self-tests, from lesson 2) and targets her mistakes. Daily rereading is spaced but passive; the day-9 flashcard marathon is active but massed; the first plan is neither.",
          hint: "Look for the plan that is both spaced *and* active.",
        },
      ],
    },

    // ------------------------------------------------------------------ 4
    {
      id: "interleave-feynman",
      title: "Mix it up, explain it simply",
      summary: "Mix problem types to learn when to use each method, explain ideas simply to find the gaps, and turn mistakes into lessons.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "The loop's last stretch is **explain** and **apply**: can you put an idea in your own words, and use it on a problem you haven't seen?\n\nBy the end you'll know why mixing up problem types prepares you for real tests, how explaining something simply exposes what you don't yet understand, and how to turn mistakes into your best study material.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Predict: students learn to find the volumes of four kinds of solid shapes. Group A practices in blocks: all the problems for one shape, then all for the next. Group B gets exactly the same problems shuffled together. Who does better on a test **one week later**?",
          options: [
            "Group A: they got more right during practice",
            "Group B, even though practice felt harder",
            "No difference: same problems, same time",
          ],
          answer: [1],
          explain:
            "In a 2007 study by Doug Rohrer and Kelli Taylor, the blocked group did better *during* practice, but a week later the mixed group scored far higher, about three times as well. Doing well in practice isn't the same as learning.",
          hint: "Remember lesson 2: what feels easy during practice and what lasts aren't always the same.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Blocked vs interleaved",
          body:
            "**Blocked** practice does one type at a time: AAA BBB CCC. **Interleaved** practice mixes the same problems.\n\nIn a block, you know which method to use before you even read the problem, so you're just repeating steps. On a real test, problems don't come labeled. Interleaving makes you practice the hard part: *recognizing what kind of problem this is* and choosing the method. It also spaces out each type for free.",
          figure: BLOCKS_FIG,
          caption: "The same nine problems, blocked and interleaved.",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "Look at the blocked row. You only meet a *new* type of problem when a block starts. Counting the very first problem, on how many of the 9 problems do you have to work out which method to use?",
          answers: ["3", "three"],
          placeholder: "a number",
          explain:
            "**3**: problems 1, 4 and 7. In the interleaved row, the type changes every time, so you choose on all 9. That choosing is exactly the skill a mixed test demands.",
          hint: "Count the blocks.",
          figure: BLOCKS_FIG,
          caption: "Blocked vs interleaved.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are interleaved practice? Select all that apply.",
          options: [
            "A mixed review sheet of fraction, percentage and ratio problems",
            "30 long-division problems, then 30 fraction problems",
            "One flashcard deck that shuffles vocabulary from five chapters",
            "A whole tennis session hitting only backhands",
            "A pianist rotating between three pieces every 10 minutes",
          ],
          answer: [0, 2, 4],
          explain:
            "Interleaving means switching between different kinds of problem or skill within a session. Thirty of one kind then thirty of another is still blocked, just with two blocks, and a backhand-only session is one long block.",
          hint: "In which ones does the next item keep changing type?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "It feels worse and works better",
          body:
            "Mixed practice *feels* worse: you're slower and make more mistakes. In a study by Kornell and Bjork (2008), people learned painters' styles from examples shown either one artist at a time or all mixed together. Mixing led to better recognition of new paintings, yet most people believed the blocked version had worked as well or better.\n\nInterleaving helps most when problem types are easy to confuse: similar-looking math problems, related grammar rules, species that look alike. A common approach is to meet a new method with a few examples in a row, then mix it in with older ones.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt:
            "Rate from 1 to 7 how well you understand how a zipper works. Now explain, step by step, how sliding the pull joins the two sides.",
          body:
            "Most people rate themselves fairly high, then stall partway through. Psychologists call this the **illusion of explanatory depth** (Rozenblit and Keil, 2002): we feel we understand everyday things far better than we do, and the feeling only cracks when we try to explain. (How it works: the slider's Y-shaped channel squeezes the two rows of teeth together at an angle, so the bump on each tooth nests into a hollow on the teeth opposite.)",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The Feynman technique",
          body:
            "Named after physicist Richard Feynman, famous for explaining hard ideas in plain words (others wrote up the recipe later):\n\n1. Pick a concept and write its name at the top of a page.\n2. Explain it in plain words, as if to someone new to it.\n3. Mark where you get stuck, hand-wave, or hide behind jargon: those are your gaps.\n4. Go back to the source, fill the gaps, and explain it again, more simply.\n\nIt's the *Explain* step in every Basalt lesson. It combines active recall with understanding, and research on *self-explanation* finds that students who explain material to themselves as they study tend to understand it better.",
          figure: FEYNMAN_FIG,
          caption: "Explain, find the gaps, fill them, explain again.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You're explaining photosynthesis in plain words. Which are warning signs of a gap? Select all that apply.",
          options: [
            "You say \"and then the chlorophyll does its thing\" and move on",
            "You use a technical term you couldn't define if asked",
            "You come up with a simple everyday analogy that fits",
            "You can only repeat the textbook's sentence word for word",
            "A 12-year-old could follow your explanation",
          ],
          answer: [0, 1, 3],
          explain:
            "Hand-waving, undefined jargon and parroting the textbook all hide gaps. A fitting analogy and an explanation a 12-year-old can follow are signs you really understand it.",
          hint: "Which ones let you sound right without understanding?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Learn from your mistakes",
          body:
            "Mistakes are the most useful thing a practice session produces, if you catch them. Keep an **error log**: for each mistake, write what went wrong, *why* it happened, and what you'll do differently. Reread it before tests, and turn repeat offenders into flashcards.\n\nThen end each session with a one-minute **reflection**: *What did I learn? What was hard? What will I change next time?* That's how the loop improves itself.",
          figure: ERRLOG_FIG,
          caption: "One row of an error log.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You got question 7 wrong on a practice set. Which error-log entry will help you most next time?",
          options: [
            "Q7: wrong.",
            "Q7: careless mistake, be more careful.",
            "Q7: used the area formula instead of volume. Why: didn't check what the question asked for. Next time: circle the unit before solving.",
            "Q7: reread chapter 3.",
          ],
          answer: [2],
          explain:
            "A useful entry says what went wrong, *why*, and a specific change. \"Careless\" names no cause and no fix, \"wrong\" says nothing, and \"reread chapter 3\" is passive.",
          hint: "Which entry would actually change what you do next time?",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "Use the Feynman technique on this lesson: explain to a friend why mixing problem types, explaining ideas in plain words, and logging mistakes help you solve problems you've never seen before.",
          keyPoints: [
            "Blocked practice tells you which method to use; interleaving makes you choose, like a real test",
            "Mixed practice feels harder but leads to better long-term results",
            "Explaining in plain words exposes gaps that jargon and familiarity hide",
            "Mistakes are information: log what went wrong, why, and what to do differently",
          ],
          model:
            "When you practice one type of problem at a time, you always know which method to use, so you never practice the hardest part: figuring out what kind of problem you're looking at. Mixing the types forces that choice every time, just like an exam. It feels slower, but it sticks. Explaining an idea simply, as if to a beginner, does the same for understanding: wherever you get stuck or start hiding behind big words, you've found a gap to go back and fill. And when you get something wrong, write down what happened, why, and what you'll do next time, so the same mistake doesn't keep coming back.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each technique to the problem it fixes.",
          pairs: [
            { left: "Active recall", right: "Rereading that feels like learning but isn't" },
            { left: "Spacing", right: "Cramming that fades within days" },
            { left: "Interleaving", right: "Knowing each method, but not when to use which" },
            { left: "Feynman technique", right: "Understanding that's shallower than it feels" },
            { left: "Error log", right: "Making the same mistake again and again" },
          ],
          explain:
            "Each technique targets a different trap. Together with previewing, they make up the whole learning loop.",
        },
        {
          type: "order",
          phase: "recall",
          prompt: "Put the steps of the Feynman technique in order.",
          items: [
            "Pick a concept and write its name at the top of a page",
            "Explain it in plain words, as if to someone new to it",
            "Mark where you got stuck or leaned on jargon",
            "Go back to the source, fill the gaps, and explain it again more simply",
          ],
          explain: "Pick, explain, find the gaps, fill them and simplify. Then repeat until the explanation is plain all the way through.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "Final challenge: your math exam is in three weeks and covers four types of problems. Which plan puts the whole course to work?",
          options: [
            "Each evening, reread one chapter's worked examples, one chapter at a time",
            "Every few days, a short mixed set of problems from all four types, done from memory and then checked; log each mistake and explain its method out loud in plain words",
            "One long session per problem type, all on the weekend before the exam",
            "Copy the formulas onto a neat summary sheet and read it every day",
          ],
          answer: [1],
          explain:
            "It's **spaced** (every few days), **interleaved** (all four types mixed), **active** (from memory, then checked), and uses an **error log** and the **Feynman technique** on mistakes. Rereading examples is passive and blocked; weekend marathons are massed and blocked; reading a summary sheet is passive recognition.",
          hint: "Count how many techniques from this course each plan uses.",
        },
      ],
    },
  ],
};

export default course;

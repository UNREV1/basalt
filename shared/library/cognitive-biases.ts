import type { LibraryCourse } from "./types.ts";

// ---- figures: small inline SVGs (currentColor plus a few accents, so they read in light and dark mode) ----

const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const GREEN = "#16a34a";
const ROSE = "#e11d48";

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif" font-size="16" fill="currentColor">${body}</svg>`;
const label = (x: number, y: number, s: string, extra = "") => `<text x="${x}" y="${y}" text-anchor="middle"${extra}>${s}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, extra = "") =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="2"${extra}/>`;

/** Wheel-of-fortune anchors (10, 65) and the median guesses they produced (25, 45), on a 0–100% scale. */
const FIG_ANCHOR = (() => {
  const x = (v: number) => 30 + 3 * v;
  const diamond = (cx: number, cy: number) => `<polygon points="${cx},${cy - 10} ${cx + 10},${cy} ${cx},${cy + 10} ${cx - 10},${cy}" fill="${AMBER}"/>`;
  const dot = (cx: number, cy: number) => `<circle cx="${cx}" cy="${cy}" r="7" fill="${BLUE}"/>`;
  const guide = (cx: number, y1: number) => line(cx, y1, cx, 150, ' stroke-opacity="0.3" stroke-dasharray="3 4" stroke-width="1.5"');
  let body = line(30, 150, 330, 150);
  for (const v of [0, 50, 100]) body += line(x(v), 145, x(v), 155) + label(x(v), 172, `${v}%`, ' font-size="14"');
  // lane 1: wheel 10 -> guess 25
  body += guide(x(10), 65) + guide(x(25), 62);
  body += diamond(x(10), 55) + line(x(10) + 11, 55, x(25) - 12, 55) + `<polygon points="${x(25) - 8},55 ${x(25) - 16},50 ${x(25) - 16},60"/>` + dot(x(25), 55);
  body += label(x(10), 35, "10", ` fill="${AMBER}" font-weight="600"`) + label(x(25), 35, "25", ` fill="${BLUE}" font-weight="600"`);
  // lane 2: wheel 65 -> guess 45
  body += guide(x(65), 120) + guide(x(45), 117);
  body += diamond(x(65), 110) + line(x(65) - 11, 110, x(45) + 12, 110) + `<polygon points="${x(45) + 8},110 ${x(45) + 16},105 ${x(45) + 16},115"/>` + dot(x(45), 110);
  body += label(x(65), 90, "65", ` fill="${AMBER}" font-weight="600"`) + label(x(45), 90, "45", ` fill="${BLUE}" font-weight="600"`);
  // legend
  body += `<text x="232" y="30" font-size="15" fill="${AMBER}">◆ wheel showed</text><text x="232" y="54" font-size="15" fill="${BLUE}">● median guess</text>`;
  return svg(360, 180, body);
})();

/** 600 people as 60 dots: 20 green (200 saved), 40 grey (400 die). */
const FIG_600 = (() => {
  let body = "";
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 10; c++) {
      const saved = r < 2;
      body += `<circle cx="${25 + c * 22}" cy="${25 + r * 22}" r="8" fill="${saved ? GREEN : "currentColor"}" fill-opacity="${saved ? 0.9 : 0.3}"/>`;
    }
  body += `<text x="250" y="42" fill="${GREEN}" font-weight="600">200 saved</text>`;
  body += `<text x="250" y="75" font-size="14" opacity="0.7">same people,</text><text x="250" y="93" font-size="14" opacity="0.7">same outcome</text>`;
  body += `<text x="250" y="124" font-weight="600">400 die</text>`;
  body += label(124, 170, "each dot = 10 people", ' font-size="14" opacity="0.7"');
  return svg(360, 178, body);
})();

/** The 2-4-6 task: the hunch "up by 2" sits inside the real rule "increasing". */
const FIG_NESTED = svg(
  360,
  230,
  `<rect x="2" y="2" width="356" height="226" rx="12" fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-dasharray="6 5"/>` +
    `<text x="14" y="24" font-size="14" opacity="0.7">all triples</text>` +
    label(318, 24, "6, 4, 2", ' font-size="14"') +
    `<ellipse cx="180" cy="128" rx="160" ry="90" fill="${BLUE}" fill-opacity="0.12" stroke="${BLUE}" stroke-width="2"/>` +
    label(180, 76, "increasing: the real rule", ` fill="${BLUE}" font-size="15" font-weight="600"`) +
    `<ellipse cx="135" cy="145" rx="85" ry="48" fill="${AMBER}" fill-opacity="0.25" stroke="${AMBER}" stroke-width="2"/>` +
    label(135, 138, "up by 2: your hunch", ' font-size="14" font-weight="600"') +
    label(135, 164, "2, 4, 6 · 8, 10, 12", ' font-size="14"') +
    label(285, 130, "1, 2, 3", ' font-size="14"') +
    label(285, 158, "5, 20, 99", ' font-size="14"'),
);

/** Four cards for the Wason selection task. */
const FIG_CARDS = svg(
  360,
  110,
  ["E", "K", "4", "7"]
    .map((s, i) => {
      const x = 18 + i * 90;
      return `<rect x="${x}" y="8" width="66" height="92" rx="8" fill="none" stroke="currentColor" stroke-width="2"/>` + label(x + 33, 67, s, ' font-size="36" font-weight="600"');
    })
    .join(""),
);

/** Win/loss record with and without the lucky charm. */
const FIG_CHARM_TABLE = svg(
  360,
  130,
  line(8, 40, 352, 40, ' stroke-opacity="0.5"') +
    line(8, 85, 352, 85, ' stroke-opacity="0.5"') +
    line(150, 8, 150, 126, ' stroke-opacity="0.5"') +
    line(250, 8, 250, 126, ' stroke-opacity="0.5"') +
    label(200, 29, "wins", ` fill="${GREEN}" font-size="15" font-weight="600"`) +
    label(300, 29, "losses", ` fill="${ROSE}" font-size="15" font-weight="600"`) +
    `<text x="12" y="68" font-size="15">with charm</text><text x="12" y="113" font-size="15">without charm</text>` +
    label(200, 69, "12", ' font-size="18"') +
    label(300, 69, "8", ' font-size="18"') +
    label(200, 114, "18", ' font-size="18"') +
    label(300, 114, "12", ' font-size="18"'),
);

/** One librarian for every twenty farmers. */
const FIG_FARMERS = (() => {
  const person = (x: number, y: number, color: string) =>
    `<circle cx="${x}" cy="${y}" r="6" fill="${color}"/><rect x="${x - 7}" y="${y + 8}" width="14" height="17" rx="5" fill="${color}"/>`;
  let body = person(45, 62, BLUE);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 10; i++) body += person(112 + i * 24, 38 + r * 46, GREEN);
  body += line(85, 25, 85, 115, ' stroke-opacity="0.4" stroke-dasharray="4 4"');
  body += label(45, 142, "1 librarian", ` fill="${BLUE}" font-size="15"`) + label(220, 142, "20 farmers", ` fill="${GREEN}" font-size="15"`);
  return svg(350, 150, body);
})();

/** Natural-frequency tree for a 1% disease and a test that is right 90% of the time. */
const FIG_TREE = svg(
  360,
  210,
  `<rect x="264" y="15" width="72" height="25" rx="6" fill="${ROSE}" fill-opacity="0.25"/>` +
    `<rect x="258" y="125" width="84" height="25" rx="6" fill="${AMBER}" fill-opacity="0.3"/>` +
    line(84, 103, 134, 66) +
    line(84, 117, 122, 152) +
    line(202, 50, 262, 31) +
    line(202, 58, 264, 77) +
    line(222, 158, 256, 141) +
    line(222, 166, 254, 187) +
    label(50, 115, "1,000", ' font-size="17" font-weight="600"') +
    label(170, 58, "10 sick", ` fill="${ROSE}" font-size="15"`) +
    label(170, 169, "990 healthy", ' font-size="15"') +
    label(300, 33, "9 test +", ' font-size="15" font-weight="600"') +
    label(300, 83, "1 test −", ' font-size="15" opacity="0.7"') +
    label(300, 143, "99 test +", ' font-size="15" font-weight="600"') +
    label(300, 193, "891 test −", ' font-size="15" opacity="0.7"'),
);

// ---- the course ----------------------------------------------------------------------------

const course: LibraryCourse = {
  id: "cognitive-biases",
  title: "Cognitive Biases",
  icon: "🧩",
  blurb:
    "Catch the mental shortcuts that quietly bend your judgement (anchors, frames, confirmation and vivid stories) and learn a practical counter-move for each.",
  ability: "wis",
  skill: { name: "Insight", icon: "💭" },
  lessons: [
    // ---------------------------------------------------------------- 1
    {
      id: "anchoring-framing",
      title: "Anchoring and Framing",
      summary: "How the first number you see and the wording of a choice steer your judgement.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Your mind runs on shortcuts. Most of the time they're brilliant: fast, cheap and good enough. **Cognitive biases** are the predictable ways those shortcuts misfire.\n\nThis lesson covers two that quietly steer decisions about numbers and choices: **anchoring** and **framing**. You'll learn to spot them in prices, negotiations and warnings, with a counter-move for each.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Make a prediction. Two groups get five seconds to estimate a product.\n\n- Group A sees $8 \\times 7 \\times 6 \\times 5 \\times 4 \\times 3 \\times 2 \\times 1$\n- Group B sees $1 \\times 2 \\times 3 \\times 4 \\times 5 \\times 6 \\times 7 \\times 8$\n\nWhich group guesses higher, on average?",
          options: ["Group A", "Group B", "Neither: it's the same product, so the guesses match"],
          answer: [0],
          hint: "In five seconds you can only multiply the first few numbers. What do those first steps look like for each group?",
          explain:
            "In Tversky and Kahneman's 1974 study, the median guess was **2,250** for the descending version and **512** for the ascending one. The true answer is **40,320**.\n\nPeople compute the first few steps ($8 \\times 7 \\times 6 = 336$ versus $1 \\times 2 \\times 3 = 6$), then adjust upward from there, nowhere near enough. Both groups were dragged down by where they started.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Anchoring",
          figure: FIG_ANCHOR,
          caption:
            "Median guesses for the percentage of African countries in the UN, after a rigged wheel showed 10 or 65 (Tversky & Kahneman, 1974).",
          body:
            "**Anchoring**: when you estimate a number, the first number in view becomes an anchor. You adjust away from it, but usually not far enough.\n\nIt works even when the anchor is obviously irrelevant. People spun a wheel of fortune rigged to stop at 10 or 65, then estimated the percentage of African countries in the United Nations. The median guesses: **25%** after seeing 10, **45%** after seeing 65.\n\nPrices, salary offers, 'was/now' tags and opening bids all act as anchors.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are anchoring at work? Select all that apply.",
          options: [
            "A jacket tagged 'was 300 gold, now 150' feels like a bargain",
            "The first salary figure mentioned pulls the final offer toward it",
            "You pack an umbrella because the forecast says 80% chance of rain",
            "A 90-gold dish on the menu makes the 45-gold dish seem reasonable",
            "You collect three independent quotes before hiring a builder",
          ],
          answer: [0, 1, 3],
          hint: "Anchoring is when a number shapes your judgement even though it doesn't tell you what the thing is really worth.",
          explain:
            "The 'was' price, the first salary figure and the pricey menu dish all set a reference point that makes other numbers look small or large, whatever the thing is actually worth.\n\nThe rain forecast is relevant evidence, not an anchor. Collecting independent quotes is a **counter-move**: it gives you your own sense of a fair price instead of relying on one number someone handed you.",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "Now framing. An outbreak is expected to kill 600 people, and you must choose a plan.\n\n- **Plan A:** 200 people will be saved.\n- **Plan B:** a 1/3 chance that all 600 are saved, and a 2/3 chance that nobody is saved.\n\nOn average, how many people does Plan B save?",
          answers: ["200", "200 people"],
          placeholder: "number of people",
          hint: "Weigh each outcome by its chance and add them up.",
          explain:
            "$\\frac{1}{3} \\times 600 + \\frac{2}{3} \\times 0 = 200$. Plans A and B save the same number on average; they differ only in risk. When Tversky and Kahneman posed this in 1981, **72%** of people picked the sure thing, Plan A.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "Same outbreak, same 600 people, new wording:\n\n- **Plan C:** 400 people will die.\n- **Plan D:** a 1/3 chance that nobody dies, and a 2/3 chance that all 600 die.\n\nHow does Plan C compare with Plan A (200 saved)?",
          options: [
            "It's identical: 200 live and 400 die either way",
            "It's worse: 400 deaths is a lot",
            "It's better: it's more honest about the deaths",
          ],
          answer: [0],
          hint: "Out of 600 people, if 400 die, how many are saved?",
          explain:
            "Plan C *is* Plan A, and D is B. Only the wording changed, from 'saved' to 'die'. Yet with this wording **78%** of people chose the gamble, Plan D.\n\nFramed as gains, people protect the sure thing; framed as losses, they gamble to avoid a certain loss.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Framing",
          figure: FIG_600,
          caption: "One outcome, two descriptions. Which one you hear changes what feels right.",
          body:
            "**Framing**: the same facts, worded differently, lead to different choices.\n\n- **Gain frame** ('200 saved'): people tend to play safe.\n- **Loss frame** ('400 die'): people tend to take risks to avoid a sure loss.\n\nLosses loom larger than equal gains, so whatever is framed as a loss grabs your attention. Advertisers, surgeons, politicians and your own inner voice all choose frames, often without meaning to.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "A good counter-move is to restate a claim in the opposite frame. Match each claim with its mirror image.",
          pairs: [
            { left: "95% fat-free", right: "Contains 5% fat" },
            { left: "90% of patients survive the operation", right: "10% of patients die from the operation" },
            { left: "Keeps 3 of every 4 customers", right: "Loses 1 customer in 4" },
            { left: "5 gold off for paying cash", right: "5 gold extra for paying by card" },
          ],
          hint: "Each pair describes exactly the same situation, once as a gain and once as a loss.",
          explain:
            "Each pair states the same fact from opposite sides. Studies have found that even doctors choose surgery more often when outcomes are described as survival rates than as mortality rates. Saying both versions out loud takes the sting (or the shine) out of the frame.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Counter-moves",
          body:
            "**Against anchors**\n- Make your own estimate *before* you see anyone else's number.\n- Ask 'why might this number be far too high, or far too low?'\n- In a negotiation, prepare your target and walk-away price in advance, and consider making the first offer yourself.\n\n**Against frames**\n- Restate the choice in the opposite frame: 'saved' ↔ 'die', 'survive' ↔ 'mortality'.\n- Turn percentages into counts: '10 in 100 patients'.\n- Ask: 'Would I choose the same if it were worded the other way?'",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "You're about to haggle for a horse at the market. Put these steps in the order that best protects you from the seller's anchor.",
          items: [
            "Find out what similar horses have sold for recently",
            "Set your own target and walk-away price",
            "Hear the seller's opening price",
            "Compare their price with the range you prepared",
            "Counter from your own target, not from their number",
          ],
          hint: "Your own numbers need to exist before theirs can pull on them.",
          explain:
            "Research and your own target come **first**, so the seller's opening number lands against a reference you built, not in a vacuum. Then judge their number against your range and counter from your target. Countering 'a bit below theirs' lets their anchor set the whole negotiation.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "Why would deliberately listing reasons the anchor might be wrong weaken its pull?",
          body:
            "Anchors work partly through *selective recall*. To check whether a horse is worth about 800 gold, your mind pulls up the features that fit 800 (its fine coat, its young age), and those make a high price feel right.\n\nListing reasons the number could be wrong brings up the other evidence too. In one study where car experts (mechanics and dealers) priced a used car, those asked to consider the opposite were noticeably less swayed by the seller's anchor (Mussweiler, Strack & Pfeiffer, 2000).",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain anchoring and framing to a friend who's never heard of them, with one way to counter each.",
          keyPoints: [
            "Anchoring: the first number you see pulls your estimate toward it, even when it's irrelevant",
            "You adjust away from an anchor, but not far enough",
            "Framing: the same facts worded as gains or as losses lead to different choices",
            "Counter anchors: make your own estimate first and ask why the anchor might be wrong",
            "Counter frames: restate the choice the other way round, and in counts",
          ],
          model:
            "Anchoring is when the first number you hear drags your estimate toward it. A 'was 300, now 150' tag makes 150 feel cheap, even if the jacket is worth 80. You adjust from the anchor, but not far enough. To resist it, decide your own number before you hear theirs, and ask why theirs might be way off. Framing is when the same facts feel different depending on the wording: '90% survive' sounds safer than '10% die', though they're identical. To resist it, flip the wording and put it in counts, then see if your choice changes.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "From memory: which of these is true of anchoring?",
          options: [
            "Even an obviously random number can shift people's estimates",
            "Anchors only work when they're relevant to the question",
            "Experts in a field are immune to anchors",
            "People keep adjusting away from an anchor until they reach the right answer",
          ],
          answer: [0],
          explain:
            "The rigged wheel of fortune (10 or 65) shifted estimates of UN membership, though it obviously had nothing to do with the question. Car experts were anchored too, and adjustment typically stops short: that's the whole effect.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "A shop's sign reads: '**Deluxe cloak: 400 gold.** Traveller's cloak: 120 gold.' At the counter the clerk adds: 'Don't *lose* your 20-gold festival saving: it ends today!' Which effects are in play? Select all that apply.",
          options: [
            "Anchoring: the 400-gold cloak makes 120 gold feel cheap",
            "Framing: a 20-gold saving presented as something you could lose",
            "Neither: listing prices and deadlines is just information",
            "Anchoring can't apply, because the deluxe cloak is a different product",
          ],
          answer: [0, 1],
          hint: "Ask what each number or phrase does to how the price *feels*, not what it says about the cloak.",
          explain:
            "The 400-gold cloak is a classic **anchor**: next to it, 120 looks modest, even if cloaks like it usually go for 60. Anchors don't need to be relevant, so 'it's a different product' doesn't protect you. 'Don't *lose* your saving' is a **loss frame**: the same 20 gold feels more urgent as a loss than as a discount. Counter-moves: price a traveller's cloak elsewhere first, and restate the offer as 'I can pay 100 gold today'.",
        },
      ],
    },

    // ---------------------------------------------------------------- 2
    {
      id: "confirmation-bias",
      title: "Confirmation Bias",
      summary: "Why we test ideas by seeking agreement, and how to hunt for the counterexample instead.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Last lesson was about how numbers and wording steer your judgements. This one is about how you **test your own beliefs**, and why the natural way of testing them keeps telling you you're right.\n\nBy the end you'll be able to design a test that could actually prove you wrong, which is the only kind worth running.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Make a prediction. A sage has a secret rule for sequences of three numbers. She tells you **2, 4, 6** follows it. You may test any triple and she'll say whether it fits.\n\nYour hunch: *'numbers going up by 2'*. Which triple is the most informative test of your hunch?",
          options: ["8, 10, 12", "100, 102, 104", "1, 2, 3", "3, 5, 7"],
          answer: [2],
          hint: "Which triple does your hunch predict will *not* fit? What would you learn if it did?",
          explain:
            "The triples (8, 10, 12), (100, 102, 104) and (3, 5, 7) all fit your hunch, so you expect 'yes'. If the real rule is broader than your hunch, you'll hear 'yes' every time and grow more confident while being wrong.\n\n**1, 2, 3** is a triple your hunch says *won't* fit. If the sage says it does, you've learned your hunch is too narrow. (It does: her rule is 'any three increasing numbers'.)",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The 2-4-6 task",
          figure: FIG_NESTED,
          caption: "Every triple that fits the hunch also fits the real rule, so testing only those can never reveal the mistake.",
          body:
            "Psychologist Peter Wason ran this game in 1960. The secret rule was simply 'any three numbers in increasing order'. Most people guessed something narrower, such as 'add 2', then tested only triples that fit their guess. Every answer came back 'yes', and most announced a wrong rule at least once, feeling sure of it.\n\nThis is **confirmation bias**: the tendency to seek, interpret and remember information in ways that support what you already believe. It isn't dishonesty; checking for agreement just *feels* like the natural thing to do.\n\nThe fix: test the cases your idea says should **fail**.",
        },
        {
          type: "choice",
          phase: "understand",
          figure: FIG_CARDS,
          prompt:
            "Each card has a letter on one side and a number on the other. Rule: *'If a card has a vowel on one side, it has an even number on the other.'* Which cards must you turn over to find out whether the rule is broken? Select all that apply.",
          options: ["E", "K", "4", "7"],
          answer: [0, 3],
          hint: "For each card, ask: could whatever is on the back break the rule?",
          explain:
            "- **E**: an odd number on the back would break the rule. Turn it.\n- **7**: a vowel on the back would break the rule. Turn it.\n- **K**: the rule says nothing about consonants.\n- **4**: the rule doesn't say even numbers need vowels, so any letter is fine.\n\nMost people pick E and 4, but turning the 4 can only *confirm*, never refute. In Wason's studies typically only about 1 person in 10 chose E and 7.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Hunt for the rule-breaker",
          body:
            "A rule of the form **'if P, then Q'** is broken only by a case with **P and not-Q**.\n\n- Check every **P** case: does it have Q?\n- Check every **not-Q** case: is it hiding a P?\n- Q cases and not-P cases can't break the rule, however many you look at.\n\nConfirming examples feel like proof, but a thousand of them can't prove a general rule, while a single counterexample can disprove it.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "Same logic, new setting. A tavern rule: *'If you're drinking ale, you must be at least 18.'* For each of four patrons you know one detail. Whose other detail must you check? Select all that apply.",
          options: ["Someone drinking ale", "Someone drinking water", "Someone aged 30", "Someone aged 15"],
          answer: [0, 3],
          hint: "Who could possibly be breaking the rule?",
          explain:
            "Check the **ale drinker** (are they 18 or over?) and the **15-year-old** (are they drinking ale?). The water drinker and the 30-year-old can't break the rule.\n\nMost people find this version easy, although it's logically identical to the card puzzle: ale is the vowel (P), under-18 is the odd number (not-Q). We're good at hunting for *cheaters*, but less good at hunting for counterexamples to our own ideas. Borrow the cheater-detector: ask *'what would a violation look like?'*",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Three ways it sneaks in, and three counters",
          body:
            "- **Search**: you look where agreement lives ('why will my plan work?'). *Counter:* also search for 'why might it fail?' and read the strongest opposing case.\n- **Interpretation**: ambiguous evidence gets read as support, and evidence against gets picked apart. *Counter:* decide **in advance** what result would change your mind.\n- **Memory**: hits stick, misses fade. The night your lucky charm 'worked' is vivid; the nights it didn't are gone. *Counter:* **write things down**, misses included.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You suspect your lucky charm helps you win at cards. Which evidence would actually test that?",
          options: [
            "Recall the games you won while wearing it",
            "Compare your win rate in games with the charm to games without it",
            "Ask other players who believe in charms",
            "Wear it every game and notice when you win",
          ],
          answer: [1],
          hint: "Evidence only counts if it could come out *against* the charm.",
          explain:
            "You need all four cases: charm and win, charm and loss, no charm and win, no charm and loss. Remembering wins with the charm looks at only one of the four; wearing it every game leaves nothing to compare against; fellow believers will mostly remember hits too.",
        },
        {
          type: "input",
          phase: "understand",
          figure: FIG_CHARM_TABLE,
          caption: "Your written record of 50 games.",
          prompt: "Here's your record. By how many **percentage points** does the charm raise your win rate?",
          answers: ["0", "0%", "none", "zero", "0 points"],
          placeholder: "percentage points",
          hint: "Turn each row into a win rate first: wins ÷ games played.",
          explain:
            "With the charm: $\\frac{12}{20} = 60\\%$. Without it: $\\frac{18}{30} = 60\\%$. The difference is **0** points. Twelve wins with the charm felt like a lot, but you win just as often without it. Only the full comparison could show that.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put these steps for honestly testing a belief in order.",
          items: [
            "State the belief as a clear, testable claim",
            "Ask what you'd expect to see if the belief were false",
            "Go looking for exactly that evidence",
            "Update how confident you are, based on what you find",
          ],
          hint: "You can't look for disconfirming evidence until you know what it would look like.",
          explain:
            "A vague belief can't be tested, so make it specific first. Then work out what 'wrong' would look like, go and look for it, and let the result move your confidence up or down. Skipping step 2 is how confirmation bias creeps in: you end up looking only for what 'right' looks like.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "Is testing examples that fit your idea always a mistake?",
          body:
            "No. Checking cases your idea predicts will work is useful: it catches an idea that's too *broad*. It fails when the truth is broader than your guess, as in 2-4-6, because then every positive test says 'yes' and you never find out.\n\nThe rule of thumb: always include some tests your idea predicts will **fail**. If you can't think of any result that would change your mind, you're not testing an idea; you're defending it.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain confirmation bias to a friend using the 2-4-6 game, and tell them how to test an idea properly.",
          keyPoints: [
            "Confirmation bias: seeking, reading and remembering evidence in ways that fit what you already believe",
            "In 2-4-6, tests that fit your hunch keep getting 'yes' even though the hunch is wrong",
            "A rule 'if P then Q' is broken only by P together with not-Q, so look for that case",
            "Test cases your idea predicts will fail, and decide in advance what would change your mind",
          ],
          model:
            "Confirmation bias is our habit of looking for evidence that agrees with us. In the 2-4-6 game, people guess 'goes up by 2' and test 8, 10, 12 and 20, 22, 24. They keep hearing 'yes', but the real rule is just 'increasing', so they never discover they're wrong. The way out is to test something your idea says should fail, like 1, 2, 3. For any rule 'if P then Q', the only case that can break it is P without Q, so that's what to look for. Before testing, decide what result would change your mind.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each idea with an example.",
          pairs: [
            { left: "Biased search", right: "Looking up only reasons your plan will work" },
            { left: "Biased interpretation", right: "Reading an ambiguous result as support" },
            { left: "Biased memory", right: "Remembering the charm's wins but not its losses" },
            { left: "A falsifying test", right: "Trying 1, 2, 3 when you suspect 'up by 2'" },
          ],
          explain:
            "Confirmation bias acts at every stage: where you look (search), how you read what you find (interpretation) and what you keep (memory). A falsifying test is the antidote: a case your idea predicts will fail.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "A potion seller's sign reads: '**9 out of 10 customers felt better within a week!** Was 20 silver, now only 8!' You have a cold. Which questions would genuinely test whether the tonic works? Select all that apply.",
          options: [
            "How many people with a cold feel better within a week *without* the tonic?",
            "How many other customers say it worked for them?",
            "Has anyone compared it fairly against a fake (placebo) tonic?",
            "Is 8 silver a bargain compared with the old price of 20?",
          ],
          answer: [0, 2],
          hint: "Which answers could come out *against* the tonic?",
          explain:
            "Most colds clear up within a week or so on their own, so '9 in 10 felt better' may be exactly what happens with no tonic at all. You need the comparison group, just like the lucky-charm table, and a fair trial against a placebo is the gold standard.\n\nMore testimonials are only more confirming cases. And 'was 20, now 8' is an **anchor** from the last lesson: it makes the price feel good but says nothing about whether the tonic works.",
        },
      ],
    },

    // ---------------------------------------------------------------- 3
    {
      id: "availability-base-rates",
      title: "Availability and Base Rates",
      summary: "Vivid examples feel common, and rare things stay rare, even after a positive test.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Two more shortcuts, both about judging **how likely** things are. **Availability**: judging by how easily examples come to mind. **Base rates**: how common something is before you look at the details, which vivid evidence tends to push aside.\n\nBy the end you'll be able to read a medical test result correctly, something that many people, including many doctors in studies, get wrong.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt: "Make a prediction. Think of English words containing the letter **K**. In typical English text, is K more often the **first** letter of a word, or the **third**?",
          options: ["More often first", "More often third", "About equally often"],
          answer: [1],
          hint: "Which is easier to search your memory for: words that start with K, or words with K in third place? Is 'easy to recall' the same as 'common'?",
          explain:
            "In the word counts Tversky and Kahneman (1973) used, K appeared in the third position about **twice as often** as in the first (*like, make, take, ask, joke*). Yet most people answer 'first', because memory is searched by first letters: *king, kind, keep* come to mind instantly, while third-letter K words don't. Ease of recall got mistaken for frequency.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The availability heuristic",
          body:
            "You judge how common or likely something is by **how easily examples come to mind**.\n\nThat's usually a decent shortcut, since common things *are* usually easy to recall. But recall is also boosted by things that have nothing to do with frequency:\n\n- **vividness**: a shark attack beats heart disease\n- **recency**: what happened last week\n- **coverage**: what the news and your feed repeat",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these judgements are likely distorted by availability? Select all that apply.",
          options: [
            "Feeling that flying is dangerous right after a widely covered plane crash",
            "Believing crime is soaring because the local news covers it every night",
            "Checking official accident statistics before choosing between two routes",
            "A manager rating the employee whose mistake last week is freshest in mind as the team's weakest",
          ],
          answer: [0, 1, 3],
          hint: "Look for judgements based on what's easy to remember rather than on counts.",
          explain:
            "The crash (vivid, heavily covered), nightly crime stories (repetition) and last week's mistake (recency) all make examples easy to recall without making them more common. Checking the statistics is the **counter-move**: it replaces 'what comes to mind' with actual frequencies.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Order these causes of death in the United States from **least** to **most** common per year.",
          items: ["Shark attacks", "Lightning strikes", "Motor-vehicle crashes", "Heart disease"],
          hint: "Ask which ones make the news, then ask which ones fill hospitals.",
          explain:
            "Roughly: shark attacks about 1 death a year, lightning about 20, road crashes about 40,000, and heart disease around 700,000. Sharks and lightning get headlines out of all proportion to their toll, while heart disease rarely makes the news, so people tend to overestimate dramatic causes and underestimate common, quiet ones.",
        },
        {
          type: "choice",
          phase: "understand",
          figure: FIG_FARMERS,
          caption: "In the US there are roughly 20 male farmers for every male librarian.",
          prompt: "Steve is shy and withdrawn, very tidy, and has a passion for detail. Is Steve more likely to be a librarian or a farmer?",
          options: [
            "A librarian: the description fits perfectly",
            "A farmer: there are far more farmers",
            "Equally likely: the description and the numbers cancel out",
          ],
          answer: [1],
          hint: "Suppose shy, tidy people were 4 times as common among librarians as among farmers. Among 1 librarian and 20 farmers, where would you find more Steves?",
          explain:
            "Even if shy, tidy people were four times as common among librarians, 20 farmers for every librarian leaves about **5** Steve-like farmers for each Steve-like librarian.\n\nThe description is vivid; the **base rate** (how common each group is to begin with) is dull, so it gets ignored. That's **base-rate neglect**.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "A disease affects **1%** of people. A test for it is '90% accurate': it flags 90% of people who have the disease and correctly clears 90% of people who don't. You test positive. Roughly how likely is it that you have the disease?",
          options: ["About 90%", "About 50%", "About 8%", "About 1%"],
          answer: [2],
          hint: "Picture 1,000 people taking the test. How many are sick? How many healthy people get flagged anyway?",
          explain:
            "About **8%**, which surprises almost everyone; the next steps show why. The trap in 'about 90%' is that 90% is the chance of testing positive *if you're sick*, not the chance you're sick *if you test positive*. Those are different questions.",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "Let's count. Picture 1,000 people taking that test. 10 have the disease, and 9 of them test positive. The other 990 are healthy, but the test wrongly flags 10% of healthy people. How many **healthy people test positive**?",
          answers: ["99"],
          placeholder: "number of people",
          hint: "The false-alarm rate applies to the healthy group only.",
          explain:
            "10% of 990 = **99** false positives. That's 11 times as many as the 9 true positives, because healthy people outnumber sick ones 99 to 1.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Count people, not percentages",
          figure: FIG_TREE,
          caption: "Natural frequencies: follow 1,000 people through the test. 9 + 99 = 108 test positive.",
          body:
            "Of the **108** people who test positive, only **9** are sick:\n\n$$P(\\text{sick} \\mid \\text{positive}) = \\frac{9}{9 + 99} = \\frac{9}{108} \\approx 8.3\\%$$\n\nThe test is decent; the problem is the **base rate**. When a condition is rare, even a small false-alarm rate among the huge healthy majority swamps the true cases.\n\nThinking in **natural frequencies** (turn percentages into counts of people, then count) makes this easy to see, and studies find it helps doctors and patients alike.",
        },
        {
          type: "slider",
          phase: "understand",
          prompt:
            "Use the same test (flags 90% of sick people and 10% of healthy people) in groups where the disease is more or less common. Slide the base rate to where a positive result means a **50/50** chance of being sick.",
          min: 0,
          max: 50,
          step: 0.5,
          start: 1,
          label: "Base rate",
          unit: "%",
          plot: "90*x/(0.9*x + 0.1*(100 - x))",
          xMin: 0,
          xMax: 50,
          readout: "90*v/(0.9*v + 0.1*(100 - v))",
          readoutLabel: "Chance a positive is real (%)",
          answer: 10,
          tolerance: 0.25,
          hint: "At a 1% base rate a positive means about 8%. Keep sliding until the readout reaches 50.",
          explain:
            "At a **10%** base rate, 1,000 people include 100 sick (90 test positive) and 900 healthy (90 test positive): 90 real against 90 false, exactly 50/50. The same test means very different things in different groups, which is why a positive result tells you more about someone with symptoms (a higher base rate) than in a screening of everyone.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "You test positive for the 1% disease (about an 8% chance you're sick). What's a sensible next step, and how much can it help?",
          body:
            "Don't panic, and don't shrug it off either: your risk went from 1% to about 8%. Get a **second, independent test**. Your 8% is now the new base rate.\n\nOf the 108 positives, 9 are sick and 99 healthy. A second positive comes from about 8.1 of the sick (90%) and about 9.9 of the healthy (10%), so two positives put you at about $\\frac{8.1}{8.1 + 9.9} = 45\\%$, and a third at about 88%, as long as the tests' errors are independent. That's why doctors confirm screening results before acting.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Counter-moves",
          body:
            "**Against availability**\n- Ask: is this easy to recall because it's *common*, or because it's *vivid, recent or widely reported*?\n- Look up the actual numbers before judging a risk.\n\n**Against base-rate neglect**\n- Before weighing specific evidence, ask: *how common is this to begin with?*\n- Translate percentages into counts ('out of 1,000 people…') and count.\n- Keep $P(\\text{positive} \\mid \\text{sick})$ and $P(\\text{sick} \\mid \\text{positive})$ apart. They're different numbers.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain to a friend why a positive result from a '90% accurate' test for a rare disease probably doesn't mean they're sick.",
          keyPoints: [
            "Start from the base rate: only 1% of people have the disease",
            "Picture 1,000 people: 10 sick and 990 healthy",
            "9 sick people test positive, but so do 99 healthy ones",
            "So only about 9 of 108 positives (about 8%) are really sick",
            "The chance of a positive if you're sick is not the chance you're sick if you're positive",
          ],
          model:
            "Imagine 1,000 people taking the test. Only 1% have the disease, so 10 are sick and 990 are healthy. The test catches 9 of the 10 sick people. But it also wrongly flags 10% of the healthy ones, which is 99 people. So 108 people test positive and only 9 of them are actually sick: about 8%. The '90%' describes how the test treats sick people; it doesn't tell you how likely you are to be sick after a positive. Because the disease is rare, false alarms outnumber real cases. A second test would sort it out.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each term with its meaning.",
          pairs: [
            { left: "Availability heuristic", right: "Judging how common something is by how easily examples come to mind" },
            { left: "Base rate", right: "How common something is before any specific evidence" },
            { left: "Base-rate neglect", right: "Letting a vivid description or test result drown out how common something is" },
            { left: "False positive", right: "A healthy person the test flags anyway" },
            { left: "Natural frequencies", right: "Counting people ('9 out of 1,000') instead of juggling percentages" },
          ],
          explain:
            "Availability swaps 'easy to recall' for 'common'. The base rate is the starting frequency; neglecting it lets vivid evidence take over. False positives are where the surprise comes from when a condition is rare, and natural frequencies make all of it countable.",
        },
        {
          type: "input",
          phase: "apply",
          prompt:
            "A lab advertises a '99% accurate' test for a rarer disease that **1 in 1,000** people have. The test flags **99%** of sick people and wrongly flags **2%** of healthy people. You test positive. What's the chance you're sick? Give a percentage to one decimal place. (Tip: picture 100,000 people.)",
          answers: ["4.7%", "4.72%", "0.047", "0.0472", "99/2097"],
          tolerance: 0.005,
          placeholder: "e.g. 12.3%",
          hint: "Of 100,000 people, how many are sick and test positive? How many are healthy and test positive?",
          explain:
            "Of 100,000 people, 100 are sick and 99 test positive. The other 99,900 are healthy, and 2% of them, **1,998**, test positive too. So $\\frac{99}{99 + 1998} = \\frac{99}{2097} \\approx 4.7\\%$.\n\nNotice the frame: '99% accurate' is true about the test, yet fewer than 1 in 20 positives are real, because the base rate is so low.",
        },
      ],
    },
  ],
};

export default course;

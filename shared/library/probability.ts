import type { LibraryCourse } from "./types.ts";

// ---- figures: small inline SVGs (currentColor plus a few accents, so they read in light and dark mode) ----

const BLUE = "#3b82f6";
const RED = "#ef4444";
const AMBER = "#f59e0b";

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif" font-size="16" fill="currentColor">${body}</svg>`;
const label = (x: number, y: number, s: string, extra = "") => `<text x="${x}" y="${y}" text-anchor="middle"${extra}>${s}</text>`;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** A line from circle A to circle B that stops at both rims. */
const edge = (ax: number, ay: number, ar: number, bx: number, by: number, br: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  return `<line x1="${r1(ax + (dx * ar) / d)}" y1="${r1(ay + (dy * ar) / d)}" x2="${r1(bx - (dx * br) / d)}" y2="${r1(by - (dy * br) / d)}" stroke="currentColor" stroke-width="2"/>`;
};

const PIPS: number[][][] = [
  [],
  [[25, 25]],
  [[14, 14], [36, 36]],
  [[14, 14], [25, 25], [36, 36]],
  [[14, 14], [36, 14], [14, 36], [36, 36]],
  [[14, 14], [36, 14], [25, 25], [14, 36], [36, 36]],
  [[14, 14], [36, 14], [14, 25], [36, 25], [14, 36], [36, 36]],
];
const die = (x: number, y: number, n: number, on: boolean) =>
  `<rect x="${x}" y="${y}" width="50" height="50" rx="9" fill="${on ? BLUE : "none"}" fill-opacity="0.3" stroke="currentColor" stroke-width="2"/>` +
  PIPS[n].map(([px, py]) => `<circle cx="${x + px}" cy="${y + py}" r="4.5"/>`).join("");

/** The six faces of a die, even ones highlighted. */
const FIG_EVEN_FACES = svg(
  360,
  90,
  [1, 2, 3, 4, 5, 6].map((n) => die(7 + (n - 1) * 58, 6, n, n % 2 === 0)).join("") + label(180, 82, "even faces: 3 of 6", ` fill="${BLUE}"`),
);

/** Tree diagram for two coin flips. */
const FIG_COIN_TREE = (() => {
  const root: [number, number] = [24, 120];
  const first: [number, number, string][] = [
    [120, 75, "H"],
    [120, 165, "T"],
  ];
  const second: [number, number, string, number][] = [
    [220, 50, "H", 0],
    [220, 100, "T", 0],
    [220, 140, "H", 1],
    [220, 190, "T", 1],
  ];
  const node = (x: number, y: number, s: string) =>
    `<circle cx="${x}" cy="${y}" r="15" fill="none" stroke="currentColor" stroke-width="2"/>` + label(x, y + 6, s);
  let body = label(120, 20, "flip 1", ' font-size="14" opacity="0.7"') + label(220, 20, "flip 2", ' font-size="14" opacity="0.7"') + label(300, 20, "outcome", ' font-size="14" opacity="0.7"');
  body += `<circle cx="${root[0]}" cy="${root[1]}" r="5"/>`;
  for (const [x, y, s] of first) body += edge(root[0], root[1], 5, x, y, 15) + node(x, y, s);
  for (const [x, y, s, p] of second) {
    const [px, py, ps] = first[p];
    const outcome = ps + s;
    const one = outcome === "HT" || outcome === "TH";
    body += edge(px, py, 15, x, y, 15) + node(x, y, s);
    if (one) body += `<rect x="272" y="${y - 15}" width="56" height="28" rx="6" fill="${BLUE}" fill-opacity="0.3"/>`;
    body += label(300, y + 6, outcome, ' font-weight="600"');
  }
  return svg(340, 210, body);
})();

/** All 36 outcomes of two dice with their sums; the sevens highlighted. */
const FIG_DICE_SUMS = (() => {
  const c = 38;
  const ox = 60;
  const oy = 50;
  let body = label(ox + 3 * c, 18, "blue die", ` fill="${BLUE}" font-size="15"`);
  body += `<text transform="rotate(-90 18 ${oy + 3 * c})" x="18" y="${oy + 3 * c}" text-anchor="middle" fill="${RED}" font-size="15">red die</text>`;
  for (let i = 0; i < 6; i++) {
    body += label(ox + c * i + c / 2, 42, String(i + 1), ` fill="${BLUE}" font-weight="600"`);
    body += label(44, oy + c * i + c / 2 + 6, String(i + 1), ` fill="${RED}" font-weight="600"`);
  }
  for (let r = 0; r < 6; r++)
    for (let b = 0; b < 6; b++) {
      const sum = r + b + 2;
      const x = ox + c * b;
      const y = oy + c * r;
      body += `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="${sum === 7 ? AMBER : "none"}" fill-opacity="0.35" stroke="currentColor" stroke-opacity="0.4"/>`;
      body += label(x + c / 2, y + c / 2 + 5, String(sum), ' font-size="15"');
    }
  return svg(300, 290, body);
})();

/** The 12 coin-and-die combinations, (H, 6) highlighted. */
const FIG_COIN_DIE = (() => {
  const w = 44;
  const h = 38;
  const ox = 70;
  const oy = 36;
  let body = "";
  for (let i = 0; i < 6; i++) body += label(ox + w * i + w / 2, 26, String(i + 1), ' font-weight="600"');
  ["H", "T"].forEach((s, r) => {
    body += label(48, oy + h * r + h / 2 + 6, s, ` fill="${AMBER}" font-weight="600"`);
    for (let i = 0; i < 6; i++) {
      const on = r === 0 && i === 5;
      body += `<rect x="${ox + w * i}" y="${oy + h * r}" width="${w}" height="${h}" fill="${on ? BLUE : "none"}" fill-opacity="0.35" stroke="currentColor" stroke-opacity="0.4"/>`;
      body += label(ox + w * i + w / 2, oy + h * r + h / 2 + 5, s + (i + 1), ' font-size="14"');
    }
  });
  return svg(350, 120, body);
})();

/** Venn diagram: hearts and kings overlap in the king of hearts. */
const FIG_VENN = svg(
  360,
  215,
  `<circle cx="145" cy="110" r="80" fill="${RED}" fill-opacity="0.15" stroke="${RED}" stroke-width="2"/>` +
    `<circle cx="245" cy="110" r="55" fill="${BLUE}" fill-opacity="0.15" stroke="${BLUE}" stroke-width="2"/>` +
    label(105, 22, "hearts: 13", ` fill="${RED}"`) +
    label(275, 44, "kings: 4", ` fill="${BLUE}"`) +
    label(110, 117, "12", ' font-size="20"') +
    label(207, 116, "K♥", ' font-size="15" font-weight="600"') +
    label(268, 117, "3", ' font-size="20"') +
    label(180, 209, "13 + 4 − 1 = 16 cards", ' font-size="15"'),
);

/** A beam with equal weights at 1…6 and the balance point to find. */
const FIG_BALANCE = svg(
  360,
  140,
  `<line x1="15" y1="70" x2="345" y2="70" stroke="currentColor" stroke-width="4"/>` +
    [1, 2, 3, 4, 5, 6]
      .map((n) => {
        const x = 30 + (n - 1) * 60;
        return `<circle cx="${x}" cy="52" r="15" fill="${AMBER}" fill-opacity="0.35" stroke="${AMBER}" stroke-width="2"/>` + label(x, 57, String(n), ' font-size="15"');
      })
      .join("") +
    `<polygon points="180,72 162,104 198,104" fill-opacity="0.6"/>` +
    label(180, 128, "balance point = ?", ' font-size="15"'),
);

/** Four heads in a row, then an unknown flip. */
const FIG_STREAK = svg(
  360,
  110,
  [42, 111, 180, 249]
    .map((x) => `<circle cx="${x}" cy="45" r="27" fill="${AMBER}" fill-opacity="0.35" stroke="${AMBER}" stroke-width="2"/>` + label(x, 52, "H", ' font-size="20" font-weight="600"'))
    .join("") +
    `<circle cx="318" cy="45" r="27" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"/>` +
    label(318, 52, "?", ' font-size="20" font-weight="600"') +
    label(180, 102, "four heads so far. Next flip?", ' font-size="15"'),
);

// ---- the course ----------------------------------------------------------------------------

const course: LibraryCourse = {
  id: "probability",
  title: "Thinking in Probabilities",
  icon: "🎲",
  blurb:
    "Count outcomes, combine chances and price a bet like a seasoned sage, using nothing but dice, coins and cards you can picture in your head.",
  ability: "int",
  skill: { name: "Arcana", icon: "🔮" },
  lessons: [
    // ---------------------------------------------------------------- 1
    {
      id: "counting-outcomes",
      title: "Counting Outcomes",
      summary: "Probability as favourable outcomes over possible outcomes, with dice, coins and cards.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Probability is the language of uncertainty: dice and cards, weather forecasts, medical tests, any risky choice. Everything in this course rests on one move: **counting equally likely outcomes**.\n\nBy the end of this lesson you'll be able to work out the chance of any event with dice, coins or cards by listing and counting.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt: "Make a prediction. You roll one fair six-sided die. Which is more likely?",
          options: ["Rolling a 6", "Rolling an even number", "They're equally likely"],
          answer: [1],
          hint: "Count how many faces give each result.",
          explain:
            "Even numbers are 2, 4 and 6: **three** of the six faces. A 6 is just **one** face. More ways for something to happen means it's more likely. (Every 6 is even, so 'even' can't be *less* likely than '6'.)",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Favourable over possible",
          figure: FIG_EVEN_FACES,
          caption: "Three of the six equally likely faces are even.",
          body:
            "When every outcome is **equally likely**, the probability of an event is\n\n$$P(\\text{event}) = \\frac{\\text{favourable outcomes}}{\\text{possible outcomes}}$$\n\nA die has 6 equally likely faces and 3 of them are even, so $P(\\text{even}) = \\frac{3}{6} = \\frac{1}{2}$.\n\nProbabilities run from 0 (impossible) to 1 (certain). The same value can be written as a fraction, a decimal or a percentage: $\\frac{1}{2} = 0.5 = 50\\%$.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "What's the probability of rolling a number **greater than 4** on a fair six-sided die? Give it as a fraction.",
          answers: ["1/3", "2/6", "0.333", "0.33", "33.3%", "33%", "33.33%"],
          tolerance: 0.005,
          placeholder: "e.g. 1/2",
          hint: "Which faces are greater than 4? How many faces are there in total?",
          explain:
            "Only 5 and 6 are greater than 4: 2 favourable faces out of 6, so $\\frac{2}{6} = \\frac{1}{3} \\approx 0.333$. (4 itself doesn't count: 'greater than 4' excludes 4.)",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You flip two fair coins. What's the probability of getting **exactly one** head?",
          options: ["1/3, because the results are 0, 1 or 2 heads", "1/2", "1/4", "2/3"],
          answer: [1],
          hint: "Write out every way the two coins can land, keeping track of which coin is which.",
          explain:
            "The equally likely outcomes are HH, HT, TH and TT. Exactly one head happens in two of them (HT and TH), so the probability is $\\frac{2}{4} = \\frac{1}{2}$.\n\nThe tempting $\\frac{1}{3}$ treats 'no heads', 'one head' and 'two heads' as equally likely, but 'one head' can happen in two ways. Even the 18th-century mathematician d'Alembert tripped over a version of this.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "List outcomes that are equally likely",
          figure: FIG_COIN_TREE,
          caption: "Each flip splits into heads or tails: 4 equally likely paths, 2 of them with exactly one head.",
          body:
            "The formula only works when the outcomes you count are **equally likely**, so the trick is to list outcomes that are. A tree diagram does it for you: every branch is one equally likely path.\n\nFor two dice, imagine one red and one blue. Each has 6 faces, giving $6 \\times 6 = 36$ equally likely pairs. (red 1, blue 2) and (red 2, blue 1) are *different* outcomes, even though both make a sum of 3.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "You roll two fair dice. How many of the 36 equally likely outcomes give a **sum of 7**?",
          answers: ["6"],
          placeholder: "a whole number",
          hint: "Go through the red die's value from 1 to 6. What must the blue die show each time?",
          explain:
            "(1,6), (2,5), (3,4), (4,3), (5,2), (6,1): **6** outcomes. Every value of the first die has exactly one partner, which is why 7 is the most common sum: $P(\\text{sum } 7) = \\frac{6}{36} = \\frac{1}{6}$.",
        },
        {
          type: "match",
          phase: "understand",
          figure: FIG_DICE_SUMS,
          caption: "All 36 outcomes for a red and a blue die, with their sums. The six 7s are highlighted.",
          prompt: "Use the grid. Match each sum of two dice with its probability.",
          pairs: [
            { left: "Sum of 2", right: "1/36" },
            { left: "Sum of 4", right: "1/12" },
            { left: "Sum of 6", right: "5/36" },
            { left: "Sum of 7", right: "1/6" },
            { left: "Sum of 11", right: "1/18" },
          ],
          hint: "Count the cells showing each sum, then divide by 36 and simplify.",
          explain:
            "- Sum 2: only (1,1), so $\\frac{1}{36}$.\n- Sum 4: (1,3), (2,2), (3,1), so $\\frac{3}{36} = \\frac{1}{12}$.\n- Sum 6: (1,5), (2,4), (3,3), (4,2), (5,1), so $\\frac{5}{36}$.\n- Sum 7: six cells, so $\\frac{6}{36} = \\frac{1}{6}$.\n- Sum 11: (5,6), (6,5), so $\\frac{2}{36} = \\frac{1}{18}$.\n\nEqual sums lie on the same diagonal of the grid, which is why middle sums are common and extreme ones rare.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "A deck of cards",
          body:
            "A standard deck has **52 cards**: 4 suits (♠ spades, ♥ hearts, ♦ diamonds, ♣ clubs) of 13 ranks each: A, 2–10, J, Q, K.\n\n- Hearts and diamonds are red; spades and clubs are black (26 of each colour).\n- J, Q and K are the **face cards**: 3 per suit, 12 in all.\n- Each rank appears 4 times, once in every suit.\n\nIn a well-shuffled deck every card is equally likely, so you can simply count.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "You draw one card from a well-shuffled 52-card deck. What's the probability it's a **face card** (J, Q or K)? Give it as a fraction.",
          answers: ["3/13", "12/52", "0.231", "0.23", "0.2308", "23.1%", "23%", "23.08%"],
          tolerance: 0.005,
          placeholder: "e.g. 1/4",
          hint: "How many face cards are in each suit, and how many suits are there?",
          explain:
            "3 face cards per suit × 4 suits = 12 face cards, so $\\frac{12}{52} = \\frac{3}{13} \\approx 0.231$, about 23%.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You draw one card from a full deck. Which of these events have a probability of exactly **1/4**? Select all that apply.",
          options: ["It's a heart", "It's a red card", "It's an ace", "It's a black card that isn't a club"],
          answer: [0, 3],
          hint: "Count the cards that fit each description, then compare with 13 out of 52.",
          explain:
            "A quarter of 52 is 13 cards.\n\n- **Heart**: 13 cards, so $\\frac{13}{52} = \\frac{1}{4}$. ✓\n- **Red**: 26 cards, so $\\frac{1}{2}$.\n- **Ace**: 4 cards, so $\\frac{1}{13}$.\n- **Black but not a club** is just a spade: 13 cards, so $\\frac{1}{4}$. ✓\n\nDifferent descriptions can pick out the same set of cards; always count what they actually include.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain to a friend why the chance of exactly one head in two coin flips is 1/2 and not 1/3.",
          keyPoints: [
            "Favourable ÷ possible only works when the outcomes are equally likely",
            "The equally likely outcomes are HH, HT, TH and TT",
            "Exactly one head happens two ways (HT and TH), so it's 2 out of 4 = 1/2",
            "'0, 1 or 2 heads' aren't equally likely results, so 1/3 is wrong",
          ],
          model:
            "You can only divide favourable outcomes by possible outcomes when every outcome is equally likely. With two coins, the equally likely outcomes are HH, HT, TH and TT. Exactly one head shows up in two of them, HT and TH, so the chance is 2 out of 4, which is 1/2. Saying '0, 1 or 2 heads, so 1/3' treats those three results as equally likely, but 'one head' can happen in two different ways, so it's twice as likely as the others.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "From memory: when does 'favourable outcomes ÷ possible outcomes' give the right probability?",
          options: [
            "When every outcome is equally likely",
            "Whenever you can list all the outcomes",
            "Only when there are exactly two outcomes",
            "Only for dice and coins",
          ],
          answer: [0],
          explain:
            "The formula needs outcomes that are **equally likely**. Listing outcomes isn't enough: '0, 1 or 2 heads' is a complete list, but its outcomes aren't equally likely. It works for cards, lottery tickets and anything else once you've split things into equally likely cases.",
        },
        {
          type: "reveal",
          phase: "apply",
          prompt: "A friend says: 'The lottery is 50/50: either I win or I don't.' What's wrong with that?",
          body:
            "Two outcomes aren't the same as two **equally likely** outcomes. 'Win' is one combination of numbers; 'lose' is every other combination. In a lottery where you pick 6 numbers from 49 there are 13,983,816 possible combinations, so one ticket wins the jackpot with probability 1 in 13,983,816 (about 1 in 14 million).\n\nWhenever you use favourable ÷ possible, first ask: *are these outcomes equally likely?* If not, break them into ones that are.",
        },
        {
          type: "order",
          phase: "apply",
          prompt: "Final challenge: put these events in order from **least likely** to **most likely**.",
          items: [
            "Rolling a sum of 12 with two dice",
            "Drawing an ace from a full deck",
            "Drawing a heart from a full deck",
            "Getting exactly one head when flipping two coins",
            "Rolling more than 2 on one die",
          ],
          hint: "Work out each probability as a fraction, then compare them as decimals.",
          explain:
            "- Sum of 12: only (6,6), so $\\frac{1}{36} \\approx 0.03$\n- An ace: $\\frac{4}{52} = \\frac{1}{13} \\approx 0.08$\n- A heart: $\\frac{13}{52} = \\frac{1}{4} = 0.25$\n- Exactly one head in two flips: $\\frac{2}{4} = 0.5$\n- More than 2 on a die (3, 4, 5 or 6): $\\frac{4}{6} \\approx 0.67$",
        },
      ],
    },

    // ---------------------------------------------------------------- 2
    {
      id: "combining-events",
      title: "And, Or, Not",
      summary: "Multiply for 'and', add for 'or', and use the complement for 'at least one'.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Real questions rarely involve a single event. *Will it rain on both days? Will at least one of my three plans work? Is this card a heart or a king?*\n\nLast lesson you counted outcomes. Now you'll learn three rules that combine probabilities without listing everything: **multiply** for 'and', **add** for 'or', and **subtract from 1** for 'not'. By the end you'll crack a gambling puzzle that helped found probability theory.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt: "Make a prediction. You flip a fair coin **and** roll a fair die. What's the probability of getting heads **and** a 6?",
          options: ["1/12", "1/8", "2/3", "1/6"],
          answer: [0],
          hint: "How many coin–die combinations are there in total? How many of them are (heads, 6)?",
          explain:
            "There are $2 \\times 6 = 12$ equally likely coin–die combinations, and only (heads, 6) works: $\\frac{1}{12}$.\n\nThe tempting $\\frac{2}{3}$ comes from *adding* $\\frac{1}{2} + \\frac{1}{6}$. But needing both things to happen should make the result *less* likely than either one alone, not more.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "'And': multiply (for independent events)",
          figure: FIG_COIN_DIE,
          caption: "2 coin sides × 6 die faces = 12 equally likely combinations; only one is heads and 6.",
          body:
            "Two events are **independent** when one happening doesn't change the chance of the other: a coin doesn't care what a die shows.\n\nFor independent events, multiply:\n\n$$P(A \\text{ and } B) = P(A) \\times P(B)$$\n\nHeads and a 6: $\\frac{1}{2} \\times \\frac{1}{6} = \\frac{1}{12}$, matching the grid. Multiplying numbers below 1 always gives something smaller: needing *both* is harder than needing either.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "You roll three fair dice. What's the probability that **all three** show a 6? Give it as a fraction.",
          answers: ["1/216", "0.00463", "0.0046", "0.004630", "(1/6)^3", "1/6^3"],
          tolerance: 0.00005,
          placeholder: "e.g. 1/100",
          hint: "The dice are independent. What's the chance of a 6 on each one?",
          explain:
            "Each die shows a 6 with probability $\\frac{1}{6}$, and the dice don't affect each other, so $\\frac{1}{6} \\times \\frac{1}{6} \\times \\frac{1}{6} = \\frac{1}{216} \\approx 0.0046$. Check by counting: there are $6^3 = 216$ equally likely outcomes, and only one is (6, 6, 6).",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You draw one card from a full 52-card deck. What's the probability that it's a heart **or** a king?",
          options: ["17/52", "16/52", "1/52", "13/52"],
          answer: [1],
          hint: "Is there a card that is both a heart and a king? How many times would you count it?",
          explain:
            "There are 13 hearts and 4 kings, but the king of hearts is in both groups. Counting $13 + 4 = 17$ counts it twice. The real number of cards is $13 + 4 - 1 = 16$, so the probability is $\\frac{16}{52} = \\frac{4}{13}$.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "'Or': add, minus any overlap",
          figure: FIG_VENN,
          caption: "Hearts and kings share one card, so adding 13 + 4 counts the king of hearts twice.",
          body:
            "'A or B' means at least one of them happens.\n\nIf the events **can't both happen** (they're *mutually exclusive*), just add: $P(A \\text{ or } B) = P(A) + P(B)$. Rolling a 1 or a 2: $\\frac{1}{6} + \\frac{1}{6} = \\frac{1}{3}$.\n\nIf they **can overlap**, adding counts the overlap twice, so subtract it once:\n\n$$P(A \\text{ or } B) = P(A) + P(B) - P(A \\text{ and } B)$$\n\nThis is called **inclusion–exclusion**. Heart or king: $\\frac{13}{52} + \\frac{4}{52} - \\frac{1}{52} = \\frac{16}{52}$.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "You roll one die. What's the probability of rolling an **even number or a number greater than 3**? Give it as a fraction.",
          answers: ["2/3", "4/6", "0.667", "0.67", "66.7%", "67%", "66.67%"],
          tolerance: 0.005,
          placeholder: "e.g. 1/2",
          hint: "Even is {2, 4, 6}; greater than 3 is {4, 5, 6}. Do they overlap?",
          explain:
            "With inclusion–exclusion: $\\frac{3}{6} + \\frac{3}{6} - \\frac{2}{6} = \\frac{4}{6} = \\frac{2}{3}$, because 4 and 6 are in both sets. Or just list the faces that work: 2, 4, 5, 6, which is 4 of 6. Adding without subtracting gives $\\frac{6}{6} = 1$, which is clearly wrong: rolling a 1 or a 3 fits neither.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these pairs of events are **mutually exclusive** (they can't both happen)? Select all that apply.",
          options: [
            "One die roll: 'even' and 'odd'",
            "One card: 'a heart' and 'a king'",
            "One card: 'a heart' and 'a spade'",
            "Two coin flips: 'first is heads' and 'second is heads'",
            "One die roll: 'a 6' and 'less than 3'",
          ],
          answer: [0, 2, 4],
          hint: "For each pair, try to imagine a single result where both happen.",
          explain:
            "Even/odd, heart/spade, and 6/less-than-3 can never happen together, so they're mutually exclusive: you can add.\n\nThe king of hearts is both a heart and a king, so those overlap. The two coin flips are **independent**, not exclusive: both can easily be heads. Independent means 'doesn't affect the other'; mutually exclusive means 'can't happen together'. They're very different ideas.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You roll a fair die **6 times**. What's the probability of getting **at least one** 6?",
          options: ["Exactly 1: six chances of 1/6 add up to certainty", "About 0.665", "Exactly 5/6", "Exactly 1/2"],
          answer: [1],
          hint: "Could you roll six times and never see a 6? Then the answer can't be 1.",
          explain:
            "Adding $\\frac{1}{6}$ six times only works for mutually exclusive events, and 'a 6 on roll 1' and 'a 6 on roll 2' can both happen, so adding double-counts.\n\nFlip the question instead. The chance of **no** 6 in six rolls is $\\left(\\frac{5}{6}\\right)^6 \\approx 0.335$, so the chance of at least one is $1 - 0.335 \\approx 0.665$.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put these steps for finding P(at least one 6 in 4 rolls) in order.",
          items: [
            "Flip the question: 'at least one 6' is the opposite of 'no 6 at all'",
            "Find the chance of no 6 on a single roll",
            "Multiply that chance across all 4 independent rolls",
            "Subtract the result from 1",
          ],
          hint: "You need P(no 6) for all four rolls before you can subtract anything.",
          explain:
            "This is the **complement rule**: every event either happens or it doesn't, so $P(\\text{not } A) = 1 - P(A)$. 'At least one 6' is 'not (no 6)'. One roll misses with probability $\\frac{5}{6}$; four independent misses: $\\left(\\frac{5}{6}\\right)^4$; then subtract from 1.",
        },
        {
          type: "slider",
          phase: "understand",
          prompt: "How many rolls do you need before **at least one 6** becomes more likely than not? Slide to the fewest rolls that push the chance past 50%.",
          min: 1,
          max: 12,
          step: 1,
          start: 1,
          label: "Rolls",
          plot: "1 - (5/6)^x",
          xMin: 0,
          xMax: 12,
          readout: "1 - (5/6)^v",
          readoutLabel: "P(at least one 6)",
          answer: 4,
          tolerance: 0.4,
          hint: "Watch the readout: it's $1 - (5/6)^n$. Where does it first go above 0.5?",
          explain:
            "Three rolls give $1 - \\left(\\frac{5}{6}\\right)^3 \\approx 0.421$; four give $1 - \\left(\\frac{5}{6}\\right)^4 \\approx 0.518$. So **4 rolls** is the first time the odds tip in your favour. Notice the curve bends: each extra roll adds less than the one before, and it never quite reaches 1.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain to a beginner how to find the chance of at least one 6 in four rolls, and why you can't just add 1/6 four times.",
          keyPoints: [
            "Adding only works for events that can't happen together, and sixes on different rolls can",
            "Use the complement: 'at least one 6' is the opposite of 'no 6 at all'",
            "Rolls are independent, so P(no 6 in 4 rolls) = (5/6)^4",
            "Answer: 1 − (5/6)^4 ≈ 0.518",
          ],
          model:
            "Adding 1/6 four times would count some results twice, because you can roll a 6 on more than one roll; carry on to six rolls and you'd even 'prove' a 6 is certain, which it isn't. Instead, look at the opposite: no 6 at all. Each roll misses with chance 5/6, and the rolls don't affect each other, so four misses in a row has chance (5/6)^4, about 0.482. Everything else has at least one 6, so the answer is 1 − 0.482 ≈ 0.518.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each situation with the rule that computes it.",
          pairs: [
            { left: "A and B, independent", right: "$P(A) \\times P(B)$" },
            { left: "A or B, can't both happen", right: "$P(A) + P(B)$" },
            { left: "A or B, might overlap", right: "$P(A) + P(B) - P(A \\text{ and } B)$" },
            { left: "Not A", right: "$1 - P(A)$" },
            { left: "At least one 6 in n rolls", right: "$1 - (5/6)^n$" },
          ],
          explain:
            "Multiply for independent 'and'; add for exclusive 'or'; subtract the overlap when 'or' events can both happen; take $1 - P$ for 'not'. 'At least one' is 'not none', and 'none' in $n$ independent rolls is $(5/6)^n$.",
        },
        {
          type: "input",
          phase: "apply",
          prompt:
            "A 17th-century gambler's bet: roll **two** dice **24 times**. What's the probability of at least one **double six**? Give it as a decimal to three places.",
          answers: ["0.491", "0.4914", "49.1%", "49.14%"],
          tolerance: 0.001,
          placeholder: "e.g. 0.123",
          hint: "First, from lesson 1: what's the chance of a double six on a single roll of two dice? Then use the complement.",
          explain:
            "A double six is 1 of 36 outcomes, so each roll misses with probability $\\frac{35}{36}$. Twenty-four independent misses: $\\left(\\frac{35}{36}\\right)^{24} \\approx 0.509$. So $P(\\text{at least one double six}) \\approx 1 - 0.509 = 0.491$, slightly **worse** than even.",
        },
        {
          type: "reveal",
          phase: "apply",
          prompt:
            "The Chevalier de Méré won steadily betting on at least one 6 in 4 rolls (0.518). He reasoned that 24 rolls for a double six should be just as good, since $\\frac{4}{6} = \\frac{24}{36}$. It lost him money. Where did his reasoning go wrong?",
          body:
            "He scaled the number of tries in proportion to the rarity, as if chances simply add up: $4 \\times \\frac{1}{6}$ and $24 \\times \\frac{1}{36}$ both equal $\\frac{2}{3}$. But adding double-counts overlapping successes, so neither bet is really $\\frac{2}{3}$: the true chances are $1 - (1 - p)^n$, which is 0.518 for one and 0.491 for the other.\n\nHis puzzle reached Blaise Pascal, and Pascal's 1654 letters with Pierre de Fermat helped found probability theory.",
        },
      ],
    },

    // ---------------------------------------------------------------- 3
    {
      id: "expected-value",
      title: "Expected Value & the Gambler's Fallacy",
      summary: "Price a bet by its long-run average, and see why dice have no memory.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Knowing the odds is only half of a decision; the other half is what's at stake. A 1-in-6 chance of winning is a great bet if the prize is huge and a bad one if it's small.\n\n**Expected value** combines chance and stakes into one number, so you can compare any bets, prices or risks. You'll also see why a streak never makes the next result 'due'.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Make a prediction. A tavern game: you pay **1 gold** to roll a die. Roll a 6 and the keeper hands you **5 gold**; roll anything else and you get nothing. Is it worth playing all night?",
          options: [
            "Yes: a win pays 5 times your stake",
            "No: on average you lose about 0.17 gold per game",
            "It's break-even: 5 gold × 1/6 is about 1 gold",
          ],
          answer: [1],
          hint: "Imagine playing 6 games. How much do you pay, and how much do you win on average?",
          explain:
            "Picture 6 games: you pay 6 gold and, on average, roll one 6 and collect 5 gold. That's 1 gold lost every 6 games, about 0.17 gold per game.\n\n$5 \\times \\frac{1}{6}$ is about 0.83 gold, not 1, so it isn't break-even. A big payout only makes a good bet if it's big enough to make up for how rarely it comes.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Expected value",
          body:
            "The **expected value** (EV) of a bet is its long-run average result per play. Weigh each outcome by its probability and add:\n\n$$E = x_1 p_1 + x_2 p_2 + \\dots$$\n\nIn the tavern game you net $+4$ gold (5 won minus 1 paid) with probability $\\frac{1}{6}$, and $-1$ gold with probability $\\frac{5}{6}$:\n\n$$E = 4 \\cdot \\tfrac{1}{6} - 1 \\cdot \\tfrac{5}{6} = -\\tfrac{1}{6} \\approx -0.17 \\text{ gold}$$\n\nYou'll never lose exactly 0.17 gold in one game. EV describes the average over many games.",
        },
        {
          type: "input",
          phase: "understand",
          figure: FIG_BALANCE,
          caption: "Put equal weights at 1, 2, 3, 4, 5 and 6: the expected value is where the beam balances.",
          prompt: "What's the expected value of a single roll of a fair six-sided die?",
          answers: ["3.5", "7/2", "21/6"],
          placeholder: "a number",
          hint: "Each face from 1 to 6 has probability 1/6. Weigh each value and add them up.",
          explain:
            "$\\frac{1 + 2 + 3 + 4 + 5 + 6}{6} = \\frac{21}{6} = 3.5$, exactly the balance point of the beam. You can never actually roll 3.5, but over many rolls your average will settle near it.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "A friend offers a bet: flip a fair coin. **Heads** you win 10 gold, **tails** you lose 6 gold. What's your expected value per flip, in gold?",
          answers: ["2", "+2", "2 gold"],
          placeholder: "gold per flip",
          hint: "Half the time you gain 10, half the time you lose 6.",
          explain:
            "$\\frac{1}{2} \\times 10 + \\frac{1}{2} \\times (-6) = 5 - 3 = 2$ gold per flip. You'll lose plenty of individual flips, but over 100 flips you'd expect to be about 200 gold ahead. Take the bet (if your friend's coin is fair).",
        },
        {
          type: "slider",
          phase: "understand",
          prompt:
            "Back to the tavern: you pay 1 gold per roll. How much should the keeper pay on a 6 to make the game **fair** (expected value 0)? Slide the payout.",
          min: 0,
          max: 12,
          step: 0.5,
          start: 2,
          label: "Payout on a 6",
          unit: "gold",
          plot: "x/6 - 1",
          xMin: 0,
          xMax: 12,
          readout: "v/6 - 1",
          readoutLabel: "EV per game (gold)",
          answer: 6,
          tolerance: 0.25,
          hint: "You collect the payout 1 time in 6, and always pay 1 gold. When does the average payout equal your stake?",
          explain:
            "The average payout is $\\frac{\\text{payout}}{6}$, and you pay 1 gold, so $E = \\frac{\\text{payout}}{6} - 1$, which is 0 when the payout is **6 gold**. A fair game pays in proportion to the odds. The keeper's 5 gold keeps $\\frac{1}{6}$ gold per game for the house.",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "European roulette has 37 pockets: 18 red, 18 black and one green 0. A 1-gold bet on **red** wins you 1 gold if red comes up; otherwise you lose your 1 gold. What's your expected value per bet, in gold? Give it to three decimal places.",
          answers: ["-0.027", "-1/37", "−0.027", "-2.7%"],
          tolerance: 0.0005,
          placeholder: "e.g. 0.123",
          hint: "Red wins in 18 of 37 pockets. The other 19 pockets, including the green 0, lose. The answer is negative.",
          explain:
            "$E = 1 \\cdot \\frac{18}{37} - 1 \\cdot \\frac{19}{37} = -\\frac{1}{37} \\approx -0.027$ gold. That single green pocket gives the casino an average of 2.7% of every bet: the **house edge**.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt:
            "Every roulette bet has an EV of about −0.027 gold per gold. Could a clever system, such as doubling your bet after every loss, turn that into a profit?",
          body:
            "No. The EV of a series of bets is the sum of their EVs, and adding negative numbers can't give a positive one.\n\nDoubling after losses (the *martingale*) changes the **shape** of your results: many small wins, then a rare, crushing loss when a long losing run hits your bankroll or the table limit. It doesn't change the **average**. Over many bets, the **law of large numbers** pulls your average result toward −2.7% of what you wager.",
        },
        {
          type: "choice",
          phase: "understand",
          figure: FIG_STREAK,
          prompt: "You've just flipped **4 heads in a row** with a fair coin. What's the probability that the next flip is heads too, completing a run of 5?",
          options: ["1/32, because five in a row is rare", "1/2", "Less than 1/2, because tails is due", "More than 1/2, because heads is on a streak"],
          answer: [1],
          hint: "Does the coin know what it did before?",
          explain:
            "$\\left(\\frac{1}{2}\\right)^5 = \\frac{1}{32}$ was the chance of the *whole* run before you started. Four of those flips have already happened (a $\\frac{1}{16}$ chance, now behind you), and only one flip is left: $\\frac{1}{2}$. Indeed $\\frac{1}{16} \\times \\frac{1}{2} = \\frac{1}{32}$.\n\nA fair coin has no memory, so it can't be 'due' for tails or 'hot' for heads.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The gambler's fallacy",
          body:
            "The **gambler's fallacy** is the belief that past results of an independent process change the next one, such as tails being 'due' after a run of heads.\n\nOn 18 August 1913 at the Monte Carlo casino, the ball landed on black 26 times in a row. Gamblers piled money onto red, sure the streak had to break. Each spin was still a fresh 18/37 chance of red, and many lost fortunes.\n\nWhy does 'it evens out' feel true? Over many flips the *proportion* of heads does approach 1/2, but by **dilution, not correction**. Five extra heads followed by 1,000 fair flips gives about 505 heads in 1,005, or 50.2%. The surplus is never paid back; it just stops mattering.",
        },
        {
          type: "explore",
          phase: "understand",
          title: "Dilution, not correction",
          body:
            "Start with some **extra heads**, then keep flipping a fair coin (half heads on average). The graph shows the overall share of heads after $x$ more flips. Slide the surplus up and down: the share always sinks toward 0.5 but never dips below it. Tails never 'catches up'; the surplus just gets swamped.",
          min: 0,
          max: 20,
          step: 1,
          start: 5,
          label: "Extra heads at the start",
          plot: "(v + x/2)/(v + x)",
          xMin: 1,
          xMax: 1000,
          readout: "(v + 500)/(v + 1000)",
          readoutLabel: "Share of heads after 1,000 more flips",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these thoughts are examples of the gambler's fallacy? Select all that apply.",
          options: [
            "'I've lost ten hands in a row, so I'm due a win.'",
            "'This die has rolled a 6 on 40 of the last 60 rolls. Maybe it's loaded.'",
            "'The last three babies born here were boys, so the next is more likely a girl.'",
            "'Number 17 hasn't come up in the lottery for months, so it's overdue.'",
            "'Each spin has an 18/37 chance of red, no matter what came before.'",
          ],
          answer: [0, 2, 3],
          hint: "The fallacy assumes the process is fair but expects it to 'balance out'. Which thoughts do that?",
          explain:
            "'Due a win', 'more likely a girl' and 'overdue' all expect independent events to compensate for the past. They don't.\n\nThe loaded-die thought is different: a fair die would give about 10 sixes in 60 rolls, so 40 is overwhelming evidence the die **isn't** fair. Doubting the die is reasonable; expecting a fair die to make up for a streak is the fallacy. The roulette statement is simply correct.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain to a friend what expected value tells you, and why 'tails is due' after a run of heads is wrong.",
          keyPoints: [
            "EV = each outcome times its probability, all added up",
            "EV is the long-run average per play, not what happens in one game",
            "Independent flips have no memory: after any streak, heads is still 1/2",
            "Averages even out by dilution: a surplus gets swamped by later results, never paid back",
          ],
          model:
            "Expected value is what a bet is worth on average: multiply each result by its chance and add them up. You won't get exactly that in one game, but over many games your average settles near it, so a negative EV means you lose in the long run. A coin doesn't remember its past flips, so after five heads the next flip is still 50/50. Streaks do even out in proportion, but only because thousands of later flips swamp them, not because tails starts coming up more often.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each idea with its meaning.",
          pairs: [
            { left: "Expected value", right: "The long-run average result per play" },
            { left: "Independent events", right: "One outcome doesn't change the other's chances" },
            { left: "Gambler's fallacy", right: "Believing a result is 'due' after a streak" },
            { left: "Law of large numbers", right: "Over many trials, the average settles near the expected value" },
            { left: "House edge", right: "The casino's average profit per unit bet" },
          ],
          explain:
            "EV is the long-run average per play; independence means no influence between outcomes; the gambler's fallacy expects compensation that never comes; the law of large numbers is why averages settle (by dilution); the house edge is the casino's EV, 1/37 of every bet in European roulette.",
        },
        {
          type: "order",
          phase: "apply",
          prompt: "Final challenge: put these bets in order from **best** to **worst** expected value for you.",
          items: [
            "Flip a coin: win 5 gold on heads, lose 2 gold on tails",
            "Roll a die: win 12 gold on a 6, lose 2 gold on anything else",
            "Bet 1 gold at even money that at least one 6 shows in 4 rolls of a die",
            "Bet 1 gold on red in European roulette",
            "Pay 1 gold to roll a die; collect 5 gold on a 6",
          ],
          hint: "Compute each EV: weigh every outcome by its probability and add. For the 4-roll bet, you need P(at least one 6) from the last lesson.",
          explain:
            "- Coin, +5/−2: $\\frac{5}{2} - \\frac{2}{2} = +1.5$ gold\n- Die, +12/−2: $\\frac{12}{6} - \\frac{10}{6} \\approx +0.33$ gold\n- At least one 6 in 4 rolls: you win with probability 0.518, so $0.518 - 0.482 \\approx +0.04$ gold\n- Roulette red: $-\\frac{1}{37} \\approx -0.03$ gold\n- Tavern game: $-\\frac{1}{6} \\approx -0.17$ gold",
        },
      ],
    },
  ],
};

export default course;

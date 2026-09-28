import type { LibraryCourse } from "./types.ts";

// ---- figures (inline SVG, currentColor + a few accent colors so they read in light and dark mode) ----

const HYPNOGRAM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 192" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Hypnogram of an eight-hour night">
<g text-anchor="end"><text x="52" y="35">Awake</text><text x="52" y="65" fill="#8b5cf6">REM</text><text x="52" y="95">N1</text><text x="52" y="125">N2</text><text x="52" y="155" fill="#3b82f6">N3</text></g>
<path d="M60 165H348" stroke="currentColor" stroke-opacity="0.3"/>
<path d="M60 30V90H63V120H72V150H99V120H108V60H114V120H126V150H147V120H159V60H168V120H195V150H204V120H216V60H228V90H231V120H264V60H282V90H285V120H321V60H342V30H348" fill="none" stroke="currentColor" stroke-width="1.5"/>
<path d="M108 60H114M159 60H168M216 60H228M264 60H282M321 60H342" stroke="#8b5cf6" stroke-width="7"/>
<path d="M72 150H99M126 150H147M195 150H204" stroke="#3b82f6" stroke-width="7"/>
<g text-anchor="middle"><text x="60" y="184">0h</text><text x="132" y="184">2h</text><text x="204" y="184">4h</text><text x="276" y="184">6h</text><text x="348" y="184">8h</text></g>
</svg>`;

const NAP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 165" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="How deep sleep gets during a 70-minute nap">
<g text-anchor="end"><text x="52" y="35">Awake</text><text x="52" y="65">N1</text><text x="52" y="95">N2</text><text x="52" y="125" fill="#3b82f6">N3</text></g>
<path d="M60 135H340" stroke="currentColor" stroke-opacity="0.3"/>
<path d="M60 30V60H80V90H160V120H340" fill="none" stroke="currentColor" stroke-width="2"/>
<path d="M160 120H340" stroke="#3b82f6" stroke-width="7"/>
<path d="M140 96V135M300 126V135" stroke="currentColor" stroke-dasharray="3 3" stroke-opacity="0.6"/>
<circle cx="140" cy="90" r="6" fill="#10b981"/><circle cx="300" cy="120" r="6" fill="#f59e0b"/>
<g text-anchor="middle"><text x="60" y="155">0</text><text x="140" y="155">20 min</text><text x="300" y="155">60 min</text></g>
</svg>`;

const TWO_PROCESS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 192" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Sleep pressure and the body clock's wake signal across a day">
<rect x="230" y="50" width="100" height="112" fill="currentColor" fill-opacity="0.08"/>
<text x="280" y="70" text-anchor="middle" fill-opacity="0.7">asleep</text>
<path d="M30 162H330" stroke="currentColor" stroke-opacity="0.3"/>
<polyline points="30 145 42.5 137.7 55 130.8 67.5 124.3 80 118.1 92.5 112.3 105 106.7 117.5 101.5 130 96.6 142.5 91.9 155 87.5 167.5 83.3 180 79.3 192.5 75.6 205 72 217.5 68.7 230 65.5 242.5 85.5 255 101.3 267.5 113.7 280 123.5 292.5 131.3 305 137.4 317.5 142.2 330 145.9" fill="none" stroke="#f59e0b" stroke-width="3"/>
<polyline points="30 131.5 42.5 124.3 55 115 67.5 104.1 80 92.5 92.5 80.9 105 70 117.5 60.7 130 53.5 142.5 49 155 47.5 167.5 49 180 53.5 192.5 60.7 205 70 217.5 80.9 230 92.5 242.5 104.1 255 115 267.5 124.3 280 131.5 292.5 136 305 137.5 317.5 136 330 131.5" fill="none" stroke="#8b5cf6" stroke-width="3"/>
<path d="M10 12H28" stroke="#f59e0b" stroke-width="3"/><text x="34" y="17">Sleep pressure (adenosine)</text>
<path d="M10 32H28" stroke="#8b5cf6" stroke-width="3"/><text x="34" y="37">Body clock's wake signal</text>
<g text-anchor="middle"><text x="30" y="182">7am</text><text x="130" y="182">3pm</text><text x="230" y="182">11pm</text><text x="330" y="182">7am</text></g>
</svg>`;

const RECEPTOR = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 160" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Caffeine sitting in an adenosine receptor so adenosine can't bind">
<g text-anchor="middle">
<text x="90" y="22">No caffeine</text><text x="270" y="22">With caffeine</text>
<path d="M50 78V118H130V78" fill="none" stroke="currentColor" stroke-width="3"/>
<circle cx="90" cy="100" r="16" fill="#f59e0b"/><text x="90" y="105" fill="#fff" font-weight="bold">A</text>
<path d="M230 78V118H310V78" fill="none" stroke="currentColor" stroke-width="3"/>
<rect x="254" y="84" width="32" height="32" rx="4" fill="#14b8a6"/><text x="270" y="105" fill="#fff" font-weight="bold">C</text>
<circle cx="318" cy="50" r="14" fill="#f59e0b"/><text x="318" y="55" fill="#fff" font-weight="bold">A</text>
<text x="90" y="145">adenosine fits: sleepy</text><text x="270" y="145">caffeine blocks it: alert</text>
</g>
</svg>`;

const WAKE_WEEK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 190" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Wake-up time for each day of the week">
<path d="M52 25H352M52 75H352M52 125H352" stroke="currentColor" stroke-opacity="0.15"/>
<g text-anchor="end"><text x="46" y="30">6:00</text><text x="46" y="80">8:00</text><text x="46" y="130">10:00</text></g>
<polyline points="80 50 124 50 168 50 212 50 256 50 300 137.5 344 137.5" fill="none" stroke="currentColor" stroke-opacity="0.5" stroke-width="2"/>
<g fill="#3b82f6"><circle cx="80" cy="50" r="6"/><circle cx="124" cy="50" r="6"/><circle cx="168" cy="50" r="6"/><circle cx="212" cy="50" r="6"/><circle cx="256" cy="50" r="6"/></g>
<g fill="#f59e0b"><circle cx="300" cy="137.5" r="6"/><circle cx="344" cy="137.5" r="6"/></g>
<g text-anchor="middle"><text x="168" y="40" fill="#3b82f6">7:00</text><text x="322" y="162" fill="#f59e0b">10:30</text>
<text x="80" y="184">Mon</text><text x="124" y="184">Tue</text><text x="168" y="184">Wed</text><text x="212" y="184">Thu</text><text x="256" y="184">Fri</text><text x="300" y="184">Sat</text><text x="344" y="184">Sun</text></g>
</svg>`;

const BODY_TEMP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 182" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Core body temperature over 24 hours, lowest in the early morning">
<rect x="167.5" y="40" width="100" height="112" fill="currentColor" fill-opacity="0.08"/>
<text x="217.5" y="60" text-anchor="middle" fill-opacity="0.7">asleep</text>
<path d="M30 152H330" stroke="currentColor" stroke-opacity="0.3"/>
<polyline points="30 84.6 42.5 75 55 66.7 67.5 60.4 80 56.4 92.5 55 105 56.4 117.5 60.4 130 66.7 142.5 75 155 84.6 167.5 95 180 105.4 192.5 115 205 123.3 217.5 129.6 230 133.6 242.5 135 255 133.6 267.5 129.6 280 123.3 292.5 115 305 105.4 317.5 95 330 84.6" fill="none" stroke="#ef4444" stroke-width="3"/>
<path d="M10 16H28" stroke="#ef4444" stroke-width="3"/><text x="34" y="21">Core body temperature</text>
<g text-anchor="middle"><text x="30" y="172">noon</text><text x="105" y="172">6pm</text><text x="180" y="172">midnight</text><text x="255" y="172">6am</text><text x="330" y="172">noon</text></g>
</svg>`;

const course: LibraryCourse = {
  id: "sleep-science",
  title: "The Science of Sleep",
  icon: "🌙",
  blurb:
    "What actually happens while you sleep, how your body clock and sleep pressure decide when you feel tired, and how to build nights that leave you rested.",
  ability: "con",
  skill: { name: "Vitality", icon: "😴" },
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "stages",
      title: "A Night in Stages",
      summary: "Tour the stages of sleep and the roughly 90-minute cycles that repeat through the night.",
      steps: [
        {
          type: "choice",
          phase: "preview",
          prompt:
            "By the end of this lesson you'll be able to map out a night of sleep and plan around it. First, a guess: what is your brain doing while you sleep?",
          options: [
            "Mostly switching off, like a computer on standby",
            "Holding one steady, quiet state from lights-out until morning",
            "Cycling through distinct stages, some almost as active as when you're awake",
          ],
          answer: [2],
          hint: "Think about dreaming. Does that sound like a brain that's switched off?",
          explain:
            "Sleep isn't one state. Through the night you cycle through several stages, and in one of them (REM) your brain activity looks strikingly similar to being awake. Sleep is an active process, not the brain powering down.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Two kinds of sleep",
          body:
            "Sleep comes in two kinds:\n\n- **NREM** (non-rapid eye movement) sleep, in three stages that get progressively deeper: **N1**, **N2** and **N3**.\n- **REM** (rapid eye movement) sleep: your eyes dart around, the most vivid dreams happen, and most of your muscles are temporarily paralyzed so you don't act those dreams out.\n\nYou move through these stages in a **cycle of about 90 minutes** (roughly 70 to 120), and repeat it four to six times a night.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each stage to what it's like.",
          pairs: [
            { left: "N1", right: "Drifting off: a few minutes of very light sleep, easy to wake from" },
            { left: "N2", right: "Light but true sleep: the biggest share of the night, about half" },
            { left: "N3", right: "Deep, slow-wave sleep: the hardest stage to wake from" },
            { left: "REM", right: "Vivid dreams, with most muscles temporarily paralyzed" },
          ],
          hint: "The N-numbers get deeper as they go up. Story-like dreams belong to the stage named after your eyes.",
          explain:
            "N1 is the doorway into sleep and lasts only minutes. N2 is where you spend the most time, roughly half the night. N3, deep or slow-wave sleep, is dominated by big, slow brain waves and is the hardest to wake from. REM is when your brain is busy dreaming while your body is held still.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "You've just fallen asleep. Put the stages in the order you first reach them.",
          items: ["N1", "N2", "N3", "REM"],
          hint: "You go down through the NREM stages before your first dream.",
          explain:
            "You descend through N1 and N2 into deep N3, then usually drift back up through N2 into a first, short REM period, typically around 90 minutes after falling asleep. Then the next cycle begins.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "If one cycle takes about 90 minutes, how many full cycles fit into 6 hours of sleep?",
          answers: ["4", "four"],
          placeholder: "cycles",
          hint: "6 hours is 360 minutes.",
          explain:
            "360 ÷ 90 = **4** cycles. Real cycles vary from person to person and through the night, so treat 90 minutes as a handy average, not a stopwatch.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The night is front-loaded",
          figure: HYPNOGRAM,
          caption: "A typical night. Deep N3 sleep (blue) comes mostly in the first cycles; REM periods (purple) grow longer toward morning.",
          body:
            "The cycles aren't identical. **Early cycles are rich in deep N3 sleep**, which supports physical recovery and is when much of your growth hormone is released. As the night goes on, deep sleep shrinks and **REM periods get longer**, so most of your REM comes in the last few hours before you wake.\n\nThe first and second halves of the night do different jobs, and you need both.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which stage is concentrated in the *first* few hours of the night?",
          options: ["N1", "N3 (deep sleep)", "REM"],
          answer: [1],
          hint: "Think back to the chart: where did the blue bars sit?",
          explain:
            "Deep N3 sleep is front-loaded: the first one or two cycles hold most of it. REM is the opposite, growing longer toward morning. N1 is only a brief transition whenever you drift off.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are true of REM sleep? Select all that apply.",
          options: [
            "Brain activity looks a lot like being awake",
            "Most of your muscles are temporarily paralyzed",
            "It's when the most vivid, story-like dreams happen",
            "It has the slowest, deepest brain waves of the night",
            "It takes up most of the night",
          ],
          answer: [0, 1, 2],
          hint: "Two of these describe other stages: one describes N3 and one describes N2.",
          explain:
            "REM brain activity resembles wakefulness, your muscles are held still, and it's home to the most vivid dreams. The slowest brain waves belong to **N3**, and the biggest share of the night belongs to **N2**. REM is only about a fifth to a quarter of the night.",
        },
        {
          type: "reveal",
          phase: "understand",
          figure: NAP,
          caption: "A typical nap: light sleep first, then deep sleep from roughly 20–30 minutes in.",
          prompt: "Why might you wake from a 60-minute nap feeling worse than from a 20-minute one?",
          body:
            "After an hour you've probably sunk into **deep N3 sleep**, and being woken from deep sleep causes **sleep inertia**: that heavy, groggy, confused feeling that can take a while to clear. A 20-minute nap usually stays in lighter N1 and N2, so you wake up more easily. That's why short power naps are popular.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain to a friend what happens during a night of sleep, as if they'd never heard of sleep stages.",
          keyPoints: [
            "Sleep has distinct stages: light N1 and N2, deep N3, and REM",
            "The stages repeat in cycles of about 90 minutes, four to six times a night",
            "Deep N3 sleep is packed into the first half of the night",
            "REM (vivid dreams, body held still) grows longer toward morning",
            "So a short night mostly costs you REM",
          ],
          model:
            "Sleep isn't one state. You drift from light sleep (N1, N2) into deep sleep (N3), then into REM, where your brain is almost as active as when you're awake and you have vivid dreams while your body stays still. That loop takes about 90 minutes and repeats four to six times. The early loops are heavy on deep sleep and the later ones on REM, so if you cut your night short, you mostly lose REM.",
        },
        {
          type: "input",
          phase: "recall",
          prompt: "From memory: about how long is one sleep cycle, in minutes?",
          answers: ["90", "ninety"],
          tolerance: 10,
          placeholder: "minutes",
          explain:
            "About **90 minutes** on average, though a cycle can run anywhere from roughly 70 to 120 minutes and varies across the night.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "From memory: which stage takes up the biggest share of a typical night?",
          options: ["N1", "N2", "N3", "REM"],
          answer: [1],
          explain:
            "**N2**, at around half the night. Deep N3 and REM each take roughly a fifth to a quarter, and N1 only a few percent. It's easy to guess REM or deep sleep because they get the most attention.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "You normally sleep 11 p.m. to 7 a.m., but an early flight means your alarm goes off at 5 a.m. Which stage do you lose the most of?",
          options: ["N3 deep sleep", "REM sleep", "Both equally", "Neither, since the first hours are the important ones"],
          answer: [1],
          hint: "Which stage is packed into the last hours of the night?",
          explain:
            "Cutting the *end* of the night mostly costs REM, because the longest REM periods come in those final cycles. Losing a quarter of your sleep time can mean losing a much bigger share of your REM. Deep sleep, packed into the early cycles, is largely protected.",
        },
        {
          type: "input",
          phase: "apply",
          prompt:
            "Ana must be up at 6:30 a.m. and wants about 5 full cycles of sleep. Using 90-minute cycles, what's the latest time she should be asleep?",
          answers: ["11:00", "11", "11 pm", "11pm", "11:00 pm", "11:00pm", "23:00", "23", "eleven"],
          placeholder: "e.g. 10:15 pm",
          hint: "5 × 90 minutes = 7½ hours. Count back from 6:30.",
          explain:
            "5 × 90 = 450 minutes = 7.5 hours. Counting back 7.5 hours from 6:30 a.m. gives **11:00 p.m.**, so she should get into bed a little earlier to allow time to fall asleep. Cycle lengths vary, so treat this as a rough target: a consistent schedule matters more than hitting a cycle exactly.",
        },
      ],
    },

    // ------------------------------------------------------------------------------------------
    {
      id: "body-clock",
      title: "Your Body Clock",
      summary: "See how your circadian rhythm and sleep pressure decide when you feel sleepy, and how light, caffeine and alcohol push them around.",
      steps: [
        {
          type: "choice",
          phase: "preview",
          prompt:
            "By the end of this lesson you'll know why you feel sleepy when you do, and how to time caffeine so it doesn't steal your sleep. First, a puzzle: you stay up all night. Around 4 a.m. you feel awful, yet by 9 a.m. you feel a bit more alert, despite being awake even longer. Why?",
          options: [
            "Being awake longer slowly clears your tiredness",
            "Your body clock started sending its daytime “wake up” signal",
            "Staying up all night resets your body clock to a new time zone",
          ],
          answer: [1],
          hint: "There's more than one system deciding how sleepy you feel.",
          explain:
            "Two systems set your sleepiness. **Sleep pressure** keeps building the longer you're awake, so it was higher at 9 a.m. than at 4 a.m. But your **body clock** pushes alertness up in the morning whether or not you slept: the “second wind”. The pressure hasn't gone anywhere, though; it catches up with you later.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Two systems",
          figure: TWO_PROCESS,
          caption: "Sleep pressure (orange) builds all day and drains overnight. The body clock's wake signal (purple) rises through the day and falls at night. You fall asleep easily when pressure is high and the wake signal is dropping.",
          body:
            "**Sleep pressure** works like an hourglass. While you're awake, a chemical called **adenosine** builds up in your brain, and the more there is, the sleepier you feel. Sleep clears it.\n\nYour **circadian rhythm** is a roughly 24-hour clock run by a tiny brain region, the **suprachiasmatic nucleus**. It times your alertness, body temperature and hormones such as **melatonin**, which rises in the evening as it gets dark and tells your body it's night.\n\nYou sleep best when the two line up: plenty of sleep pressure *and* a clock that says “night”.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each term to what it does.",
          pairs: [
            { left: "Adenosine", right: "Builds up while you're awake, creating sleep pressure" },
            { left: "Circadian rhythm", right: "A roughly 24-hour cycle of alertness, temperature and hormones" },
            { left: "Melatonin", right: "A hormone that rises in the evening darkness to signal night" },
            { left: "Suprachiasmatic nucleus", right: "The brain's master clock, set largely by light" },
          ],
          hint: "One is a place in the brain, one is a hormone, and one is a chemical that accumulates.",
          explain:
            "Adenosine drives sleep pressure; the circadian rhythm is the daily cycle; melatonin is its night-time signal; and the suprachiasmatic nucleus, sitting just above where the optic nerves cross, is the master clock that keeps it all in time.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "What resets your master clock most powerfully each day?",
          options: ["Light reaching your eyes", "What you eat for dinner", "How warm your bedroom is", "Whether you exercise"],
          answer: [0],
          hint: "The master clock sits right next to the optic nerves.",
          explain:
            "Light is the clock's strongest cue. Meal and exercise timing nudge your body's rhythms too, but far less than light. **Morning light** shifts your clock earlier, helping you feel sleepy at a sensible time; **bright light late at night** shifts it later and holds back melatonin.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these tend to push your body clock *later*, making it harder to fall asleep at your usual time? Select all that apply.",
          options: [
            "Bright screens and lights late in the evening",
            "Getting outdoor light soon after you wake",
            "Sleeping in until noon on weekends",
            "Dimming the lights an hour before bed",
          ],
          answer: [0, 2],
          hint: "Light in the evening and light in the morning push the clock in opposite directions.",
          explain:
            "Evening light delays your clock and suppresses melatonin. Sleeping in until noon means you miss morning light and get your light later in the day, which drags your clock later too, and that's why Sunday night gets hard. Morning light and dim evenings do the opposite: they keep your clock anchored earlier.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "For someone who wakes around 7 a.m., put these daily body-clock landmarks in order, starting in the morning.",
          items: [
            "Alertness climbs after you wake",
            "An early-afternoon dip in alertness",
            "Melatonin starts rising as evening darkness falls",
            "Core body temperature hits its lowest point in the small hours",
          ],
          hint: "The low point of the whole cycle comes a couple of hours before you'd normally wake.",
          explain:
            "Your clock lifts alertness in the morning, dips a little in the early afternoon (the post-lunch slump isn't only about lunch), starts releasing melatonin in the evening, a couple of hours before your usual bedtime, and bottoms out around 4–5 a.m., when body temperature is lowest and staying awake is hardest.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Caffeine: borrowed alertness",
          figure: RECEPTOR,
          caption: "Caffeine (C) sits in the receptors adenosine (A) normally uses, so the sleepy signal can't get through.",
          body:
            "Caffeine works by **blocking adenosine receptors**. It doesn't remove adenosine; it just stops you feeling it for a while.\n\nYour body clears caffeine slowly. Its **half-life is roughly 5 hours on average**: about 5 hours after a coffee, half of the caffeine is still in your system. That varies a lot between people, from roughly 2 to 10 hours, depending on genetics, pregnancy, smoking and some medications.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "You drink a large coffee with 200 mg of caffeine at 2 p.m. With a 5-hour half-life, about how much is still in your system at 7 p.m.?",
          answers: ["100", "100 mg", "100mg"],
          placeholder: "mg",
          hint: "How many half-lives fit between 2 p.m. and 7 p.m.?",
          explain:
            "Five hours is one half-life, so half remains: 200 → **100 mg**. That's about as much as a regular cup of coffee, still working at dinner time.",
        },
        {
          type: "explore",
          phase: "understand",
          title: "Watch it fade",
          body:
            "The graph shows how much caffeine is left *x* hours after you drink it, with a 5-hour half-life. Drag the dose. Notice the shape: it never drops off a cliff, it just keeps halving, so a big afternoon dose is still around at bedtime.",
          min: 0,
          max: 400,
          step: 10,
          start: 200,
          label: "Caffeine",
          unit: "mg",
          plot: "v*0.5^(x/5)",
          xMin: 0,
          xMax: 24,
          readout: "v*0.5^(6/5)",
          readoutLabel: "Left after 6 hours (mg)",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "A nightcap can help you fall asleep faster. What does alcohol do to the rest of the night?",
          options: [
            "Nothing: once you're asleep, sleep is sleep",
            "Suppresses REM and makes sleep more broken in the second half of the night",
            "Boosts both deep and REM sleep all night long",
          ],
          answer: [1],
          hint: "Think about what happens as your body processes the alcohol through the night.",
          explain:
            "Alcohol is a sedative, so it can shorten the time it takes to drop off. But it suppresses REM sleep, and as your body metabolizes it, sleep in the second half of the night becomes lighter and more fragmented, with more awakenings. Sedation isn't the same as good sleep.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "A friend says: “I had a coffee at 5 p.m., but I've been up since 7 a.m., so I should be exhausted by 11. Why am I wide awake?” Explain it to them in your own words.",
          keyPoints: [
            "Sleep pressure comes from adenosine building up while you're awake",
            "Caffeine blocks adenosine receptors, so you don't feel that pressure",
            "Caffeine's half-life is about 5 hours, so about half the 5 p.m. dose is still active at 10 p.m.",
            "Your body clock, set mainly by light, also has to signal “night” before you feel sleepy",
          ],
          model:
            "You are building up sleep pressure: a chemical called adenosine accumulates the longer you're awake. But caffeine blocks the receptors adenosine acts on, so you don't feel it. Caffeine only halves about every 5 hours, so roughly half of your 5 p.m. coffee is still working at 10 p.m. On top of that, your body clock, set mostly by light, has to say “night” too, and bright screens late in the evening push it later.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "From memory: what does caffeine actually do to adenosine?",
          options: [
            "Blocks its receptors, so you don't feel the sleep pressure it creates",
            "Destroys it, so your sleep pressure resets to zero",
            "Turns it into melatonin",
          ],
          answer: [0],
          explain:
            "Caffeine only **masks** sleep pressure by blocking adenosine's receptors. The adenosine keeps building, so when the caffeine wears off, all that pressure hits at once: the familiar caffeine crash.",
        },
        {
          type: "input",
          phase: "recall",
          prompt: "From memory: roughly what is caffeine's average half-life, in hours?",
          answers: ["5", "five"],
          tolerance: 1,
          placeholder: "hours",
          explain:
            "About **5 hours** on average, but it ranges from roughly 2 to 10 hours from person to person. If a mid-afternoon coffee keeps you up, you may simply clear it slowly.",
        },
        {
          type: "slider",
          phase: "apply",
          prompt:
            "Plan tonight's caffeine cut-off. You'll be in bed at 11 p.m. and want a 200 mg coffee to be down to about 50 mg by then. How many hours before bed should you drink it?",
          min: 0,
          max: 16,
          step: 1,
          start: 3,
          label: "Hours before bed",
          unit: "h",
          readout: "200*0.5^(v/5)",
          readoutLabel: "Left at bedtime (mg)",
          answer: 10,
          tolerance: 0.5,
          hint: "Each half-life halves it: 200 → 100 → 50.",
          explain:
            "Two half-lives, 200 → 100 → 50 mg, take about **10 hours**, so for an 11 p.m. bedtime your cut-off is around **1 p.m.** If caffeine hits you hard, you may clear it slowly, so make it earlier still.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "Jordan has a large coffee at 4 p.m., two glasses of wine at 10 p.m. to “balance it out”, then scrolls a bright phone in bed. Which of these are working against Jordan's sleep? Select all that apply.",
          options: ["The 4 p.m. coffee", "The wine", "The bright phone in bed", "The walk to work in morning sunlight"],
          answer: [0, 1, 2],
          hint: "Check each against caffeine's half-life, alcohol's effect on the second half of the night, and evening light.",
          explain:
            "With a ~5-hour half-life, half of the 4 p.m. coffee is still active at 9 p.m. The wine doesn't cancel it out; it adds REM suppression and broken sleep later on. The bright phone delays the clock and holds back melatonin. The morning sunlight is the one thing *helping*: it anchors Jordan's clock.",
        },
      ],
    },

    // ------------------------------------------------------------------------------------------
    {
      id: "better-night",
      title: "Building a Better Night",
      summary: "Turn the science into habits: a steady wake time, a wind-down, a sleep-friendly bedroom, and what to do when sleep won't come.",
      steps: [
        {
          type: "choice",
          phase: "preview",
          prompt:
            "By the end of this lesson you'll have a plan for tonight. First, a guess: if you could change just one habit to steady your body clock, which would sleep experts pick first?",
          options: [
            "Going to bed at exactly the same minute every night",
            "Getting up at the same time every day, weekends included",
            "Sleeping in on weekends to catch up",
            "A long nap after lunch every day",
          ],
          answer: [1],
          hint: "Which of these can you actually control? You can't force yourself to fall asleep.",
          explain:
            "A **consistent wake time** is the anchor. You can't make yourself fall asleep on command, but you can get up at the same time. That fixes when you get morning light and how long you've been awake by bedtime, so sleep pressure and your body clock line up night after night. Bedtime then tends to settle on its own.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Anchor the morning",
          body:
            "Pick a wake time you can keep **seven days a week**, give or take about an hour, and get some daylight soon after you're up, ideally outdoors.\n\nBig weekend lie-ins cause **social jet lag**: your clock drifts later, as if you'd flown to another time zone for the weekend and back again on Monday.\n\nIf you nap, keep it short (about 20–30 minutes) and before mid-afternoon, so you don't spend the sleep pressure you need at night.",
        },
        {
          type: "input",
          phase: "understand",
          figure: WAKE_WEEK,
          caption: "One person's wake-up times across a week.",
          prompt: "Look at the chart. How many hours later does this person get up on weekends than on weekdays?",
          answers: ["3.5", "3.5 hours", "3.5h", "3:30", "three and a half"],
          placeholder: "hours",
          hint: "Count from the weekday time to the weekend time.",
          explain:
            "From 7:00 to 10:30 is **3.5 hours**, like crossing three or four time zones every weekend. Bringing weekend wake-ups within about an hour of the weekday alarm makes Sunday nights and Monday mornings much easier.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Wind down, cool down",
          body:
            "Your brain has no off switch, so give it a ramp. For the last **30–60 minutes** before bed, dim the lights, put work and scrolling away, and do something calm: reading, gentle stretching, a warm shower. (A warm shower or bath an hour or two before bed can actually help, because afterwards your body sheds heat.)\n\nThen make the bedroom a place built for sleep: **cool, dark and quiet**.",
        },
        {
          type: "slider",
          phase: "understand",
          figure: BODY_TEMP,
          caption: "Your core temperature falls through the evening and night, reaching its low point a couple of hours before you usually wake.",
          prompt: "Set the bedroom thermostat to a temperature most people sleep well at.",
          min: 10,
          max: 30,
          step: 0.5,
          start: 24,
          label: "Bedroom",
          unit: "°C",
          readout: "v*9/5+32",
          readoutLabel: "In °F",
          answer: 17.5,
          tolerance: 1.5,
          hint: "Cooler than a typical daytime living room, but not cold.",
          explain:
            "Most people sleep best in a cool room, around **16–19 °C (60–67 °F)**. Falling asleep goes hand in hand with a drop in core body temperature, and a cool room helps your body shed heat. Too hot or too cold both make you wake more, and bedding matters too, so treat this as a starting range.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each part of the bedroom to what helps.",
          pairs: [
            { left: "Temperature", right: "Cool: around 16–19 °C (60–67 °F)" },
            { left: "Light", right: "Dark: blackout curtains or an eye mask" },
            { left: "Noise", right: "Quiet, or a steady masking sound like a fan, or earplugs" },
            { left: "Your bed", right: "Kept for sleep (and sex), not work or scrolling" },
          ],
          hint: "Each right-hand side describes the ideal for one item.",
          explain:
            "A cool room helps your body temperature drop; darkness protects melatonin; quiet (or steady, predictable sound) keeps noises from pulling you out of light sleep; and keeping the bed for sleep teaches your brain that bed means sleep, not alertness.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "It's 2 a.m. and you've been lying awake for what feels like ages. Which of these are good moves? Select all that apply.",
          options: [
            "Get up, go somewhere dim, and do something calm until you feel sleepy",
            "Turn the clock away so you stop checking the time",
            "Scroll your phone in bed until you get tired",
            "Have a drink to knock yourself out",
            "Remind yourself one rough night is manageable, and still get up at your usual time",
          ],
          answer: [0, 1, 4],
          hint: "Think back: what does bright light do at night, and what does alcohol do to the later hours of sleep?",
          explain:
            "Lying in bed frustrated teaches your brain that bed means being awake. Getting up for a while, not watching the clock, and keeping tomorrow's wake time (rather than sleeping in) all help you sleep the next night. Scrolling in bed adds bright light and stimulation, and alcohol fragments the rest of the night.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put this “can't sleep” routine in order.",
          items: [
            "Lie awake for what feels like about 20 minutes, without clock-watching",
            "Get up and go to another dimly lit room",
            "Do something calm and a bit boring, like reading a paper book",
            "Go back to bed once you feel sleepy",
            "Get up at your usual time in the morning, however the night went",
          ],
          hint: "It ends the next morning.",
          explain:
            "This technique is called **stimulus control**. By only being in bed when you're sleepy, you rebuild the link between bed and sleep, and by keeping your wake time you make sure tomorrow night starts with plenty of sleep pressure. Repeat the loop if you need to.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "Why might a sleep specialist tell someone with insomnia to spend *less* time in bed?",
          body:
            "Hours spent lying awake teach the brain that bed is a place for worrying and tossing. Going to bed only when truly sleepy, and keeping a fixed wake time, builds up sleep pressure, so time in bed turns into more solid, less broken sleep and the bed–sleep link recovers. A structured version of this is part of **CBT-I** (cognitive behavioral therapy for insomnia), the recommended first treatment for chronic insomnia, and it's best done with a clinician's guidance.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "When to get help",
          body:
            "This course is general wellness education, not medical advice. Good habits help most people, but they can't fix everything.\n\nSee a doctor if poor sleep lasts for weeks and affects your days, if someone notices you **snore loudly, gasp or stop breathing** in your sleep, if you're **very sleepy during the day** despite enough time in bed, or if an urge to move your legs keeps you awake. These can be signs of treatable conditions such as sleep apnea or restless legs syndrome.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "A friend sleeps badly and asks what to change first. Explain the three or four changes that would help most, and why they work.",
          keyPoints: [
            "Keep the same wake time every day, weekends included, to anchor the body clock",
            "Wind down for 30–60 minutes with dim light and no work or scrolling",
            "Make the bedroom cool, dark and quiet",
            "If you can't sleep, get up and do something calm until sleepy, so bed stays linked with sleep",
            "See a doctor if problems last for weeks",
          ],
          model:
            "Start with a fixed wake time, even on weekends: it anchors your body clock and builds steady sleep pressure by bedtime. Give yourself 30–60 minutes of dim, calm wind-down time without work or scrolling. Keep the bedroom cool, dark and quiet. And if you're lying awake, get up and do something calm in dim light, and only go back to bed when you're sleepy, so your brain keeps linking bed with sleep. If it's still bad after a few weeks, see a doctor.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "From memory: why can lying awake in bed for hours make sleep problems worse?",
          options: [
            "It teaches your brain to link bed with being awake",
            "It uses up your melatonin for the week",
            "It cools your body down too much",
          ],
          answer: [0],
          explain:
            "Your brain learns associations. Hours of tossing and worrying in bed train it to link bed with being awake and frustrated. Getting up when you can't sleep, and returning when sleepy, retrains the link. Melatonin isn't “used up”, and a slight drop in body temperature actually helps sleep.",
        },
        {
          type: "input",
          phase: "apply",
          prompt:
            "Plan your bedtime. You need to be up at 6:30 a.m., you feel best on about 8 hours of sleep, and it usually takes you about 15 minutes to fall asleep. What time should you get into bed?",
          answers: ["10:15", "10:15 pm", "10:15pm", "22:15"],
          placeholder: "e.g. 11:30 pm",
          hint: "Count back 8 hours from your wake time, then allow for falling asleep.",
          explain:
            "8 hours before 6:30 a.m. is 10:30 p.m., and 15 minutes earlier to allow for falling asleep gives **10:15 p.m.** Start your wind-down 30–60 minutes before that. Working back from a fixed wake time like this is the simplest way to set a bedtime.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "Priya gets up at 6:30 on weekdays and 11:00 on weekends, drinks coffee until 5 p.m., and answers work email from bed until midnight. Which changes would likely help? Select all that apply.",
          options: [
            "Keep weekend wake-ups within about an hour of 6:30",
            "Move her last coffee to late morning or early afternoon",
            "Move email out of the bedroom and start a wind-down before bed",
            "Sleep in even later on weekends to pay back the week's sleep debt",
            "Take a two-hour nap at 5 p.m. to get through the evening",
          ],
          answer: [0, 1, 2],
          hint: "Check each change against the wake-time anchor, caffeine's half-life and sleep pressure.",
          explain:
            "A steady wake time anchors her clock; an earlier caffeine cut-off gives the ~5-hour half-life time to work; and taking work out of bed, with a wind-down, lets her brain link bed with sleep. Longer lie-ins deepen the social jet lag, and a long late-afternoon nap drains the sleep pressure she needs at night.",
        },
        {
          type: "practice",
          phase: "apply",
          prompt:
            "Set up tonight's wind-down. Take the next 15 minutes to get your routine and bedroom ready, so tonight runs on autopilot.",
          minutes: 15,
          focus: [
            "Choose a wake time you can keep every day and set the alarm for it, weekends too",
            "Work back to a bedtime, then set a reminder 30–60 minutes earlier to start winding down",
            "Make the bedroom cool, dark and quiet: thermostat or window, curtains, anything noisy",
            "Move your phone charger out of reach of the bed",
            "Pick one calm wind-down activity, like a paper book, stretching or a warm shower",
          ],
          goal: "Tonight, lights dim and screens go away at your reminder, and you're in bed at your planned time",
        },
      ],
    },
  ],
};

export default course;

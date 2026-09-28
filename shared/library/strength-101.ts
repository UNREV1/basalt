import type { LibraryCourse } from "./types.ts";

// ---- figures (inline SVG, currentColor + a few accent colors so they read in light and dark mode) ----

const SUPERCOMPENSATION = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 185" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Fitness dips after a workout, recovers, then rises above the starting level">
<path d="M20 100H345" stroke="currentColor" stroke-dasharray="5 5" stroke-opacity="0.4"/>
<text x="345" y="122" text-anchor="end" fill-opacity="0.6">starting level</text>
<path d="M20 100H60C80 100 90 145 110 145C135 145 150 100 170 100C190 100 205 65 230 65C265 65 300 90 340 97" fill="none" stroke="currentColor" stroke-width="3"/>
<circle cx="60" cy="100" r="6" fill="#ef4444"/>
<g text-anchor="middle"><text x="60" y="84" fill="#ef4444">Workout</text><text x="115" y="172" fill="#3b82f6">Recovery</text><text x="230" y="50" fill="#10b981">Adaptation</text></g>
</svg>`;

const NEURAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 206" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Nervous system gains come fast and level off; muscle size gains build slowly">
<path d="M40 30V160H340" fill="none" stroke="currentColor" stroke-opacity="0.4"/>
<path d="M40 158C70 90 120 75 340 72" fill="none" stroke="#3b82f6" stroke-width="3"/>
<path d="M40 158C140 156 230 110 340 55" fill="none" stroke="#f59e0b" stroke-width="3"/>
<text x="140" y="58" fill="#3b82f6">Nervous system</text>
<text x="338" y="40" text-anchor="end" fill="#f59e0b">Muscle size</text>
<g text-anchor="middle"><text x="40" y="180">0</text><text x="115" y="180">4</text><text x="190" y="180">8</text><text x="265" y="180">12</text><text x="340" y="180">16</text><text x="190" y="200">weeks of training</text></g>
<text x="24" y="95" transform="rotate(-90 24 95)" text-anchor="middle">Strength gain</text>
</svg>`;

const SQUAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 205" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Side view of a bodyweight squat: standing tall, then at the bottom with hips back, chest up and heels flat">
<path d="M20 181H340" stroke="currentColor" stroke-opacity="0.3"/>
<g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
<circle cx="90" cy="31" r="11"/>
<path d="M90 44V96L90 138L90 180M84 180H108M90 54L124 58"/>
<circle cx="270" cy="93" r="11"/>
<path d="M262 104L228 145L270 143L250 180M244 180H268M257 110L300 106"/>
</g>
<circle cx="228" cy="145" r="5" fill="#f59e0b"/>
<g text-anchor="middle"><text x="95" y="200">Stand tall</text><text x="255" y="200">Hips back and down</text></g>
</svg>`;

const REP_RANGES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 142" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Rep ranges: 1 to 5 for maximal strength, a wide range from about 6 reps upward for muscle growth">
<text x="30" y="20" fill="#3b82f6">Max strength: 1–5</text>
<rect x="30" y="28" width="41.4" height="22" fill="#3b82f6"/>
<text x="81.7" y="72" fill="#10b981">Muscle growth: 6–15+ (hard sets)</text>
<rect x="81.7" y="80" width="93.1" height="22" fill="#10b981"/>
<rect x="174.8" y="80" width="155.2" height="22" fill="#10b981" fill-opacity="0.35"/>
<path d="M30 112H330" stroke="currentColor" stroke-opacity="0.4"/>
<g text-anchor="middle"><text x="30" y="132">1</text><text x="71.4" y="132">5</text><text x="123.1" y="132">10</text><text x="174.8" y="132">15</text><text x="226.6" y="132">20</text></g>
<text x="330" y="132" text-anchor="end">30 reps</text>
</svg>`;

const RPE_SCALE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 122" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="RPE 6 to 10 and matching reps in reserve 4 to 0; RPE 7 to 9 covers most working sets">
<path d="M116 32V26H280V32" fill="none" stroke="#10b981" stroke-width="2"/>
<text x="198" y="18" text-anchor="middle" fill="#10b981">most working sets</text>
<g text-anchor="end"><text x="52" y="61">RPE</text><text x="52" y="101">RIR</text></g>
<rect x="60" y="40" width="52" height="32" rx="6" fill="currentColor" fill-opacity="0.08"/>
<rect x="116" y="40" width="52" height="32" rx="6" fill="#10b981" fill-opacity="0.3"/>
<rect x="172" y="40" width="52" height="32" rx="6" fill="#10b981" fill-opacity="0.3"/>
<rect x="228" y="40" width="52" height="32" rx="6" fill="#10b981" fill-opacity="0.3"/>
<rect x="284" y="40" width="52" height="32" rx="6" fill="#ef4444" fill-opacity="0.3"/>
<g fill="currentColor" fill-opacity="0.08"><rect x="60" y="80" width="52" height="32" rx="6"/><rect x="116" y="80" width="52" height="32" rx="6"/><rect x="172" y="80" width="52" height="32" rx="6"/><rect x="228" y="80" width="52" height="32" rx="6"/><rect x="284" y="80" width="52" height="32" rx="6"/></g>
<g text-anchor="middle"><text x="86" y="61">6</text><text x="142" y="61">7</text><text x="198" y="61">8</text><text x="254" y="61">9</text><text x="310" y="61">10</text>
<text x="86" y="101">4</text><text x="142" y="101">3</text><text x="198" y="101">2</text><text x="254" y="101">1</text><text x="310" y="101">0</text></g>
</svg>`;

const PUSHUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 52 360 108" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Side view of a push-up: body in a straight line from head to heels, compared with sagging hips">
<path d="M20 131H345" stroke="currentColor" stroke-opacity="0.3"/>
<path d="M50 130L147 124L265 85" fill="none" stroke="#ef4444" stroke-width="3" stroke-dasharray="6 5"/>
<g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M50 130L265 85M265 87V130"/><circle cx="282" cy="81" r="11"/></g>
<text x="150" y="76" text-anchor="middle" fill="#10b981">Straight line, head to heels</text>
<text x="150" y="152" text-anchor="middle" fill="#ef4444">Sagging hips</text>
</svg>`;

const WEEK_PLAN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 84" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="A beginner week: full-body training on Monday, Wednesday and Friday, rest on the other days">
<g fill="#3b82f6"><rect x="12" y="8" width="44" height="68" rx="8"/><rect x="108" y="8" width="44" height="68" rx="8"/><rect x="204" y="8" width="44" height="68" rx="8"/></g>
<g fill="currentColor" fill-opacity="0.08"><rect x="60" y="8" width="44" height="68" rx="8"/><rect x="156" y="8" width="44" height="68" rx="8"/><rect x="252" y="8" width="44" height="68" rx="8"/><rect x="300" y="8" width="44" height="68" rx="8"/></g>
<g text-anchor="middle" fill="#fff"><text x="34" y="36">Mon</text><text x="130" y="36">Wed</text><text x="226" y="36">Fri</text><text x="34" y="60">Train</text><text x="130" y="60">Train</text><text x="226" y="60">Train</text></g>
<g text-anchor="middle"><text x="82" y="36">Tue</text><text x="178" y="36">Thu</text><text x="274" y="36">Sat</text><text x="322" y="36">Sun</text></g>
<g text-anchor="middle" fill-opacity="0.6"><text x="82" y="60">Rest</text><text x="178" y="60">Rest</text><text x="274" y="60">Rest</text><text x="322" y="60">Rest</text></g>
</svg>`;

const DOMS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 194" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Muscle soreness after a new workout rises, peaks one to three days later, then fades">
<path d="M40 145H330" stroke="currentColor" stroke-opacity="0.4"/>
<path d="M40 143C75 143 95 50 140 50C185 50 220 128 330 138" fill="none" stroke="#f59e0b" stroke-width="3"/>
<text x="40" y="20" fill="#f59e0b">Soreness</text>
<text x="140" y="40" text-anchor="middle">peaks 1–3 days later</text>
<g text-anchor="middle"><text x="40" y="165">0</text><text x="98" y="165">1</text><text x="156" y="165">2</text><text x="214" y="165">3</text><text x="272" y="165">4</text><text x="330" y="165">5</text><text x="185" y="186">days after the workout</text></g>
</svg>`;

const HINGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 205" font-family="system-ui, sans-serif" font-size="14" fill="currentColor" role="img" aria-label="Hip hinge drill: a stick held along the back touches the head, upper back and tailbone while the hips move back">
<path d="M20 181H340" stroke="currentColor" stroke-opacity="0.3"/>
<g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
<circle cx="90" cy="32" r="10"/>
<path d="M90 44V96L90 138L90 180M84 180H108M90 54L96 110"/>
<circle cx="282" cy="77.5" r="10"/>
<path d="M226 110L269 85M226 110L256 139L250 180M244 180H268M262 90V132"/>
</g>
<path d="M80 14V114M210.6 107.3L287.4 62.8" stroke="#f59e0b" stroke-width="4" stroke-linecap="round"/>
<g text-anchor="middle"><text x="95" y="200">Stand tall</text><text x="250" y="200">Hips back, back flat</text></g>
</svg>`;

const course: LibraryCourse = {
  id: "strength-101",
  title: "Strength Training 101",
  icon: "🏋️",
  blurb:
    "Learn how muscles adapt, how to pick sets, reps and effort, and how to build a simple, safe beginner week, with hands-on bodyweight practice in every lesson.",
  ability: "str",
  skill: { name: "Athletics", icon: "🏋️" },
  lessons: [
    // ------------------------------------------------------------------------------------------
    {
      id: "overload",
      title: "How Muscles Adapt",
      summary: "Learn the stimulus → recovery → adaptation cycle and progressive overload, then set a squat baseline to beat.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Today's goal",
          body:
            "By the end of this session you'll know how muscles get stronger and how to keep them improving, and you'll have done **3 controlled sets of bodyweight squats** and written down a baseline to beat next time.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt: "First, a prediction. You do the same 3 sets of 10 push-ups every day for a year, never changing a thing. What most likely happens?",
          options: [
            "You keep getting stronger at the same rate all year",
            "You improve for a while, then progress stalls",
            "You get weaker, because muscles get bored of repetition",
          ],
          answer: [1],
          hint: "What happens once 3 × 10 push-ups stops being hard for you?",
          explain:
            "At first, 3 × 10 is a real challenge, so your body adapts. Once you've adapted, the same workout no longer gives it a reason to change, so progress levels off. You don't get weaker; you just maintain. To keep improving, the challenge has to grow.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Stimulus → recovery → adaptation",
          figure: SUPERCOMPENSATION,
          caption: "The classic model: a workout knocks you down temporarily, recovery brings you back, and adaptation leaves you slightly above where you started. Train again around then and the gains stack up.",
          body:
            "Strength training works in a loop:\n\n1. **Stimulus**: a workout that challenges your muscles more than they're used to.\n2. **Recovery**: in the hours and days afterwards, with rest, food and sleep, your body repairs and rebuilds.\n3. **Adaptation**: it rebuilds slightly stronger, ready for that challenge next time.\n\nThe workout is the *signal*. The getting-stronger happens while you recover.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put one turn of the adaptation cycle in order.",
          items: [
            "Lift something challenging",
            "Feel tired, and temporarily a bit weaker",
            "Rest, eat and sleep while your body repairs",
            "Come back slightly stronger",
            "Train again with a slightly bigger challenge",
          ],
          hint: "Right after a hard workout you're not stronger yet.",
          explain:
            "Training first makes you *more tired*, not stronger. Recovery turns that fatigue into adaptation, and then the next workout needs to be a bit harder to keep the loop going.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "So when do your muscles actually grow?",
          options: [
            "During the workout, while you feel the pump",
            "During recovery, in the hours and days between workouts",
            "Only on days you drink a protein shake",
          ],
          answer: [1],
          hint: "Look back at the loop: which step does the rebuilding?",
          explain:
            "The pump you feel in a workout is temporary swelling from extra blood flow. The real building happens during recovery, when your body repairs and adds muscle protein for a day or two after each session. Protein helps, but it's your total diet over time that matters, not one shake.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Progressive overload",
          body:
            "Because your body adapts to whatever you ask of it, the challenge has to **gradually increase** to keep progress coming. That's **progressive overload**. You can overload in several ways:\n\n- more **weight** (e.g. +2.5 kg on the bar)\n- more **reps** with the same weight\n- more **sets**\n\nThe key word is *gradually*: small steps you can recover from, with good form.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are good ways to apply progressive overload? Select all that apply.",
          options: [
            "Adding 2.5 kg to the bar once you hit your target reps",
            "Doing one more rep than last time with the same weight",
            "Adding an extra set to an exercise",
            "Repeating the exact same workout for months",
            "Adding weight even though your form is falling apart",
          ],
          answer: [0, 1, 2],
          hint: "Two options fail either the “progressive” part or the “good form” part.",
          explain:
            "More weight, more reps and more sets all raise the challenge. Repeating the same workout forever gives no new stimulus. Piling on weight with collapsing form isn't useful overload: it shifts stress to places you don't want it and raises your injury risk.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "Your squat is 40 kg for 3 sets of 5. If you add 2.5 kg each week and keep hitting your reps, what will you squat after 4 weeks?",
          answers: ["50", "50 kg", "50kg"],
          placeholder: "kg",
          hint: "Work out the total added over 4 weeks first.",
          explain:
            "4 × 2.5 kg = 10 kg, so 40 + 10 = **50 kg**. Small jumps add up fast, which is why beginners can often add weight every week, or even every session, at first.",
        },
        {
          type: "explore",
          phase: "understand",
          title: "Small steps add up",
          body:
            "The graph shows your squat over 12 weeks, starting at 40 kg. Drag the slider to change how much you add each week. At 5 kg a week you'd hit 100 kg in 12 weeks. Could anyone really keep that up forever? Hold that thought.",
          min: 0,
          max: 5,
          step: 0.5,
          start: 2.5,
          label: "Added per week",
          unit: "kg",
          plot: "40 + v*x",
          xMin: 0,
          xMax: 12,
          readout: "40 + 12*v",
          readoutLabel: "Squat after 12 weeks (kg)",
        },
        {
          type: "reveal",
          phase: "understand",
          figure: NEURAL,
          caption: "A simplified picture: your nervous system adapts fast and then levels off, while muscle growth builds more slowly.",
          prompt: "Beginners often get noticeably stronger in the first few weeks without their muscles getting any bigger. How? And why can't the fast early progress last forever?",
          body:
            "Much of the early progress is your **nervous system** learning the lift: better coordination, recruiting more muscle fibers at once, and smoother technique. Muscle growth is slower and becomes more significant over months of consistent training.\n\nThat's also why progress slows: the quick nervous-system gains run out, and each new kilo then takes more stimulus and more recovery. Smaller jumps, adding reps before weight, and patience keep you moving.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "How to squat",
          figure: SQUAT,
          caption: "Side view: sit the hips back and down, keep the chest up and heels flat. Knees moving forward over the toes is normal.",
          body:
            "Stand with your feet about shoulder-width apart, toes turned out slightly. Sit your hips **back and down** as if onto a chair, keep your **chest up** and your **heels flat**, and let your knees travel forward in line with your toes. Go as deep as you can while keeping all that, then push the floor away to stand up.\n\nCommon mistakes: knees caving inward, heels lifting, and the back rounding at the bottom.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Quick check: as you squat down, which way should your knees point?",
          options: ["The same direction as your toes", "Inward, toward each other", "Straight ahead, however your feet are turned"],
          answer: [0],
          hint: "Picture a straight line from your hip, through your knee, to your foot.",
          explain:
            "Knees should track in line with your toes, so the joint bends the way it's built to. Knees caving inward is the most common squat fault; if it happens, go a little less deep and think about spreading the floor apart with your feet.",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "Bodyweight squat practice. Warm up with 2 minutes of marching on the spot or other easy movement. Then do 3 sets of bodyweight squats, resting about a minute between sets. Move slowly: about 2 seconds down, 1 second up. Stop each set when you have 2–3 good reps left, and write down how many you did: that's your baseline. If balance or depth is tricky, squat down to lightly touch a sturdy chair. Stop if anything feels sharp or painful.",
          minutes: 12,
          focus: [
            "Feet about shoulder-width, toes turned slightly out",
            "Hips go back and down while your chest stays up",
            "Knees track in line with your toes, never caving inward",
            "Heels stay flat on the floor",
            "Only go as deep as you can with a flat back",
          ],
          goal: "3 sets of slow, controlled squats with good form, and your reps written down",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt: "Imagine you filmed your squats from the side. Which of these would you want to fix next session? Select all that apply.",
          options: [
            "Heels lifting off the floor",
            "Knees caving inward as you stand up",
            "Chest dropping and back rounding at the bottom",
            "Knees moving forward past your toes, in line with them",
            "Thighs reaching about parallel with heels flat",
          ],
          answer: [0, 1, 2],
          hint: "Two of these are exactly what good squats look like.",
          explain:
            "Heels lifting, knees caving and a collapsing back are the classic faults: fix them by squatting slightly less deep, pushing your knees out in line with your toes, and keeping your chest up. Knees travelling past your toes is normal as long as they track in line with them and your heels stay down, and parallel depth with flat heels is exactly what you want.",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt:
            "Say today you did 3 sets of 12 squats with good form, stopping with about 3 reps in reserve each time. What's the best plan for next session?",
          options: [
            "Aim for 13 or 14 reps per set, with the same form and effort",
            "Jump straight to 3 sets of 40",
            "Repeat exactly 3 × 12 every session from now on",
            "Add a heavy barbell before the movement feels solid",
          ],
          answer: [0],
          hint: "Progressive overload: small steps you can recover from.",
          explain:
            "A rep or two more per set is a small, recoverable overload. Once sets of 15–20 feel easy, make the squat harder instead: slower reps, or holding a weight at your chest (a goblet squat). Jumping to 40 is too big a step, never changing gives no new stimulus, and loading a movement you haven't mastered drills bad habits.",
        },
      ],
    },

    // ------------------------------------------------------------------------------------------
    {
      id: "sets-reps",
      title: "Sets, Reps and Effort",
      summary: "Choose rep ranges, judge effort with RPE and reps in reserve, count weekly volume, and test your effort sense on push-ups.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Today's goal",
          body:
            "By the end of this session you'll be able to choose reps for a goal, rate how hard a set was, and count your weekly volume. Then you'll do **3 sets of push-ups**, stopping at a set effort level, and check how accurate your sense of effort really is.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "First, a prediction. Alex and Blake train for 8 weeks with the same number of sets. Alex lifts heavy for sets of 8; Blake lifts lighter for sets of 20. Both stop each set just 1–2 reps short of failure. Who builds more muscle?",
          options: [
            "Alex: only heavy weights build muscle",
            "Blake: more reps always means more growth",
            "About the same: both are doing hard sets",
            "Neither: you have to go to complete failure to grow",
          ],
          answer: [2],
          hint: "What do both of their sets have in common?",
          explain:
            "Research shows muscle growth is similar across a wide range of reps, from about 6 to 15 and beyond, **as long as the sets are hard**, ending close to failure. Alex will probably gain more *maximal* strength, because heavy lifting is more specific to that. But for size, effort matters more than the exact rep count.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Reps, sets and ranges",
          figure: REP_RANGES,
          caption: "Heavy sets of 1–5 are the most specific for maximal strength. For muscle growth, hard sets work across a wide range; very high reps (the faded part) still work but get long and uncomfortable.",
          body:
            "A **rep** is one full lift: one squat, down and up. A **set** is a group of reps done back to back, like 3 sets of 8.\n\n- **About 1–5 reps** with heavy weights is the most specific way to build maximal strength.\n- **About 6–15+ reps** is great for building muscle, and growth is similar across that range as long as the sets are hard.\n\nMost beginners do well spending much of their time around 5–12 reps, which builds both.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Your goal is to lift the heaviest single squat you can. Which kind of training should be a regular part of your plan?",
          options: ["Heavy sets of about 1–5 reps", "Light sets of 25–30 reps", "It makes no difference for maximal strength"],
          answer: [0],
          hint: "You get best at what you practice.",
          explain:
            "Strength is specific: to get good at lifting heavy, you need to practice lifting heavy. Higher-rep work still builds muscle that supports strength, but heavy sets of 1–5 train the skill and nervous-system side of a maximal lift.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "How hard was that set?",
          figure: RPE_SCALE,
          caption: "RPE and reps in reserve (RIR) describe the same thing: RPE = 10 − reps left.",
          body:
            "Two handy ways to rate effort:\n\n- **Reps in reserve (RIR)**: how many more good reps you could have done when you stopped.\n- **RPE** (rate of perceived exertion), on a scale to 10, where **RPE 10 = nothing left** and each rep left takes one point off.\n\nFor most working sets, finishing with about **1–3 reps in reserve** (RPE 7–9) gives a strong stimulus without piling up too much fatigue. Beginners tend to underestimate how many reps they have left, so be honest.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "You end a set knowing you could have done exactly 2 more reps with good form. What RPE is that?",
          answers: ["8", "eight", "RPE 8", "rpe8"],
          placeholder: "RPE",
          hint: "RPE 10 means 0 reps left. Count down from there.",
          explain: "2 reps in reserve = **RPE 8**: subtract the reps you had left from 10.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each term to its meaning.",
          pairs: [
            { left: "Rep", right: "One complete lift, like one squat down and up" },
            { left: "Set", right: "A group of reps done back to back" },
            { left: "1RM", right: "The most weight you can lift for a single rep" },
            { left: "RIR", right: "How many more good reps you could have done" },
            { left: "RPE", right: "A rating of how hard a set was, up to 10" },
          ],
          hint: "1RM stands for one-rep max.",
          explain:
            "Reps make up sets; your 1RM (one-rep max) measures your top strength; and RIR and RPE are two ways of describing the same thing: how close to failure you took a set.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these count as **hard sets** for building muscle? Select all that apply.",
          options: [
            "10 reps, stopping with about 2 reps in reserve",
            "12 reps to true failure with good form",
            "10 reps with a weight you could lift 25 times",
            "5 heavy reps at RPE 9",
            "A warm-up set with an empty bar",
          ],
          answer: [0, 1, 3],
          hint: "Look at how close to failure each set ends, not the number of reps.",
          explain:
            "A hard set ends close to failure, roughly 0–3 reps in reserve, whatever the rep count. Stopping at 10 when you could do 25 leaves 15 in reserve, far too easy to drive much growth, and warm-ups are meant to be easy.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Weekly volume",
          body:
            "**Volume** is how much work you do. A simple way to count it: **hard sets per muscle group per week**.\n\nFor building muscle, a common evidence-based target is roughly **10–20 hard sets per muscle per week**, spread over two or more sessions. Beginners grow well on less than that. More isn't automatically better: sets beyond what you can recover from just add fatigue.",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "Each workout you do 3 hard sets of squats and 2 hard sets of lunges, and you train 3 times a week. How many hard sets for your quads is that per week?",
          answers: ["15", "fifteen"],
          placeholder: "sets",
          hint: "Sets per workout × workouts per week.",
          explain:
            "(3 + 2) × 3 = **15** hard sets a week: right in the common 10–20 range, split across three sessions so each one stays manageable.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Push-up form",
          figure: PUSHUP,
          caption: "Keep one straight line from head to heels (green), not sagging hips (red, dashed).",
          body:
            "Hands a little wider than your shoulders, body in **one straight line** from head to heels: squeeze your glutes and brace your abs. Lower with your elbows angled back at about **45°** until your chest nearly touches the surface, then press all the way up.\n\nToo hard? Put your hands on a sturdy table, bench or wall: the higher your hands, the easier it gets. Common mistakes: sagging hips, half reps, and elbows flared straight out to the sides.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You can do 3 floor push-ups with good form, or about 12 with your hands on a sturdy bench. Which should you train with today?",
          options: [
            "Bench (incline) push-ups: about 12 good reps is a great range",
            "Floor push-ups, even if the last reps turn into half reps",
            "Wall push-ups, because they're easiest and you could do 60",
          ],
          answer: [0],
          hint: "Think about rep ranges, and remember sets only count when they're hard.",
          explain:
            "Incline push-ups give you about 12 hard, full-range reps, right in the productive range. Grinding out floor push-ups with broken form trains the wrong movement, and 60 easy wall push-ups end far from failure. As you get stronger, lower the surface until you're on the floor.",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "Push-ups with an effort check. Pick the version where you can do about 8–15 good reps: hands on a wall, a sturdy table or bench, or the floor. Do 3 sets, resting 2 minutes between them. On sets 1 and 2, stop when you think you have 2 reps left (RPE 8). On set 3, make the same guess and note it, then keep going until you can't do another good rep. How many extra reps did you get? Stop if anything hurts (burning muscles are fine; sharp pain is not).",
          minutes: 12,
          focus: [
            "Hands a little wider than your shoulders",
            "One straight line from head to heels: glutes squeezed, abs braced",
            "Elbows angled back at about 45°, not flared straight out",
            "Chest close to the surface at the bottom, arms straight at the top",
            "An honest guess of your reps in reserve",
          ],
          goal: "Your set-3 guess is within 2 reps of what you actually had left",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt: "You watch a friend's push-ups. Which of these should they fix? Select all that apply.",
          options: [
            "Hips sagging toward the floor",
            "Going only a quarter of the way down",
            "Elbows flared straight out at 90° from the body",
            "Body in a straight line from head to heels",
            "Chest coming close to the surface on every rep",
          ],
          answer: [0, 1, 2],
          hint: "Compare each with the form cues and the figure.",
          explain:
            "Sagging hips, partial reps and flared elbows are the classic faults. The fixes: brace and squeeze the glutes, use a higher surface if needed so every rep goes all the way down, and angle the elbows back. A straight body and near-full depth are exactly right.",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt: "On your third set you guessed you had 2 reps left, but you actually managed 6 more. What should you change next session?",
          options: [
            "Push your sets harder: you had more in reserve than you thought",
            "Nothing: that guess was accurate",
            "Stop even earlier to be safe",
          ],
          answer: [0],
          hint: "How far off was your guess?",
          explain:
            "You were 4 reps off, so your “2 in reserve” sets were really about 6 in reserve: too easy to count as hard sets. That's very common for beginners. Next time push a few reps further, and test yourself on a last set now and then. Once you can do more than about 15 good reps, move to a harder push-up version.",
        },
      ],
    },

    // ------------------------------------------------------------------------------------------
    {
      id: "first-week",
      title: "Recovery and Your First Week",
      summary: "Build a full-body beginner week around five movement patterns, learn how to recover, and drill the hip hinge.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Today's goal",
          body:
            "By the end of this session you'll be able to plan a simple full-body week you can recover from, tell normal soreness from a warning sign, and do **30 clean hip hinges**, the movement behind deadlifts.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt: "First, a prediction. Which beginner plan will probably build the most all-round strength over three months?",
          options: [
            "Full-body sessions 3 times a week, with a rest day between each",
            "An hour of arm exercises every single day",
            "One huge 3-hour session every Saturday",
          ],
          answer: [0],
          hint: "Think about recovery, and about training the whole body.",
          explain:
            "Training each muscle 2–3 times a week gives frequent stimulus with time to recover in between. Daily arm work neglects most of your body and leaves no recovery; one giant weekly session means long gaps, and by the end you're too tired for the sets to be any good.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Five movement patterns",
          body:
            "You don't need dozens of exercises. Five basic **movement patterns** cover most of your body:\n\n- **Squat**: bend knees and hips to sit down and stand up (goblet squat, back squat).\n- **Hinge**: bend at the hips with a flat back (deadlift, Romanian deadlift).\n- **Push**: press weight away from you (push-up, overhead press).\n- **Pull**: pull weight toward you (row, pull-up).\n- **Carry**: walk while holding something heavy (suitcase carry).\n\nThese are **compound** movements: several joints and many muscles working together.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each exercise to its movement pattern.",
          pairs: [
            { left: "Leg press", right: "Squat" },
            { left: "Kettlebell swing", right: "Hinge" },
            { left: "Bench press", right: "Push" },
            { left: "Chin-up", right: "Pull" },
            { left: "Farmer's walk", right: "Carry" },
          ],
          hint: "Ask: is the main action bending the knees, bending at the hips, pressing away, pulling in, or walking with a load?",
          explain:
            "The leg press is a squat pattern (knees and hips bend together); the kettlebell swing is a powerful hip hinge; the bench press pushes weight away; chin-ups pull you up toward the bar; and the farmer's walk is a loaded carry.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are **compound** exercises, working several joints and muscle groups at once? Select all that apply.",
          options: ["Squat", "Biceps curl", "Deadlift", "Push-up", "Calf raise"],
          answer: [0, 2, 3],
          hint: "Count the joints that move.",
          explain:
            "Squats move the hips, knees and ankles; deadlifts the hips and knees; push-ups the shoulders and elbows. Curls (elbow only) and calf raises (ankle only) are **isolation** exercises: useful extras, but compounds give beginners the most return for their time.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Recovery is part of training",
          figure: WEEK_PLAN,
          caption: "A simple beginner week: three full-body sessions with a rest day between each.",
          body:
            "You get stronger while you *recover*. Three things matter most:\n\n- **Sleep**: aim for 7–9 hours; much of your repair happens then.\n- **Protein**: a common evidence-based target for building muscle is about **1.6 g per kg of body weight per day**, spread across your meals.\n- **Rest days**: at least a day between hard full-body sessions.\n\nSome muscle soreness a day or two after a new workout is normal. It fades, and it's not a measure of how good the workout was.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "Using about 1.6 g of protein per kg of body weight, roughly how many grams a day would a 70 kg person aim for?",
          answers: ["112", "112 g", "112g"],
          tolerance: 1,
          placeholder: "grams",
          hint: "70 × 1.6. Try 70 × 1.5, then add 70 × 0.1.",
          explain:
            "70 × 1.6 = **112 g** a day, for example roughly 25–30 g at each of four meals and snacks. It doesn't have to be exact; getting roughly that most days is what counts. If you have kidney disease or another medical condition, check with your doctor before raising your protein.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Two days after your first squat session, your thighs are really sore when you walk downstairs. What does that most likely mean?",
          options: [
            "Normal delayed-onset muscle soreness from a new challenge; it fades within a few days and gets milder as you adapt",
            "You've injured yourself and should never squat again",
            "It was a perfect workout, since soreness is the best sign of progress",
          ],
          answer: [0],
          hint: "This kind of soreness has a name, and it's very common after new exercises.",
          explain:
            "**DOMS** (delayed-onset muscle soreness) usually peaks 1–3 days after unfamiliar exercise and fades on its own. It gets milder as your body adapts, which is why it's a poor measure of progress: a workout can be very effective without leaving you sore.",
        },
        {
          type: "reveal",
          phase: "understand",
          figure: DOMS,
          caption: "Typical muscle soreness (DOMS) after a new workout.",
          prompt: "How can you tell normal soreness from a possible injury?",
          body:
            "**Normal soreness** is a dull ache spread across the muscles you trained. It peaks a day or two later and fades within a few days.\n\n**Warning signs** are different: sharp or stabbing pain, pain in a joint rather than a muscle, swelling, pain that changes how you move, or pain that isn't improving. If you notice these, stop the exercise that causes it and see a qualified professional, such as a doctor or physical therapist, rather than training through it.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The hip hinge",
          figure: HINGE,
          caption: "The broomstick drill: the stick touches your head, upper back and tailbone the whole time.",
          body:
            "The hinge is the movement behind deadlifts and kettlebell swings. Push your hips **back** (imagine closing a car door with your backside), let your torso tip forward with a **flat back**, and keep your knees **softly bent**. You'll feel a stretch in your hamstrings, the backs of your thighs. Then drive your hips forward to stand tall.\n\nCommon mistakes: rounding the back, turning it into a squat, and leaning back at the top.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Quick check: in a hip hinge, what does most of the moving?",
          options: [
            "Your hips travel backward while your back stays flat",
            "Your knees bend deeply and your hips drop straight down",
            "Your back rounds so your hands can reach the floor",
          ],
          answer: [0],
          hint: "Compare the hinge figure with the squat: where did the hips go?",
          explain:
            "A hinge is a hip movement: the hips go back, the torso tips forward as one flat unit, and the knees bend only a little. Dropping the hips with a deep knee bend turns it into a squat, and rounding the back moves the work away from your hips and hamstrings.",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "Hip hinge drill. Hold a broomstick along your back so it touches the back of your head, your upper back and your tailbone. With soft knees, push your hips back until you feel a stretch in the backs of your thighs, then drive your hips forward to stand tall. Do 3 slow sets of 10, resting a minute between sets. If you have time, finish with 2 sets of 10 glute bridges (lie on your back, feet flat, and lift your hips). Stop if anything feels sharp or painful.",
          minutes: 10,
          focus: [
            "The stick keeps touching your head, upper back and tailbone the whole time",
            "Hips move backward, not down: this isn't a squat",
            "Knees stay softly bent and mostly still",
            "Stand up by squeezing your glutes, without leaning back at the top",
          ],
          goal: "30 slow hinges without the stick losing contact",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt: "Looking back at your hinges (or a video of them), which of these need fixing? Select all that apply.",
          options: [
            "The stick lifts off your tailbone or head",
            "Your knees bend a lot and your hips drop, like a squat",
            "You lean back at the top instead of just standing tall",
            "You feel a stretch in the backs of your thighs",
            "Your shins stay close to vertical",
          ],
          answer: [0, 1, 2],
          hint: "Two of these are signs you're doing it right.",
          explain:
            "The stick losing contact means your back is rounding; dropping the hips turns the hinge into a squat; and leaning back at the top puts stress on your lower back. A hamstring stretch and near-vertical shins are exactly what a good hinge feels and looks like.",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt: "Weeks later, you're adding weight to your deadlift, and your back rounds more and more on the last few reps. What's the best move?",
          options: [
            "Drop to a weight where your form holds, and build back up from there",
            "Keep adding weight; form sorts itself out",
            "Take every set to failure so you get used to it",
          ],
          answer: [0],
          hint: "What was the condition for good progressive overload?",
          explain:
            "Good form comes before load. Taking the weight down to where you move well keeps the stress on the muscles you're training, and you'll build back up quickly. If you're unsure about your technique, a qualified coach can help.",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt: "Put it all together. Which is the best first week for a beginner?",
          options: [
            "Mon, Wed, Fri: goblet squat, Romanian deadlift, push-up, dumbbell row, farmer's carry; 2–3 hard sets each with good form",
            "Every day: bench press and curls, 6 sets each, all to failure",
            "Mon, Tue, Wed in a row: squats only, then four days off",
            "Wednesday only: 20 different machines, one easy set each",
          ],
          answer: [0],
          hint: "Look for all five patterns, sensible effort, and rest days between sessions.",
          explain:
            "The Mon/Wed/Fri plan covers squat, hinge, push, pull and carry, uses hard-but-controlled sets, and leaves a rest day between full-body sessions. The others skip patterns, give no recovery, or are too easy to drive progress. Start there, add a rep or a little weight each week, sleep well, eat enough protein, and you're on your way.",
        },
      ],
    },
  ],
};

export default course;

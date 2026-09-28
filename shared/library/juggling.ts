import type { LibraryCourse } from "./types.ts";

const course: LibraryCourse = {
  id: "juggling",
  title: "Three-Ball Juggling",
  icon: "🤹",
  blurb:
    "Go from one ball to a full three-ball cascade in small, doable steps. Grab three balls (or rolled-up socks) and learn by doing.",
  ability: "dex",
  skill: { name: "Sleight of Hand", icon: "✍️" },
  lessons: [
    // ---- 1. One ball: the throw ------------------------------------------------------------
    {
      id: "one-ball",
      title: "One Ball, One Arc",
      summary: "Posture and the one throw every juggling pattern is built from: inside to outside, peaking at eye height.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Today's goal",
          body:
            "**By the end of this session: 20 throws in a row with one ball, hand to hand, without moving your feet or looking at your hands.**\n\nIt sounds too easy, but every juggling pattern is built from this one throw. Make it identical from both hands now, and three balls later becomes a matter of timing.\n\nYou'll need something soft that won't roll away: beanbags are ideal, or a pair of socks rolled into a ball.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Before you touch a ball: when a juggler tosses a ball from one hand to the other, where are their eyes?",
          options: [
            "On the hand that's about to catch",
            "On the top of the arc, where the ball peaks",
            "Following the ball all the way down into the hand",
            "On the hand that's throwing",
          ],
          answer: [1],
          explain:
            "Jugglers watch the **peaks**. When every throw is good, the ball lands where your hand expects it, and your peripheral vision handles the catch. Following a ball down into your hand works with one ball, but with three there's no time, so build the habit now.",
          hint: "With three balls in the air, you can't follow any single one all the way down.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Set up",
          body:
            "Practise in front of a bed or sofa so drops are easy to pick up.\n\nStand tall with your feet shoulder-width apart. Keep your **elbows relaxed by your sides**, bent so your **forearms are roughly level with the floor**, hands about waist height, palms up. Shoulders loose. The work comes from your forearms and wrists, not your shoulders.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 250" font-family="sans-serif" font-size="14" fill="currentColor"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><circle cx="80" cy="36" r="18"/><line x1="80" y1="54" x2="80" y2="150"/><line x1="80" y1="150" x2="66" y2="236"/><line x1="80" y1="150" x2="94" y2="236"/><line x1="80" y1="70" x2="84" y2="120"/><line x1="84" y1="120" x2="140" y2="120"/></g><circle cx="147" cy="110" r="10" fill="#f08c00"/><line x1="90" y1="128" x2="106" y2="146" stroke="currentColor" stroke-width="1.5"/><text x="94" y="110">90°</text><text x="168" y="112">Forearms level,</text><text x="168" y="130">hands at waist height</text><text x="108" y="160">Elbows by your sides</text><text x="108" y="215">Stand tall, knees soft</text></svg>`,
          caption: "Side view of the juggling stance.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are part of a good juggling stance? Select all that apply.",
          options: [
            "Elbows relaxed near your sides",
            "Forearms roughly level with the floor",
            "Arms stretched out in front of you",
            "Shoulders loose and low",
            "Wrists locked stiff so every throw is the same",
          ],
          answer: [0, 1, 3],
          explain:
            "Elbows in, forearms level, shoulders loose. Stretched-out arms make you throw from the shoulder, which sends balls forward. Stiff wrists feel controlled but kill the small scooping motion that makes throws accurate.",
          hint: "Think relaxed and compact.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The throw",
          body:
            "Throw one ball from hand to hand in an arc that **peaks at about eye or forehead height**, just in front of your face.\n\n- **Throw from the inside:** the hand dips slightly toward your middle in a small scoop and releases the ball near the centre of your body.\n- **Catch on the outside:** the other hand meets the ball out to the side, then carries it inward to throw it back.\n\nSo each hand moves in a little loop: catch out wide, scoop in, throw from the middle.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 205" font-family="sans-serif" font-size="14" text-anchor="middle" fill="currentColor"><line x1="20" y1="50" x2="320" y2="50" stroke="#1c7ed6" stroke-width="2" stroke-dasharray="6 5"/><text x="20" y="40" text-anchor="start" fill="#1c7ed6">eye height</text><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.5"><circle cx="170" cy="48" r="20"/><line x1="170" y1="68" x2="170" y2="175"/><line x1="132" y1="86" x2="208" y2="86"/><line x1="132" y1="86" x2="118" y2="148"/><line x1="208" y1="86" x2="222" y2="148"/></g><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M80,160 Q95,176 110,160"/><path d="M200,160 Q215,176 230,160"/></g><path d="M215,150 Q155,-54 95,150" fill="none" stroke="#f08c00" stroke-width="3"/><polygon points="95,150 102.6,141.8 93,139" fill="#f08c00"/><circle cx="215" cy="148" r="9" fill="#f08c00"/><text x="95" y="197">catch (outside)</text><text x="215" y="197">throw (inside)</text></svg>`,
          caption: "Seen from behind: the right hand throws from the inside; the ball peaks at eye height and lands out to the side in the left hand.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put one full throw-and-catch in order, starting with the ball in your right hand.",
          items: [
            "Right hand dips inward in a small scoop",
            "Ball leaves your hand near the middle of your body",
            "Ball peaks at about eye height",
            "Left hand catches it out to the side",
            "Left hand carries it inward, ready to throw back",
          ],
          explain:
            "Scoop in, release from the inside, peak at eye height, catch on the outside, carry it in. Then the left hand does the mirror image. This little loop is the engine of every juggling pattern.",
          hint: "The ball is thrown from the inside and caught on the outside.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "Why throw from the inside and catch on the outside, instead of throwing and catching at the same spot?",
          body:
            "Because with three balls, one is coming down while another is going up. Throwing from the inside and catching on the outside makes their paths cross in an **X** in front of you: the new throw rises through the middle while the incoming ball drops down the side. Throw and catch at the same spot and they'd collide right above your hand.\n\nWith one ball it doesn't matter yet, which is exactly why now is the time to build the habit.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "Your arc should peak at about the height of which part of your body?",
          answers: [
            "eyes",
            "eye",
            "eye level",
            "eye-level",
            "eye height",
            "your eyes",
            "my eyes",
            "forehead",
            "forehead height",
            "forehead level",
            "your forehead",
            "my forehead",
            "brow",
            "eyebrows",
            "head",
            "head height",
            "head level",
            "face",
          ],
          placeholder: "One word",
          explain:
            "About **eye or forehead height**. Much lower and you won't have time to catch and throw with three balls; much higher and throws get harder to aim and the pattern slows down.",
          hint: "It's where you'll be looking.",
        },
        {
          type: "explore",
          phase: "understand",
          title: "Height buys time",
          body:
            "How long a ball stays in the air depends on how high it rises above your hands. Drag the slider and watch the hang time.\n\nEye height is about **0.5 m** above your hands, which gives roughly **0.64 s**: enough time to get ready for the next catch, without throws so high they wander. Notice the curve flattening: each extra bit of height buys a little less extra time.",
          min: 0.1,
          max: 2,
          step: 0.05,
          start: 0.5,
          label: "Peak above your hands",
          unit: "m",
          plot: "2*sqrt(2*x/9.81)",
          xMin: 0,
          xMax: 2,
          readout: "2*sqrt(2*v/9.81)",
          readoutLabel: "Hang time (s)",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "Slow and correct first. Take one ball, stand in front of a bed, and throw it from hand to hand. Pause after every catch and check your form before the next throw.",
          minutes: 3,
          focus: [
            "Did it peak at eye height?",
            "Thrown from the inside, caught on the outside?",
            "Elbows by your sides, feet still?",
          ],
          goal: "10 throws in a row that pass all three checks.",
        },
        {
          type: "practice",
          phase: "practice",
          prompt: "Now keep it flowing: the same throw back and forth with no pauses, eyes fixed on the peak.",
          minutes: 5,
          focus: [
            "Eyes on the peak, never on your hands",
            "Same height and shape from both hands",
            "Feet stay planted",
          ],
          goal: "20 throws in a row without moving your feet or looking down.",
        },
        {
          type: "match",
          phase: "reflect",
          prompt: "Match what went wrong in practice to the fix.",
          pairs: [
            {
              left: "The ball drifts away, so you step forward",
              right: "Throw up and across in front of your face, not outward",
            },
            { left: "Every arc is a different height", right: "Pick a spot at eye level and make each throw peak there" },
            {
              left: "Your shoulders ache and throws feel jerky",
              right: "Drop your elbows to your sides and throw from the forearm and wrist",
            },
            { left: "You keep glancing down at your hands", right: "Keep your eyes on the peak and catch by feel" },
          ],
          explain:
            "Most one-ball problems come from throwing with the whole arm or not having a target. Relaxed elbows, a fixed peak and eyes up fix nearly all of them.",
          hint: "Each fix targets the cause of its problem: direction, height, arm, or eyes.",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt:
            "After practising, your right-hand throws are smooth, but your left-hand throws wobble and drift. What do you change next session?",
          options: [
            "Practise mostly with your right hand to build confidence",
            "Practise both directions, with extra reps from your left",
            "Only ever throw from your right; the left just catches",
            "Throw higher with the left to make up for it",
          ],
          answer: [1],
          explain:
            "In the cascade both hands throw equally often, and every throw has to match. The pattern is only as good as your weaker hand, so give it extra practice. Throwing higher with one hand just makes the throws uneven.",
          hint: "How many throws does each hand make in a cascade?",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt:
            "Your friend tries it: they hold the ball out wide, throw it from the outside of their right hand, and it flies in a flat line at chest height to the left hand, which catches it in the middle of their body. Select all the mistakes.",
          options: [
            "Throwing from the outside instead of scooping in and releasing from the inside",
            "The arc is too low and flat: it should peak around eye height",
            "Catching in the middle instead of out to the side",
            "Starting with the right hand",
          ],
          answer: [0, 1, 2],
          explain:
            "Three mistakes: the throw should come from the inside, rise to eye height, and be caught out to the side. Which hand starts doesn't matter; you'll practise both anyway.",
          hint: "Compare it with the arc diagram: where it starts, how high it goes, where it lands.",
        },
      ],
    },

    // ---- 2. Two balls: the exchange ------------------------------------------------------------
    {
      id: "two-ball",
      title: "The Two-Ball Exchange",
      summary: "Throw the second ball as the first one peaks: throw, throw, catch, catch.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Today's goal",
          body:
            "**By the end of this session: 10 clean exchanges starting with your right hand, and 10 starting with your left.** A clean exchange means two matching throws to eye height, caught without moving your feet.\n\nThe exchange is the heart of juggling. The three-ball cascade is nothing more than exchanges chained together.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "One ball in each hand. You throw the right-hand ball across to your left, but your left hand is still full. When should the left hand throw?",
          options: [
            "At the same moment as the right hand",
            "When the first ball reaches its peak",
            "Just as the first ball is landing in the left hand",
          ],
          answer: [1],
          explain:
            "At the **peak**. That empties the left hand with time to spare before the first ball lands. Throw at the same moment and the balls collide in the middle; wait until the last instant and you'll be snatching in a panic.",
          hint: "The left hand must be empty before the first ball arrives, but not so early that the balls meet.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The exchange",
          body:
            "Hold one ball in each hand.\n\n1. Throw ball A from your right hand, the same arc as before.\n2. When A **peaks**, throw ball B from your left hand, from the inside, so it passes **under** A.\n3. Catch A in your left hand.\n4. Catch B in your right hand.\n\nThen stop. The rhythm is **throw, throw, catch, catch**. Say it out loud while you do it.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 210" font-family="sans-serif" font-size="14" text-anchor="middle" fill="currentColor"><g fill="none" stroke-width="3"><path d="M215,152 Q155,-52 95,152" stroke="#f08c00"/><path d="M125,152 Q185,-52 245,152" stroke="#1c7ed6"/><path d="M88,164 Q110,182 132,164" stroke="currentColor" stroke-linecap="round"/><path d="M208,164 Q230,182 252,164" stroke="currentColor" stroke-linecap="round"/></g><polygon points="95,152 102.6,143.8 93,141" fill="#f08c00"/><polygon points="245,152 247,141 237.4,143.8" fill="#1c7ed6"/><circle cx="155" cy="50" r="11" fill="#f08c00"/><text x="155" y="55" fill="#fff" font-weight="bold">A</text><circle cx="125" cy="145" r="11" fill="#1c7ed6"/><text x="125" y="150" fill="#fff" font-weight="bold">B</text><text x="110" y="202">Left hand</text><text x="230" y="202">Right hand</text></svg>`,
          caption: "The moment ball A peaks, the left hand throws ball B from the inside. Their paths cross in an X.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put one exchange in order.",
          items: [
            "Right hand throws ball A",
            "As ball A peaks, left hand throws ball B",
            "Left hand catches ball A",
            "Right hand catches ball B",
          ],
          explain:
            "Throw, throw, catch, catch. Ball A was thrown first, so it lands first, in the left hand, which has just emptied itself by throwing B.",
          hint: "The first ball thrown is the first ball caught.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "Fill in the rhythm of the exchange: throw, throw, ___, ___",
          answers: ["catch, catch", "catch catch", "catch-catch", "catch and catch"],
          placeholder: "Two words",
          explain:
            "**Catch, catch.** Both throws happen before either catch. If yours comes out as *throw, catch, throw, catch*, the second hand is waiting too long.",
          hint: "Both balls are in the air before anything lands.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Ball A is coming down on your left side. Where should ball B go as you throw it?",
          options: [
            "From the inside, passing under ball A",
            "From the outside, arcing over ball A",
            "Straight up, to be caught by the same hand",
          ],
          answer: [0],
          explain:
            "Both balls are thrown from the inside and caught on the outside, so their paths cross in an **X** in front of you, with the new throw passing *under* the ball that's coming down. Throw from the outside and the two paths meet head-on.",
          hint: "Throw from the inside, catch on the outside.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Three classic mistakes",
          body:
            "- **The pass.** The second hand flicks its ball flat across to the other hand instead of throwing a real arc. Both balls get caught, so it feels fine, but it won't work with three.\n- **The freeze.** The second hand hangs on to its ball and never throws. You get *throw, catch* instead of *throw, throw, catch, catch*.\n- **Throwing forward.** The arcs drift away from you, and you end up walking after them.\n\nA drop after a good throw is progress. A catch after a bad throw isn't.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 165" font-family="sans-serif" font-size="15" text-anchor="middle" fill="currentColor"><line x1="10" y1="60" x2="350" y2="60" stroke="#1c7ed6" stroke-width="2" stroke-dasharray="6 5"/><text x="350" y="52" text-anchor="end" font-size="14" fill="#1c7ed6">eye height</text><line x1="180" y1="30" x2="180" y2="155" stroke="currentColor" stroke-width="1" opacity="0.3"/><text x="85" y="22" font-weight="bold" fill="#2f9e44">Throw ✓</text><text x="275" y="22" font-weight="bold" fill="#e03131">Pass ✗</text><path d="M140,130 Q85,-10 30,130" fill="none" stroke="#2f9e44" stroke-width="3"/><polygon points="30,130 38.3,122.5 29,118.9" fill="#2f9e44"/><path d="M330,125 Q275,110 220,125" fill="none" stroke="#e03131" stroke-width="3"/><polygon points="220,125 231,127.2 228.3,117.5" fill="#e03131"/><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18,140 Q30,152 42,140"/><path d="M128,140 Q140,152 152,140"/><path d="M208,140 Q220,152 232,140"/><path d="M318,140 Q330,152 342,140"/></g></svg>`,
          caption: "A real throw arcs up to eye height; a pass zips flat across. Only the throw scales to three balls.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "Your friend's exchange: the right hand throws a lovely arc to eye height. As it peaks, the left hand flicks its ball flat and fast across to the right hand at waist height. Both balls are caught. What's wrong?",
          options: [
            "Nothing, both balls were caught",
            "The second ball was passed, not thrown: it should arc to eye height like the first",
            "The second ball was thrown too early",
          ],
          answer: [1],
          explain:
            "That's **the pass**. The timing was right (at the peak), but the second throw must mirror the first: same height, same shape. Catching both balls isn't the goal; two matching throws are.",
          hint: "Compare the two throws.",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "One ball in each hand, in front of a bed. Do single exchanges starting with your right hand: throw, throw, catch, catch, then stop and reset. Go slowly and say the rhythm out loud.",
          minutes: 5,
          focus: [
            "Second throw exactly when the first ball peaks",
            "Both throws reach eye height, as mirror images",
            "Second ball goes from the inside, under the first",
            "A drop is fine if the throw was on time",
          ],
          goal: "10 clean exchanges starting with your right hand.",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "Now start with your left hand. When that feels steady, speed up a little: an exchange, a short pause, then an exchange back the other way.",
          minutes: 5,
          focus: [
            "The weaker hand throws as high as the stronger one",
            "Same rhythm: throw, throw, catch, catch",
            "Feet stay still",
          ],
          goal: "10 clean exchanges starting with your left hand.",
        },
        {
          type: "reveal",
          phase: "reflect",
          prompt: "Think back: which starting hand felt harder, and what went wrong on that side?",
          body:
            "For almost everyone it's the weaker hand, usually because its throw is lower or drifts forward, so the other hand has to reach for it.\n\nThat's your plan for next time: start most exchanges with the weaker hand until both throws look like mirror images.",
        },
        {
          type: "match",
          phase: "reflect",
          prompt: "Match each mistake to its fix.",
          pairs: [
            {
              left: "The second hand flicks its ball flat across",
              right: "Make it a real arc to eye height, a mirror image of the first throw",
            },
            {
              left: "The second hand freezes and never throws",
              right: "Say “throw, throw” out loud, and let the balls drop if they must",
            },
            {
              left: "The balls collide in the middle",
              right: "Wait for the peak, then throw the second ball from the inside, under the first",
            },
            { left: "You keep stepping forward to catch", right: "Throw up, not out: keep both arcs in a flat plane in front of you" },
          ],
          explain:
            "Each fix targets exactly what went wrong: a flat pass needs height, a freeze needs a spoken cue (and permission to drop), a collision needs the right timing and path, and walking needs throws that stay in front of you.",
          hint: "Look for the fix that addresses the cause, not just the symptom.",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt: "Which of these show your exchange is ready for three balls? Select all that apply.",
          options: [
            "Both throws peak at the same height",
            "You can start the exchange with either hand",
            "The rhythm sounds even: throw, throw, catch, catch",
            "You take a step forward on most catches",
            "The second ball travels flat across",
          ],
          answer: [0, 1, 2],
          explain:
            "Matching heights, either-hand starts and an even rhythm are exactly what the cascade needs. Stepping forward means your throws drift, and a flat second ball is the pass, both worth fixing first.",
          hint: "Which ones describe the good habits from this lesson?",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt:
            "Your exchanges feel frantic: the left hand only lets go of its ball when the first ball is almost in it, and you end up snatching. What's the fix?",
          options: [
            "Throw the second ball earlier, as the first one peaks",
            "Throw the second ball even later, after the first one lands",
            "Throw both balls lower so everything is quicker",
            "Throw both balls at the same time",
          ],
          answer: [0],
          explain:
            "The second throw is **late**. Release it when the first ball peaks, and you have half the first ball's flight to get ready for the catch. Lower throws make everything faster, and throwing together means a collision.",
          hint: "What's the cue for the second throw?",
        },
      ],
    },

    // ---- 3. Three balls: the cascade -----------------------------------------------------------
    {
      id: "cascade",
      title: "The Three-Ball Cascade",
      summary: "Chain exchanges into the cascade: the flash, counted runs, a practice plan and troubleshooting.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Today's goal",
          body:
            "**By the end of this session: 5 clean flashes (three throws, three catches), then your first 5-throw run.**\n\nEverything from the last two lessons comes together here. Don't expect endless juggling today; expect a clear next step, and a plan to get the rest.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "The three-ball cascade is two-ball exchanges chained together. With three balls, when does each new throw happen?",
          options: [
            "When the previous ball peaks",
            "When the previous ball lands",
            "Only after both hands have caught something",
            "Whenever your hand feels ready",
          ],
          answer: [0],
          explain:
            "Same cue as the exchange: **every time a ball peaks, throw the next one** from the other hand, under it. Ball 1 peaks, throw ball 2. Ball 2 peaks, throw ball 3. Ball 3 peaks, throw ball 1 again. The hands simply alternate: right, left, right, left.",
          hint: "What was the cue in the two-ball exchange?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Starting position",
          body:
            "Hold **two balls in your dominant hand** and one in the other (these steps assume you're right-handed; swap sides if not). In the full hand, hold the front ball with your fingertips and let the back one rest in your palm. You'll throw the **front** one first.\n\nThe hand holding two always starts. Then each time a ball peaks, the other hand throws. Every throw is the same arc you've practised: from the inside, peaking at eye height.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 215" font-family="sans-serif" font-size="14" text-anchor="middle" fill="currentColor"><text x="335" y="18" text-anchor="end" fill="#f08c00">Right → left: 1, 3, 5</text><text x="335" y="36" text-anchor="end" fill="#1c7ed6">Left → right: 2, 4, 6</text><g fill="none" stroke-width="3"><path d="M215,152 Q155,-52 95,152" stroke="#f08c00"/><path d="M125,152 Q185,-52 245,152" stroke="#1c7ed6"/></g><g fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"><path d="M95,152 Q110,188 125,152"/><path d="M245,152 Q230,188 215,152"/></g><polygon points="95,152 102.6,143.8 93,141" fill="#f08c00"/><polygon points="245,152 247,141 237.4,143.8" fill="#1c7ed6"/><circle cx="155" cy="50" r="12" fill="#f08c00"/><text x="155" y="55" fill="#fff" font-weight="bold">1</text><circle cx="125" cy="146" r="12" fill="#1c7ed6"/><text x="125" y="151" fill="#fff" font-weight="bold">2</text><circle cx="230" cy="168" r="12" fill="#f08c00"/><text x="230" y="173" fill="#fff" font-weight="bold">3</text><text x="110" y="207">Left hand</text><text x="230" y="207">Right hand</text></svg>`,
          caption:
            "The cascade traces a figure 8. Ball 1 is peaking, so ball 2 has just been thrown; ball 3 waits in the right hand for ball 2's peak. Dashed lines: each hand carrying a caught ball inward to throw.",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Put your first three-throw attempt (a “flash”) in order.",
          items: [
            "Hold two balls in your right hand and one in your left",
            "Right hand throws ball 1",
            "As ball 1 peaks, left hand throws ball 2",
            "As ball 2 peaks, right hand throws ball 3",
            "Catch the last ball and stop",
          ],
          explain:
            "Three throws, alternating right, left, right, each triggered by the previous ball's peak. Catches happen in between, but you don't need to think about them: good throws land in your hands on their own.",
          hint: "Each throw waits for the previous ball's peak.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "After a clean flash (three throws, three catches) starting with two balls in your right hand, where do the balls end up?",
          options: [
            "Two in the right, one in the left: back where you started",
            "Two in the left, one in the right",
            "All three in the left",
          ],
          answer: [1],
          explain:
            "The right hand threw twice (balls 1 and 3) and caught once (ball 2); the left threw once and caught twice. So you finish with **two in the left**, the mirror image of your start. Handy: you can flash straight back the other way, which trains your weaker side.",
          hint: "Count how many times each hand throws and catches.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Count your way up",
          body:
            "Don't chase endless juggling yet. Build it in counted steps:\n\n1. **3 throws** (the flash) until it's easy.\n2. **5 throws**, then stop and catch cleanly.\n3. Then 7, and then just **keep going**.\n\nCount your throws out loud, and decide the number *before* you start: stopping on purpose builds control. Keep sessions short (10–15 minutes a day beats an hour once a week), and finish on a good run.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 165" font-family="sans-serif" font-size="14" text-anchor="middle" fill="currentColor"><rect x="15" y="120" width="72" height="35" opacity="0.15"/><rect x="92" y="90" width="72" height="65" opacity="0.25"/><rect x="169" y="60" width="72" height="95" opacity="0.35"/><rect x="246" y="30" width="79" height="125" fill="#2f9e44" opacity="0.7"/><text x="51" y="112">3 throws</text><text x="128" y="82">5 throws</text><text x="205" y="52">7 throws</text><text x="285" y="22">Keep going</text></svg>`,
          caption: "Climb one step at a time; drop back a step when it falls apart.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "You do a clean run of 7 throws, starting with your right hand. How many of those throws did your right hand make?",
          answers: ["4", "four"],
          placeholder: "A number",
          explain:
            "**4.** The hands alternate right, left, right, left, right, left, right, so the starting hand gets the extra throw on any odd count. (And, just like the flash, you finish with two balls in your left hand.)",
          hint: "Write out R, L, R, … until you have seven.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Troubleshooting",
          body:
            "- **Walking forward** to chase the balls: your throws drift forward. Stand facing a wall, close enough that a forward throw would bump into it, or at the edge of a bed.\n- **Collisions:** your throws aren't crossing properly. Every throw goes from the inside, *under* the ball that's peaking, so the paths make an X.\n- **Speeding up until it collapses:** your throws are getting lower. Throw a bit higher; height buys time.\n- **One side lower than the other:** go back to two-ball exchanges that start with your weaker hand.",
        },
        {
          type: "slider",
          phase: "understand",
          prompt:
            "Your throws peak about 0.5 m above your hands, which gives roughly 0.64 s in the air. The pattern feels rushed, so you'd like **twice** the hang time. Drag to the height that doubles it.",
          min: 0.1,
          max: 2.5,
          step: 0.05,
          start: 0.5,
          label: "Peak above your hands",
          unit: "m",
          plot: "2*sqrt(2*x/9.81)",
          xMin: 0,
          xMax: 2.5,
          readout: "2*sqrt(2*v/9.81)",
          readoutLabel: "Hang time (s)",
          answer: 2,
          tolerance: 0.1,
          explain:
            "**About 2 m**: four times the height for twice the time, because hang time grows with the *square root* of height. That's why the fix for a rushed pattern is a *little* higher, not much higher: going from 0.5 m to 0.7 m already buys about 18% more time, while doubling it would put the balls far above your head.",
          hint: "Watch the readout: you're looking for about 1.28 s.",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "Slow and correct first: the flash. Two balls in your right hand, one in your left, facing a wall or over a bed. Throw right, left, right, let everything land, and stop. Reset and repeat.",
          minutes: 5,
          focus: [
            "One throw per peak: right, left, right",
            "Every throw from the inside, up to eye height",
            "Judge the throws, not the catches: drops are fine",
            "Stop after three, even when it's going well",
          ],
          goal: "5 clean flashes in a row (three throws, three catches).",
        },
        {
          type: "practice",
          phase: "practice",
          prompt:
            "Then build the count. Go for 5 throws and stop on purpose. After three clean 5-throw runs, try 7, then just keep going. Count every throw out loud.",
          minutes: 10,
          focus: [
            "Decide the number before you start, and stop cleanly",
            "Keep the throws the same height as the rhythm picks up",
            "If it falls apart, drop back to flashes for a minute",
          ],
          goal: "Three clean 5-throw runs. Bonus: 10 throws in a row.",
        },
        {
          type: "match",
          phase: "reflect",
          prompt: "Match each problem you might have hit to its fix.",
          pairs: [
            {
              left: "You keep walking forward to chase the balls",
              right: "Stand facing a wall or the edge of a bed so throws can't drift forward",
            },
            {
              left: "Balls collide in mid-air",
              right: "Throw each ball from the inside, under the one that's peaking, so the paths form an X",
            },
            { left: "The pattern speeds up until it collapses", right: "Throw a little higher to buy more time" },
            {
              left: "Your left-hand throws peak lower than your right's",
              right: "Drill two-ball exchanges that start with your left hand",
            },
          ],
          explain:
            "Walking forward is a direction problem, collisions are a crossing problem, collapsing is a time problem, and a low side is a weak-hand problem. Name the cause and the fix follows.",
          hint: "Direction, crossing, time, weak hand.",
        },
        {
          type: "choice",
          phase: "reflect",
          prompt:
            "Your friend's cascade dies after 4 or 5 throws. The balls keep clipping each other, and by the end they've taken two steps forward. Which advice will help? Select all that apply.",
          options: [
            "Practise facing a wall",
            "Make every throw go from the inside, under the ball that's peaking",
            "Throw lower and faster to keep up",
            "Watch your hands so you don't miss catches",
            "Go back to 3- and 5-throw counts, stopping on purpose",
          ],
          answer: [0, 1, 4],
          explain:
            "Walking forward means forward throws, and the wall fixes that. Clipping means the throws aren't crossing properly: inside, under the peak. Counted runs rebuild control. Lower, faster throws give you *less* time, and watching your hands pulls your eyes off the peaks.",
          hint: "Match each symptom to its fix; beware advice that removes time or pulls your eyes down.",
        },
        {
          type: "order",
          phase: "reflect",
          prompt: "When a stage falls apart, you drop back one level. Put the ladder in order, from the foundation up.",
          items: [
            "Steady one-ball arcs in both directions",
            "Two-ball exchanges, starting with either hand",
            "Three-throw flash",
            "Five-throw runs",
            "Continuous cascade",
          ],
          explain:
            "Each stage uses the one before it. If a stage falls apart, drop back a level for a few minutes: a messy cascade is almost always a two-ball exchange problem in disguise.",
          hint: "Add one ball, or two throws, at a time.",
        },
        {
          type: "reveal",
          phase: "reflect",
          prompt: "Plan your next session: based on today, what should you practise, and in what order?",
          body:
            "A good 10-minute session:\n\n1. **2 min** one-ball warm-up, both directions, eyes on the peaks.\n2. **3 min** two-ball exchanges, mostly starting with your weaker hand.\n3. **5 min** flashes, then 5-throw runs, counting out loud, facing a wall or over a bed.\n\nStop while it's still going well. Short daily sessions beat long weekly ones, and a lot of the improvement shows up after a night's sleep. Once you hit 20 throws in a row, you're juggling.",
        },
      ],
    },
  ],
};

export default course;

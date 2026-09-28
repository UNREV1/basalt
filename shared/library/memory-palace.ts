import type { LibraryCourse } from "./types.ts";

// ---- figures: small inline SVGs (currentColor plus a few accents, so they read in light and dark mode) ----

const SVG = `xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif"`;

const STAGES_FIG =
  `<svg viewBox="0 0 480 100" ${SVG} text-anchor="middle" fill="currentColor">` +
  `<rect x="10" y="18" width="130" height="64" rx="12" fill="#f59e0b" fill-opacity=".18" stroke="#f59e0b" stroke-width="2"/>` +
  `<rect x="175" y="18" width="130" height="64" rx="12" fill="#3b82f6" fill-opacity=".18" stroke="#3b82f6" stroke-width="2"/>` +
  `<rect x="340" y="18" width="130" height="64" rx="12" fill="#22c55e" fill-opacity=".18" stroke="#22c55e" stroke-width="2"/>` +
  `<text x="75" y="46" font-size="17" font-weight="bold">Encoding</text><text x="75" y="68" font-size="14">getting it in</text>` +
  `<text x="240" y="46" font-size="17" font-weight="bold">Storage</text><text x="240" y="68" font-size="14">keeping it</text>` +
  `<text x="405" y="46" font-size="17" font-weight="bold">Retrieval</text><text x="405" y="68" font-size="14">getting it out</text>` +
  `<path d="M142 50H164M307 50H329" stroke="currentColor" stroke-width="2"/>` +
  `<path d="M173 50l-9-5v10zM338 50l-9-5v10z"/>` +
  `</svg>`;

const DUAL_FIG =
  `<svg viewBox="0 0 440 150" ${SVG} text-anchor="middle" fill="currentColor">` +
  `<rect x="15" y="14" width="150" height="46" rx="10" fill="none" stroke="currentColor" stroke-width="2"/>` +
  `<text x="90" y="44" font-size="18" font-style="italic">“banana”</text>` +
  `<path d="M40 102Q95 150 150 92Q95 124 40 102Z" fill="#eab308" stroke="#a16207" stroke-width="1.5"/>` +
  `<path d="M148 94l8-8" stroke="#a16207" stroke-width="3"/>` +
  `<circle cx="360" cy="78" r="52" fill="#a855f7" fill-opacity=".15" stroke="#a855f7" stroke-width="2"/>` +
  `<text x="360" y="84" font-size="17">memory</text>` +
  `<path d="M170 37L298 62M158 100L297 88" stroke="currentColor" stroke-width="2"/>` +
  `<path d="M0 0l-11-5.5v11z" transform="translate(308 64) rotate(11)"/>` +
  `<path d="M0 0l-11-5.5v11z" transform="translate(308 87) rotate(-5)"/>` +
  `<text x="235" y="36" font-size="14" opacity=".75">word route</text>` +
  `<text x="230" y="120" font-size="14" opacity=".75">picture route</text>` +
  `</svg>`;

const STANDOUT_FIG =
  `<svg viewBox="0 0 420 100" ${SVG} text-anchor="middle" fill="currentColor">` +
  [15, 72, 129, 243, 300, 357].map((x) => `<rect x="${x}" y="20" width="40" height="40" rx="6" fill-opacity=".25"/>`).join("") +
  `<polygon points="206,16 211.9,31.9 228.8,32.6 215.5,43.1 220.1,59.4 206,50 191.9,59.4 196.5,43.1 183.2,32.6 200.1,31.9" fill="#ef4444"/>` +
  `<text x="210" y="90" font-size="15">Which one will you remember?</text>` +
  `</svg>`;

/** The practice palace from lesson 2: six numbered stops along a dashed route, labeled with their names or with the item placed at each. */
const LOCI = [
  { x: 70, y: 210, name: "Front door", lx: 70, ly: 240, anchor: "middle" },
  { x: 35, y: 110, name: "Mirror", lx: 14, ly: 88, anchor: "start" },
  { x: 200, y: 160, name: "Sofa", lx: 200, ly: 190, anchor: "middle" },
  { x: 250, y: 70, name: "TV", lx: 232, ly: 75, anchor: "end" },
  { x: 380, y: 75, name: "Sink", lx: 380, ly: 55, anchor: "middle" },
  { x: 420, y: 170, name: "Fridge", lx: 445, ly: 198, anchor: "end" },
];

function palaceFig(items?: string[]): string {
  return (
    `<svg viewBox="0 0 460 250" ${SVG} font-size="14" fill="currentColor">` +
    `<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><rect x="10" y="10" width="440" height="200" rx="4"/>` +
    `<path d="M130 10V120M130 170V210M310 10V40M310 90V210"/></g>` +
    `<g text-anchor="middle" opacity=".6"><text x="70" y="32">Hall</text><text x="220" y="32">Living room</text><text x="380" y="32">Kitchen</text></g>` +
    `<polyline points="70,210 35,110 130,145 200,160 250,70 310,68 380,75 420,170" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-dasharray="6 5"/>` +
    LOCI.map(
      (l, i) =>
        `<circle cx="${l.x}" cy="${l.y}" r="13" fill="#f59e0b"/>` +
        `<text x="${l.x}" y="${l.y + 5}" text-anchor="middle" font-weight="bold" fill="#111">${i + 1}</text>` +
        (items
          ? `<text x="${l.lx}" y="${l.ly}" text-anchor="${l.anchor}" font-weight="bold" fill="#db2777">${items[i]}</text>`
          : `<text x="${l.lx}" y="${l.ly}" text-anchor="${l.anchor}">${l.name}</text>`),
    ).join("") +
    `</svg>`
  );
}

/** A row of Major System code cards: digit on top, its sounds below. */
function codeFig(cols: [string, string, string?][]): string {
  return (
    `<svg viewBox="0 0 460 110" ${SVG} text-anchor="middle" fill="currentColor">` +
    cols
      .map(([digit, sound, more], i) => {
        const x = 46 + i * 92;
        return (
          `<rect x="${x - 42}" y="6" width="84" height="98" rx="10" fill="#3b82f6" fill-opacity=".12" stroke="#3b82f6" stroke-width="1.5"/>` +
          `<text x="${x}" y="44" font-size="32" font-weight="bold" fill="#3b82f6">${digit}</text>` +
          `<text x="${x}" y="72" font-size="15">${sound}</text>` +
          (more ? `<text x="${x}" y="92" font-size="14">${more}</text>` : "")
        );
      })
      .join("") +
    `</svg>`
  );
}

const WORKED_FIG =
  `<svg viewBox="0 0 460 170" ${SVG} text-anchor="middle" fill="currentColor">` +
  `<g font-size="14" opacity=".6" text-anchor="start"><text x="10" y="34">digits</text><text x="10" y="90">sounds</text><text x="10" y="146">word</text></g>` +
  `<text x="150" y="38" font-size="30" font-weight="bold" fill="#3b82f6">9 2</text>` +
  `<text x="330" y="38" font-size="30" font-weight="bold" fill="#3b82f6">1 4</text>` +
  `<text x="150" y="64" font-size="18">↓</text><text x="330" y="64" font-size="18">↓</text>` +
  `<text x="150" y="92" font-size="18">p/b · n</text><text x="330" y="92" font-size="18">t/d · r</text>` +
  `<text x="150" y="118" font-size="18">↓</text><text x="330" y="118" font-size="18">↓</text>` +
  `<text x="150" y="150" font-size="26" font-weight="bold" fill="#d97706">bone</text>` +
  `<text x="330" y="150" font-size="26" font-weight="bold" fill="#d97706">tree</text>` +
  `</svg>`;

// ---- the course ------------------------------------------------------------------------

const course: LibraryCourse = {
  id: "memory-palace",
  title: "Memory Palace",
  icon: "🏛️",
  blurb:
    "Turn forgettable lists and numbers into vivid scenes placed along a route you already know. Learn why the trick works, build your first palace, and crack numbers with the Major System.",
  ability: "int",
  skill: { name: "Memory", icon: "🧠" },
  lessons: [
    // ------------------------------------------------------------------ 1
    {
      id: "how-memory-works",
      title: "Why some things stick",
      summary: "Why vivid, strange, emotional and well-placed images beat a plain list.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "This course turns your memory into a tool you can steer. First: why some things stick and others vanish. Then you'll build a **memory palace** to hold lists in order, and finally use the **Major System** to remember numbers.\n\nBy the end of this lesson you'll be able to turn any dull item into an image that's hard to forget.",
        },
        {
          type: "choice",
          phase: "preview",
          prompt:
            "First, a prediction. Two people get two minutes with the same list of 20 words. One repeats the words over and over. The other pictures each word in a strange little scene. Who usually recalls more?",
          options: [
            "The repeater: repetition is how memory works",
            "The picturer",
            "Neither: only the time spent matters",
          ],
          answer: [1],
          explain:
            "In classic experiments from the 1960s and 70s, people told to form mental images recalled far more than people told to simply repeat the words, with the same study time. Repeating keeps words in mind for a moment, but on its own it does surprisingly little to make them last.",
          hint: "Same time, different activity. Which one does more with each word?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Memory is built, not recorded",
          body:
            "Your memory isn't a video camera. It works in three stages: **encoding** (getting it in), **storage** (keeping it) and **retrieval** (getting it out).\n\nThe stage you control most is encoding. The more you *do* with something when you first meet it (think about what it means, picture it, link it to what you already know), the more ways you'll have to find it again later.",
          figure: STAGES_FIG,
          caption: "The three stages of memory.",
        },
        {
          type: "input",
          phase: "understand",
          prompt:
            "You can't think of an actor's name. Then a friend says \"it starts with M\" and it pops straight into your head. The name was stored all along. Which stage was failing?",
          answers: ["retrieval", "retrieving", "recall", "recalling"],
          placeholder: "one word",
          explain:
            "**Retrieval.** The name was encoded and stored; you just lacked the right cue to reach it. That's why good encoding builds lots of cues: meanings, images, links and places all give you more ways back in.",
          hint: "Getting it in, keeping it, or getting it out?",
        },
        {
          type: "order",
          phase: "understand",
          prompt:
            "Three people see the word **piano** in a list, and each answers a different question about it. Order them from the one who'll remember it **least** to the one who'll remember it **best**.",
          items: [
            "“Is it written in capital letters?”",
            "“Does it rhyme with *soprano*?”",
            "“Does it fit in: *She played the ___ at the wedding*?”",
          ],
          explain:
            "This mirrors a classic experiment (Craik and Tulving, 1975). Judging how a word *looks* gave the weakest memory, judging how it *sounds* did better, and judging what it *means* did best. Thinking about meaning is \"deeper\" processing, and deeper processing leaves a stronger memory.",
          hint: "Which question makes you think about what a piano actually is?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Pictures and hooks",
          body:
            "Words you can picture (*banana*, *hammer*) are remembered better than abstract ones (*truth*, *idea*), and pictures are remembered better than words. One explanation is **dual coding**: a picturable word gets stored twice, as a word and as an image, so there are two routes back to it.\n\nThe other big lever is **association**. Memories are found through cues, and every link to something you already know is one more cue.",
          figure: DUAL_FIG,
          caption: "A word you can picture has two routes back to the memory.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "Why is a plain shopping list (milk, eggs, bread, soap) so easy to forget?",
          body:
            "Every item is ordinary, the items look alike, and they aren't connected to each other or to anything you know. There's no picture, no feeling, no place. Nothing makes one item stand out, and nothing leads you from one item to the next. Fix those things and the same list becomes easy.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Strange, connected, felt",
          body:
            "Three more things help an image stick:\n\n- **Distinctiveness.** An item that stands out from its surroundings is remembered better (the *von Restorff effect*). Strangeness helps mostly because it makes things stand out.\n- **Interaction.** In classic studies, what mattered most was joining the items into one scene where they *do something* to each other, more than weirdness on its own.\n- **Emotion.** Things that make you laugh, wince or feel disgusted tend to be remembered better than neutral ones.",
          figure: STANDOUT_FIG,
          caption: "The odd one out gets remembered.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You need to buy **eggs** and a **hammer**. Which image will probably work best?",
          options: [
            "An egg sitting next to a hammer on a shelf",
            "A hammer smashing a giant egg that splatters warm yolk all over your shoes",
            "The words EGGS and HAMMER in big bold letters",
            "A picture of an egg, and separately a picture of a hammer",
          ],
          answer: [1],
          explain:
            "The smashing scene has everything: the two items **interact**, it's oversized and vivid, you can feel it, and it's a bit gross. Each item now cues the other. An egg *next to* a hammer is an image but nothing happens, separate pictures aren't linked at all, and bold words are still just words.",
          hint: "Look for the option where the two things actually do something to each other.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which changes would make a mental image **more** memorable? Select all that apply.",
          options: [
            "Make it huge or exaggerated",
            "Make the items interact: one does something to the other",
            "Keep it neat, realistic and ordinary",
            "Add a sound, smell or texture",
            "Picture each item alone on a plain white background",
          ],
          answer: [0, 1, 3],
          explain:
            "Exaggeration makes an image distinctive, interaction links the items, and senses add extra cues. A neat, ordinary image blends in with everything else you've ever seen, and items floating alone on white have nothing tying them together.",
          hint: "Two of these make the image blend in, or keep the items apart.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Your brain loves places",
          body:
            "You can probably walk through every room of your home in your mind, in order, without ever having tried to memorize it. Memory for places and routes is remarkably strong.\n\nThe **method of loci** (*loci* is Latin for \"places\") uses that. When researchers studied world-class memory competitors (Maguire and colleagues, 2003), they found no sign of unusual intelligence or unusual brains. What they found was a method: most of them used this route-based technique, and while memorizing, brain areas involved in spatial navigation were especially active.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "Explain to a friend, in plain words, why picturing a hammer smashing a giant egg is easier to remember than reading the words \"eggs, hammer\".",
          keyPoints: [
            "How well you remember depends on what you do with information as you take it in (encoding)",
            "A picture gives a second route back to the memory, on top of the word",
            "Making the two items interact links them, so each one reminds you of the other",
            "Strange, vivid, emotional or sensory details make it stand out from everything else",
          ],
          model:
            "When you just read \"eggs, hammer\", you barely do anything with the words, so they leave a faint trace. Picturing a hammer smashing a giant egg does much more: you store a picture as well as the words, so there are two ways to find it later. The two things are doing something to each other, so thinking of one drags up the other. And it's strange, a bit gross, and you can almost feel the yolk on your shoes, which makes it stand out from all the ordinary things you see every day.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each principle to an example of it.",
          pairs: [
            { left: "Imagery", right: "Picturing a banana instead of just reading the word" },
            { left: "Association", right: "Linking your new colleague Rose to the rose bush by your door" },
            { left: "Distinctiveness", right: "One purple cow in a field of ordinary ones" },
            { left: "Emotion", right: "A scene so gross or funny it makes you wince or laugh" },
            { left: "Location", right: "Leaving a mental image of your keys on your doormat" },
          ],
          explain:
            "Each one gives memory something to grab: a picture, a link to what you know, something that stands out, a feeling, or a place. The best images use several at once.",
        },
        {
          type: "choice",
          phase: "recall",
          prompt: "In the *piano* experiment, which kind of question led to the best memory for the word?",
          options: ["How the word looks", "How the word sounds", "What the word means"],
          answer: [2],
          explain:
            "Meaning. Thinking about what a word means is deeper processing than noticing its letters or its sound, and deeper processing leaves a stronger, easier-to-find memory.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "New situation: you must remember to pack your **passport**, **charger** and **sunscreen** tomorrow morning. Which plan uses the most of what you've learned?",
          options: [
            "Say \"passport, charger, sunscreen\" ten times before bed",
            "Picture your passport jammed in the front door lock, a charger cable snaking out of your pillow and zapping your ear, and sunscreen squirting all over your toothbrush",
            "Write the list in capital letters so it looks important",
            "Imagine a normal passport, charger and bottle of sunscreen side by side",
          ],
          answer: [1],
          explain:
            "It uses vivid, interacting, sensory (and slightly painful) images, and puts each one at a **place** you'll actually pass: the door, your pillow, your toothbrush. That's the method of loci in miniature, and exactly what the next lesson builds. Rote repetition and capital letters are shallow; ordinary objects side by side don't stand out or connect.",
          hint: "Which plan uses images, action, feeling *and* places?",
        },
      ],
    },

    // ------------------------------------------------------------------ 2
    {
      id: "first-palace",
      title: "Build your first memory palace",
      summary: "Pick a route you know, place vivid images along it, then walk back through to recall a list in order.",
      steps: [
        {
          type: "explain",
          phase: "preview",
          title: "Where this fits",
          body:
            "Last lesson you saw what makes memories stick: vivid, interacting images, and places, which your brain holds onto easily. A **memory palace** puts the two together.\n\nBy the end of this lesson you'll have built one and used it to recall a six-item shopping list, in order, after a single pass.",
        },
        {
          type: "reveal",
          phase: "preview",
          prompt:
            "Start with what you already know. Imagine walking from your front door to your bed. Could you name five things you'd pass, in order?",
          body:
            "Almost everyone can, instantly, even though they never tried to memorize their home. That route is already stored, in order, in rich detail. A memory palace borrows it: you hang new things you want to remember on places you already know.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The method of loci",
          body:
            "The story is over 2,000 years old. The Greek poet **Simonides of Ceos** stepped out of a banquet moments before the roof collapsed. The victims couldn't be recognized, but Simonides named them all by remembering *where each guest had been sitting*. (The tale comes to us mainly from the Roman orator Cicero.)\n\nThe method:\n\n1. Choose a place you know well.\n2. Pick a fixed route through it with distinct stops, the **loci**.\n3. At each stop, place a vivid image of one thing to remember.\n4. To recall, walk the route in your mind and look at what's there.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which would make good stops (loci) for a memory palace? Select all that apply.",
          options: [
            "Your front door",
            "The kitchen sink",
            "A blank stretch of hallway wall",
            "Your bed",
            "Ten identical steps on a staircase",
          ],
          answer: [0, 1, 3],
          explain:
            "Good loci are **distinct**, **fixed** and easy to picture, like a door, a sink or a bed. A blank wall gives an image nothing to hold on to, and identical steps blur together, so you'd lose track of which image was on which step.",
          hint: "Could you tell each stop apart from the others with your eyes closed?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Your practice palace",
          body:
            "For practice, borrow this small apartment (or swap in similar spots from your own home, which is even better). There are six stops, always walked in the same order:\n\n1. **Front door**\n2. **Hall mirror**\n3. **Sofa**\n4. **TV**\n5. **Kitchen sink**\n6. **Fridge**\n\nWalk it twice in your mind, front door to fridge, until you can do it without looking.",
          figure: palaceFig(),
          caption: "Six stops, always in the same order.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Place your shopping list",
          body:
            "Now put one item at each stop. Spend a few seconds really *seeing* each scene:\n\n1. **Front door:** the door is a giant loaf of **bread**. You tear through the warm crust to get in.\n2. **Hall mirror:** your reflection is a monkey stuffing **bananas** into its mouth.\n3. **Sofa:** it's soaked in cold **milk**, which squelches through your clothes as you sit.\n4. **TV:** **batteries** pour out of the screen like a waterfall, sparking as they hit the floor.\n5. **Kitchen sink:** the tap gushes hot black **coffee**, and the smell fills the room.\n6. **Fridge:** you open it and a dozen **eggs** leap out and smash on your feet.",
          figure: palaceFig(["bread", "bananas", "milk", "batteries", "coffee", "eggs"]),
          caption: "One vivid scene per stop.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Why does a memory palace use a **fixed** route instead of wandering around the rooms?",
          options: [
            "The fixed order of the stops gives you the order of the items for free",
            "Images only stick while you're moving forward",
            "Wandering uses up memory, so the images fade",
          ],
          answer: [0],
          explain:
            "The route is the index. Because the stops always come in the same order, the items do too. You can even jump straight to the 4th stop, or walk the route backwards to recite the list in reverse. The other two options sound plausible but aren't how memory works.",
          hint: "What does the route give you that a random pile of images wouldn't?",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "Now test your palace. Walk your route: what did you leave on the **sofa**?",
          answers: ["milk", "cold milk"],
          placeholder: "one word",
          explain:
            "**Milk**, soaking cold through your clothes. Notice how the feeling of sitting in it helps bring it back.",
          hint: "Picture sitting down on it. What do you feel?",
          figure: palaceFig(),
          caption: "Walk the route: 1 → 6.",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "Which item is waiting at the **4th** stop?",
          answers: ["batteries", "battery"],
          placeholder: "one word",
          explain:
            "**Batteries**, pouring out of the TV. You didn't have to recite the whole list to find it: you went to the 4th stop and looked.",
          hint: "Front door, mirror, sofa, then…?",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "Walk the whole route and put your shopping list in order.",
          items: ["Bread", "Bananas", "Milk", "Batteries", "Coffee", "Eggs"],
          explain:
            "Bread, bananas, milk, batteries, coffee, eggs. If you got them all, you just recalled six items in order after a single pass, with no repetition. That's the method working.",
          hint: "Start at the front door.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "A friend has never heard of a memory palace. Explain how to use one to remember a shopping list, and why it keeps the items in order.",
          keyPoints: [
            "Pick a place you know well and a fixed route through it with distinct stops",
            "Put one vivid, interacting image of each item at each stop",
            "To remember, walk the route in your mind and look at what's at each stop",
            "The route's fixed order gives the list its order, and places are easy for the brain to hold",
          ],
          model:
            "Think of your home and a route through it you could walk with your eyes closed: front door, mirror, sofa, and so on. For each thing on your list, make a crazy, vivid picture and stick it at the next stop, like a door made of bread or a monkey eating bananas in the mirror. In the shop, walk the route in your head and look at what's at each stop. You already know your home by heart, so the stops are easy to find, and because you always walk them in the same order, the items come back in order too.",
        },
        {
          type: "order",
          phase: "recall",
          prompt: "From memory: put the steps of the method of loci in order.",
          items: [
            "Choose a place you know well",
            "Pick a fixed route with distinct stops",
            "Place a vivid image of each item at a stop",
            "Walk the route in your mind to read the items back",
          ],
          explain:
            "Place, route, images, walk. The first two steps only need doing once: a good palace can be reused for list after list.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "Your list is still in the palace. Match each stop to what's waiting there.",
          pairs: [
            { left: "Front door", right: "Bread" },
            { left: "Hall mirror", right: "Bananas" },
            { left: "Kitchen sink", right: "Coffee" },
            { left: "Fridge", right: "Eggs" },
          ],
          explain:
            "A door of bread, a banana-eating monkey in the mirror, a coffee tap, and eggs leaping from the fridge, still there after a few minutes of other work. Walk the route once more tomorrow: spaced review keeps a palace fresh.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "New problem: you want to memorize the 8 main points of a speech, in order, but your palace only has 6 stops. Which fixes make sense? Select all that apply.",
          options: [
            "Add two more distinct stops to the end of your route",
            "Put two points at some stops, joined into one scene",
            "Drop the last two points",
            "Pile all eight images at the front door",
          ],
          answer: [0, 1],
          explain:
            "Extending the route or doubling up at a stop both keep every point in a clear place and in order; if you double up, make the two images interact so one leads to the other (lesson 1). Competitive memorizers often put two or three images at each stop. Dropping points defeats the purpose, and piling eight images in one spot throws away the order the route was giving you.",
          hint: "Which options keep both *every* point and their *order*?",
        },
      ],
    },

    // ------------------------------------------------------------------ 3
    {
      id: "major-system",
      title: "Numbers with the Major System",
      summary: "Turn digits into consonant sounds, sounds into words, and words into pictures you can place in your palace.",
      steps: [
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Your palace holds pictures, but PINs, dates and phone numbers aren't pictures. Why is a 10-digit number so much harder to remember than 10 everyday objects?",
          options: [
            "Digits are abstract and look alike, so there's nothing vivid to picture",
            "Numbers are kept in a separate, smaller memory",
            "Only some people are born with a head for numbers",
          ],
          answer: [0],
          explain:
            "You can't picture a 7 *doing* anything, and the same ten symbols repeat over and over, so they blur together. Objects are concrete and distinct, exactly what memory likes. The fix isn't a special number memory; it's turning digits into objects. By the end of this lesson you'll read a 6-digit code back out of your palace.",
          hint: "Think back to what makes images stick.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Digits become sounds",
          body:
            "The **Major System**, an idea that goes back to the 1600s, gives each digit a consonant sound. Sounds make words, and words make pictures. The first five, each with a hook:\n\n- **0 = s, z**: *z* is for *zero*.\n- **1 = t, d**: a *t* has one downstroke.\n- **2 = n**: an *n* has two downstrokes.\n- **3 = m**: an *m* has three.\n- **4 = r**: *four* ends in r.\n\nNotice the pairs: t and d (like s and z) are made with your mouth in the same position.",
          figure: codeFig([
            ["0", "s, z"],
            ["1", "t, d"],
            ["2", "n"],
            ["3", "m"],
            ["4", "r"],
          ]),
          caption: "Digits 0–4 and their sounds.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each digit to its sound.",
          pairs: [
            { left: "0", right: "s, z" },
            { left: "1", right: "t, d" },
            { left: "2", right: "n" },
            { left: "3", right: "m" },
            { left: "4", right: "r" },
          ],
          explain: "Zero starts with z, t has one downstroke, n two, m three, and four ends in r.",
          hint: "Count the downstrokes for 1, 2 and 3.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "The other five",
          body:
            "- **5 = l**: L is the Roman numeral for 50.\n- **6 = j, sh, ch, soft g** (as in *gem*): a capital G looks like a 6.\n- **7 = k, hard c, hard g** (as in *cat* and *go*): you can draw a K from two 7s.\n- **8 = f, v**: a handwritten f has two loops, like an 8.\n- **9 = p, b**: P is a mirrored 9, and b is a 9 turned upside down.",
          figure: codeFig([
            ["5", "l"],
            ["6", "j, sh, ch", "soft g"],
            ["7", "k, hard c", "hard g"],
            ["8", "f, v"],
            ["9", "p, b"],
          ]),
          caption: "Digits 5–9 and their sounds.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each digit to its sounds.",
          pairs: [
            { left: "5", right: "l" },
            { left: "6", right: "j, sh, ch, soft g" },
            { left: "7", right: "k, hard c, hard g" },
            { left: "8", right: "f, v" },
            { left: "9", right: "p, b" },
          ],
          explain: "L is 50, G looks like 6, K is built from 7s, f has 8's two loops, and P is a mirrored 9.",
          hint: "Start with the shapes: which letter looks like a mirrored 9?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Sounds, not spelling",
          body:
            "Two rules make it work:\n\n- **Only consonant sounds count.** Vowels (a, e, i, o, u) and **w, h, y** are free fillers you add to make words.\n- **Go by sound, not spelling.** Silent letters don't count, a double letter counts once, and *ph* sounds like f.\n\nSo **tie** = 1, **Noah** = 2, **lion** = 52, **knee** = 2 (silent k), **bell** = 95, **phone** = 82, and **gym** = 63 (soft g) but **gum** = 73 (hard g).",
        },
        {
          type: "input",
          phase: "understand",
          prompt: "What number does **cat** encode?",
          answers: ["71", "seventy-one", "seventy one"],
          placeholder: "a number",
          explain: "The c in *cat* is hard (a k sound) = **7**, the a is free, and t = **1**: **71**.",
          hint: "Is the c in *cat* hard or soft?",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "What number does **knife** encode?",
          options: ["728", "28", "82", "2"],
          answer: [1],
          explain:
            "The k and the final e are silent, so only n (2) and f (8) count: **28**. 728 counts the silent k, 82 reverses the order, and 2 forgets the f.",
          hint: "Say it out loud. Which consonants can you actually hear?",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these words encode **14**? Select all that apply.",
          options: ["tree", "dry", "drum", "tomb", "rat"],
          answer: [0, 1],
          explain:
            "**Tree** (t, r) and **dry** (d, r; y is free) are both 14. **Drum** is 143 (the m counts), **tomb** is 13 (silent b, and no r), and **rat** is 41: the right sounds in the wrong order.",
          hint: "You need a t or d sound, then an r sound, and nothing else.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "From number to picture",
          body:
            "To store **9214**, split it into pairs: **92** and **14**.\n\n- 92 = p/b then n → **bone**\n- 14 = t/d then r → **tree**\n\nMake one vivid scene and put it at a stop in your palace: a tree growing through your front door, hung with bones like fruit. Later, walk to the stop, see the scene, and decode the words back into digits.\n\nMany people build one fixed image for every pair from 00 to 99 (00 *sauce*, 01 *suit*, 02 *sun*, 10 *toes*, 11 *toad*…), so numbers turn into pictures almost instantly.",
          figure: WORKED_FIG,
          caption: "9214 becomes a bone and a tree.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "Your turn: turn **32** into something you can picture. (3 = m, 2 = n.)",
          body:
            "**Moon**, **man**, **mine**, **mane**, **omen**, **money**… Any word works as long as its consonant sounds are exactly m, then n. Pick the one that's easiest for *you* to picture, and use it every time you meet 32.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain to a friend how the Major System turns the number 9214 into something they could remember for a week.",
          keyPoints: [
            "Each digit stands for a consonant sound (9 = p/b, 2 = n, 1 = t/d, 4 = r)",
            "Vowels and w, h, y are free, so you can build words: 92 → bone, 14 → tree",
            "It goes by sound, not spelling",
            "The words make vivid pictures you can place in a memory palace; decoding them gives the digits back",
          ],
          model:
            "Digits are hard to remember because you can't picture them. The Major System gives every digit a consonant sound: 9 is p or b, 2 is n, 1 is t or d, 4 is r. Split 9214 into 92 and 14, then add any vowels you like to make words: b-o-n-e for 92 and t-r-ee for 14. It's the sounds that count, not the spelling. Now picture a tree growing through your front door with bones hanging off it. Later you see the scene, read off the sounds b-n and t-r, and get 9-2-1-4 back.",
        },
        {
          type: "order",
          phase: "recall",
          prompt: "From memory: put the steps for memorizing a long number in order.",
          items: [
            "Split the number into two-digit chunks",
            "Turn each digit into its consonant sound",
            "Add vowels to make a word you can picture",
            "Place each image at the next stop in your palace",
            "Later, walk the route and decode each word back into digits",
          ],
          explain:
            "Chunk, sound, word, place, then walk and decode. The palace keeps the chunks in order; the Major System turns each chunk back into digits.",
        },
        {
          type: "input",
          phase: "recall",
          prompt: "No peeking at the code: what number does **lamp** encode?",
          answers: ["539"],
          placeholder: "a number",
          explain: "l = **5**, m = **3**, p = **9**, and the a is free: **539**.",
        },
        {
          type: "input",
          phase: "apply",
          prompt:
            "Final challenge: you stored a 6-digit code in your palace from lesson 2: a **nail** hammered into the front door, a **mug** shattering against the mirror, and a **rope** tied around the sofa. What's the code?",
          answers: ["253749", "25 37 49", "25-37-49"],
          placeholder: "6 digits",
          explain:
            "Nail = n, l = **25**. Mug = m, hard g = **37**. Rope = r, p = **49**. Walk the route in order (door, mirror, sofa): **253749**.",
          hint: "Decode each word into two digits, then read them in route order.",
        },
      ],
    },
  ],
};

export default course;

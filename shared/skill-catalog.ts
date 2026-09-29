// The whole skill tree, planned up front and built in: every ability's general
// topics (fields), their sub-topics in learning order, the details you learn
// between one sub-topic and the next, and the advanced skills beyond them.
// Titles only: lessons are written when you get there. Nothing is skipped:
// each detail needs the one before it, each sub-topic needs every detail of
// the one before, and an advanced skill needs what it builds on, from any
// field (Software development needs Programming, Computer science and Math).
//
// The map shows all of it as planned skills; a skill becomes yours (a real
// skill with a page) when you start it (see shared/skill-map.ts).

export type CatalogTier = "general" | "sub" | "detail" | "advanced";

export interface CatalogEntry {
  /** Stable id: "int/mathematics/algebra/linear-equations". */
  key: string;
  name: string;
  /** Ability (area) id: str, dex, con, int, wis, cha. */
  ability: string;
  tier: CatalogTier;
  icon: string;
  description?: string;
  /** The entry it's part of: the general topic for sub-topics and advanced skills, the sub-topic (or advanced skill) for details. */
  parent?: string;
  /** Keys that must be learnt first: the step before, the sub-topic before, and anything it builds on in other fields. */
  needs: string[];
  /** The general topic it belongs to (its own key for a general topic). */
  field: string;
  /** Position among its siblings. */
  order: number;
}

/*
 * Format:
 *   @int                                   the ability for what follows
 *   # Name | icon | description            a general topic; "# Name ~ | …" when its sub-topics can go in any order
 *   Sub-topic < Need, Field / Need: a; b   a sub-topic and its details, in order (needs are optional)
 *   + Advanced < Need, Field / Need: a; b  an advanced skill and its details (it needs the last sub-topic when none are given)
 */
const TEXT = `
@str
# Athletics | 🏋️ | Strength training and sport
Movement basics: Squat pattern; Hinge pattern; Push and pull patterns; Bracing and posture; Loaded carries
Bodyweight strength: Push-ups; Rows and pull-ups; Squats and lunges; Core and planks; Dips
Barbell lifts: Back squat; Deadlift; Bench press; Overhead press; Barbell rows
Training programs: Progressive overload; Sets, reps and rest; Deloads and recovery; Tracking your lifts
+ Powerlifting < Barbell lifts, Training programs: Competition technique; Peaking for a meet; Attempt selection
+ Olympic weightlifting < Barbell lifts: The snatch; The clean and jerk; Mobility for lifting
+ Calisthenics skills < Bodyweight strength: Muscle-up; Pistol squat; Handstand push-up; Front lever

# Climbing | 🧗 | Boulder and climb: grip, technique and nerve
Climbing basics < Athletics / Movement basics: Footwork; Grips and holds; Body positioning; Falling safely
Bouldering: Reading problems; Dynamic moves; Overhangs; Projecting
Rope climbing: Knots; Belaying; Top-rope climbing; Lead climbing
Training for climbing: Finger strength; Power endurance; Injury prevention
+ Outdoor climbing < Rope climbing: Rock types and ethics; Anchors; Multi-pitch climbing

# Swimming | 🏊 | From water confidence to open water
Water skills: Floating; Breathing; Kicking; Treading water
Strokes: Freestyle; Backstroke; Breaststroke; Butterfly
Swim fitness: Drills; Interval sets; Turns and push-offs
+ Open-water swimming < Swim fitness: Sighting; Cold water; Safety in open water

# Martial arts | 🥋 | Self-defense and combat sports
Fundamentals: Stance and footwork; Guard; Breakfalls; Conditioning
Striking: Punches; Kicks; Combinations; Blocking and slipping
Grappling: Takedowns; Positions; Escapes; Submissions
Sparring: Controlled sparring; Timing and distance; Fight strategy
+ Self-defense < Sparring: Awareness and avoidance; De-escalation; Escaping holds

@dex
# Acrobatics | 🤸 | Mobility, balance, yoga and tumbling
Mobility: Hips; Shoulders; Spine; Ankles and wrists
Balance: Single-leg balance; Balance boards; Slacklining
Yoga: Foundational poses; Sun salutations; Breath and flow; Inversions
Tumbling: Rolls; Cartwheels; Handstands; Round-offs
+ Advanced acrobatics < Tumbling: Back handspring; Aerials; Partner acrobatics

# Dance | 💃 | Rhythm, movement and style
Dance foundations: Moving to the beat; Posture and frame; Footwork; Spins and turns
Partner dance: Leading and following; Salsa basics; Bachata basics; Swing basics
Street dance: Grooves; Popping and locking; Breaking basics; Freestyle
Ballet and contemporary: Ballet positions; Barre work; Floor work; Improvisation
+ Choreography < Partner dance, Street dance: Musicality; Building a routine; Teaching a routine; Performing it

# Sleight of Hand ~ | 🪄 | Quick, precise hands
Touch typing: Home row; All the letters; Numbers and symbols; Speed and accuracy
Juggling: Three-ball cascade; Juggling tricks; Four and five balls
Card magic: Card handling; False shuffles; Forces; Card routines
Coin magic: Palms; Vanishes; Productions
+ Close-up magic < Card magic, Coin magic: Misdirection; Patter; Performing for people

# Drawing | ✏️ | From lines to finished pictures
Drawing basics: Lines and shapes; Contour drawing; Shading and value; Perspective
Observation: Still life; Proportions; Light and shadow
Figure drawing: Gesture; Anatomy for artists; Faces; Hands
Color: Color theory; Color mixing; Painting basics
Composition: Framing; Focal points; Storytelling in pictures
+ Digital art < Color: Digital tools; Layers and brushes; Digital painting
+ Illustration < Figure drawing, Composition: Character design; Environments; Finding your style

# Musical instrument | 🎹 | Play an instrument: posture to performance
Instrument basics: Posture and technique; First notes; Reading notation or tabs; Practice habits
Rhythm: Pulse and counting; Note values; Syncopation
Chords and scales: Major scales; Minor scales; Basic chords; Arpeggios
Playing songs: Simple songs; Accompaniment; Playing with others
Musicianship < Performance / Music theory: Dynamics and expression; Improvisation; Performing
+ Advanced technique < Musicianship: Speed and precision; Extended techniques; Building a repertoire

# Crafts ~ | 🧵 | Make things by hand
Woodworking: Tools and safety; Measuring and cutting; Joinery; Finishing
Sewing: Hand stitches; Sewing machine; Patterns; Alterations
Knitting: Casting on; Knit and purl; Reading patterns; Finishing a piece
Ceramics: Hand building; The wheel; Glazing and firing
+ Furniture making < Woodworking: Furniture design; Advanced joinery; Upholstery

# Stealth | 🥷 | Move unseen: fieldcraft and privacy
Moving quietly: Quiet footwork; Using cover; Patience
Wildlife watching: Tracks and signs; Fieldcraft; Binoculars and cameras
Online privacy: Passwords and 2FA; Tracking and ads; Encrypted messaging; Your digital footprint
+ Cybersecurity basics < Online privacy, Computer science / Computer systems: Common threats; Securing your devices; Networks and firewalls; Incident response

@con
# Endurance | 🫀 | Cardio: go further, for longer
Cardio base: Easy aerobic work; Heart rate zones; Walking and hiking; Breathing
Running: Running form; Couch to 5K; Pacing; Running injuries
Cycling: Bike fit; Cadence; Group rides; Bike maintenance
Endurance training: Intervals; Long sessions; Tapering; Fueling
+ Half marathon < Running, Endurance training: Half marathon plan; Race nutrition; Race day
+ Marathon < Half marathon: Building mileage; Long runs; Racing 42 km
+ Triathlon < Endurance training, Swimming / Swim fitness: Swim, bike, run; Transitions; Brick workouts

# Vitality | 😴 | Sleep, nutrition and recovery
Sleep: Sleep hygiene; Circadian rhythm; Naps; Sleep problems
Nutrition: Macronutrients; Whole foods; Hydration; Meal planning
Recovery: Rest days; Stretching; Stress and recovery
Healthy habits: Building habits; Tracking your health; Checkups
+ Sports nutrition < Nutrition, Recovery: Protein and timing; Fueling training; Supplements

# Concentration | 🎯 | Deep focus you can hold
Attention basics: How attention works; Distractions; Single-tasking
Deep work: Time blocking; Focus sessions; Designing your space
Meditation for focus: Breath focus; Noting; Longer sits
Mental stamina: Longer sessions; Breaks and energy; Flow states
+ Peak performance < Mental stamina: Performing under pressure; Routines; Review and adjust

@int
# Mathematics | 🧮 | The language of quantity and pattern
Arithmetic: Counting and place value; Addition and subtraction; Multiplication and division; Fractions; Decimals and percentages
Pre-algebra: Negative numbers; Order of operations; Ratios and proportions; Exponents and roots; Expressions and variables
Algebra: Linear equations; Inequalities; Functions and graphs; Systems of equations; Polynomials; Quadratic equations
Geometry: Angles and lines; Triangles; Circles; Area and volume; Coordinate geometry; Proofs
Trigonometry: Right-triangle trigonometry; The unit circle; Trig graphs; Identities
Precalculus: Exponential and log functions; Sequences and series; Complex numbers; Vectors
Calculus: Limits; Derivatives; Applications of derivatives; Integrals; Applications of integrals; Infinite series
+ Probability and statistics < Algebra: Probability; Distributions; Descriptive statistics; Inference; Regression
+ Discrete mathematics < Algebra: Logic and proofs; Sets and relations; Combinatorics; Graph theory
+ Linear algebra < Precalculus: Vectors and spaces; Matrices; Linear transformations; Eigenvalues
+ Multivariable calculus < Calculus: Partial derivatives; Multiple integrals; Vector calculus
+ Differential equations < Calculus: First-order equations; Second-order equations; Systems of equations and modeling
+ Real analysis < Calculus, Discrete mathematics: Sequences and limits; Continuity; Rigorous calculus
+ Abstract algebra < Linear algebra, Discrete mathematics: Groups; Rings; Fields

# Physics | ⚛️ | How the universe works, from motion to quanta
Mechanics < Mathematics / Algebra: Motion and kinematics; Newton's laws; Energy and work; Momentum; Rotation
Waves and sound: Oscillations; Waves; Sound
Thermodynamics: Temperature and heat; Laws of thermodynamics; Gases
Electricity and magnetism < Mathematics / Trigonometry: Charge and fields; Circuits; Magnetism; Electromagnetic induction
Light and optics: Reflection and refraction; Lenses; Wave optics
Modern physics < Mathematics / Calculus: Special relativity; Quantum basics; Atoms and nuclei
+ Quantum mechanics < Modern physics, Mathematics / Linear algebra, Mathematics / Differential equations: Wave functions; The Schrödinger equation; Spin and measurement
+ Astrophysics < Modern physics: Stars; Galaxies; Cosmology

# Chemistry | 🧪 | Matter, bonds and reactions
Matter and atoms: States of matter; Atomic structure; The periodic table; Isotopes
Chemical bonding: Ionic bonds; Covalent bonds; Molecular shapes; Intermolecular forces
Reactions < Mathematics / Pre-algebra: Balancing equations; Stoichiometry; Reaction types; Energy in reactions
Solutions and acids: Solutions; Acids and bases; pH; Equilibrium
Organic chemistry: Carbon compounds; Functional groups; Organic reactions
+ Biochemistry < Organic chemistry, Nature / Cells: Proteins; Enzymes; Metabolism
+ Physical chemistry < Solutions and acids, Mathematics / Calculus, Physics / Thermodynamics: Chemical thermodynamics; Kinetics; Quantum chemistry

# Nature | 🌿 | Biology: life, bodies and ecosystems
Cells: Cell structure; Cell division; DNA and genes; Microbes
The human body: Organ systems; Heart and blood; Brain and nerves; The immune system
Plants and animals: Plant biology; Animal diversity; Animal behavior
Evolution: Natural selection; Heredity; The history of life
Ecology: Ecosystems; Food webs; Climate and biomes; Conservation
+ Genetics < Evolution, Chemistry / Organic chemistry: Mendelian genetics; Molecular genetics; Genomics
+ Neuroscience < The human body: Neurons; Brain systems; Learning and memory

# Computer science | 🖥️ | How computers and computation work
Computational thinking: Decomposition; Patterns and abstraction; Algorithms in everyday life; Pseudocode
Computer systems: Bits and bytes; Hardware; Operating systems; Networks and the internet
Data structures < Programming / Programming fundamentals: Arrays and lists; Maps and sets; Stacks and queues; Trees; Graphs
Algorithms < Mathematics / Discrete mathematics: Searching; Sorting; Recursion; Complexity and Big O; Dynamic programming
Theory of computation: Automata; Computability; Complexity classes
+ Computer architecture < Computer systems: Logic gates; Processors; Memory hierarchy
+ Artificial intelligence < Algorithms, Mathematics / Probability and statistics: Search and planning; Knowledge and reasoning; Intro to machine learning

# Programming | 💻 | Write software, from first line to shipped app
Programming fundamentals < Computer science / Computational thinking: Variables and types; Conditions and loops; Functions; Debugging; Reading errors
Developer tools: The terminal; Git and version control; Your editor; Package managers
Object-oriented and functional: Objects and classes; Modules; Functional style; Error handling
Web fundamentals: HTML; CSS; JavaScript; HTTP and the web
+ Frontend development < Web fundamentals: Components; State; Accessibility; Frameworks
+ Backend development < Web fundamentals, Computer science / Data structures: Servers and APIs; Authentication; Automated testing; Deployment
+ Databases < Computer science / Data structures: SQL; Data modeling; Indexes; Transactions
+ Software development < Frontend development, Backend development, Databases, Computer science / Algorithms, Mathematics / Discrete mathematics: Requirements; Software architecture; Code review; Teamwork and agile
+ System design < Software development, Computer science / Computer architecture: Scalability; Reliability; Distributed systems
+ Machine learning < Software development, Mathematics / Linear algebra, Mathematics / Probability and statistics, Mathematics / Multivariable calculus: Supervised learning; Neural networks; Model evaluation; Deep learning

# Arcana ~ | 🔮 | The science of our world, for everyone
Scientific method: Questions and hypotheses; Experiments and variables; Evidence and uncertainty; Peer review
Astronomy: The night sky; The solar system; Stars; Galaxies
How things work: Electricity at home; Engines and motors; Computers and the internet; Materials
Critical thinking: Logic basics; Fallacies; Weighing evidence; Statistics in the news

# History | 📜 | From the first cities to today
Ancient world: First civilizations; Ancient Egypt; Greece and Rome; Ancient India and China
Middle ages: Medieval Europe; The Islamic golden age; Medieval Asia and Africa; The Americas before 1500
Early modern world: The Renaissance; The age of exploration; The Reformation; The scientific revolution
Age of revolutions: The Enlightenment; The American and French revolutions; The industrial revolution; Empires
Modern world: World War I; World War II; The Cold War; Decolonization; The world today
+ Historiography < Modern world: Sources and evidence; Interpretations; Writing history

# Languages | 🗣️ | A new language, from first words to fluency
Sounds and script: Pronunciation; Alphabet or script; Accent
First words: Greetings; Numbers; Everyday words; Your first 500 words
Grammar basics: Sentence structure; Present tense; Questions and negatives; Past and future
Listening and reading: Graded readers; Podcasts; Native speed
Speaking and writing: Conversations; Messages and emails; Telling stories
+ Fluency < Speaking and writing: Idioms; Complex grammar; Thinking in the language
+ Translation < Fluency: Translation techniques; Translation tools; Specialized texts

# Memory | 🧠 | Remember what you learn, on purpose
How memory works: Encoding; Storage; Retrieval; Forgetting
Spaced repetition: Flashcards; Review schedules; Writing good cards
Mnemonics: Acronyms and rhymes; Chunking; Vivid images; The Major System
Memory palace: Choosing palaces; Placing images; Long journeys
+ Memory sports < Memory palace: The PAO system; Memorize a deck of cards; Speed numbers

# Study craft | 📝 | Learn faster and keep it
Active recall: Self-testing; Practice questions; Blurting
Note-taking: Notes in your own words; Linking notes; Summaries
Reading for understanding: Skimming; Questioning; Close reading
Planning your study: Study schedules; The Pomodoro technique; Weekly review
+ Exam mastery < Planning your study, Memory / Spaced repetition: Revision plans; Past papers; Test anxiety

# Investigation | 🔍 | Research and problem solving
Finding sources < Study craft / Reading for understanding: Search techniques; Libraries and databases; Evaluating sources
Problem solving: Defining the problem; Breaking it down; Heuristics
Analysis: Gathering data; Spotting patterns; Drawing conclusions
Reporting: Writing it up; Citing sources; Presenting findings
+ Research methods < Analysis, Mathematics / Probability and statistics: Surveys; Experiments; Statistics for research

# Religion ~ | 🕯️ | Philosophy, religion and mythology
Philosophy basics: What philosophy is; Arguments; The great questions
Ethics: Right and wrong; Virtue ethics; Consequences and duties
World religions: Abrahamic faiths; Hinduism and Buddhism; East Asian traditions; Indigenous traditions
Mythology: Greek and Roman myths; Norse myths; Myths around the world
+ Philosophy of mind < Philosophy basics, Nature / The human body: Consciousness; Free will; Personal identity

# Economics | 📈 | How people, markets and countries use resources
Economic basics: Scarcity and trade-offs; Supply and demand; Markets
Microeconomics: Consumers; Firms; Competition
Macroeconomics: GDP and growth; Inflation; Money and banks; Unemployment
Economic policy: Government and taxes; Trade; Economic crises
+ Econometrics < Macroeconomics, Mathematics / Probability and statistics: Economic data; Regression; Causality

@wis
# Perception | 👁️ | Mindfulness, and noticing what others miss
Mindfulness basics: Breath awareness; Body scan; Noticing thoughts
Meditation practice: Daily sitting; Walking meditation; Loving-kindness
Awareness: Observation skills; Situational awareness; Deep listening
+ Retreat practice < Meditation practice: Silent retreat; Deep concentration; Insight practice

# Insight | 💭 | Read people and yourself
Self-knowledge: Journaling; Values; Emotions; Strengths and weaknesses
Empathy: Active listening; Perspective taking; Body language
Psychology basics: How minds work; Biases; Motivation; Habits
+ Coaching others < Empathy, Psychology basics: Powerful questions; Giving feedback; Goal setting

# Medicine | 🩺 | Health know-how and first aid
First aid: Scene safety; CPR; Bleeding and wounds; Burns and fractures
Health basics < Nature / The human body: How the body works; Common illnesses; Medicines and safety
Mental health: Stress; Anxiety and mood; Getting help
+ Wilderness first aid < First aid, Survival / Emergencies: Improvised care; Evacuation; Environmental emergencies

# Survival | 🧭 | The outdoors and self-reliance
Outdoor basics: Planning a trip; Clothing and layers; Leave no trace
Navigation: Maps; Compass; GPS and apps
Camping: Shelter; Fire; Water; Camp cooking
Emergencies: Signaling; Staying found; Weather
+ Wilderness expeditions < Emergencies, Medicine / First aid: Multi-day routes; Remote travel; Leading a group

# Cooking | 🍳 | Good food, from scratch
Kitchen basics: Knife skills; Kitchen safety; Measuring; Stocking a pantry
Cooking methods: Boiling and steaming; Sautéing; Roasting and baking; Grilling
Flavor: Salt, fat, acid and heat; Herbs and spices; Sauces
Meals: Breakfasts; Weeknight dinners; Meal prep; Cooking for others
+ Baking and pastry < Cooking methods: Bread; Pastry; Cakes
+ World cuisines < Flavor: Italian cooking; Asian cooking; Mexican cooking; Indian cooking

# Personal finance | 💰 | Money sense for life
Money basics: Budgeting; Saving; Banking; Tracking spending
Debt and credit: How credit works; Paying off debt; Loans and mortgages
Investing < Mathematics / Pre-algebra: Compound interest; Index funds; Risk and diversification; Retirement accounts
Financial planning: Emergency fund; Financial goals; Taxes; Insurance
+ Financial independence < Financial planning: Savings rate; Withdrawal rates; Early retirement

# Animal Handling ~ | 🐾 | Care for pets, animals and plants
Pet care: Feeding; Pet health; Grooming
Animal training: Positive reinforcement; Basic commands; Behavior problems
Gardening: Soil; Planting; Watering and care; Pests
+ Permaculture < Gardening: Permaculture design; Food forests; Composting

@cha
# Persuasion | 🤝 | Bring people round
Communication basics: Clarity; Listening well; Asking good questions
Influence: Reciprocity and trust; Framing; Persuasive stories
Negotiation: Preparing; Interests, not positions; Making offers; Closing a deal
Sales: Prospecting; Discovery calls; Handling objections
+ Leadership < Influence, Performance / Public speaking: Vision; Delegation; Building teams; Decision making

# Performance | 🎤 | Public speaking, music and the stage
Public speaking: Structuring a talk; Voice and body; Handling nerves; Q&A
Storytelling: Story structure; Anecdotes; Humor
Music theory: Notation; Keys and scales; Chords; Harmony
Acting: Scene work; Building a character; Improv
Singing: Breath support; Pitch; Range; Songs
+ Stand-up comedy < Storytelling, Acting: Writing jokes; Timing; Open mics
+ Professional speaking < Public speaking, Storytelling: Keynotes; Workshops; Media interviews

# Social skills | 💬 | Conversation, friendship and connection
Small talk: Starting conversations; Keeping them going; Graceful exits
Friendship: Making friends; Staying in touch; Being a good friend
Handling conflict: Staying calm; Assertive messages; Repairing relationships
Networking: Events; Following up; Building relationships
+ Charisma < Friendship, Intimidation / Presence: Presence and warmth; Confidence; Making people feel seen

# Intimidation | 🦁 | Presence, assertiveness and boundaries
Assertiveness: Saying no; Stating your needs; Setting boundaries
Presence: Posture; Eye contact; Voice
Composure: Staying calm under pressure; Handling criticism; Recovering from mistakes
+ High-stakes negotiation < Composure, Persuasion / Negotiation: Hardball tactics; Walking away; Holding firm

# Deception | 🃏 | Acting, improv and a good poker face
Improv: Yes, and; Characters; Scenes
Poker: Rules and hands; Odds; Reading players; Bluffing
+ Game theory < Poker, Mathematics / Probability and statistics: Strategies; Equilibria; Bluffing math

# Writing | ✍️ | Say it clearly on the page
Writing basics: Clear sentences; Paragraphs; Grammar and punctuation
Essays: Arguments; Structure; Editing
Creative writing: Story; Characters; Dialogue; Poetry
Professional writing: Emails; Reports; Copywriting
+ Novel writing < Creative writing: Plotting; Drafting a novel; Revision; Publishing
`;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** How names compare: case, accents and punctuation don't matter. */
export const sameName = (a: string, b: string) => slug(a) === slug(b);
export const nameKey = slug;

function parse(text: string): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const pending: { entry: CatalogEntry; refs: string[] }[] = [];
  let ability = "";
  let general: CatalogEntry | null = null;
  let parallel = false;
  let lastSub: CatalogEntry | null = null;
  let order = 0;
  const add = (e: CatalogEntry, refs: string[] = []) => {
    out.push(e);
    if (refs.length) pending.push({ entry: e, refs });
    return e;
  };
  const details = (owner: CatalogEntry, list: string) => {
    let prev: CatalogEntry | null = null;
    list
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((name, i) => {
        prev = add({
          key: `${owner.key}/${slug(name)}`,
          name,
          ability,
          tier: "detail",
          icon: owner.icon,
          parent: owner.key,
          // No skipping: each detail needs the one before it.
          needs: prev ? [prev.key] : [],
          field: owner.field,
          order: i,
        });
      });
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("@")) {
      ability = line.slice(1).trim();
      continue;
    }
    if (line.startsWith("#")) {
      const [head, icon = "📘", description = ""] = line
        .slice(1)
        .split("|")
        .map((s) => s.trim());
      parallel = head.endsWith("~");
      const name = head.replace(/~$/, "").trim();
      const key = `${ability}/${slug(name)}`;
      general = add({ key, name, ability, tier: "general", icon, description, needs: [], field: key, order: order++ });
      lastSub = null;
      continue;
    }
    if (!general) throw new Error(`Catalog: "${line}" comes before any general topic`);
    const advanced = line.startsWith("+");
    const body = advanced ? line.slice(1).trim() : line;
    const colon = body.indexOf(":");
    const head = colon < 0 ? body : body.slice(0, colon);
    const [name, refList = ""] = head.split("<").map((s) => s.trim());
    const refs = refList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const siblings = out.filter((e) => e.parent === general!.key);
    const entry: CatalogEntry = {
      key: `${general.key}/${slug(name)}`,
      name,
      ability,
      tier: advanced ? "advanced" : "sub",
      icon: general.icon,
      parent: general.key,
      needs: [],
      field: general.key,
      order: siblings.length,
    };
    if (!advanced && !parallel && lastSub) entry.needs.push(lastSub.key);
    // An advanced skill with nothing named builds on the last sub-topic.
    if (advanced && !refs.length && lastSub) entry.needs.push(lastSub.key);
    add(entry, refs);
    if (!advanced) lastSub = entry;
    if (colon >= 0) details(entry, body.slice(colon + 1));
  }
  // Needs by name: "Name" in the same general topic, or "General / Name" anywhere.
  const byField = new Map<string, CatalogEntry[]>();
  for (const e of out) if (e.tier !== "detail") byField.set(e.field, [...(byField.get(e.field) ?? []), e]);
  const generals = out.filter((e) => e.tier === "general");
  for (const { entry, refs } of pending) {
    for (const ref of refs) {
      const [a, b] = ref.split("/").map((s) => s.trim());
      const field = b ? generals.find((g) => sameName(g.name, a)) : generals.find((g) => g.key === entry.field);
      const name = b ?? a;
      const hit = field && (byField.get(field.key) ?? []).find((e) => e.tier !== "general" && sameName(e.name, name));
      if (!hit) throw new Error(`Catalog: "${entry.name}" needs "${ref}", which isn't in the catalog`);
      if (!entry.needs.includes(hit.key)) entry.needs.push(hit.key);
    }
  }
  return out;
}

export const CATALOG: CatalogEntry[] = parse(TEXT);
export const CATALOG_BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

/** An entry's parts, in order. */
export function catalogChildren(key: string): CatalogEntry[] {
  return CATALOG.filter((e) => e.parent === key);
}

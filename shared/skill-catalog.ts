// The whole skill tree, planned up front and built in, from the general to the
// detailed: every ability's broad areas (Formal sciences, Sports, Visual arts),
// the fields in each (Mathematics, Swimming, Drawing), their topics (which
// branch and join: Pre-algebra leads to both Algebra and Geometry, and
// Trigonometry needs both), the steps you learn inside each topic, and the
// advanced skills beyond them. Titles only: lessons are written when you get
// there. Nothing is skipped: each step needs the one before it, a topic needs
// every step of what it follows, and an advanced skill needs what it builds on,
// from any tree (Software development needs Programming, Computer science and
// Math). Related skills in other trees are linked too, without locking.
//
// The map shows all of it as planned skills; a skill becomes yours (a real
// skill with a page) when you start it (see shared/skill-map.ts).

export type CatalogTier = "general" | "field" | "sub" | "detail" | "advanced";

export interface CatalogEntry {
  /** Stable id: "int/formal-sciences/mathematics/algebra/linear-equations". */
  key: string;
  name: string;
  /** Ability (area) id: str, dex, con, int, wis, cha. */
  ability: string;
  /** general: a broad area; field: a field in it; sub: a topic in the field; detail: a step in a topic; advanced: beyond the topics. */
  tier: CatalogTier;
  icon: string;
  description?: string;
  /** The entry it's part of: area for a field, field for topics and advanced skills, topic for steps. */
  parent?: string;
  /** Keys that must be learnt first: the step before, the topics it follows, and what it builds on in other trees. */
  needs: string[];
  /** Keys it's related to (in other trees), without having to learn them first. */
  related: string[];
  /** The field it belongs to (its own key for a field; the area's key for an area). */
  field: string;
  /** Position among its siblings. */
  order: number;
}

/*
 * Format:
 *   @int                                    the ability for what follows
 *   ## Area | icon | description            a broad area
 *   # Field | icon | description            a field in it; "# Field ~ | …" when its topics can go in any order
 *   Topic: a; b; c                          a topic and its steps, in order; it follows the topic above it
 *   Topic < Need, Field / Need: a; b        …or exactly what's listed ("Topic <: …" for nothing: it starts a new branch)
 *   Topic < Need ~ Field / Other: a; b      "~" adds related skills (linked, not required)
 *   + Advanced < Need, Field / Need: a; b   an advanced skill and its steps (it follows the last topic when none are listed)
 */
const TEXT = `
@str
## Strength training | 🏋️ | Get strong: lifts, bodyweight and knowing how to train
# Athletics | 🏋️ | Strength training with weights
Movement basics: Squat pattern; Hinge pattern; Push and pull patterns; Bracing and posture; Loaded carries
Barbell lifts: Back squat; Deadlift; Bench press; Overhead press; Barbell rows
Training programs < Movement basics: Progressive overload; Sets, reps and rest; Deloads and recovery; Tracking your lifts
Strength nutrition < Movement basics ~ Nutrition / Sports nutrition: Protein; Eating for strength; Bulking and cutting
+ Powerlifting < Barbell lifts, Training programs: Competition technique; Peaking for a meet; Attempt selection
+ Olympic weightlifting < Barbell lifts, Acrobatics / Mobility: The snatch; The clean and jerk; Mobility for lifting
+ Strongman < Barbell lifts, Training programs: Stones and sandbags; Yoke and farmer's walk; Log press
# Calisthenics | 💪 | Bodyweight strength and skills
Bodyweight foundations: Push-ups; Rows; Squats and lunges; Plank and hollow body
Pulling < Bodyweight foundations: Dead hangs; Pull-ups; Chin-ups; Archer pull-ups
Pushing < Bodyweight foundations: Dips; Pike push-ups; Pseudo-planche push-ups
Legs and core < Bodyweight foundations: Pistol squat progressions; L-sit; Dragon flag progressions
+ Muscle-up < Pulling, Pushing: False grip; The transition; Strict muscle-up
+ Handstand push-up < Pushing, Acrobatics / Tumbling: Wall handstand; Negatives; Freestanding handstand push-up
+ Levers < Pulling, Legs and core: Tuck front lever; Back lever; Full front lever

## Sports | ⚽ | Play: ball games, the water and the wall
# Ball sports ~ | ⚽ | Team and racket games
Football: Ball control; Passing; Shooting; Positioning
Basketball: Dribbling; Shooting form; Passing and moves; Team play
Tennis: Forehand; Backhand; Serve; Rallies and tactics
Volleyball: Passing and digging; Setting; Serving; Spiking
+ Coaching a team < Football, Basketball, Persuasion / Communication basics: Running practice; Tactics; Motivating players
# Swimming | 🏊 | From water confidence to open water
Water skills: Floating; Breathing; Kicking; Treading water
Freestyle < Water skills: Freestyle arms; Side breathing; Freestyle kick; Freestyle rhythm
Backstroke < Water skills: Backstroke position; Backstroke arms; Backstroke turns
Breaststroke < Water skills: Breaststroke kick; Breaststroke pull; Breaststroke timing
Butterfly < Freestyle: Dolphin kick; Butterfly arms; Butterfly breathing
Swim fitness < Freestyle ~ Endurance / Cardio base: Drills; Interval sets; Turns and push-offs
+ Open-water swimming < Swim fitness: Sighting; Cold water; Safety in open water
+ Lifesaving < Swim fitness, Medicine / First aid: Rescue techniques; Towing; Water first aid
# Climbing | 🧗 | Boulder and climb: grip, technique and nerve
Climbing basics < Athletics / Movement basics: Footwork; Grips and holds; Body positioning; Falling safely
Bouldering < Climbing basics: Reading problems; Dynamic moves; Overhangs; Projecting
Rope skills < Climbing basics: Climbing knots; Belaying; Rappelling
Top-rope and lead < Rope skills: Top-rope climbing; Lead climbing; Clipping and falls
Training for climbing < Bouldering, Athletics / Training programs: Finger strength; Power endurance; Climbing injuries
+ Outdoor climbing < Top-rope and lead, Survival / Outdoor basics: Rock types and ethics; Anchors; Multi-pitch climbing

## Combat | 🥋 | Self-defense and combat sports
# Martial arts | 🥋 | Striking, grappling and sparring
Martial arts fundamentals: Stance and footwork; Guard; Breakfalls; Conditioning
Striking < Martial arts fundamentals: Punches; Kicks; Combinations; Blocking and slipping
Grappling < Martial arts fundamentals ~ Athletics / Movement basics: Takedowns; Positions; Escapes; Submissions
Sparring < Striking, Grappling: Controlled sparring; Timing and distance; Fight strategy
+ Self-defense < Sparring, Intimidation / Composure: Awareness and avoidance; De-escalation; Escaping holds
+ Competition < Sparring, Athletics / Training programs: Rules and scoring; Fight camp; Competing
# Boxing | 🥊 | The sweet science
Stance and guard: Boxing stance; High guard; Ring footwork
Punches < Stance and guard: Jab; Cross; Hooks; Uppercuts
Defense < Stance and guard: Parrying; Slipping; Rolling; Clinching
Ring craft < Punches, Defense: Combinations; Counters; Ring control
+ Amateur bouts < Ring craft, Endurance / Endurance training: Conditioning for fights; Boxing rules; Your first bout

@dex
## Movement arts | 🤸 | Mobility, balance, acrobatics, dance and moving unseen
# Acrobatics | 🤸 | Mobility, balance, yoga and tumbling
Mobility: Hips; Shoulders; Spine; Ankles and wrists
Balance < Mobility: Single-leg balance; Balance boards; Slacklining
Yoga < Mobility: Foundational poses; Sun salutations; Breath and flow; Inversions
Tumbling < Balance: Rolls; Cartwheels; Handstands; Round-offs
+ Advanced acrobatics < Tumbling, Calisthenics / Bodyweight foundations: Back handspring; Aerials; Partner acrobatics
+ Parkour < Tumbling, Climbing / Climbing basics: Precision jumps; Vaults; Wall runs; Flow
# Dance | 💃 | Rhythm, movement and style
Dance foundations ~ Music theory / Rhythm and meter: Moving to the beat; Posture and frame; Footwork; Spins and turns
Partner dance < Dance foundations: Leading and following; Salsa basics; Bachata basics; Swing basics
Street dance < Dance foundations: Grooves; Popping and locking; Breaking basics; Freestyle
Ballet < Dance foundations: Ballet positions; Barre work; Jumps and leaps
Contemporary < Ballet: Floor work; Release technique; Dance improvisation
+ Choreography < Partner dance, Street dance, Contemporary: Musicality; Building a routine; Teaching a routine; Performing it
# Stealth | 🥷 | Move unseen: fieldcraft and privacy
Moving quietly: Quiet footwork; Using cover; Patience
Wildlife watching < Moving quietly: Tracks and signs; Fieldcraft; Binoculars and cameras
Online privacy <  ~ Computer science / Computer systems: Passwords and 2FA; Tracking and ads; Encrypted messaging; Your digital footprint
+ Cybersecurity basics < Online privacy, Computer science / Computer systems: Common threats; Securing your devices; Networks and firewalls; Incident response

## Hand skills | 🪄 | Quick, precise hands and things you make
# Sleight of Hand ~ | 🪄 | Typing, juggling and magic
Touch typing: Home row; All the letters; Numbers and symbols; Speed and accuracy
Juggling: Three-ball cascade; Juggling tricks; Four and five balls
Card magic: Card handling; False shuffles; Forces; Card routines
Coin magic: Palms; Vanishes; Productions
+ Close-up magic < Card magic, Coin magic, Performance / Stage presence: Misdirection; Patter; Performing for people
# Crafts ~ | 🧵 | Make things by hand
Woodworking ~ Mathematics / Geometry: Tools and safety; Measuring and cutting; Joinery; Finishing
Sewing: Hand stitches; Sewing machine; Patterns; Alterations
Knitting: Casting on; Knit and purl; Reading patterns; Finishing a piece
Ceramics: Hand building; The wheel; Glazing and firing
+ Furniture making < Woodworking, Mathematics / Geometry: Furniture design; Advanced joinery; Upholstery

## Visual arts | 🎨 | Drawing, painting and photography
# Drawing | ✏️ | From lines to finished pictures
Drawing basics: Lines and shapes; Contour drawing; Shading and value; Proportion
Observation < Drawing basics: Still life; Light and shadow; Drawing from life
Perspective < Drawing basics ~ Mathematics / Geometry: One-point perspective; Two-point perspective; Three-point perspective
Figure drawing < Observation ~ Nature / The human body: Gesture; Anatomy for artists; Faces; Hands
Composition < Observation, Perspective: Framing; Focal points; Storytelling in pictures
+ Illustration < Figure drawing, Composition, Painting / Color theory: Character design; Environments; Finding your style
+ Comics < Figure drawing, Writing / Creative writing: Panels and pacing; Visual storytelling; Lettering
# Painting | 🖌️ | Color, paint and pixels
Color theory < Drawing / Drawing basics: The color wheel; Value and saturation; Color harmony; Mixing colors
Watercolor < Color theory: Washes; Wet on wet; Layering
Acrylic and oil < Color theory: Brushwork; Blocking in; Glazing
Digital painting < Color theory: Digital tools; Layers and brushes; Digital workflow
+ Landscape painting < Acrylic and oil, Drawing / Perspective: Plein air; Skies and water; Atmosphere
+ Concept art < Digital painting, Drawing / Composition: Thumbnails; Worldbuilding; Presentation
# Photography | 📷 | Seeing and capturing light
Camera basics: Your camera; Focus; Holding steady
Exposure < Camera basics: Aperture; Shutter speed; ISO; The exposure triangle
Photo composition < Camera basics ~ Drawing / Composition: Rule of thirds; Leading lines; Framing a shot
Light < Exposure: Natural light; Flash; Golden hour
Photo editing < Exposure: Raw editing; Color grading; Retouching
+ Portrait photography < Light, Photo editing: Posing; Studio lighting; Working with people
+ Street and travel photography < Photo composition, Light: Candid moments; Telling a story; A travel series

## Music making | 🎹 | Play, understand and produce music
# Musical instrument | 🎹 | Play an instrument: posture to performance
Instrument basics: Posture and technique; First notes; Reading notation or tabs; Practice habits
Rhythm < Instrument basics ~ Music theory / Rhythm and meter: Pulse and counting; Note values; Syncopation
Chords and scales < Instrument basics ~ Music theory / Keys and scales: Major scales; Minor scales; Basic chords; Arpeggios
Playing songs < Rhythm, Chords and scales: Simple songs; Accompaniment; Playing with others
Musicianship < Playing songs, Music theory / Harmony: Dynamics and expression; Improvisation; Performing
+ Advanced technique < Musicianship: Speed and precision; Extended techniques; Building a repertoire
+ Band playing < Musicianship, Social skills / Friendship: Rehearsing; Arranging; Gigs
# Music theory | 🎼 | How music works
Notation: The staff; Note names; Rhythm notation
Keys and scales < Notation: Intervals; Major keys; Minor keys; Modes
Rhythm and meter < Notation: Time signatures; Subdivision; Groove
Chords < Keys and scales: Triads; Seventh chords; Inversions
Harmony < Chords: Progressions; Voice leading; Cadences
Form and analysis < Harmony, Rhythm and meter: Song form; Classical forms; Analyzing a piece
+ Composition < Form and analysis: Melody writing; Development; Orchestration
+ Jazz theory < Harmony: Extended chords; Substitutions; Improvising on changes
# Music production | 🎚️ | Record, beat-make and mix
DAW basics: Your DAW; Tracks and clips; MIDI
Recording < DAW basics: Microphones; Gain staging; Recording takes
Beat making < DAW basics, Music theory / Rhythm and meter: Drum patterns; Sampling; Arrangement
Sound design < DAW basics: Synthesis; Effects; Sound layering
Mixing < Recording, Beat making: EQ; Compression; Space and depth
+ Mastering < Mixing: Loudness; Final EQ; Delivering a master
+ Electronic music < Sound design, Beat making: Genres and styles; Live sets; Releasing music

@con
## Endurance | 🫀 | Go further, for longer
# Endurance | 🫀 | Cardio: running and cycling
Cardio base: Easy aerobic work; Heart rate zones; Walking; Breathing
Running < Cardio base: Running form; Couch to 5K; Pacing; Running injuries
Cycling < Cardio base: Bike fit; Cadence; Group rides; Bike maintenance
Endurance training < Running, Cycling: Intervals; Long sessions; Tapering; Fueling
+ Half marathon < Running, Endurance training: Half marathon plan; Race nutrition; Race day
+ Marathon < Half marathon: Building mileage; Long runs; Racing 42 km
+ Triathlon < Endurance training, Swimming / Swim fitness: Swim, bike, run; Transitions; Brick workouts
# Hiking | 🥾 | Trails, hills and mountains
Trail basics < Endurance / Cardio base: Gear and clothing; Pacing on hills; Trail etiquette
Trail navigation < Trail basics, Survival / Navigation: Reading trails; Route planning; When lost
Multi-day hikes < Trail navigation: Packing light; Camping on the trail; Resupply
+ Mountaineering < Multi-day hikes, Climbing / Rope skills: Crampons and ice axe; Glacier travel; Altitude

## Health | 🥗 | Healthy eating, diets, weight, sleep and recovery
# Nutrition | 🥗 | Healthy eating, diets and weight: eat well for life
Nutrition basics: Macronutrients; Vitamins and minerals; Whole foods; Hydration
Healthy eating < Nutrition basics: Balanced plates; Portions; Reading food labels; Healthy snacks
Diets < Healthy eating: Mediterranean diet; Plant-based eating; Low-carb diets; Intermittent fasting; Diets compared
Weight management < Healthy eating: Energy balance; Losing fat; Gaining muscle; Keeping weight off
Meal planning < Healthy eating, Cooking / Kitchen basics: Batch cooking; Shopping lists; Eating on a budget
Nutrition science < Nutrition basics ~ Chemistry / Organic chemistry: Metabolism; Gut health; Reading nutrition studies
Sports nutrition < Nutrition science: Protein and timing; Fueling training; Supplements
+ Diet design < Diets, Weight management, Nutrition science: Calorie targets; Your own plan; Sticking with it
+ Clinical nutrition < Nutrition science, Medicine / Health basics: Diabetes and diet; Heart health; Food allergies and intolerances
# Vitality | 😴 | Sleep, recovery and healthy habits
Sleep: Sleep hygiene; Circadian rhythm; Naps; Sleep problems
Recovery < Sleep: Rest days; Stretching; Stress and recovery
Healthy habits < Sleep: Building habits; Tracking your health; Checkups
+ Longevity < Recovery, Healthy habits, Nutrition / Nutrition science: Exercise for life; Healthy aging; Prevention

## Mental stamina | 🎯 | Focus and resilience
# Concentration | 🎯 | Deep focus you can hold
Attention basics: How attention works; Distractions; Single-tasking
Deep work < Attention basics: Time blocking; Focus sessions; Designing your space
Meditation for focus < Attention basics, Perception / Mindfulness basics: Breath focus; Noting; Longer sits
Mental stamina < Deep work, Meditation for focus: Longer sessions; Breaks and energy; Flow states
+ Peak performance < Mental stamina: Performing under pressure; Routines; Review and adjust
# Stress resilience | 🧘 | Stay steady when it's hard
Understanding stress: Stress and the body; Good and bad stress; Your stress signals
Breathing techniques < Understanding stress: Box breathing; Slow exhales; Breathing on the go
Emotional regulation < Understanding stress, Insight / Self-knowledge: Naming emotions; Reframing; Self-compassion
Exposure training < Breathing techniques: Cold exposure; Heat exposure; Discomfort practice
+ Performing under pressure < Emotional regulation, Concentration / Deep work: Pre-performance routines; Handling nerves; Bouncing back

@int
## Formal sciences | 📐 | Mathematics, logic and computation
# Mathematics | 🧮 | The language of quantity and pattern
Arithmetic: Counting and place value; Addition and subtraction; Multiplication and division; Fractions; Decimals and percentages
Pre-algebra: Negative numbers; Order of operations; Ratios and proportions; Exponents and roots; Expressions and variables
Algebra < Pre-algebra: Linear equations; Inequalities; Functions and graphs; Systems of equations; Polynomials; Quadratic equations
Geometry < Pre-algebra: Angles and lines; Triangles; Circles; Area and volume; Coordinate geometry; Proofs in geometry
Trigonometry < Algebra, Geometry: Right-triangle trigonometry; The unit circle; Trig graphs; Identities
Probability and statistics < Algebra: Probability; Distributions; Descriptive statistics; Inference; Regression
Discrete mathematics < Algebra: Logic and proofs; Sets and relations; Combinatorics; Graph theory
Precalculus < Trigonometry: Exponential and log functions; Sequences and series; Complex numbers; Vectors
Calculus < Precalculus: Limits; Derivatives; Applications of derivatives; Integrals; Applications of integrals; Infinite series
Linear algebra < Algebra, Precalculus: Vectors and spaces; Matrices; Linear transformations; Eigenvalues
+ Multivariable calculus < Calculus, Linear algebra: Partial derivatives; Multiple integrals; Vector calculus
+ Differential equations < Calculus: First-order equations; Second-order equations; Systems and modeling
+ Real analysis < Calculus, Discrete mathematics: Sequences and limits; Continuity; Rigorous calculus
+ Abstract algebra < Linear algebra, Discrete mathematics: Groups; Rings; Fields
+ Number theory < Discrete mathematics: Divisibility; Primes; Modular arithmetic
+ Topology < Real analysis: Open and closed sets; Continuity and spaces; Surfaces
# Logic | ⚖️ | Reasoning you can check
Propositional logic: Statements; Connectives; Truth tables; Valid arguments
Predicate logic < Propositional logic: Quantifiers; Translating sentences; Predicate proofs
Critical thinking < Propositional logic: Fallacies; Weighing evidence; Statistics in the news
Proofs < Predicate logic, Mathematics / Algebra: Direct proof; Contradiction; Induction
Set theory < Proofs: Sets; Functions and relations; Infinity
+ Mathematical logic < Set theory, Mathematics / Discrete mathematics: Formal systems; Completeness; Incompleteness
+ Philosophy of logic < Proofs, Philosophy / Epistemology: Truth; Paradoxes; Non-classical logics
# Computer science | 🖥️ | How computers and computation work
Computational thinking: Decomposition; Patterns and abstraction; Algorithms in everyday life; Pseudocode
Computer systems < Computational thinking: Bits and bytes; Hardware; Operating systems; Networks and the internet
Data structures < Computational thinking, Programming / Programming fundamentals: Arrays and lists; Maps and sets; Stacks and queues; Trees; Graphs
Algorithms < Data structures, Mathematics / Discrete mathematics: Searching; Sorting; Recursion; Complexity and Big O; Dynamic programming
Theory of computation < Algorithms, Logic / Set theory: Automata; Computability; Complexity classes
+ Computer architecture < Computer systems, Electronics / Digital logic: Logic circuits; Processors; Memory hierarchy
+ Artificial intelligence < Algorithms, Mathematics / Probability and statistics: Search and planning; Knowledge and reasoning; Intro to machine learning
+ Cryptography < Algorithms, Mathematics / Number theory: Ciphers; Public-key cryptography; Hashes and signatures

## Natural sciences | 🔬 | Physics, chemistry, biology, earth and space
# Physics | ⚛️ | How the universe works, from motion to quanta
Mechanics < Mathematics / Algebra: Motion and kinematics; Newton's laws; Energy and work; Momentum; Rotation
Waves and sound < Mechanics: Oscillations; Waves; Sound
Thermodynamics < Mechanics: Temperature and heat; Laws of thermodynamics; Gases
Electricity and magnetism < Mechanics, Mathematics / Trigonometry: Charge and fields; Circuits; Magnetism; Electromagnetic induction
Light and optics < Waves and sound, Electricity and magnetism: Reflection and refraction; Lenses; Wave optics
Modern physics < Light and optics, Mathematics / Calculus: Special relativity; Quantum basics; Atoms and nuclei
+ Classical mechanics < Mechanics, Mathematics / Calculus: Lagrangian mechanics; Orbits; Rigid bodies
+ Quantum mechanics < Modern physics, Mathematics / Linear algebra, Mathematics / Differential equations: Wave functions; The Schrödinger equation; Spin and measurement
+ Astrophysics < Modern physics, Arcana / Astronomy: Stellar physics; Galaxies; Cosmology
# Chemistry | 🧪 | Matter, bonds and reactions
Matter and atoms: States of matter; Atomic structure; The periodic table; Isotopes
Chemical bonding < Matter and atoms: Ionic bonds; Covalent bonds; Molecular shapes; Intermolecular forces
Reactions < Chemical bonding, Mathematics / Pre-algebra: Balancing equations; Stoichiometry; Reaction types; Energy in reactions
Solutions and acids < Reactions: Solutions; Acids and bases; pH; Equilibrium
Organic chemistry < Chemical bonding: Carbon compounds; Functional groups; Organic reactions
+ Biochemistry < Organic chemistry, Nature / Cells: Proteins; Enzymes; Metabolic pathways
+ Physical chemistry < Solutions and acids, Mathematics / Calculus, Physics / Thermodynamics: Chemical thermodynamics; Kinetics; Quantum chemistry
+ Materials science < Chemical bonding, Physics / Thermodynamics: Metals; Polymers; Ceramics and composites
# Nature | 🌿 | Biology: life, bodies and ecosystems
Cells ~ Chemistry / Matter and atoms: Cell structure; Cell division; DNA and genes; Microbes
The human body < Cells: Organ systems; Heart and blood; Brain and nerves; The immune system
Plants and animals < Cells: Plant biology; Animal diversity; Animal behavior
Evolution < Plants and animals: Natural selection; Heredity; The history of life
Ecology < Plants and animals, Evolution: Ecosystems; Food webs; Climate and biomes; Conservation
+ Genetics < Evolution, Chemistry / Organic chemistry: Mendelian genetics; Molecular genetics; Genomics
+ Neuroscience < The human body, Psychology / Cognition: Neurons; Brain systems; Learning and memory in the brain
+ Microbiology < Cells, Chemistry / Reactions: Bacteria; Viruses; Microbes and health
# Arcana ~ | 🔮 | Earth, space and how science works
Scientific method: Questions and hypotheses; Experiments and variables; Evidence and uncertainty; Peer review
Astronomy ~ Physics / Mechanics: The night sky; The solar system; Stars; Galaxies
Earth science: Rocks and minerals; Plate tectonics; Weather; Climate
How things work: Electricity at home; Engines and motors; Computers and the internet; Materials around you
+ Space exploration < Astronomy, Physics / Mechanics: Rockets; Orbits and missions; Living in space
+ Climate science < Earth science, Chemistry / Reactions: The carbon cycle; Climate models; Solutions

## Technology | 💻 | Software, electronics and data
# Programming | 💻 | Write software, from first line to shipped app
Programming fundamentals < Computer science / Computational thinking: Variables and types; Conditions and loops; Functions; Debugging; Reading errors
Developer tools < Programming fundamentals: The terminal; Git and version control; Your editor; Package managers
Object-oriented and functional < Programming fundamentals: Objects and classes; Modules; Functional style; Error handling
Web fundamentals < Programming fundamentals: HTML; CSS; JavaScript; HTTP and the web
+ Frontend development < Web fundamentals: Components; State; Accessibility; Frameworks
+ Backend development < Web fundamentals, Developer tools, Computer science / Data structures: Servers and APIs; Authentication; Automated testing; Deployment
+ Databases < Computer science / Data structures: SQL; Data modeling; Indexes; Transactions
+ Mobile apps < Object-oriented and functional, Frontend development: Mobile UI; Device features; Publishing an app
+ Software development < Frontend development, Backend development, Databases, Computer science / Algorithms, Mathematics / Discrete mathematics: Requirements; Software architecture; Code review; Teamwork and agile
+ DevOps < Backend development, Developer tools: Containers; CI and CD; Monitoring
+ System design < Software development, Computer science / Computer architecture: Scalability; Reliability; Distributed systems
+ Machine learning < Software development, Mathematics / Linear algebra, Mathematics / Probability and statistics, Mathematics / Multivariable calculus: Supervised learning; Neural networks; Model evaluation; Deep learning
# Electronics | 🔌 | Circuits, chips and robots
Circuit basics < Physics / Electricity and magnetism: Voltage, current and resistance; Breadboards; Measuring with a multimeter
Components < Circuit basics: Resistors and capacitors; Diodes and LEDs; Transistors
Digital logic < Components, Logic / Propositional logic: Logic gates; Flip-flops; Binary arithmetic
Microcontrollers < Digital logic, Programming / Programming fundamentals: Your first microcontroller; Sensors; Motors and actuators
+ Robotics < Microcontrollers, Physics / Mechanics: Robot kinematics; Control loops; Building a robot
+ Circuit board design < Components, Digital logic: Schematics; Board layout; Manufacturing
# Data science | 📊 | Turn data into answers
Spreadsheets and data: Spreadsheets; Formulas; Tidy data
Data cleaning < Spreadsheets and data, Programming / Programming fundamentals: Loading data; Cleaning; Joining tables
Visualization < Data cleaning: Choosing a chart; Plotting; Dashboards
Statistics in practice < Data cleaning, Mathematics / Probability and statistics: Summaries; Testing ideas; Regression in practice
+ Data engineering < Statistics in practice, Programming / Databases: Pipelines; Data warehouses; Data at scale
+ Applied machine learning < Statistics in practice, Programming / Machine learning: Feature engineering; Model selection; Deploying models

## Humanities | 📜 | History, philosophy, religion, languages and literature
# History | 📜 | From the first cities to today
Ancient world: First civilizations; Ancient Egypt; Greece and Rome; Ancient India and China
Middle ages: Medieval Europe; The Islamic golden age; Medieval Asia and Africa; The Americas before 1500
Early modern world: The Renaissance; The age of exploration; The Reformation; The scientific revolution
Age of revolutions: The Enlightenment; The American and French revolutions; The industrial revolution; Empires
Modern world ~ Economics / Economic policy: World War I; World War II; The Cold War; Decolonization; The world today
+ Historiography < Modern world, Investigation / Finding sources: Sources and evidence; Interpretations; Writing history
+ History of science < Early modern world, Arcana / Scientific method: Ancient science; The scientific revolution in depth; Modern science
# Philosophy | 🏛️ | The big questions, argued well
Philosophy basics: What philosophy is; Arguments; The great questions
Ethics < Philosophy basics: Right and wrong; Virtue ethics; Consequences and duties
Epistemology < Philosophy basics, Logic / Propositional logic: Knowledge; Belief and justification; Skepticism
Metaphysics < Epistemology: Reality; Causation; Time
Political philosophy < Ethics, History / Age of revolutions: Justice; Rights; The state
+ Philosophy of mind < Metaphysics, Nature / The human body: Consciousness; Free will; Personal identity
+ Philosophy of science < Epistemology, Arcana / Scientific method: Explanation; Theory change; Science and values
# Religion ~ | 🕯️ | Faiths and myths of the world
World religions: Abrahamic faiths; Hinduism and Buddhism; East Asian traditions; Indigenous traditions
Mythology: Greek and Roman myths; Norse myths; Myths around the world
Sacred texts < World religions: Reading scripture; Commentary traditions; Texts compared
+ Comparative religion < Sacred texts, Mythology, Philosophy / Metaphysics: Ritual; Belief and practice; Religion and society
# Languages | 🗣️ | A new language, from first words to fluency
Sounds and script: Pronunciation; Alphabet or script; Accent
First words < Sounds and script: Greetings; Numbers; Everyday words; Your first 500 words
Grammar basics < First words ~ Writing / Writing basics: Sentence structure; Present tense; Questions and negatives; Past and future
Listening and reading < Grammar basics: Graded readers; Podcasts; Native speed
Speaking and writing < Grammar basics: Conversations; Messages and emails; Telling stories
+ Fluency < Listening and reading, Speaking and writing: Idioms; Complex grammar; Thinking in the language
+ Translation < Fluency, Writing / Editing: Translation techniques; Translation tools; Specialized texts
# Literature | 📚 | Read deeply, from poems to novels
Reading literature < Study craft / Reading for understanding: Close reading; Themes; Context
Poetry < Reading literature: Meter and rhyme; Imagery; Poetic forms
The novel < Reading literature: Plot and structure; Character; Narrative voice
Drama < Reading literature: Tragedy and comedy; Shakespeare; Modern drama
Literary theory < Poetry, The novel, Drama: Formalism; Historical criticism; Modern theory
+ Comparative literature < Literary theory, Languages / Listening and reading: Translation and meaning; World literature; Influence

## Social sciences | 📈 | Economics and psychology
# Economics | 📈 | How people, markets and countries use resources
Economic basics ~ Personal finance / Money basics: Scarcity and trade-offs; Supply and demand; Markets
Microeconomics < Economic basics, Mathematics / Algebra: Consumers; Firms; Competition
Macroeconomics < Economic basics: GDP and growth; Inflation; Money and banks; Unemployment
Economic policy < Microeconomics, Macroeconomics: Government and taxes; Trade; Economic crises
+ Econometrics < Economic policy, Mathematics / Probability and statistics: Economic data; Regression; Causality
+ Behavioral economics < Microeconomics, Psychology / Biases and decisions: Heuristics; Nudges; Experiments
+ Finance < Microeconomics, Personal finance / Investing: Valuation; Markets and risk; Corporate finance
# Psychology | 🧩 | How minds work
Foundations of psychology: What psychology studies; Research methods in psychology; The brain and behavior
Cognition < Foundations of psychology ~ Memory / How memory works: Perception and attention; Memory; Thinking
Development < Foundations of psychology: Childhood; Adolescence; Adulthood
Social psychology < Foundations of psychology: Groups; Attitudes; Influence and conformity
Biases and decisions < Cognition: Heuristics and biases; Judgment; Choice
Personality < Development: Traits; Motivation; Identity
+ Clinical psychology < Personality, Medicine / Mental health: Disorders; Therapies; Wellbeing
+ Neuropsychology < Cognition, Nature / The human body: The brain; Brain and mind; Brain injury

## Learning | 🧠 | Memory, study and research skills
# Memory | 🧠 | Remember what you learn, on purpose
How memory works: Encoding; Storage; Retrieval; Forgetting
Spaced repetition < How memory works: Flashcards; Review schedules; Writing good cards
Mnemonics < How memory works: Acronyms and rhymes; Chunking; Vivid images; The Major System
Memory palace < Mnemonics: Choosing palaces; Placing images; Long journeys
+ Memory sports < Memory palace: The PAO system; Memorize a deck of cards; Speed numbers
# Study craft | 📝 | Learn faster and keep it
Active recall: Self-testing; Practice questions; Blurting
Note-taking <: Notes in your own words; Linking notes; Summaries
Reading for understanding <: Skimming; Questioning; Close reading of texts
Planning your study < Active recall: Study schedules; The Pomodoro technique; Weekly review
+ Exam mastery < Planning your study, Memory / Spaced repetition: Revision plans; Past papers; Test anxiety
# Investigation | 🔍 | Research and problem solving
Finding sources < Study craft / Reading for understanding: Search techniques; Libraries and databases; Evaluating sources
Problem solving <: Defining the problem; Breaking it down; Heuristics
Analysis < Finding sources, Problem solving: Gathering data; Spotting patterns; Drawing conclusions
Reporting < Analysis: Writing it up; Citing sources; Presenting findings
+ Research methods < Analysis, Mathematics / Probability and statistics: Surveys; Experiments; Statistics for research

@wis
## Mind | 👁️ | Mindfulness, and reading yourself and others
# Perception | 👁️ | Mindfulness, and noticing what others miss
Mindfulness basics: Breath awareness; Body scan; Noticing thoughts
Meditation practice < Mindfulness basics: Daily sitting; Walking meditation; Loving-kindness
Awareness < Mindfulness basics: Observation skills; Situational awareness; Deep listening
+ Retreat practice < Meditation practice: Silent retreat; Deep concentration; Insight practice
# Insight | 💭 | Read people and yourself
Self-knowledge: Journaling; Values; Emotions; Strengths and weaknesses
Empathy < Self-knowledge: Active listening; Perspective taking; Compassion
Reading people < Empathy: Body language; Tone and words; Motives
Psychology in daily life < Self-knowledge, Psychology / Foundations of psychology: Habits; Motivation at work; Relationships
+ Coaching others < Empathy, Psychology in daily life: Powerful questions; Giving feedback; Goal setting
+ Counseling skills < Reading people, Psychology / Social psychology: Holding space; Reflective listening; Knowing your limits

## Health know-how | 🩺 | First aid, medicine and mental health
# Medicine | 🩺 | Health know-how and first aid
First aid: Scene safety; CPR; Bleeding and wounds; Burns and fractures
Health basics < First aid, Nature / The human body: How the body works; Common illnesses; Medicines and safety
Mental health < Health basics: Stress; Anxiety and mood; Getting help
+ Wilderness first aid < First aid, Survival / Emergencies: Improvised care; Evacuation; Environmental emergencies
+ Emergency care < First aid, Health basics: Triage; Trauma care; Medical emergencies

## Self-reliance | 🧭 | The outdoors, the kitchen, money and home
# Survival | 🧭 | The outdoors and self-reliance
Outdoor basics: Planning a trip; Clothing and layers; Leave no trace
Navigation < Outdoor basics: Maps; Compass; GPS and apps
Camping < Outdoor basics ~ Cooking / Cooking methods: Shelter; Fire; Water; Camp cooking
Emergencies < Navigation, Camping: Signaling; Staying found; Weather dangers
+ Wilderness expeditions < Emergencies, Medicine / First aid: Multi-day routes; Remote travel; Leading a group
# Cooking | 🍳 | Good food, from scratch
Kitchen basics: Knife skills; Kitchen safety; Measuring; Stocking a pantry
Cooking methods < Kitchen basics: Boiling and steaming; Sautéing; Roasting and baking; Grilling
Flavor < Cooking methods ~ Chemistry / Reactions: Salt, fat, acid and heat; Herbs and spices; Sauces
Meals < Flavor: Breakfasts; Weeknight dinners; Meal prep; Cooking for others
+ Baking and pastry < Cooking methods ~ Chemistry / Reactions: Bread; Pastry; Cakes
+ World cuisines < Flavor: Italian cooking; Asian cooking; Mexican cooking; Indian cooking
# Personal finance | 💰 | Money sense for life
Money basics: Budgeting; Saving; Banking; Tracking spending
Debt and credit < Money basics: How credit works; Paying off debt; Loans and mortgages
Investing < Money basics, Mathematics / Pre-algebra: Compound interest; Index funds; Risk and diversification; Retirement accounts
Financial planning < Debt and credit, Investing: Emergency fund; Financial goals; Taxes; Insurance
+ Financial independence < Financial planning: Savings rate; Withdrawal rates; Early retirement
# Home repair | 🔧 | Fix and improve your home
Home tools: Tool kit; Working safely; Measuring and marking
Plumbing basics < Home tools: Leaks and drips; Unblocking drains; Replacing fixtures
Electrical basics < Home tools, Electronics / Circuit basics: Home wiring; Switches and sockets; Electrical safety
Carpentry repairs < Home tools, Crafts / Woodworking: Doors and drawers; Shelves; Patching walls
+ Renovation < Plumbing basics, Electrical basics, Carpentry repairs: Planning a project; Budgets and permits; Finishing well

## Living things | 🐾 | Animals and plants
# Animal Handling | 🐾 | Care for pets and animals
Pet care: Feeding; Pet health; Grooming
Animal training < Pet care: Positive reinforcement; Basic commands; Behavior problems
Animal behavior < Pet care, Nature / Plants and animals: Instincts; Communication; Welfare
+ Horse riding < Animal training, Acrobatics / Balance: Grooming and tack; Walk and trot; Canter
# Gardening | 🌱 | Grow plants and food
Soil: Soil types; Compost; Feeding the soil
Planting < Soil: Seeds and seedlings; Transplanting; Spacing
Plant care < Planting: Watering; Pruning; Seasons
Pests and diseases < Plant care, Nature / Plants and animals: Common pests; Plant diseases; Natural control
+ Growing food < Plant care: Vegetables; Herbs; Fruit
+ Permaculture < Pests and diseases, Nature / Ecology: Permaculture design; Food forests; Water and soil systems

@cha
## Communication | 💬 | Conversation, writing and persuasion
# Social skills | 💬 | Conversation, friendship and connection
Small talk: Starting conversations; Keeping them going; Graceful exits
Friendship < Small talk: Making friends; Staying in touch; Being a good friend
Handling conflict < Small talk: Staying calm; Assertive messages; Repairing relationships
Networking < Friendship: Events; Following up; Building relationships
+ Charisma < Friendship, Intimidation / Presence: Presence and warmth; Confidence; Making people feel seen
# Writing | ✍️ | Say it clearly on the page
Writing basics: Clear sentences; Paragraphs; Grammar and punctuation
Essays < Writing basics: Arguments; Structure; Research for essays
Creative writing < Writing basics: Story; Characters; Dialogue; Poetry writing
Professional writing < Writing basics: Emails; Reports; Copywriting
Editing < Essays: Self-editing; Cutting; Style
+ Novel writing < Creative writing, Editing, Literature / The novel: Plotting; Drafting a novel; Revision; Publishing
+ Journalism < Professional writing, Investigation / Finding sources: News writing; Interviewing; Features
+ Screenwriting < Creative writing, Performance / Acting: Screenplay format; Scenes; Rewriting
# Persuasion | 🤝 | Bring people round
Communication basics: Clarity; Listening well; Asking good questions
Influence < Communication basics: Reciprocity and trust; Framing; Persuasive stories
Negotiation < Influence: Preparing; Interests, not positions; Making offers; Closing a deal
Sales < Influence: Prospecting; Discovery calls; Handling objections
+ High-stakes negotiation < Negotiation, Intimidation / Composure: Hardball tactics; Walking away; Holding firm
+ Marketing < Sales, Psychology / Social psychology: Audiences; Messaging; Campaigns

## Performing arts | 🎤 | Speaking, acting and singing
# Performance | 🎤 | Public speaking and the stage
Public speaking: Structuring a talk; Voice and body; Handling nerves; Q&A
Storytelling < Public speaking: Story structure; Anecdotes; Humor
Acting < Storytelling ~ Deception / Improv: Scene work; Building a character; Voice for acting
Singing <  ~ Music theory / Notation: Breath support; Pitch; Range; Songs
Stage presence < Public speaking, Acting: Owning the stage; Reading a room; Timing
+ Stand-up comedy < Storytelling, Stage presence: Writing jokes; Comic timing; Open mics
+ Professional speaking < Public speaking, Storytelling: Keynotes; Workshops; Media interviews
+ Musical theater < Acting, Singing, Dance / Dance foundations: Singing in character; Staging numbers; Auditions

## Influence | 👑 | Leadership, presence and a good poker face
# Leadership | 👑 | Set direction and bring people with you
Leading yourself: Goals; Discipline; Learning from mistakes
Decision making < Leading yourself: Weighing options; Deciding under uncertainty; Owning the call
Leading a team < Leading yourself, Persuasion / Influence: Delegation; Motivation; Feedback culture
Strategy < Decision making, Leading a team: Vision; Planning; Execution
+ Leading organizations < Strategy, Performance / Public speaking: Culture; Change; Scaling teams
+ Entrepreneurship < Strategy, Personal finance / Financial planning: Finding an idea; Building a product; Growing a business
# Intimidation | 🦁 | Presence, assertiveness and boundaries
Assertiveness: Saying no; Stating your needs; Setting boundaries
Presence < Assertiveness: Posture; Eye contact; Voice
Composure < Assertiveness: Staying calm under pressure; Handling criticism; Recovering from mistakes
+ Command presence < Presence, Composure: Taking charge; Crisis leadership; Calm authority
# Deception ~ | 🃏 | Acting, improv and a good poker face
Improv: Yes, and; Characters; Scenes
Poker: Rules and hands; Odds; Reading players; Bluffing
Poker face: Controlling tells; Staying neutral; Misdirection in conversation
+ Game theory < Poker, Mathematics / Probability and statistics: Strategies; Equilibria; Bluffing math
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
  const pending: { entry: CatalogEntry; refs: string[]; related: string[] }[] = [];
  let ability = "";
  let area: CatalogEntry | null = null;
  let field: CatalogEntry | null = null;
  let parallel = false;
  let lastSub: CatalogEntry | null = null;
  let order = 0;
  const add = (e: CatalogEntry, refs: string[] = [], related: string[] = []) => {
    out.push(e);
    if (refs.length || related.length) pending.push({ entry: e, refs, related });
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
          // No skipping: each step needs the one before it.
          needs: prev ? [prev.key] : [],
          related: [],
          field: owner.field,
          order: i,
        });
      });
  };
  const header = (line: string) => {
    const [head, icon = "📘", description = ""] = line.split("|").map((s) => s.trim());
    return { head, icon, description };
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("@")) {
      ability = line.slice(1).trim();
      continue;
    }
    if (line.startsWith("##")) {
      const { head, icon, description } = header(line.slice(2));
      const key = `${ability}/${slug(head)}`;
      area = add({ key, name: head, ability, tier: "general", icon, description, needs: [], related: [], field: key, order: order++ });
      field = null;
      continue;
    }
    if (line.startsWith("#")) {
      if (!area) throw new Error(`Catalog: "${line}" comes before any area`);
      const { head, icon, description } = header(line.slice(1));
      parallel = head.endsWith("~");
      const name = head.replace(/~$/, "").trim();
      const key = `${area.key}/${slug(name)}`;
      const siblings = out.filter((e) => e.parent === area!.key).length;
      field = add({ key, name, ability, tier: "field", icon, description, parent: area.key, needs: [], related: [], field: key, order: siblings });
      lastSub = null;
      continue;
    }
    if (!field) throw new Error(`Catalog: "${line}" comes before any field`);
    const advanced = line.startsWith("+");
    const body = advanced ? line.slice(1).trim() : line;
    const colon = body.indexOf(":");
    const head = colon < 0 ? body : body.slice(0, colon);
    const [main, relList = ""] = head.split("~");
    const explicit = main.includes("<");
    const [name, refList = ""] = main.split("<").map((s) => s.trim());
    const list = (s: string) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const refs = list(refList);
    const siblings = out.filter((e) => e.parent === field!.key);
    const entry: CatalogEntry = {
      key: `${field.key}/${slug(name)}`,
      name,
      ability,
      tier: advanced ? "advanced" : "sub",
      icon: field.icon,
      parent: field.key,
      needs: [],
      related: [],
      field: field.key,
      order: siblings.length,
    };
    // A topic follows the one above it unless it says what it needs (or "<" alone: nothing).
    if (!advanced && !parallel && !explicit && lastSub) entry.needs.push(lastSub.key);
    // An advanced skill with nothing named follows the last topic.
    if (advanced && !refs.length && lastSub) entry.needs.push(lastSub.key);
    add(entry, refs, list(relList));
    if (!advanced) lastSub = entry;
    if (colon >= 0) details(entry, body.slice(colon + 1));
  }
  // Names: "Name" in the same field, or "Field / Name" anywhere.
  const byField = new Map<string, CatalogEntry[]>();
  for (const e of out) if (e.tier === "sub" || e.tier === "advanced") byField.set(e.field, [...(byField.get(e.field) ?? []), e]);
  const fields = out.filter((e) => e.tier === "field");
  const resolve = (entry: CatalogEntry, ref: string) => {
    const [a, b] = ref.split("/").map((s) => s.trim());
    const f = b ? fields.find((g) => sameName(g.name, a)) : fields.find((g) => g.key === entry.field);
    const hit = f && (byField.get(f.key) ?? []).find((e) => sameName(e.name, b ?? a));
    if (!hit) throw new Error(`Catalog: "${entry.name}" refers to "${ref}", which isn't in the catalog`);
    return hit.key;
  };
  for (const { entry, refs, related } of pending) {
    for (const ref of refs) {
      const k = resolve(entry, ref);
      if (!entry.needs.includes(k)) entry.needs.push(k);
    }
    for (const ref of related) {
      const k = resolve(entry, ref);
      if (!entry.related.includes(k) && !entry.needs.includes(k)) entry.related.push(k);
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

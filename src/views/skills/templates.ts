// Hand-written starter trees, so the skill tree works without AI. Categories
// are ability ids (str, dex, con, int, wis, cha; see shared/skills.ts).

import type { SkillPlanItem } from "../../../shared/skills.ts";

export interface SkillTemplate {
  id: string;
  name: string;
  icon: string;
  /** Default ability for items without their own. */
  area: string;
  blurb: string;
  skills: SkillPlanItem[];
}

type Item = Omit<SkillPlanItem, "parentKeys"> & { parents?: string[] };

function tpl(id: string, name: string, icon: string, area: string, blurb: string, items: Item[]): SkillTemplate {
  return {
    id,
    name,
    icon,
    area,
    blurb,
    skills: items.map(({ parents, ...rest }) => ({ category: area, ...rest, parentKeys: parents ?? [] })),
  };
}

/** The featured starter: every D&D skill as a real-life skill, under its ability. */
export const FEATURED_TEMPLATE = "dnd";

export const SKILL_TEMPLATES: SkillTemplate[] = [
  tpl("dnd", "D&D character", "🎲", "int", "All six abilities and every D&D skill, read as real life. Intelligence covers academics and memory techniques.", [
    // Strength
    { key: "athletics", name: "Athletics", icon: "🏋️", category: "str", description: "Strength training, climbing, swimming and sport.", quests: [{ title: "Strength workout", cadence: "weekly", target: 2, xp: 60 }] },
    { key: "climbing", name: "Climbing", icon: "🧗", category: "str", description: "Boulder and climb: grip, technique and nerve.", parents: ["athletics"], requiredLevel: 3 },
    // Dexterity
    { key: "acrobatics", name: "Acrobatics", icon: "🤸", category: "dex", description: "Mobility, balance, yoga and dance.", quests: [{ title: "Stretch 10 minutes", cadence: "daily", xp: 20 }] },
    { key: "sleight", name: "Sleight of Hand", icon: "✍️", category: "dex", description: "Skilled hands: an instrument, drawing, crafts or fast typing.", quests: [{ title: "Practice a hand skill 15 minutes", cadence: "daily", xp: 25 }] },
    { key: "stealth", name: "Stealth", icon: "🥷", category: "dex", description: "Move quietly and unseen: trails, wildlife watching and your privacy online." },
    // Constitution
    { key: "endurance", name: "Endurance", icon: "🫀", category: "con", description: "Cardio: walk, run, cycle or swim a little further each month.", quests: [{ title: "Cardio session", cadence: "weekly", target: 3, xp: 50 }] },
    { key: "vitality", name: "Vitality", icon: "😴", category: "con", description: "Sleep, nutrition and recovery that keep you going.", quests: [{ title: "In bed by 11 pm", cadence: "daily", xp: 20 }] },
    { key: "concentration", name: "Concentration", icon: "🎯", category: "con", description: "Hold deep focus under pressure, like a caster keeping a spell up.", quests: [{ title: "One 45-minute deep-work block", cadence: "daily", xp: 30 }] },
    // Intelligence: memory techniques and academics
    { key: "memory", name: "Memory", icon: "🧠", category: "int", description: "Memory techniques: remember what you learn, on purpose." },
    { key: "srs", name: "Spaced repetition", icon: "🗂️", category: "int", description: "Review flashcards on a schedule so knowledge lasts for years.", parents: ["memory"], requiredLevel: 2, quests: [{ title: "Review your flashcards", cadence: "daily", xp: 20 }] },
    { key: "mnemonics", name: "Mnemonics", icon: "🔤", category: "int", description: "Acronyms, chunking, vivid images and the Major System for numbers.", parents: ["memory"], requiredLevel: 2 },
    { key: "palace", name: "Memory palace", icon: "🏛️", category: "int", description: "The method of loci: place what you learn along a route you know by heart.", parents: ["mnemonics"], requiredLevel: 3 },
    { key: "study", name: "Study craft", icon: "📝", category: "int", description: "Active recall, the Feynman technique and notes that make you think.", quests: [{ title: "25-minute study session", cadence: "daily", xp: 25 }] },
    { key: "arcana", name: "Arcana", icon: "🔮", category: "int", description: "Science, math and technology: the arcane arts of our world." },
    { key: "history", name: "History", icon: "📜", category: "int", description: "History, the humanities and current events." },
    { key: "investigation", name: "Investigation", icon: "🔍", category: "int", description: "Research and problem solving: find sources, test ideas, get to the bottom of things.", parents: ["study"], requiredLevel: 3 },
    { key: "nature", name: "Nature", icon: "🌿", category: "int", description: "Biology, ecology and how the natural world works." },
    { key: "religion", name: "Religion", icon: "🕯️", category: "int", description: "Philosophy, religion and mythology: the big questions." },
    { key: "languages", name: "Languages", icon: "🗣️", category: "int", description: "A new language, from first words to real conversations.", quests: [{ title: "15 minutes of practice", cadence: "daily", xp: 25 }] },
    // Wisdom
    { key: "perception", name: "Perception", icon: "👁️", category: "wis", description: "Mindfulness, and noticing what others miss.", quests: [{ title: "Meditate 10 minutes", cadence: "daily", xp: 25 }] },
    { key: "insight", name: "Insight", icon: "💭", category: "wis", description: "Read people and yourself: empathy, journaling and reflection.", quests: [{ title: "Write three lines in your journal", cadence: "daily", xp: 20 }] },
    { key: "medicine", name: "Medicine", icon: "🩺", category: "wis", description: "Health know-how and first aid." },
    { key: "survival", name: "Survival", icon: "🧭", category: "wis", description: "Self-reliance: cooking, the outdoors and money sense.", quests: [{ title: "Cook a meal from scratch", cadence: "weekly", target: 3, xp: 40 }] },
    { key: "animals", name: "Animal Handling", icon: "🐾", category: "wis", description: "Care for pets, animals and plants." },
    // Charisma
    { key: "persuasion", name: "Persuasion", icon: "🤝", category: "cha", description: "Negotiation, sales and bringing people round." },
    { key: "performance", name: "Performance", icon: "🎤", category: "cha", description: "Public speaking, music and the stage." },
    { key: "intimidation", name: "Intimidation", icon: "🦁", category: "cha", description: "Presence and assertiveness: say what you need and hold your boundaries." },
    { key: "deception", name: "Deception", icon: "🃏", category: "cha", description: "Acting, improv and a good poker face." },
    { key: "leadership", name: "Leadership", icon: "👑", category: "cha", description: "Set direction and bring people with you.", parents: ["persuasion", "performance"], requiredLevel: 5 },
  ]),

  tpl("memory", "Memory & study", "🧠", "int", "A wizard's training: learn how to learn, then remember anything, up to memorizing a deck of cards.", [
    { key: "recall", name: "Active recall", icon: "🧪", description: "Test yourself instead of rereading.", quests: [{ title: "Close the book and recall five key points", cadence: "daily", xp: 20 }] },
    { key: "srs", name: "Spaced repetition", icon: "🗂️", description: "Flashcards on a schedule so memories last.", quests: [{ title: "Review your flashcards", cadence: "daily", xp: 20 }] },
    { key: "notes", name: "Note-taking", icon: "📝", description: "Notes in your own words, linked to each other." },
    { key: "feynman", name: "Feynman technique", icon: "🧑‍🏫", description: "Explain it simply to find the gaps in what you know.", parents: ["recall"], requiredLevel: 2 },
    { key: "reading", name: "Reading for understanding", icon: "📖", description: "Skim, question and read with a purpose.", parents: ["notes"], requiredLevel: 2 },
    { key: "mnemonics", name: "Mnemonics", icon: "🔤", description: "Acronyms, rhymes, chunking and vivid images." },
    { key: "palace", name: "Memory palace", icon: "🏛️", description: "Place memories along a route you know well.", parents: ["mnemonics"], requiredLevel: 3 },
    { key: "major", name: "Major System", icon: "🔢", description: "Turn numbers into words and images.", parents: ["mnemonics"], requiredLevel: 3 },
    { key: "pao", name: "PAO system", icon: "🎭", description: "Person–Action–Object images for long numbers and cards.", parents: ["major", "palace"], requiredLevel: 5 },
    { key: "deck", name: "Memorize a deck of cards", icon: "♠️", description: "The classic memory-athlete feat.", parents: ["pao"], requiredLevel: 6 },
    { key: "exams", name: "Exam mastery", icon: "🎓", description: "Plan revision, practise under test conditions and stay calm.", parents: ["srs", "feynman"], requiredLevel: 4 },
  ]),

  tpl("fitness", "Fitness", "🏃", "con", "From first steps to athletic performance: cardio, strength, mobility and fuel.", [
    { key: "mobility", name: "Mobility", icon: "🤸", category: "dex", description: "Joint range of motion and flexibility.", quests: [{ title: "Stretch 10 minutes", cadence: "daily", xp: 20 }] },
    { key: "cardio", name: "Cardio base", icon: "🫀", description: "Easy aerobic work that builds your engine.", quests: [{ title: "Run or brisk walk", cadence: "weekly", target: 3, xp: 50 }] },
    { key: "bodyweight", name: "Bodyweight strength", icon: "💪", category: "str", description: "Push-ups, squats, pull-ups and planks." },
    { key: "nutrition", name: "Nutrition", icon: "🥗", description: "Protein, whole foods and sensible portions." },
    { key: "sleep", name: "Recovery & sleep", icon: "😴", description: "Sleep, rest days and managing fatigue." },
    { key: "5k", name: "Run a 5K", icon: "🏃", description: "Run 5 km without stopping.", parents: ["cardio"], requiredLevel: 3 },
    { key: "barbell", name: "Barbell lifts", icon: "🏋️", category: "str", description: "Squat, deadlift, bench and press with good form.", parents: ["bodyweight", "mobility"], requiredLevel: 4 },
    { key: "half", name: "Half marathon", icon: "🏅", description: "Train for and finish 21.1 km.", parents: ["5k", "sleep"], requiredLevel: 8 },
    { key: "performance", name: "Athletic performance", icon: "🏆", category: "str", description: "Periodized training toward peak performance.", parents: ["half", "barbell", "nutrition"], requiredLevel: 12 },
  ]),

  tpl("programming", "Programming", "💻", "int", "From your first program to system design and open-source research.", [
    { key: "basics", name: "Programming fundamentals", icon: "💻", description: "Variables, control flow, functions and debugging.", quests: [{ title: "Code for 30 minutes", cadence: "daily", xp: 30 }] },
    { key: "git", name: "Git & tooling", icon: "🔧", description: "Version control, the terminal and your editor.", parents: ["basics"], requiredLevel: 2 },
    { key: "ds", name: "Data structures", icon: "🧱", description: "Arrays, maps, trees, graphs and their trade-offs.", parents: ["basics"], requiredLevel: 4 },
    { key: "algo", name: "Algorithms", icon: "⚙️", description: "Sorting, searching, recursion and complexity.", parents: ["ds"], requiredLevel: 5 },
    { key: "web", name: "Web fundamentals", icon: "🌐", description: "HTML, CSS, JavaScript and HTTP.", parents: ["basics"], requiredLevel: 3 },
    { key: "frontend", name: "Frontend apps", icon: "🖼️", description: "Components, state and accessible UI.", parents: ["web"], requiredLevel: 5 },
    { key: "backend", name: "Backend & APIs", icon: "🔌", description: "Servers, APIs, auth and testing.", parents: ["web", "git"], requiredLevel: 5 },
    { key: "db", name: "Databases", icon: "🗄️", description: "SQL, data modelling and indexes.", parents: ["backend"], requiredLevel: 4 },
    { key: "design", name: "System design", icon: "🏗️", description: "Scalable, reliable architectures.", parents: ["algo", "db"], requiredLevel: 8 },
    { key: "oss", name: "Open source & research", icon: "🔬", description: "Contribute to projects and push the state of the art.", parents: ["design"], requiredLevel: 12 },
  ]),

  tpl("languages", "Languages", "🗣️", "int", "Learn a language from first sounds to fluent, cultured conversation.", [
    { key: "sounds", name: "Pronunciation", icon: "🔤", description: "The sound system, alphabet and accent." },
    { key: "vocab", name: "Core vocabulary", icon: "📇", description: "The 2,000 most useful words.", quests: [{ title: "Review flashcards", cadence: "daily", xp: 20 }] },
    { key: "grammar", name: "Grammar basics", icon: "🧩", description: "Sentence structure, tenses and agreement." },
    { key: "listening", name: "Listening", icon: "🎧", category: "wis", description: "Understand podcasts, shows and native speed.", parents: ["sounds", "vocab"], requiredLevel: 3 },
    { key: "reading", name: "Reading", icon: "📖", description: "Graded readers, then news and novels.", parents: ["vocab", "grammar"], requiredLevel: 3 },
    { key: "speaking", name: "Speaking", icon: "💬", category: "cha", description: "Real conversations with real people.", parents: ["listening"], requiredLevel: 4, quests: [{ title: "Conversation session", cadence: "weekly", xp: 80 }] },
    { key: "writing", name: "Writing", icon: "✍️", description: "Messages, essays and a natural style.", parents: ["reading"], requiredLevel: 5 },
    { key: "fluency", name: "Fluency", icon: "🌍", category: "cha", description: "Think and express yourself freely.", parents: ["speaking", "writing"], requiredLevel: 10 },
    { key: "culture", name: "Cultural fluency", icon: "🎎", description: "Idioms, humour, history and literature.", parents: ["fluency"], requiredLevel: 8 },
  ]),

  tpl("music", "Music", "🎹", "dex", "Technique, theory and ear, all the way to composing and performing.", [
    { key: "rhythm", name: "Rhythm", icon: "🥁", description: "Pulse, subdivision and groove." },
    { key: "ear", name: "Ear training", icon: "👂", category: "wis", description: "Intervals, chords and melodies by ear." },
    { key: "technique", name: "Instrument technique", icon: "🎹", description: "Posture, scales and clean playing.", quests: [{ title: "Practice 20 minutes", cadence: "daily", xp: 30 }] },
    { key: "theory", name: "Music theory", icon: "🎼", category: "int", description: "Notation, keys, scales and chords." },
    { key: "harmony", name: "Chords & harmony", icon: "🎶", category: "int", description: "Voicings, progressions and voice leading.", parents: ["theory", "technique"], requiredLevel: 4 },
    { key: "repertoire", name: "Repertoire", icon: "📜", description: "A growing set of pieces you can play.", parents: ["technique", "rhythm"], requiredLevel: 3 },
    { key: "improv", name: "Improvisation", icon: "🎷", category: "cha", description: "Make music up on the spot.", parents: ["harmony", "ear"], requiredLevel: 6 },
    { key: "compose", name: "Composition", icon: "🎵", category: "cha", description: "Write and arrange your own music.", parents: ["improv"], requiredLevel: 6 },
    { key: "perform", name: "Performing", icon: "🎤", category: "cha", description: "Play for others with confidence.", parents: ["repertoire"], requiredLevel: 8 },
  ]),

  tpl("art", "Drawing & painting", "🖌️", "dex", "Observation, perspective, light and color, toward a personal style.", [
    { key: "lines", name: "Line & shape", icon: "✏️", description: "Confident lines, simple forms and proportions.", quests: [{ title: "Daily sketch", cadence: "daily", xp: 25 }] },
    { key: "observe", name: "Observation drawing", icon: "👁️", category: "wis", description: "Draw what you see, not what you think you see.", parents: ["lines"], requiredLevel: 2 },
    { key: "perspective", name: "Perspective", icon: "📐", category: "int", description: "One-, two- and three-point perspective.", parents: ["lines"], requiredLevel: 3 },
    { key: "value", name: "Value & light", icon: "🌗", description: "Shading, form lighting and cast shadows.", parents: ["observe"], requiredLevel: 3 },
    { key: "color", name: "Color theory", icon: "🎨", category: "int", description: "Hue, saturation, temperature and harmony.", parents: ["value"], requiredLevel: 3 },
    { key: "anatomy", name: "Figure & anatomy", icon: "🧍", category: "int", description: "Gesture, proportions and anatomy.", parents: ["observe"], requiredLevel: 5 },
    { key: "composition", name: "Composition", icon: "🖼️", category: "wis", description: "Framing, focal points and storytelling.", parents: ["perspective", "value"], requiredLevel: 4 },
    { key: "painting", name: "Painting", icon: "🖌️", description: "Traditional or digital painting from start to finish.", parents: ["color", "composition"], requiredLevel: 5 },
    { key: "style", name: "Personal style", icon: "✨", category: "cha", description: "A recognisable voice in your work.", parents: ["painting", "anatomy"], requiredLevel: 10 },
  ]),

  tpl("math", "Mathematics", "🧮", "int", "From algebra to analysis and research mathematics.", [
    { key: "algebra", name: "Algebra", icon: "➗", description: "Equations, functions and graphs." },
    { key: "logic", name: "Logic & proofs", icon: "🧠", description: "How to read and write mathematical proofs." },
    { key: "geometry", name: "Geometry & trig", icon: "📐", description: "Shapes, angles and trigonometric functions.", parents: ["algebra"], requiredLevel: 2 },
    { key: "calculus", name: "Calculus", icon: "∫", description: "Limits, derivatives and integrals.", parents: ["algebra", "geometry"], requiredLevel: 4 },
    { key: "linalg", name: "Linear algebra", icon: "🔢", description: "Vectors, matrices and linear maps.", parents: ["algebra", "logic"], requiredLevel: 4 },
    { key: "prob", name: "Probability", icon: "🎲", description: "Random variables and distributions.", parents: ["calculus"], requiredLevel: 4 },
    { key: "stats", name: "Statistics", icon: "📊", description: "Inference, estimation and models.", parents: ["prob", "linalg"], requiredLevel: 5 },
    { key: "analysis", name: "Real analysis", icon: "📈", description: "Rigorous foundations of calculus.", parents: ["calculus", "logic"], requiredLevel: 8 },
    { key: "research", name: "Research mathematics", icon: "🔭", description: "Read papers and prove new results.", parents: ["analysis", "stats"], requiredLevel: 12 },
  ]),

  tpl("money", "Money", "💰", "wis", "Budget, save, invest and grow toward financial independence.", [
    { key: "budget", name: "Budgeting", icon: "📒", description: "A simple plan for every dollar.", quests: [{ title: "Review spending", cadence: "weekly", xp: 50 }] },
    { key: "emergency", name: "Emergency fund", icon: "🛟", description: "Three to six months of expenses set aside.", parents: ["budget"], requiredLevel: 2 },
    { key: "debt", name: "Debt payoff", icon: "✂️", description: "Snowball or avalanche your way out of debt.", parents: ["budget"], requiredLevel: 3 },
    { key: "saving", name: "Saving habit", icon: "🐖", description: "Pay yourself first, automatically.", quests: [{ title: "Move money to savings", cadence: "weekly", xp: 40 }] },
    { key: "taxes", name: "Tax basics", icon: "🧾", category: "int", description: "Brackets, deductions and tax-advantaged accounts.", parents: ["budget"], requiredLevel: 4 },
    { key: "investing", name: "Investing basics", icon: "📈", category: "int", description: "Risk, diversification and compounding.", parents: ["emergency", "saving"], requiredLevel: 4 },
    { key: "index", name: "Index investing", icon: "🧺", description: "Low-cost, long-term portfolio building.", parents: ["investing", "taxes"], requiredLevel: 5 },
    { key: "income", name: "Income growth", icon: "💼", category: "cha", description: "Negotiate, upskill and build side income." },
    { key: "fi", name: "Financial independence", icon: "🏝️", description: "Work because you want to, not because you must.", parents: ["index", "income", "debt"], requiredLevel: 10 },
  ]),

  tpl("social", "Social skills", "🤝", "cha", "Listening, conversation and confidence, up to leading people.", [
    { key: "listen", name: "Active listening", icon: "👂", category: "wis", description: "Attention, reflection and good questions." },
    { key: "smalltalk", name: "Conversation", icon: "💬", description: "Start, sustain and deepen conversations.", quests: [{ title: "Talk to someone new", cadence: "weekly", xp: 50 }] },
    { key: "empathy", name: "Empathy", icon: "🤗", category: "wis", description: "Understand how others feel and why.", parents: ["listen"], requiredLevel: 3 },
    { key: "assert", name: "Assertiveness", icon: "🗯️", description: "Say what you need, kindly and clearly.", parents: ["smalltalk"], requiredLevel: 3 },
    { key: "story", name: "Storytelling", icon: "📣", description: "Tell stories people remember.", parents: ["smalltalk"], requiredLevel: 4 },
    { key: "speaking", name: "Public speaking", icon: "🎤", description: "Present to groups with confidence.", parents: ["story"], requiredLevel: 5 },
    { key: "conflict", name: "Conflict resolution", icon: "🕊️", description: "Turn disagreements into progress.", parents: ["empathy", "assert"], requiredLevel: 5 },
    { key: "network", name: "Relationships & network", icon: "🌐", description: "Keep in touch and help others generously.", parents: ["smalltalk"], requiredLevel: 4, quests: [{ title: "Reach out to a friend", cadence: "weekly", xp: 40 }] },
    { key: "lead", name: "Leadership", icon: "👑", description: "Set direction and bring people with you.", parents: ["conflict", "speaking"], requiredLevel: 8 },
  ]),

  tpl("mindfulness", "Mindfulness", "🧘", "wis", "Calm, awareness and resilience through small daily practices.", [
    { key: "breath", name: "Breathwork", icon: "🌬️", description: "Calm the body with the breath." },
    { key: "meditate", name: "Meditation", icon: "🧘", description: "Train attention and awareness.", parents: ["breath"], requiredLevel: 2, quests: [{ title: "Meditate 10 minutes", cadence: "daily", xp: 25 }] },
    { key: "journal", name: "Journaling", icon: "✍️", description: "Process your days in writing.", quests: [{ title: "Evening journal", cadence: "daily", xp: 20 }] },
    { key: "gratitude", name: "Gratitude", icon: "🙏", description: "Notice what is going well.", quests: [{ title: "Write three good things", cadence: "daily", xp: 15 }] },
    { key: "awareness", name: "Emotional awareness", icon: "💭", description: "Name emotions as they arise.", parents: ["meditate", "journal"], requiredLevel: 3 },
    { key: "stress", name: "Stress management", icon: "🌊", category: "con", description: "Tools for hard days.", parents: ["breath", "awareness"], requiredLevel: 4 },
    { key: "compassion", name: "Self-compassion", icon: "💗", description: "Treat yourself like a good friend would.", parents: ["gratitude", "awareness"], requiredLevel: 4 },
    { key: "equanimity", name: "Equanimity", icon: "☯️", description: "Steady in the face of whatever comes.", parents: ["stress", "compassion"], requiredLevel: 8 },
  ]),

  tpl("home", "Cooking & home", "🏡", "wis", "Kitchen confidence, a tidy home and the know-how to fix things.", [
    { key: "knife", name: "Knife skills", icon: "🔪", category: "dex", description: "Safe, fast, even cuts." },
    { key: "cooking", name: "Cooking basics", icon: "🍳", description: "Heat, seasoning and a repertoire of staples.", quests: [{ title: "Cook a meal from scratch", cadence: "weekly", target: 3, xp: 40 }] },
    { key: "planning", name: "Meal planning", icon: "🗓️", description: "Plan, shop and prep for the week.", parents: ["cooking"], requiredLevel: 3 },
    { key: "baking", name: "Baking", icon: "🥖", category: "int", description: "Bread, pastry and the science behind them.", parents: ["cooking"], requiredLevel: 4 },
    { key: "cuisine", name: "World cuisines", icon: "🍜", description: "Techniques and flavours from around the world.", parents: ["knife", "cooking"], requiredLevel: 6 },
    { key: "cleaning", name: "Cleaning routines", icon: "🧽", description: "Small daily habits that keep the home fresh.", quests: [{ title: "10-minute tidy", cadence: "daily", xp: 15 }] },
    { key: "organize", name: "Organization", icon: "📦", description: "A place for everything.", parents: ["cleaning"], requiredLevel: 3 },
    { key: "repairs", name: "Basic repairs", icon: "🔧", category: "dex", description: "Fix, patch, assemble and maintain." },
    { key: "garden", name: "Gardening", icon: "🌱", description: "Grow herbs, vegetables and flowers." },
  ]),
];

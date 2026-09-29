// The whole skill tree, planned up front and built in, from the general to the
// detailed: every ability's broad areas (Formal sciences, Sports, Visual arts),
// the fields in each (Mathematics, Swimming, Drawing), their topics (which
// branch and join: Pre-algebra leads to both Algebra and Geometry, and
// Trigonometry needs both), the steps you learn inside each topic, the
// advanced skills beyond them, and at the top of every field its expert
// skills: PhD-level study and research for an academic field, mastery (elite,
// coaching, professional) for a practical one. Every branch goes all the way:
// each topic leads on to an advanced skill, and each advanced skill to an
// expert one. Titles only: lessons are written when you get there. Nothing is
// skipped: each step needs the one before it, a topic needs every step of what
// it follows, and an advanced skill needs what it builds on, from any tree
// (Software development needs Programming, Computer science and Math). Related
// skills in other trees are linked too, without locking.
//
// The map shows all of it as planned skills; a skill becomes yours (a real
// skill with a page) when you start it (see shared/skill-map.ts).

export type CatalogTier = "general" | "field" | "sub" | "detail" | "advanced" | "expert";

export interface CatalogEntry {
  /** Stable id: "int/formal-sciences/mathematics/algebra/linear-equations". */
  key: string;
  name: string;
  /** Ability (area) id: str, dex, con, int, wis, cha. */
  ability: string;
  /** general: a broad area; field: a field in it; sub: a topic in the field; detail: a step in a topic; advanced: beyond the topics; expert: PhD level or mastery, the top of the field. */
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
 *   ++ Expert < Advanced, Other: a; b       an expert skill (PhD level, or mastery) at the top of the field, after what it needs
 */
export const CATALOG_TEXT = `
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
Hypertrophy < Training programs, Strength nutrition: How muscle grows; Training volume; Exercise selection; Training close to failure
+ Periodization < Barbell lifts, Hypertrophy: Block periodization; Undulating periodization; Autoregulation and RPE; Planning a training year
+ Exercise physiology < Training programs, Nature / The human body: Muscle and the nervous system; Energy systems; Adaptation to training; Fatigue and recovery
+ Biomechanics < Barbell lifts, Physics / Mechanics: Levers and moment arms; Force and velocity; Joint loading; Technique analysis
++ Elite powerlifting < Powerlifting, Periodization: Qualifying totals; Making weight; Multi-year planning; National championships; International meets
++ Elite weightlifting < Olympic weightlifting, Periodization: Technique at maximal loads; Making weight; Qualifying totals; National championships; International meets
++ Strength coaching < Powerlifting, Olympic weightlifting, Strongman, Periodization: Assessing athletes; Teaching the lifts; Programming for a sport; Monitoring training load; Coaching certification
++ Strength science < Exercise physiology, Biomechanics, Periodization, Investigation / Research methods: Reading the research; Muscle adaptation research; Lab testing methods; Designing training studies; Publishing research
# Calisthenics | 💪 | Bodyweight strength and skills
Bodyweight foundations: Push-ups; Rows; Squats and lunges; Plank and hollow body
Pulling < Bodyweight foundations: Dead hangs; Pull-ups; Chin-ups; Archer pull-ups
Pushing < Bodyweight foundations: Dips; Pike push-ups; Pseudo-planche push-ups
Legs and core < Bodyweight foundations: Pistol squat progressions; L-sit; Dragon flag progressions
+ Muscle-up < Pulling, Pushing: False grip; The transition; Strict muscle-up
+ Handstand push-up < Pushing, Acrobatics / Tumbling: Wall handstand; Negatives; Freestanding handstand push-up
+ Levers < Pulling, Legs and core: Tuck front lever; Back lever; Full front lever
+ Planche < Pushing, Legs and core: Planche leans; Tuck planche; Straddle planche; Full planche
++ Elite calisthenics < Muscle-up, Handstand push-up, Levers, Planche: One-arm pull-up; Maltese and victorian progressions; Skill combinations; Street workout competition
++ Calisthenics coaching < Muscle-up, Handstand push-up, Levers, Athletics / Exercise physiology: Assessing clients; Designing progressions; Tendon and joint health; Coaching groups

## Sports | ⚽ | Play: ball games, the water and the wall
# Ball sports ~ | ⚽ | Team and racket games
Football: Ball control; Passing; Shooting; Positioning
Basketball: Dribbling; Shooting form; Passing and moves; Team play
Tennis: Forehand; Backhand; Serve; Rallies and tactics
Volleyball: Passing and digging; Setting; Serving; Spiking
+ Coaching a team < Football, Basketball, Persuasion / Communication basics: Running practice; Tactics; Motivating players
+ Competitive tennis < Tennis: Match tactics; Doubles play; The mental game; Tournament play
+ Competitive volleyball < Volleyball: Blocking; Rotations and systems; Beach volleyball; League play
++ Elite tennis < Competitive tennis: Ranking tournaments; Playing every surface; Planning a season; The professional tour
++ Elite volleyball < Competitive volleyball: Position specialization; High-level systems; National league play; International competition
++ Professional coaching < Coaching a team, Leadership / Leading a team: Coaching licenses; Match analysis; Player development; Sports science for teams; Coaching at elite level
# Swimming | 🏊 | From water confidence to open water
Water skills: Floating; Breathing; Kicking; Treading water
Freestyle < Water skills: Freestyle arms; Side breathing; Freestyle kick; Freestyle rhythm
Backstroke < Water skills: Backstroke position; Backstroke arms; Backstroke turns
Breaststroke < Water skills: Breaststroke kick; Breaststroke pull; Breaststroke timing
Butterfly < Freestyle: Dolphin kick; Butterfly arms; Butterfly breathing
Swim fitness < Freestyle ~ Endurance / Cardio base: Drills; Interval sets; Turns and push-offs
+ Open-water swimming < Swim fitness: Sighting; Cold water; Safety in open water
+ Lifesaving < Swim fitness, Medicine / First aid: Rescue techniques; Towing; Water first aid
+ Competitive swimming < Freestyle, Backstroke, Breaststroke, Butterfly, Swim fitness: Racing starts; Flip and open turns; Individual medley; Race pacing; Swim meets
++ Elite swimming < Competitive swimming ~ Athletics / Periodization: Stroke refinement; Tapering and peaking; National championships; International racing
++ Marathon swimming < Open-water swimming: Long-distance training; Feeding in the water; Channel crossings; Open-water racing
++ Swim coaching < Competitive swimming, Lifesaving: Stroke analysis; Teaching all levels; Planning a season; Coaching a squad
# Climbing | 🧗 | Boulder and climb: grip, technique and nerve
Climbing basics < Athletics / Movement basics: Footwork; Grips and holds; Body positioning; Falling safely
Bouldering < Climbing basics: Reading problems; Dynamic moves; Overhangs; Projecting
Rope skills < Climbing basics: Climbing knots; Belaying; Rappelling
Top-rope and lead < Rope skills: Top-rope climbing; Lead climbing; Clipping and falls
Training for climbing < Bouldering, Athletics / Training programs: Finger strength; Power endurance; Climbing injuries
+ Outdoor climbing < Top-rope and lead, Survival / Outdoor basics: Rock types and ethics; Anchors; Multi-pitch climbing
+ Competition climbing < Bouldering, Top-rope and lead, Training for climbing: Onsight and flash; Competition formats; Speed climbing; Competing
+ Trad climbing < Outdoor climbing: Placing gear; Trad anchors; Crack climbing; Self-rescue
++ Elite climbing < Competition climbing, Outdoor climbing: Periodized climbing training; Projecting at your limit; International competition; Hard first ascents
++ Big wall and alpine climbing < Trad climbing, Hiking / Mountaineering: Aid climbing; Hauling and portaledges; Alpine rock; Big wall ascents
++ Climbing guiding < Trad climbing, Medicine / Wilderness first aid: Teaching new climbers; Client care and risk; Rescue systems; Guide certification

## Combat | 🥋 | Self-defense and combat sports
# Martial arts | 🥋 | Striking, grappling and sparring
Martial arts fundamentals: Stance and footwork; Guard; Breakfalls; Conditioning
Striking < Martial arts fundamentals: Punches; Kicks; Combinations; Blocking and slipping
Grappling < Martial arts fundamentals ~ Athletics / Movement basics: Takedowns; Positions; Escapes; Submissions
Sparring < Striking, Grappling: Controlled sparring; Timing and distance; Fight strategy
+ Self-defense < Sparring, Intimidation / Composure: Awareness and avoidance; De-escalation; Escaping holds
+ Competition < Sparring, Athletics / Training programs: Rules and scoring; Fight camp; Competing
+ Black belt < Sparring, Self-defense: Forms and kata; Advanced techniques; Teaching juniors; Black belt grading
+ Mixed martial arts < Competition: Striking to grappling; Wrestling for MMA; Ground and pound; Cage work
++ Professional fighting < Mixed martial arts: Turning pro; Elite fight camps; Making weight safely; Title fights
++ Martial arts instruction < Black belt, Insight / Coaching others: Running a class; Grading students; Teaching self-defense; Master grades; Running a school
# Boxing | 🥊 | The sweet science
Stance and guard: Boxing stance; High guard; Ring footwork
Punches < Stance and guard: Jab; Cross; Hooks; Uppercuts
Defense < Stance and guard: Parrying; Slipping; Rolling; Clinching
Ring craft < Punches, Defense: Combinations; Counters; Ring control
+ Amateur bouts < Ring craft, Endurance / Endurance training: Conditioning for fights; Boxing rules; Your first bout
+ Advanced boxing < Amateur bouts: Boxing styles; Feints and setups; Adjusting mid-fight; Fighting southpaws
+ Cornering < Amateur bouts: Hand wrapping; Between rounds; Cuts and swelling; Reading the fight
++ Elite amateur boxing < Advanced boxing: National championships; International tournaments; Olympic qualification
++ Professional boxing < Advanced boxing: Turning pro; Championship rounds; Elite fight camps; Title fights
++ Boxing coaching < Advanced boxing, Cornering, Insight / Coaching others: Teaching fundamentals; Pad work; Developing fighters; Running a boxing gym

@dex

## Movement arts | 🤸 | Mobility, balance, acrobatics, dance and moving unseen
# Acrobatics | 🤸 | Mobility, balance, yoga and tumbling
Mobility: Hips; Shoulders; Spine; Ankles and wrists
Balance < Mobility: Single-leg balance; Balance boards; Slacklining
Yoga < Mobility: Foundational poses; Sun salutations; Breath and flow; Inversions
Tumbling < Balance: Rolls; Cartwheels; Handstands; Round-offs
+ Advanced acrobatics < Tumbling, Calisthenics / Bodyweight foundations: Back handspring; Aerials; Partner acrobatics
+ Parkour < Tumbling, Climbing / Climbing basics: Precision jumps; Vaults; Wall runs; Flow
+ Advanced yoga < Yoga, Balance: Arm balances; Advanced inversions; Pranayama; Yoga philosophy
++ Elite acrobatics < Advanced acrobatics: Multiple saltos and twists; Hand balancing; Aerial and circus apparatus; Performing professionally
++ Acrobatics coaching < Advanced acrobatics, Parkour: Spotting and safety; Teaching progressions; Coaching parkour; Running a gym
++ Yoga teaching < Advanced yoga: Teacher training; Sequencing classes; Adjustments and safety; Yoga therapy
++ Movement science < Advanced acrobatics, Nature / The human body ~ Physics / Mechanics: Biomechanics; Flexibility research; Motor learning; Injury prevention
# Dance | 💃 | Rhythm, movement and style
Dance foundations ~ Music theory / Rhythm and meter: Moving to the beat; Posture and frame; Footwork; Spins and turns
Partner dance < Dance foundations: Leading and following; Salsa basics; Bachata basics; Swing basics
Street dance < Dance foundations: Grooves; Popping and locking; Breaking basics; Freestyle
Ballet < Dance foundations: Ballet positions; Barre work; Jumps and leaps
Contemporary < Ballet: Floor work; Release technique; Dance improvisation
+ Choreography < Partner dance, Street dance, Contemporary: Musicality; Building a routine; Teaching a routine; Performing it
+ Advanced ballet < Ballet: Advanced barre and centre; Allegro and batterie; Pointe and partnering; Classical variations
++ Professional dance < Advanced ballet, Choreography ~ Performance / Stage presence: Auditions and companies; Professional repertoire; Performing at the top level; Teaching dance
++ Choreographic practice < Choreography: Composing full works; Dance notation; Dance history and theory; Directing a production
++ Dance science < Choreography, Nature / The human body: Dance anatomy; Kinesiology and biomechanics; Injury prevention; Research in dance science
# Stealth | 🥷 | Move unseen: fieldcraft and privacy
Moving quietly: Quiet footwork; Using cover; Patience
Wildlife watching < Moving quietly: Tracks and signs; Fieldcraft; Binoculars and cameras
Online privacy <  ~ Computer science / Computer systems: Passwords and 2FA; Tracking and ads; Encrypted messaging; Your digital footprint
+ Cybersecurity basics < Online privacy, Computer science / Computer systems: Common threats; Securing your devices; Networks and firewalls; Incident response
+ Advanced tracking < Wildlife watching: Track identification; Aging tracks; Following a trail; Camouflage and concealment
+ Ethical hacking < Cybersecurity basics, Programming / Programming fundamentals: Reconnaissance; Web vulnerabilities; Exploitation; Capture the flag
+ Defensive security < Cybersecurity basics: Threat modeling; Hardening systems; Monitoring and detection; Digital forensics
++ Tracking mastery < Advanced tracking, Nature / Ecology: Tracker evaluations; Wildlife surveys; Tracking for research; Teaching tracking
++ Security research < Ethical hacking, Defensive security, Computer science / Cryptography: Reverse engineering; Vulnerability research; Responsible disclosure; Publishing research
++ Privacy engineering < Defensive security, Online privacy: Privacy by design; Anonymity and metadata; Privacy-enhancing technologies; Privacy law and policy

## Hand skills | 🪄 | Quick, precise hands and things you make
# Sleight of Hand ~ | 🪄 | Typing, juggling and magic
Touch typing: Home row; All the letters; Numbers and symbols; Speed and accuracy
Juggling: Three-ball cascade; Juggling tricks; Four and five balls
Card magic: Card handling; False shuffles; Forces; Card routines
Coin magic: Palms; Vanishes; Productions
+ Close-up magic < Card magic, Coin magic, Performance / Stage presence: Misdirection; Patter; Performing for people
+ Speed typing < Touch typing: Accuracy drills; Keyboard layouts; Typing races; 120 words per minute
+ Advanced juggling < Juggling: Siteswap notation; Clubs and rings; Five to seven balls; Passing
+ Stage magic < Close-up magic: Parlour and stage effects; Mentalism; Building an act
++ Stenography < Speed typing: Steno theory; Briefs and phrases; Real-time captioning; 225 words per minute
++ Juggling mastery < Advanced juggling ~ Performance / Stage presence: Numbers juggling; Creating an act; Festivals and competitions; Teaching juggling
++ Magic mastery < Close-up magic, Stage magic ~ Psychology / Cognition: Original effects; Magic theory; The psychology of magic; Performing professionally
# Crafts ~ | 🧵 | Make things by hand
Woodworking ~ Mathematics / Geometry: Tools and safety; Measuring and cutting; Joinery; Finishing
Sewing: Hand stitches; Sewing machine; Patterns; Alterations
Knitting: Casting on; Knit and purl; Reading patterns; Finishing a piece
Ceramics: Hand building; The wheel; Glazing and firing
+ Furniture making < Woodworking, Mathematics / Geometry: Furniture design; Advanced joinery; Upholstery
+ Tailoring < Sewing: Fitting; Pattern drafting; Tailored jackets; Couture techniques
+ Advanced knitting < Knitting: Cables; Colorwork; Lace; Designing patterns
+ Advanced ceramics < Ceramics ~ Chemistry / Reactions: Throwing large forms; Trimming and handles; Glaze chemistry; Kiln firing
++ Fine woodworking < Furniture making: Fine furniture; Carving and marquetry; Running a workshop; Teaching woodworking
++ Bespoke tailoring < Tailoring: Cutting from measurements; Hand-finished suits; Fashion and textile history; Teaching tailoring
++ Knitwear design < Advanced knitting: Designing garments; Grading sizes; Publishing patterns; Teaching knitting
++ Studio pottery < Advanced ceramics: A body of work; Glaze research; Exhibiting and selling; Teaching ceramics

## Visual arts | 🎨 | Drawing, painting and photography
# Drawing | ✏️ | From lines to finished pictures
Drawing basics: Lines and shapes; Contour drawing; Shading and value; Proportion
Observation < Drawing basics: Still life; Light and shadow; Drawing from life
Perspective < Drawing basics ~ Mathematics / Geometry: One-point perspective; Two-point perspective; Three-point perspective
Figure drawing < Observation ~ Nature / The human body: Gesture; Anatomy for artists; Faces; Hands
Composition < Observation, Perspective: Framing; Focal points; Storytelling in pictures
+ Illustration < Figure drawing, Composition, Painting / Color theory: Character design; Environments; Finding your style
+ Comics < Figure drawing, Writing / Creative writing: Panels and pacing; Visual storytelling; Lettering
+ Atelier drawing < Figure drawing, Perspective: Cast drawing; Sight-size method; Long-pose figure drawing; Master copies
++ Professional illustration < Illustration, Atelier drawing: A professional portfolio; Clients and commissions; Publishing and licensing; Teaching illustration
++ Graphic novels < Comics, Illustration: Scripting a long story; Page and book design; A finished graphic novel; Comics studies
# Painting | 🖌️ | Color, paint and pixels
Color theory < Drawing / Drawing basics: The color wheel; Value and saturation; Color harmony; Mixing colors
Watercolor < Color theory: Washes; Wet on wet; Layering
Acrylic and oil < Color theory: Brushwork; Blocking in; Glazing
Digital painting < Color theory: Digital tools; Layers and brushes; Digital workflow
+ Landscape painting < Acrylic and oil, Drawing / Perspective: Plein air; Skies and water; Atmosphere
+ Concept art < Digital painting, Drawing / Composition: Thumbnails; Worldbuilding; Presentation
+ Mixed media < Watercolor, Acrylic and oil: Gouache and ink; Collage; Experimental surfaces
+ Figure painting < Acrylic and oil, Drawing / Figure drawing: Flesh tones; Likeness; Painting from the model
+ Art history < Color theory, Drawing / Composition ~ History / Early modern world: Ancient and medieval art; Renaissance to Romanticism; Modern art; Contemporary art
++ Fine art painting < Figure painting, Landscape painting, Mixed media: A body of work; Critique; Exhibiting and galleries; Teaching painting
++ Visual development < Concept art, Figure painting: Production design; Art direction; An industry portfolio; Working in a studio
++ Art theory and criticism < Art history, Philosophy / Philosophy basics: Aesthetics; Critical theory; Curating and criticism; A research thesis
# Photography | 📷 | Seeing and capturing light
Camera basics: Your camera; Focus; Holding steady
Exposure < Camera basics: Aperture; Shutter speed; ISO; The exposure triangle
Photo composition < Camera basics ~ Drawing / Composition: Rule of thirds; Leading lines; Framing a shot
Light < Exposure: Natural light; Flash; Golden hour
Photo editing < Exposure: Raw editing; Color grading; Retouching
+ Portrait photography < Light, Photo editing: Posing; Studio lighting; Working with people
+ Street and travel photography < Photo composition, Light: Candid moments; Telling a story; A travel series
+ Fine art photography < Photo composition, Photo editing: Concepts and series; Printing; Photobooks
++ Professional photography < Portrait photography: A professional portfolio; Commercial and editorial work; Clients and pricing; Teaching photography
++ Photojournalism < Street and travel photography, Writing / Journalism: Working on assignment; Photo essays; Ethics and captions; Agencies and publishing
++ Photographic art and theory < Fine art photography ~ Painting / Art history: History of photography; Photo theory and criticism; A mature body of work; Exhibiting and curating

## Music making | 🎹 | Play, understand and produce music
# Musical instrument | 🎹 | Play an instrument: posture to performance
Instrument basics: Posture and technique; First notes; Reading notation or tabs; Practice habits
Rhythm < Instrument basics ~ Music theory / Rhythm and meter: Pulse and counting; Note values; Syncopation
Chords and scales < Instrument basics ~ Music theory / Keys and scales: Major scales; Minor scales; Basic chords; Arpeggios
Playing songs < Rhythm, Chords and scales: Simple songs; Accompaniment; Playing with others
Musicianship < Playing songs, Music theory / Harmony: Dynamics and expression; Improvisation; Performing
+ Advanced technique < Musicianship: Speed and precision; Extended techniques; Building a repertoire
+ Band playing < Musicianship, Social skills / Friendship: Rehearsing; Arranging; Gigs
+ Chamber and orchestral playing < Advanced technique: Sight-reading; Chamber music; Orchestral playing; Following a conductor
++ Concert performance < Advanced technique: Recital repertoire; Historical performance practice; Auditions and competitions; A solo recital
++ Professional musicianship < Advanced technique, Band playing: Session work; Touring; The music business; Teaching students
++ Conducting < Chamber and orchestral playing, Music theory / Form and analysis: Baton technique; Score study; Running rehearsals; Leading an orchestra
# Music theory | 🎼 | How music works
Notation: The staff; Note names; Rhythm notation
Keys and scales < Notation: Intervals; Major keys; Minor keys; Modes
Rhythm and meter < Notation: Time signatures; Subdivision; Groove
Chords < Keys and scales: Triads; Seventh chords; Inversions
Harmony < Chords: Progressions; Voice leading; Cadences
Form and analysis < Harmony, Rhythm and meter: Song form; Classical forms; Analyzing a piece
+ Composition < Form and analysis: Melody writing; Development; Orchestration
+ Jazz theory < Harmony: Extended chords; Substitutions; Improvising on changes
+ Counterpoint < Harmony: Species counterpoint; Two-voice writing; Invention and fugue
+ Post-tonal theory < Form and analysis: Pitch-class sets; Twelve-tone music; Modern techniques
+ Music history < Form and analysis ~ History / Early modern world: Medieval and Renaissance music; Baroque and Classical; The Romantic era; Modern and popular music
++ Advanced composition < Composition, Counterpoint, Post-tonal theory: Large-scale forms; Writing for orchestra; Contemporary techniques; A portfolio of works
++ Jazz composition and arranging < Jazz theory, Composition: Transcription and analysis; Reharmonization; Big band arranging; Original jazz works
++ Musicology < Music history, Post-tonal theory, History / Historiography: Historical musicology; Ethnomusicology; Music theory research; A dissertation
# Music production | 🎚️ | Record, beat-make and mix
DAW basics: Your DAW; Tracks and clips; MIDI
Recording < DAW basics: Microphones; Gain staging; Recording takes
Beat making < DAW basics, Music theory / Rhythm and meter: Drum patterns; Sampling; Arrangement
Sound design < DAW basics: Synthesis; Effects; Sound layering
Mixing < Recording, Beat making: EQ; Compression; Space and depth
+ Mastering < Mixing: Loudness; Final EQ; Delivering a master
+ Electronic music < Sound design, Beat making: Genres and styles; Live sets; Releasing music
+ Studio acoustics < Recording, Physics / Waves and sound: Room acoustics; Treating a room; Monitoring and calibration
++ Audio engineering < Mastering, Studio acoustics: Critical listening; Professional mixing; Mastering for release; Running a studio; Training engineers
++ Record production < Mastering, Electronic music: Producing artists; Arrangement and vision; Leading sessions; A released album
++ Music technology research < Studio acoustics, Mathematics / Calculus, Programming / Programming fundamentals: Digital signal processing; Psychoacoustics; Building audio software; Research in music technology

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
+ Bike racing < Cycling, Endurance training: Riding in a pack; Climbing and descending; Time trials; Racing tactics
+ Endurance physiology < Endurance training, Athletics / Exercise physiology: VO2 max; Lactate threshold; Running and cycling economy; Heat and altitude
++ Elite marathon < Marathon, Endurance physiology: High-mileage training; Altitude camps; Championship racing; Elite marathon racing
++ Long-course triathlon < Triathlon, Marathon: Long-course training; Fueling an all-day race; Pacing the full distance; Racing full distance
++ Elite cycling < Bike racing, Endurance physiology: Power-based training; Stage racing; Team roles; Professional racing
++ Endurance coaching < Endurance physiology, Insight / Coaching others: Testing athletes; Writing training plans; Periodizing a season; Applying the research; Coaching certification
# Hiking | 🥾 | Trails, hills and mountains
Trail basics < Endurance / Cardio base: Gear and clothing; Pacing on hills; Trail etiquette
Trail navigation < Trail basics, Survival / Navigation: Reading trails; Route planning; When lost
Multi-day hikes < Trail navigation: Packing light; Camping on the trail; Resupply
+ Mountaineering < Multi-day hikes, Climbing / Rope skills: Crampons and ice axe; Glacier travel; Altitude
+ Ultralight backpacking < Multi-day hikes: Base weight; Shelter systems; Choosing gear; Skills over gear
++ Thru-hiking < Ultralight backpacking: Long-trail planning; Resupply strategy; Months on the trail; Completing a long trail
++ High-altitude mountaineering < Mountaineering, Medicine / Wilderness first aid: Acclimatization strategy; Expedition logistics; Fixed ropes and high camps; Climbing above 7000 m
++ Mountain guiding < Mountaineering, Medicine / Wilderness first aid: Leading groups; Risk management; Avalanche assessment; Guide certification

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
+ Nutritional biochemistry < Nutrition science, Chemistry / Biochemistry: Energy metabolism; Macronutrient metabolism; Micronutrient biochemistry; Nutrients and genes
+ Nutrition research methods < Nutrition science, Mathematics / Probability and statistics: Study designs; Measuring what people eat; Nutritional epidemiology; Clinical trials
+ Nutrition counseling < Diet design, Meal planning: Nutrition assessment; Personal meal plans; Motivational interviewing; Behavior change
++ Clinical dietetics < Clinical nutrition, Nutritional biochemistry, Nutrition counseling: Medical nutrition therapy; Enteral and parenteral nutrition; Supervised practice; Dietitian registration
++ Sports dietetics < Sports nutrition, Nutrition counseling: Periodized fueling; Energy availability; Working with teams; Sports dietitian certification
++ Nutrition research < Nutritional biochemistry, Nutrition research methods: Reading the literature; Designing studies; Running trials; Writing papers; A dissertation
# Vitality | 😴 | Sleep, recovery and healthy habits
Sleep: Sleep hygiene; Circadian rhythm; Naps; Sleep problems
Recovery < Sleep: Rest days; Stretching; Stress and recovery
Healthy habits < Sleep: Building habits; Tracking your health; Checkups
+ Longevity < Recovery, Healthy habits, Nutrition / Nutrition science: Exercise for life; Healthy aging; Prevention
+ Sleep science < Sleep, Nature / Neuroscience: Sleep stages and cycles; How sleep is regulated; Sleep disorders; Measuring sleep
++ Sleep research < Sleep science, Investigation / Research methods: Sleep lab methods; Circadian biology; Sleep and disease; Publishing research
++ Longevity science < Longevity, Nature / Genetics: Biology of aging; Hallmarks of aging; Aging interventions; Human trials
++ Health coaching < Longevity, Sleep science, Insight / Coaching others: Health assessments; Motivational interviewing; Coaching behavior change; Health coach certification

## Mental stamina | 🎯 | Focus and resilience
# Concentration | 🎯 | Deep focus you can hold
Attention basics: How attention works; Distractions; Single-tasking
Deep work < Attention basics: Time blocking; Focus sessions; Designing your space
Meditation for focus < Attention basics, Perception / Mindfulness basics: Breath focus; Noting; Longer sits
Mental stamina < Deep work, Meditation for focus: Longer sessions; Breaks and energy; Flow states
+ Peak performance < Mental stamina: Performing under pressure; Routines; Review and adjust
+ Attention science < Deep work, Psychology / Cognition: Attention networks; Working memory; Cognitive load; Mind wandering
++ Performance psychology < Peak performance, Attention science, Stress resilience / Performing under pressure: Mental skills training; Assessing performers; Working with athletes; Applied research
++ Attention research < Attention science, Investigation / Research methods: Cognitive experiments; Neuroscience of attention; Designing studies; Publishing research
# Stress resilience | 🧘 | Stay steady when it's hard
Understanding stress: Stress and the body; Good and bad stress; Your stress signals
Breathing techniques < Understanding stress: Box breathing; Slow exhales; Breathing on the go
Emotional regulation < Understanding stress, Insight / Self-knowledge: Naming emotions; Reframing; Self-compassion
Exposure training < Breathing techniques: Cold exposure; Heat exposure; Discomfort practice
+ Performing under pressure < Emotional regulation, Concentration / Deep work: Pre-performance routines; Handling nerves; Bouncing back
+ Stress physiology < Understanding stress, Nature / The human body: The stress response; Stress hormones; Heart rate variability; Stress and long-term health
+ Stress inoculation < Exposure training, Emotional regulation: Graded stressors; Coping skills under load; Training in realistic conditions; Debrief and recovery
++ Elite resilience < Performing under pressure, Stress inoculation: Decisions in a crisis; Operating while exhausted; Recovering after trauma; Staying resilient for years
++ Resilience coaching < Stress inoculation, Stress physiology, Insight / Coaching others: Assessing stress; Teaching coping skills; Group programs; Coaching high performers
++ Stress science < Stress physiology, Investigation / Research methods: Psychophysiology methods; Resilience research; Designing studies; Publishing research

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
+ Complex analysis < Real analysis, Multivariable calculus: Complex functions; Holomorphic functions; Cauchy's theorem; Residues; Conformal maps
+ Probability theory < Probability and statistics, Multivariable calculus: Random variables; Joint distributions; Expectation and moments; Limit theorems; Markov chains
+ Differential geometry < Multivariable calculus, Topology: Curves; Surfaces; Curvature; Geodesics; Intro to manifolds
++ Graduate analysis < Real analysis, Complex analysis, Probability theory, Differential equations: Measure theory; Functional analysis; Measure-theoretic probability; Harmonic analysis; Partial differential equations
++ Graduate algebra < Abstract algebra, Number theory: Galois theory; Modules and commutative algebra; Representation theory; Homological algebra; Algebraic number theory
++ Graduate geometry and topology < Topology, Differential geometry, Graduate algebra: Algebraic topology; Smooth manifolds; Riemannian geometry; Lie groups; Algebraic geometry
++ Mathematical research < Graduate analysis, Graduate algebra, Graduate geometry and topology: Reading the literature; Open problems; Original research; Writing papers; A dissertation
# Logic | ⚖️ | Reasoning you can check
Propositional logic: Statements; Connectives; Truth tables; Valid arguments
Predicate logic < Propositional logic: Quantifiers; Translating sentences; Predicate proofs
Critical thinking < Propositional logic: Fallacies; Weighing evidence; Statistics in the news
Proofs < Predicate logic, Mathematics / Algebra: Direct proof; Contradiction; Induction
Set theory < Proofs: Sets; Functions and relations; Infinity
+ Mathematical logic < Set theory, Mathematics / Discrete mathematics: Formal systems; Completeness; Incompleteness
+ Philosophy of logic < Proofs, Philosophy / Epistemology: Truth; Paradoxes; Non-classical logics
+ Modal logic < Set theory: Necessity and possibility; Kripke semantics; Modal proof systems; Temporal and epistemic logic
+ Inductive logic < Critical thinking, Mathematics / Probability and statistics: Inductive arguments; Probability and confirmation; Bayesian reasoning; Decision theory
++ Graduate logic < Mathematical logic, Mathematics / Abstract algebra: Model theory; Computability theory; Axiomatic set theory and forcing; Proof theory
++ Philosophical logic < Modal logic, Inductive logic, Philosophy of logic: Intuitionistic logic; Relevance and paraconsistent logics; Theories of truth; Formal epistemology
++ Logic research < Graduate logic, Philosophical logic: Reading the literature; Open problems; Original research; Writing papers; A dissertation
# Computer science | 🖥️ | How computers and computation work
Computational thinking: Decomposition; Patterns and abstraction; Algorithms in everyday life; Pseudocode
Computer systems < Computational thinking: Bits and bytes; Hardware; Operating systems; Networks and the internet
Data structures < Computational thinking, Programming / Programming fundamentals: Arrays and lists; Maps and sets; Stacks and queues; Trees; Graphs
Algorithms < Data structures, Mathematics / Discrete mathematics: Searching; Sorting; Recursion; Complexity and Big O; Dynamic programming
Theory of computation < Algorithms, Logic / Set theory: Automata; Computability; Complexity classes
+ Computer architecture < Computer systems, Electronics / Digital logic: Logic circuits; Processors; Memory hierarchy
+ Artificial intelligence < Algorithms, Mathematics / Probability and statistics: Search and planning; Knowledge and reasoning; Intro to machine learning
+ Cryptography < Algorithms, Mathematics / Number theory: Ciphers; Public-key cryptography; Hashes and signatures
+ Algorithm design < Algorithms, Theory of computation, Mathematics / Probability and statistics: Greedy algorithms; Graph algorithms and network flow; NP-completeness; Randomized algorithms; Approximation algorithms
+ Operating system design < Computer architecture, Data structures: Processes and threads; Scheduling; Virtual memory; File systems; Concurrency and synchronization
+ Programming languages < Theory of computation, Logic / Proofs: Syntax and semantics; Lambda calculus; Type systems; Interpreters and compilers
++ Theoretical computer science < Algorithm design, Cryptography, Programming languages, Logic / Mathematical logic: Computational complexity; Advanced algorithms; Foundations of cryptography; Programming language theory; Formal verification
++ Graduate systems < Operating system design: Advanced operating systems; Computer networking; Distributed systems; Consensus and fault tolerance
++ Machine learning theory < Artificial intelligence, Algorithm design, Mathematics / Probability theory, Programming / Machine learning: Statistical learning theory; Optimization for learning; Online learning and bandits; Deep learning theory
++ Computer science research < Theoretical computer science, Graduate systems, Machine learning theory: Reading the literature; Open problems; Original research; Writing papers; A dissertation

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
+ Electrodynamics < Electricity and magnetism, Mathematics / Multivariable calculus: Electrostatics; Magnetostatics; Maxwell's equations; Electromagnetic waves; Radiation
+ Statistical mechanics < Thermodynamics, Quantum mechanics: Microstates and entropy; Ensembles and partition functions; Quantum statistics; Phase transitions
+ Solid-state physics < Quantum mechanics, Statistical mechanics: Crystal structure; Band theory; Phonons; Semiconductors; Magnetism in solids
++ Quantum field theory < Quantum mechanics, Electrodynamics, Classical mechanics: Advanced quantum mechanics; Relativistic quantum mechanics; Quantizing fields; Feynman diagrams; Renormalization and gauge theories
++ General relativity and cosmology < Classical mechanics, Electrodynamics, Astrophysics, Mathematics / Differential geometry: Tensors and curved spacetime; Einstein's equations; Black holes; Gravitational waves; Physical cosmology
++ Condensed matter physics < Solid-state physics, Statistical mechanics: Advanced statistical mechanics; Many-body quantum theory; Superconductivity; Topological phases
++ Physics research < Quantum field theory, General relativity and cosmology, Condensed matter physics: Reading the literature; Open problems; Original research; Writing papers; A dissertation
# Chemistry | 🧪 | Matter, bonds and reactions
Matter and atoms: States of matter; Atomic structure; The periodic table; Isotopes
Chemical bonding < Matter and atoms: Ionic bonds; Covalent bonds; Molecular shapes; Intermolecular forces
Reactions < Chemical bonding, Mathematics / Pre-algebra: Balancing equations; Stoichiometry; Reaction types; Energy in reactions
Solutions and acids < Reactions: Solutions; Acids and bases; pH; Equilibrium
Organic chemistry < Chemical bonding: Carbon compounds; Functional groups; Organic reactions
+ Biochemistry < Organic chemistry, Nature / Cells: Proteins; Enzymes; Metabolic pathways
+ Physical chemistry < Solutions and acids, Mathematics / Calculus, Physics / Thermodynamics: Chemical thermodynamics; Kinetics; Quantum chemistry
+ Materials science < Chemical bonding, Physics / Thermodynamics: Metals; Polymers; Ceramics and composites
+ Organic synthesis < Organic chemistry, Reactions: Stereochemistry; Reaction mechanisms; Carbonyl and aromatic chemistry; Retrosynthesis
+ Inorganic chemistry < Chemical bonding, Solutions and acids: Symmetry and group theory; Molecular orbital theory; Main-group chemistry; Coordination chemistry
+ Analytical chemistry < Solutions and acids, Organic chemistry: Quantitative analysis; Optical spectroscopy; NMR and mass spectrometry; Chromatography
++ Synthetic chemistry < Organic synthesis, Inorganic chemistry, Analytical chemistry: Physical organic chemistry; Organometallic chemistry; Catalysis; Modern synthetic methods; Total synthesis
++ Physical and materials chemistry < Physical chemistry, Materials science, Analytical chemistry, Physics / Quantum mechanics: Molecular spectroscopy; Advanced quantum chemistry; Statistical thermodynamics; Computational chemistry; Solid-state chemistry
++ Chemical biology < Biochemistry, Organic synthesis: Bioorganic chemistry; Enzyme mechanisms; Chemical probes; Medicinal chemistry and drug design
++ Chemistry research < Synthetic chemistry, Physical and materials chemistry, Chemical biology: Reading the literature; Designing experiments; Original research; Writing papers; A dissertation
# Nature | 🌿 | Biology: life, bodies and ecosystems
Cells ~ Chemistry / Matter and atoms: Cell structure; Cell division; DNA and genes; Microbes
The human body < Cells: Organ systems; Heart and blood; Brain and nerves; The immune system
Plants and animals < Cells: Plant biology; Animal diversity; Animal behavior
Evolution < Plants and animals: Natural selection; Heredity; The history of life
Ecology < Plants and animals, Evolution: Ecosystems; Food webs; Climate and biomes; Conservation
+ Genetics < Evolution, Chemistry / Organic chemistry: Mendelian genetics; Molecular genetics; Genomics
+ Neuroscience < The human body, Psychology / Cognition: Neurons; Brain systems; Learning and memory in the brain
+ Microbiology < Cells, Chemistry / Reactions: Bacteria; Viruses; Microbes and health
+ Molecular biology < Genetics, Microbiology, Chemistry / Biochemistry: DNA replication and repair; Transcription and translation; Gene regulation; Lab techniques
+ Population biology < Ecology, Genetics, Mathematics / Calculus: Population dynamics; Population genetics; Community ecology; Ecological models
++ Molecular and systems biology < Molecular biology, Mathematics / Differential equations: Chromatin and epigenetics; Cell signaling; Genomics and bioinformatics; Biological networks and models; Synthetic biology
++ Graduate neuroscience < Neuroscience, Molecular biology: Cellular and molecular neuroscience; Neural circuits and systems; Computational neuroscience; Cognitive neuroscience
++ Ecology and evolutionary biology < Population biology: Phylogenetics; Molecular evolution; Theoretical ecology; Field and experimental design
++ Biology research < Molecular and systems biology, Ecology and evolutionary biology: Reading the literature; Designing experiments; Original research; Writing papers; A dissertation
# Arcana ~ | 🔮 | Earth, space and how science works
Scientific method: Questions and hypotheses; Experiments and variables; Evidence and uncertainty; Peer review
Astronomy ~ Physics / Mechanics: The night sky; The solar system; Stars; Galaxies
Earth science: Rocks and minerals; Plate tectonics; Weather; Climate
How things work: Electricity at home; Engines and motors; Computers and the internet; Materials around you
+ Space exploration < Astronomy, Physics / Mechanics: Rockets; Orbits and missions; Living in space
+ Climate science < Earth science, Chemistry / Reactions: The carbon cycle; Climate models; Solutions
+ Experimental design < Scientific method, Mathematics / Probability and statistics: Variables and controls; Measurement and error; Statistical power; Reproducibility
+ Scientific instruments < How things work, Physics / Electricity and magnetism: Measurement and calibration; Sensors and detectors; Optics and imaging; Data acquisition
+ Planetary science < Astronomy, Earth science, Physics / Mechanics: Planet formation; Planetary surfaces and interiors; Planetary atmospheres; Exoplanets
++ Earth system science < Climate science, Physics / Thermodynamics, Mathematics / Multivariable calculus, Mathematics / Differential equations: Atmospheric dynamics; Physical oceanography; Geophysics; Earth system modeling; Paleoclimate
++ Planetary and space science < Planetary science, Space exploration, Scientific instruments, Physics / Classical mechanics: Orbital dynamics; Planetary geophysics; Space plasma physics; Remote sensing; Astrobiology
++ Scientific research < Experimental design, Earth system science, Planetary and space science: Reading the literature; Open problems; Original research; Writing papers; A dissertation

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
+ Systems programming < Object-oriented and functional, Developer tools, Computer science / Computer architecture: Memory and pointers; Concurrency; Performance and profiling; Operating system interfaces
++ Compilers and programming languages < Systems programming, Computer science / Theory of computation: Parsing; Semantics and type systems; Optimization and code generation; Language design; Programming language research
++ Large-scale distributed systems < System design, DevOps, Systems programming: Consensus and replication; Distributed storage; Reliability at scale; Distributed systems research
++ Machine learning research < Machine learning, Computer science / Artificial intelligence: Optimization and learning theory; Probabilistic models; Modern architectures; Reproducing papers; Publishing research
++ Staff engineering < System design, Mobile apps, DevOps: Architecture across teams; Technical strategy; Leading large projects; Mentoring engineers
# Electronics | 🔌 | Circuits, chips and robots
Circuit basics < Physics / Electricity and magnetism: Voltage, current and resistance; Breadboards; Measuring with a multimeter
Components < Circuit basics: Resistors and capacitors; Diodes and LEDs; Transistors
Digital logic < Components, Logic / Propositional logic: Logic gates; Flip-flops; Binary arithmetic
Microcontrollers < Digital logic, Programming / Programming fundamentals: Your first microcontroller; Sensors; Motors and actuators
+ Robotics < Microcontrollers, Physics / Mechanics: Robot kinematics; Control loops; Building a robot
+ Circuit board design < Components, Digital logic: Schematics; Board layout; Manufacturing
Analog electronics < Components, Mathematics / Calculus: AC circuits; Op-amps; Filters; Power supplies
+ Signal processing < Analog electronics, Mathematics / Differential equations: Signals and systems; Fourier analysis; Sampling; Digital filters
+ Embedded programming < Microcontrollers, Programming / Systems programming: Embedded C; Interrupts and timers; Communication buses; Real-time operating systems
+ Digital design < Digital logic, Computer science / Computer architecture: Hardware description languages; FPGAs; Timing and synthesis; Verification
++ Embedded systems engineering < Embedded programming, Circuit board design, Signal processing: Hardware and software co-design; Low-power design; Safety-critical systems; Taking a product to production
++ Robotics research < Robotics, Signal processing, Mathematics / Linear algebra: Control theory; State estimation; Motion planning; Robot learning; A research project
++ VLSI design < Digital design, Analog electronics, Physics / Modern physics: Semiconductor devices; CMOS circuits; Layout and fabrication; Mixed-signal design; Chip design research
# Data science | 📊 | Turn data into answers
Spreadsheets and data: Spreadsheets; Formulas; Tidy data
Data cleaning < Spreadsheets and data, Programming / Programming fundamentals: Loading data; Cleaning; Joining tables
Visualization < Data cleaning: Choosing a chart; Plotting; Dashboards
Statistics in practice < Data cleaning, Mathematics / Probability and statistics: Summaries; Testing ideas; Regression in practice
+ Data engineering < Statistics in practice, Programming / Databases: Pipelines; Data warehouses; Data at scale
+ Applied machine learning < Statistics in practice, Programming / Machine learning: Feature engineering; Model selection; Deploying models
+ Statistical modeling < Statistics in practice, Mathematics / Linear algebra: Generalized linear models; Multilevel models; Bayesian statistics; Time series
+ Causal inference < Statistical modeling: Experiments and A/B tests; Causal graphs; Observational studies; Quasi-experiments
+ Information visualization < Visualization, Programming / Web fundamentals: Visual perception; Encoding design; Interactive graphics; Data storytelling
++ Machine learning engineering < Applied machine learning, Data engineering, Programming / DevOps: Data and feature pipelines; Training at scale; Serving models; Monitoring in production
++ Statistical learning < Statistical modeling, Causal inference, Applied machine learning: Statistical learning theory; High-dimensional statistics; Causal machine learning; Bayesian computation
++ Data science research < Statistical learning, Information visualization: Reading the literature; Research questions; Reproducible research; Writing papers; A dissertation

## Humanities | 📜 | History, philosophy, religion, languages and literature
# History | 📜 | From the first cities to today
Ancient world: First civilizations; Ancient Egypt; Greece and Rome; Ancient India and China
Middle ages: Medieval Europe; The Islamic golden age; Medieval Asia and Africa; The Americas before 1500
Early modern world: The Renaissance; The age of exploration; The Reformation; The scientific revolution
Age of revolutions: The Enlightenment; The American and French revolutions; The industrial revolution; Empires
Modern world ~ Economics / Economic policy: World War I; World War II; The Cold War; Decolonization; The world today
+ Historiography < Modern world, Investigation / Finding sources: Sources and evidence; Interpretations; Writing history
+ History of science < Early modern world, Arcana / Scientific method: Ancient science; The scientific revolution in depth; Modern science
+ Global history < Historiography: Comparative history; Trade and migration networks; Empires and colonialism; Environmental history
+ Archival research < Historiography, Languages / Listening and reading: Archives and catalogs; Paleography; Sources in other languages; Oral history
++ Graduate history < Historiography, History of science, Global history: Graduate seminars; Schools of historical thought; A field of specialization; Comprehensive exams
++ Historical research < Graduate history, Archival research: A research question; Archival fieldwork; Engaging the literature; Writing articles; A dissertation
# Philosophy | 🏛️ | The big questions, argued well
Philosophy basics: What philosophy is; Arguments; The great questions
Ethics < Philosophy basics: Right and wrong; Virtue ethics; Consequences and duties
Epistemology < Philosophy basics, Logic / Propositional logic: Knowledge; Belief and justification; Skepticism
Metaphysics < Epistemology: Reality; Causation; Time
Political philosophy < Ethics, History / Age of revolutions: Justice; Rights; The state
+ Philosophy of mind < Metaphysics, Nature / The human body: Consciousness; Free will; Personal identity
+ Philosophy of science < Epistemology, Arcana / Scientific method: Explanation; Theory change; Science and values
History of philosophy < Philosophy basics: Ancient philosophy; Medieval philosophy; Early modern philosophy; Kant and the nineteenth century; Twentieth-century philosophy
+ Moral philosophy < Ethics, Political philosophy: Metaethics; Normative theories in depth; Theories of justice; Applied ethics
+ Philosophy of language < Metaphysics, Logic / Predicate logic: Meaning and reference; Truth and meaning; Speech acts; Language and thought
++ Graduate philosophy < History of philosophy, Philosophy of mind, Philosophy of science, Moral philosophy, Philosophy of language: Proseminar; Metaphysics and epistemology seminars; Value theory seminars; History of philosophy seminars; Qualifying papers
++ Philosophical research < Graduate philosophy: Reading the literature; Writing philosophy papers; Conferences and peer review; A dissertation
# Religion ~ | 🕯️ | Faiths and myths of the world
World religions: Abrahamic faiths; Hinduism and Buddhism; East Asian traditions; Indigenous traditions
Mythology: Greek and Roman myths; Norse myths; Myths around the world
Sacred texts < World religions: Reading scripture; Commentary traditions; Texts compared
+ Comparative religion < Sacred texts, Mythology, Philosophy / Metaphysics: Ritual; Belief and practice; Religion and society
+ Philosophy of religion < World religions, Philosophy / Epistemology: Arguments about God; Faith and reason; Religious experience; The problem of evil
+ Scriptural languages < Sacred texts, Languages / Grammar basics: Choosing a scriptural language; Grammar and vocabulary; Reading with a lexicon; Textual criticism
++ Graduate religious studies < Comparative religion, Philosophy of religion, Scriptural languages: Theory and method; A tradition in depth; Graduate seminars; Comprehensive exams
++ Religious studies research < Graduate religious studies, History / Historiography: Research design; Texts and fieldwork; Writing and publishing; A dissertation
# Languages | 🗣️ | A new language, from first words to fluency
Sounds and script: Pronunciation; Alphabet or script; Accent
First words < Sounds and script: Greetings; Numbers; Everyday words; Your first 500 words
Grammar basics < First words ~ Writing / Writing basics: Sentence structure; Present tense; Questions and negatives; Past and future
Listening and reading < Grammar basics: Graded readers; Podcasts; Native speed
Speaking and writing < Grammar basics: Conversations; Messages and emails; Telling stories
+ Fluency < Listening and reading, Speaking and writing: Idioms; Complex grammar; Thinking in the language
+ Translation < Fluency, Writing / Editing: Translation techniques; Translation tools; Specialized texts
+ Linguistics < Grammar basics: Phonetics and phonology; Morphology and syntax; Semantics and pragmatics; Sociolinguistics
+ Interpreting < Fluency, Translation: Consecutive interpreting; Note-taking for interpreters; Sight translation; Simultaneous basics
++ Near-native mastery < Fluency: Registers and dialects; Literary and academic language; Accent refinement; Top-level proficiency exams
++ Conference interpreting < Interpreting, Near-native mastery: Simultaneous in the booth; Specialized terminology; Relay and retour; Accreditation and professional practice
++ Linguistics research < Linguistics, Investigation / Research methods: Graduate phonology and syntax; Field methods; Corpus and experimental methods; Writing papers; A dissertation
# Literature | 📚 | Read deeply, from poems to novels
Reading literature < Study craft / Reading for understanding: Close reading; Themes; Context
Poetry < Reading literature: Meter and rhyme; Imagery; Poetic forms
The novel < Reading literature: Plot and structure; Character; Narrative voice
Drama < Reading literature: Tragedy and comedy; Shakespeare; Modern drama
Literary theory < Poetry, The novel, Drama: Formalism; Historical criticism; Modern theory
+ Comparative literature < Literary theory, Languages / Listening and reading: Translation and meaning; World literature; Influence
Literary history < Poetry, The novel, Drama: Ancient and medieval literature; Renaissance and Enlightenment; Romanticism and realism; Modernism and after
+ Critical theory < Literary theory: Structuralism and poststructuralism; Marxist and feminist criticism; Postcolonial theory; Psychoanalytic criticism
+ Textual scholarship < Literary history: Manuscripts and early print; Bibliography; Editing texts; Book history
++ Graduate literary studies < Comparative literature, Critical theory, Literary history: Graduate seminars; A period in depth; Reading lists and exams; Teaching literature
++ Literary research < Graduate literary studies, Textual scholarship: A research question; Archives and editions; Writing criticism; Publishing articles; A dissertation

## Social sciences | 📈 | Economics and psychology
# Economics | 📈 | How people, markets and countries use resources
Economic basics ~ Personal finance / Money basics: Scarcity and trade-offs; Supply and demand; Markets
Microeconomics < Economic basics, Mathematics / Algebra: Consumers; Firms; Competition
Macroeconomics < Economic basics: GDP and growth; Inflation; Money and banks; Unemployment
Economic policy < Microeconomics, Macroeconomics: Government and taxes; Trade; Economic crises
+ Econometrics < Economic policy, Mathematics / Probability and statistics: Economic data; Regression; Causality
+ Behavioral economics < Microeconomics, Psychology / Biases and decisions: Heuristics; Nudges; Experiments
+ Finance < Microeconomics, Personal finance / Investing: Valuation; Markets and risk; Corporate finance
+ Mathematics for economists < Microeconomics, Mathematics / Multivariable calculus, Mathematics / Linear algebra: Static optimization; Constrained optimization; Dynamic optimization; Fixed points and existence
++ Graduate microeconomics < Mathematics for economists, Behavioral economics: Consumer and producer theory; Choice under uncertainty; Game theory; Information and mechanism design; General equilibrium
++ Graduate macroeconomics < Mathematics for economists, Econometrics: Growth theory; Recursive methods; Business cycles and DSGE models; Monetary and fiscal theory
++ Financial economics < Finance, Econometrics, Mathematics for economists: Asset pricing theory; Stochastic calculus for finance; Empirical finance; Corporate finance theory
++ Economic research < Graduate microeconomics, Graduate macroeconomics: Graduate econometrics; Identification and causal inference; Field courses and the literature; Writing papers; A dissertation
# Psychology | 🧩 | How minds work
Foundations of psychology: What psychology studies; Research methods in psychology; The brain and behavior
Cognition < Foundations of psychology ~ Memory / How memory works: Perception and attention; Memory; Thinking
Development < Foundations of psychology: Childhood; Adolescence; Adulthood
Social psychology < Foundations of psychology: Groups; Attitudes; Influence and conformity
Biases and decisions < Cognition: Heuristics and biases; Judgment; Choice
Personality < Development: Traits; Motivation; Identity
+ Clinical psychology < Personality, Medicine / Mental health: Disorders; Therapies; Wellbeing
+ Neuropsychology < Cognition, Nature / The human body: The brain; Brain and mind; Brain injury
+ Psychological methods < Foundations of psychology, Mathematics / Probability and statistics: Experimental design; Measurement and psychometrics; Statistics for psychology; Replication and open science
+ Social cognition < Social psychology, Biases and decisions: Attribution; Stereotypes and prejudice; Implicit attitudes; Motivated reasoning
++ Cognitive neuroscience < Neuropsychology, Psychological methods: Neuroimaging methods; Perception and attention in the brain; Memory systems; Computational models of cognition
++ Clinical training < Clinical psychology, Psychological methods: Psychological assessment; Evidence-based therapies; Supervised clinical practice; Clinical research
++ Graduate social psychology < Social cognition, Psychological methods: Attitudes and persuasion; Group processes; Culture and the self; Advanced social research methods
++ Psychological research < Psychological methods, Cognition, Development, Social psychology: Advanced statistical modelling; Reading the literature; Building a research program; Writing papers; A dissertation

## Learning | 🧠 | Memory, study and research skills
# Memory | 🧠 | Remember what you learn, on purpose
How memory works: Encoding; Storage; Retrieval; Forgetting
Spaced repetition < How memory works: Flashcards; Review schedules; Writing good cards
Mnemonics < How memory works: Acronyms and rhymes; Chunking; Vivid images; The Major System
Memory palace < Mnemonics: Choosing palaces; Placing images; Long journeys
+ Memory sports < Memory palace: The PAO system; Memorize a deck of cards; Speed numbers
+ Science of learning < Spaced repetition, Psychology / Cognition: Retrieval practice; Spacing and interleaving; Desirable difficulties; Transfer of learning
++ Memory championships < Memory sports: Competition training; Hour disciplines; Speed events; Coaching memory athletes
++ Memory science < Science of learning, Psychology / Neuropsychology: Memory systems; Models of memory; The neuroscience of memory; Experimental memory research
++ Memory research < Memory science, Psychology / Psychological methods: Reading the literature; Open questions in memory; Designing studies; Writing papers; A dissertation
# Study craft | 📝 | Learn faster and keep it
Active recall: Self-testing; Practice questions; Blurting
Note-taking <: Notes in your own words; Linking notes; Summaries
Reading for understanding <: Skimming; Questioning; Close reading of texts
Planning your study < Active recall: Study schedules; The Pomodoro technique; Weekly review
+ Exam mastery < Planning your study, Memory / Spaced repetition: Revision plans; Past papers; Test anxiety
+ Scholarly reading < Reading for understanding, Note-taking: Reading research papers; Literature notes; Synthesizing sources; A personal knowledge base
+ Tutoring < Exam mastery: Explaining clearly; Diagnosing misconceptions; Guided practice; Feedback that helps
++ Graduate study < Exam mastery, Scholarly reading: Qualifying exams; Mastering a literature; Managing a long project; Working with an advisor
++ Instructional design < Tutoring, Memory / Science of learning: Learning objectives; Curriculum design; Assessment design; Evidence-based teaching
# Investigation | 🔍 | Research and problem solving
Finding sources < Study craft / Reading for understanding: Search techniques; Libraries and databases; Evaluating sources
Problem solving <: Defining the problem; Breaking it down; Heuristics
Analysis < Finding sources, Problem solving: Gathering data; Spotting patterns; Drawing conclusions
Reporting < Analysis: Writing it up; Citing sources; Presenting findings
+ Research methods < Analysis, Mathematics / Probability and statistics: Surveys; Experiments; Statistics for research
+ Qualitative research < Analysis, Reporting: Interviews; Observation and ethnography; Coding qualitative data; Mixed methods
+ Systematic reviews < Research methods, Reporting: Review protocols; Searching systematically; Appraising studies; Meta-analysis
++ Research design < Research methods, Qualitative research: Research questions; Causal inference; Sampling and power; Research ethics
++ Doctoral research < Research design, Systematic reviews: Finding a question; Reviewing the literature; Original research; Peer review and publishing; A dissertation

@wis

## Mind | 👁️ | Mindfulness, and reading yourself and others
# Perception | 👁️ | Mindfulness, and noticing what others miss
Mindfulness basics: Breath awareness; Body scan; Noticing thoughts
Meditation practice < Mindfulness basics: Daily sitting; Walking meditation; Loving-kindness
Awareness < Mindfulness basics: Observation skills; Situational awareness; Deep listening
+ Retreat practice < Meditation practice: Silent retreat; Deep concentration; Insight practice
+ Tracking < Awareness, Stealth / Wildlife watching: Identifying tracks; Aging sign; Trailing an animal; Tracker evaluations
++ Teaching meditation < Retreat practice: Teacher training; Guiding groups; Trauma-sensitive practice; Leading retreats
++ Contemplative science < Retreat practice, Psychology / Psychological methods: Contemplative traditions compared; Meditation research; Attention and the brain; Measuring mindfulness
++ Expert tracking < Tracking: Hard-ground tracking; Reading behavior from sign; Search and rescue tracking; Teaching tracking
# Insight | 💭 | Read people and yourself
Self-knowledge: Journaling; Values; Emotions; Strengths and weaknesses
Empathy < Self-knowledge: Active listening; Perspective taking; Compassion
Reading people < Empathy: Body language; Tone and words; Motives
Psychology in daily life < Self-knowledge, Psychology / Foundations of psychology: Habits; Motivation at work; Relationships
+ Coaching others < Empathy, Psychology in daily life: Powerful questions; Giving feedback; Goal setting
+ Counseling skills < Reading people, Psychology / Social psychology: Holding space; Reflective listening; Knowing your limits
+ Counseling approaches < Counseling skills, Psychology / Personality: Person-centred therapy; Cognitive behavioral therapy; Psychodynamic ideas; Family and systemic approaches
++ Professional coaching < Coaching others, Counseling skills: Coaching competencies; Coaching models; Ethics and contracts; Mentor coaching and credentials
++ Therapy practice < Counseling approaches, Psychology / Clinical psychology: The therapeutic alliance; Case formulation; Supervised practice; Ethics and licensure

## Health know-how | 🩺 | First aid, medicine and mental health
# Medicine | 🩺 | Health know-how and first aid
First aid: Scene safety; CPR; Bleeding and wounds; Burns and fractures
Health basics < First aid, Nature / The human body: How the body works; Common illnesses; Medicines and safety
Mental health < Health basics: Stress; Anxiety and mood; Getting help
+ Wilderness first aid < First aid, Survival / Emergencies: Improvised care; Evacuation; Environmental emergencies
+ Emergency care < First aid, Health basics: Triage; Trauma care; Medical emergencies
+ Mental health first aid < Mental health: Spotting a crisis; Talking about suicide; De-escalation; Referral and follow-up
+ Pathophysiology < Health basics: Physiology in depth; How disease works; Inflammation and infection; Chronic disease
+ Pharmacology < Health basics, Chemistry / Organic chemistry: How drugs work; Dosing; Side effects and interactions; Emergency drugs
++ Paramedic practice < Emergency care, Pharmacology, Mental health first aid: Patient assessment; Advanced airway management; Cardiac care and ECGs; Emergency medications; Clinical decision making
++ Wilderness medicine < Wilderness first aid, Emergency care: Wilderness first responder; Prolonged field care; Expedition medicine; Search and rescue medicine
++ Medical science < Pathophysiology, Pharmacology, Nature / Microbiology: Clinical reasoning and diagnosis; Evidence-based medicine; Clinical trials; Medical research

## Self-reliance | 🧭 | The outdoors, the kitchen, money and home
# Survival | 🧭 | The outdoors and self-reliance
Outdoor basics: Planning a trip; Clothing and layers; Leave no trace
Navigation < Outdoor basics: Maps; Compass; GPS and apps
Camping < Outdoor basics ~ Cooking / Cooking methods: Shelter; Fire; Water; Camp cooking
Emergencies < Navigation, Camping: Signaling; Staying found; Weather dangers
+ Wilderness expeditions < Emergencies, Medicine / First aid: Multi-day routes; Remote travel; Leading a group
+ Bushcraft < Camping, Emergencies: Friction fire; Natural shelters; Foraging; Tools and cordage
++ Expedition leadership < Wilderness expeditions, Medicine / Wilderness first aid: Expedition logistics; Risk management; Group dynamics in the field; Guiding certification
++ Survival instruction < Bushcraft, Wilderness expeditions: Survival in every climate; Long-term wilderness living; Teaching survival skills; Running survival courses
# Cooking | 🍳 | Good food, from scratch
Kitchen basics: Knife skills; Kitchen safety; Measuring; Stocking a pantry
Cooking methods < Kitchen basics: Boiling and steaming; Sautéing; Roasting and baking; Grilling
Flavor < Cooking methods ~ Chemistry / Reactions: Salt, fat, acid and heat; Herbs and spices; Sauces
Meals < Flavor: Breakfasts; Weeknight dinners; Meal prep; Cooking for others
+ Baking and pastry < Cooking methods ~ Chemistry / Reactions: Bread; Pastry; Cakes
+ World cuisines < Flavor: Italian cooking; Asian cooking; Mexican cooking; Indian cooking
+ Cooking at scale < Meals: Scaling recipes; Menu planning; Food safety at scale; Running a service
+ Classical technique < Flavor: Stocks and mother sauces; Butchery; Fish and shellfish; Classic French technique
+ Food science < Flavor, Chemistry / Reactions: Browning reactions; Emulsions and foams; Fermentation; Modernist techniques
++ Professional chef < Classical technique, Cooking at scale, World cuisines: Stations and the brigade; Menu development; Running a kitchen; Food costing
++ Pastry chef < Baking and pastry, Food science: Laminated doughs; Chocolate and sugar work; Plated desserts; Running a pastry section
++ Culinary science < Food science: Food chemistry; Sensory science; Recipe development; Culinary research
# Personal finance | 💰 | Money sense for life
Money basics: Budgeting; Saving; Banking; Tracking spending
Debt and credit < Money basics: How credit works; Paying off debt; Loans and mortgages
Investing < Money basics, Mathematics / Pre-algebra: Compound interest; Index funds; Risk and diversification; Retirement accounts
Financial planning < Debt and credit, Investing: Emergency fund; Financial goals; Taxes; Insurance
+ Financial independence < Financial planning: Savings rate; Withdrawal rates; Early retirement
+ Portfolio management < Investing, Mathematics / Probability and statistics: Asset allocation; Rebalancing; Factor investing; Evaluating funds
+ Tax and estate planning < Financial planning: Tax-advantaged accounts; Tax-efficient investing; Wills and trusts; Passing on wealth
++ Professional financial planning < Tax and estate planning, Financial independence, Portfolio management: Retirement income planning; Risk management and insurance; Ethics and fiduciary duty; Advising clients
++ Investment analysis < Portfolio management, Economics / Finance: Financial statement analysis; Equity valuation; Fixed income; Portfolio theory
# Home repair | 🔧 | Fix and improve your home
Home tools: Tool kit; Working safely; Measuring and marking
Plumbing basics < Home tools: Leaks and drips; Unblocking drains; Replacing fixtures
Electrical basics < Home tools, Electronics / Circuit basics: Home wiring; Switches and sockets; Electrical safety
Carpentry repairs < Home tools, Crafts / Woodworking: Doors and drawers; Shelves; Patching walls
+ Renovation < Plumbing basics, Electrical basics, Carpentry repairs: Planning a project; Budgets and permits; Finishing well
+ Framing and structure < Carpentry repairs: Load-bearing walls; Wall framing; Floors and roofs; Structural repairs
++ Master builder < Renovation, Framing and structure: Building codes and inspections; Estimating and bidding; Managing trades; Building a house
++ Building science < Renovation, Physics / Thermodynamics: Heat, air and moisture; Building envelopes; Energy modelling; Passive house design

## Living things | 🐾 | Animals and plants
# Animal Handling | 🐾 | Care for pets and animals
Pet care: Feeding; Pet health; Grooming
Animal training < Pet care: Positive reinforcement; Basic commands; Behavior problems
Animal behavior < Pet care, Nature / Plants and animals: Instincts; Communication; Welfare
+ Horse riding < Animal training, Acrobatics / Balance: Grooming and tack; Walk and trot; Canter
+ Behavior modification < Animal training, Animal behavior: Fear and aggression; Desensitization and counterconditioning; Behavior plans; Coaching owners
+ Equestrian sport < Horse riding: Jumping; Dressage; Cross-country; Competing
++ Master horsemanship < Equestrian sport: Training young horses; Advanced dressage; Coaching riders; Stable management
++ Professional animal training < Behavior modification: Working and service dogs; Training other species; Teaching trainers; Certification
++ Animal behavior science < Behavior modification, Nature / Evolution: Ethology; Learning theory; Welfare science; Behavior research
# Gardening | 🌱 | Grow plants and food
Soil: Soil types; Compost; Feeding the soil
Planting < Soil: Seeds and seedlings; Transplanting; Spacing
Plant care < Planting: Watering; Pruning; Seasons
Pests and diseases < Plant care, Nature / Plants and animals: Common pests; Plant diseases; Natural control
+ Growing food < Plant care: Vegetables; Herbs; Fruit
+ Permaculture < Pests and diseases, Nature / Ecology: Permaculture design; Food forests; Water and soil systems
+ Propagation < Plant care: Seed saving; Cuttings; Grafting; Division and layering
+ Garden design < Plant care: Reading a site; Layout; Plant selection; Planting schemes
++ Horticulture science < Propagation, Growing food, Nature / Genetics: Plant physiology; Soil science; Plant breeding; Horticultural research
++ Regenerative agriculture < Permaculture, Growing food: Soil health at scale; Agroforestry; Holistic grazing; Whole-farm design
++ Landscape design < Garden design: Design principles; Planting design; Hard landscaping; Professional practice

@cha

## Communication | 💬 | Conversation, writing and persuasion
# Social skills | 💬 | Conversation, friendship and connection
Small talk: Starting conversations; Keeping them going; Graceful exits
Friendship < Small talk: Making friends; Staying in touch; Being a good friend
Handling conflict < Small talk: Staying calm; Assertive messages; Repairing relationships
Networking < Friendship: Events; Following up; Building relationships
+ Charisma < Friendship, Intimidation / Presence: Presence and warmth; Confidence; Making people feel seen
+ Close relationships < Friendship, Handling conflict ~ Insight / Empathy: Trust and vulnerability; Emotional intimacy; Romantic partnership; Keeping relationships healthy
+ Mediation < Handling conflict, Insight / Reading people: Staying neutral; Guiding hard conversations; Finding common ground; Restorative practice
+ Community building < Networking, Charisma: Hosting gatherings; Connecting people; Growing a community; Welcoming newcomers
++ Social mastery < Close relationships, Mediation, Community building: Reading any room; Connecting across cultures; Mentoring others; Teaching social skills
++ Relationship science < Close relationships, Psychology / Social psychology, Investigation / Research methods: Attachment theory; Interpersonal communication theory; Studying relationships; Research in relationship science
# Writing | ✍️ | Say it clearly on the page
Writing basics: Clear sentences; Paragraphs; Grammar and punctuation
Essays < Writing basics: Arguments; Structure; Research for essays
Creative writing < Writing basics: Story; Characters; Dialogue; Poetry writing
Professional writing < Writing basics: Emails; Reports; Copywriting
Editing < Essays: Self-editing; Cutting; Style
+ Novel writing < Creative writing, Editing, Literature / The novel: Plotting; Drafting a novel; Revision; Publishing
+ Journalism < Professional writing, Investigation / Finding sources: News writing; Interviewing; Features
+ Screenwriting < Creative writing, Performance / Acting: Screenplay format; Scenes; Rewriting
+ Investigative journalism < Journalism, Investigation / Analysis: Public records; Data journalism; Long investigations; Media law and ethics
+ Rhetoric < Essays, Editing, Persuasion / Influence: Classical rhetoric; Rhetorical analysis; Figures and style; Writing for an audience
++ Literary mastery < Novel writing ~ Literature / Literary theory: A distinctive voice; Mastering form; A body of work; Teaching creative writing
++ Showrunning < Screenwriting: Writing a series; Running a writers' room; Producing your scripts; Mentoring writers
++ Nonfiction mastery < Investigative journalism, Rhetoric: Book-length nonfiction; Narrative nonfiction; Editing others' work; Teaching nonfiction writing
++ Rhetoric and composition < Rhetoric, Literature / Literary theory, Investigation / Research methods: Rhetorical theory; Composition and pedagogy; Writing studies research; A dissertation
# Persuasion | 🤝 | Bring people round
Communication basics: Clarity; Listening well; Asking good questions
Influence < Communication basics: Reciprocity and trust; Framing; Persuasive stories
Negotiation < Influence: Preparing; Interests, not positions; Making offers; Closing a deal
Sales < Influence: Prospecting; Discovery calls; Handling objections
+ High-stakes negotiation < Negotiation, Intimidation / Composure: Hardball tactics; Walking away; Holding firm
+ Marketing < Sales, Psychology / Social psychology: Audiences; Messaging; Campaigns
+ Marketing analytics < Marketing, Data science / Statistics in practice: Market research; Split testing; Measuring campaigns; Customer segments
++ Negotiation mastery < High-stakes negotiation ~ Insight / Reading people: Multi-party deals; Negotiating across cultures; Crisis negotiation; Teaching negotiation
++ Negotiation research < High-stakes negotiation, Economics / Behavioral economics, Investigation / Research methods: Bargaining theory; Negotiation experiments; Reading the literature; Research in negotiation
++ Marketing science < Marketing analytics, Economics / Econometrics: Consumer behavior research; Choice models; Marketing experiments; Research in marketing

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
+ Classical acting < Acting, Stage presence, Literature / Drama: Verse speaking; Shakespeare in performance; Movement for actors; Voice and text
+ Screen acting < Acting, Stage presence: Acting for the camera; Auditions and self-tapes; Working on set; Continuity
++ Professional acting < Classical acting, Screen acting: Conservatory training; Leading roles; A career in acting; Teaching acting
++ Triple threat < Musical theater, Classical acting ~ Dance / Choreography: Leading a musical; Eight shows a week; Vocal stamina and health; Teaching musical theater
++ Speaking mastery < Professional speaking, Stand-up comedy ~ Writing / Rhetoric: Signature keynotes; Humor at scale; Speechwriting; Coaching speakers
++ Theatre studies < Classical acting, Literature / Literary theory, Investigation / Research methods: Theatre history; Performance theory; Dramaturgy; Research in theatre studies

## Influence | 👑 | Leadership, presence and a good poker face
# Leadership | 👑 | Set direction and bring people with you
Leading yourself: Goals; Discipline; Learning from mistakes
Decision making < Leading yourself: Weighing options; Deciding under uncertainty; Owning the call
Leading a team < Leading yourself, Persuasion / Influence: Delegation; Motivation; Feedback culture
Strategy < Decision making, Leading a team: Vision; Planning; Execution
+ Leading organizations < Strategy, Performance / Public speaking: Culture; Change; Scaling teams
+ Entrepreneurship < Strategy, Personal finance / Financial planning: Finding an idea; Building a product; Growing a business
+ Developing leaders < Leading a team, Insight / Coaching others: Mentoring; Coaching conversations; Leadership programs; Succession planning
++ Executive leadership < Leading organizations, Developing leaders ~ Intimidation / Command presence: Leading as a CEO; Boards and governance; Leading through crisis; Leaving a legacy
++ Venture building < Entrepreneurship, Leading organizations, Economics / Finance: Raising capital; Scaling a company; Exits and acquisitions; Mentoring founders
++ Organizational behavior < Leading organizations, Psychology / Social psychology, Investigation / Research methods: Leadership theory; Teams and motivation research; Organizational culture research; Research in management
# Intimidation | 🦁 | Presence, assertiveness and boundaries
Assertiveness: Saying no; Stating your needs; Setting boundaries
Presence < Assertiveness: Posture; Eye contact; Voice
Composure < Assertiveness: Staying calm under pressure; Handling criticism; Recovering from mistakes
+ Command presence < Presence, Composure: Taking charge; Crisis leadership; Calm authority
+ De-escalation < Composure, Insight / Reading people: Calming angry people; Verbal de-escalation; Defusing threats; Knowing when to leave
++ Crisis command < Command presence, De-escalation: Incident command; Leading in emergencies; Authority under threat; Training commanders
++ Psychology of power < Command presence, Psychology / Social psychology, Investigation / Research methods: Status and hierarchy; Nonverbal dominance; How power changes people; Research on power
# Deception ~ | 🃏 | Acting, improv and a good poker face
Improv: Yes, and; Characters; Scenes
Poker: Rules and hands; Odds; Reading players; Bluffing
Poker face: Controlling tells; Staying neutral; Misdirection in conversation
+ Game theory < Poker, Mathematics / Probability and statistics: Strategies; Equilibria; Bluffing math
+ Lie detection < Poker face, Insight / Reading people: Baselines; Verbal and nonverbal cues; Why lie detection is hard; Interviewing for truth
+ Long-form improv < Improv, Performance / Acting: Group mind; The Harold; Sustained characters; Performing long-form
++ Professional poker < Game theory, Poker face: Bankroll management; Solver-based study; High-stakes play; Coaching players
++ Game theory research < Game theory, Mathematics / Real analysis, Economics / Microeconomics: Graduate game theory; Games of incomplete information; Mechanism design; Research in game theory
++ Deception research < Lie detection, Psychology / Social psychology, Investigation / Research methods: Psychology of lying; Deception detection studies; Designing deception experiments; Research in deception
++ Improv mastery < Long-form improv: Performing at the top level; Directing improv; Applied improv; Teaching improv

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

/** Reads the catalog format above (exported for checking drafts of it). */
export function parseCatalog(text: string): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const pending: { entry: CatalogEntry; refs: string[]; related: string[] }[] = [];
  let ability = "";
  let area: CatalogEntry | null = null;
  let field: CatalogEntry | null = null;
  let parallel = false;
  let lastSub: CatalogEntry | null = null;
  let lastAdvanced: CatalogEntry | null = null;
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
      lastAdvanced = null;
      continue;
    }
    if (!field) throw new Error(`Catalog: "${line}" comes before any field`);
    const expert = line.startsWith("++");
    const advanced = !expert && line.startsWith("+");
    const body = expert ? line.slice(2).trim() : advanced ? line.slice(1).trim() : line;
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
      tier: expert ? "expert" : advanced ? "advanced" : "sub",
      icon: field.icon,
      parent: field.key,
      needs: [],
      related: [],
      field: field.key,
      order: siblings.length,
    };
    // A topic follows the one above it unless it says what it needs (or "<" alone: nothing).
    if (!advanced && !expert && !parallel && !explicit && lastSub) entry.needs.push(lastSub.key);
    // An advanced skill with nothing named follows the last topic; an expert one, the last advanced skill.
    if (advanced && !refs.length && lastSub) entry.needs.push(lastSub.key);
    if (expert && !refs.length && (lastAdvanced ?? lastSub)) entry.needs.push((lastAdvanced ?? lastSub)!.key);
    add(entry, refs, list(relList));
    if (expert) {
      // (Nothing follows on from an expert skill by default.)
    } else if (advanced) lastAdvanced = entry;
    else lastSub = entry;
    if (colon >= 0) details(entry, body.slice(colon + 1));
  }
  // Names: "Name" in the same field, or "Field / Name" anywhere.
  const byField = new Map<string, CatalogEntry[]>();
  for (const e of out) if (e.tier === "sub" || e.tier === "advanced" || e.tier === "expert") byField.set(e.field, [...(byField.get(e.field) ?? []), e]);
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

export const CATALOG: CatalogEntry[] = parseCatalog(CATALOG_TEXT);
export const CATALOG_BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

/** An entry's parts, in order. */
export function catalogChildren(key: string): CatalogEntry[] {
  return CATALOG.filter((e) => e.parent === key);
}

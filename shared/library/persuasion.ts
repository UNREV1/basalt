import type { LibraryCourse } from "./types.ts";

const course: LibraryCourse = {
  id: "persuasion",
  title: "The Art of Persuasion",
  icon: "🤝",
  blurb:
    "The psychology of yes: reciprocity, commitment, social proof, authority, liking and scarcity. Use them to ask better, and notice when they're being used on you.",
  ability: "cha",
  skill: { name: "Persuasion", icon: "🤝" },
  lessons: [
    // ---- 1. Reciprocity and commitment ----------------------------------------------
    {
      id: "give-and-commit",
      title: "Give First, Start Small",
      summary: "Reciprocity and commitment: why a small gift or a small yes opens the door to a bigger one.",
      steps: [
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Most yeses run on a few mental shortcuts. This lesson covers two: giving first, and starting small. First, a prediction. A charity mails out donation requests, and half the letters also include a small free gift: a sheet of address labels printed with your name. What happens to the response rate for the letters with labels?",
          options: [
            "About the same, because people see through it",
            "It drops, because people feel manipulated",
            "It nearly doubles",
          ],
          answer: [2],
          explain:
            "Real numbers from the Disabled American Veterans: about **18%** responded to the plain letter, and about **35%** to the one with labels. A small gift nobody asked for made people feel they owed something back. Most people guess “no effect” because they assume they'd see through it, but the pull works even when we know it's there.",
          hint: "Think about how you feel when someone hands you something you didn't ask for.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Reciprocity",
          body:
            "We feel obliged to repay what others give us: a favour, a gift, a concession. Every human culture has this rule, and it's why a free sample can sell a whole jar.\n\nThe pull is strongest when the gift is **personal**, **unexpected** and **meaningful** to the person receiving it. The more it feels chosen *for you*, the more you want to give back.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 190" font-family="sans-serif" font-size="15" text-anchor="middle" fill="currentColor"><line x1="40" y1="150" x2="320" y2="150" stroke="currentColor" stroke-width="2"/><rect x="70" y="93" width="80" height="57" rx="4" opacity="0.35"/><rect x="210" y="40" width="80" height="110" rx="4" fill="#2f9e44"/><text x="110" y="84" font-weight="bold">18%</text><text x="250" y="31" font-weight="bold">35%</text><text x="110" y="174">Plain letter</text><text x="250" y="174">With free labels</text></svg>`,
          caption: "Share of people who donated to the charity mail appeal.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Researchers had waiters hand diners mints with the bill. Which version raised tips the most?",
          options: [
            "One mint with the bill",
            "Two mints with the bill",
            "One mint with the bill, then the waiter turns back and offers a second mint “for you nice people”",
          ],
          answer: [2],
          explain:
            "One mint raised tips about 3%, two mints about 14%, and the turn-back version about **23%**. It's the same number of mints as the second option. What changed is that the extra mint felt *personal* and *unexpected*.",
          hint: "Remember the three things that make a gift pull harder.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these make a favour create a *stronger* feeling of owing? Select all that apply.",
          options: [
            "It's tailored to you personally",
            "It comes as a surprise",
            "It genuinely matters to you",
            "It comes with “so now you owe me one”",
            "It's the same freebie handed to everyone",
          ],
          answer: [0, 1, 2],
          explain:
            "Personal, unexpected and meaningful gifts pull hardest. Spelling out the debt turns a gift into a transaction, and people push back against that. A generic freebie handed to everyone barely registers as a gift at all.",
          hint: "Three of these match the ideas from the last explanation.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Door-in-the-face",
          body:
            "Reciprocity also works on *concessions*. When someone backs down from a big request to a smaller one, it feels like they gave something up, and we feel we should meet them halfway.\n\nIn one study, students were asked to chaperone a group of young offenders on a day trip to the zoo. Asked cold, **17%** agreed. Others were first asked to volunteer as counsellors for young offenders two hours a week for two years. Everyone refused, and *then* they were asked about the zoo trip: **50%** agreed.\n\nThat's **door-in-the-face**: a big ask, a refusal, then the smaller ask you really wanted.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" font-family="sans-serif" font-size="15" text-anchor="middle" fill="currentColor"><rect x="10" y="20" width="140" height="80" rx="10" fill="none" stroke="currentColor" stroke-width="2"/><text x="80" y="52" font-weight="bold" font-size="16">Big ask</text><text x="80" y="78" font-size="14">Mentor 2 years</text><line x1="160" y1="60" x2="230" y2="60" stroke="currentColor" stroke-width="2"/><polygon points="240,60 229,54 229,66"/><text x="200" y="48" font-size="14">backs down</text><rect x="250" y="20" width="140" height="80" rx="10" fill="none" stroke="currentColor" stroke-width="2"/><text x="320" y="52" font-weight="bold" font-size="16">Smaller ask</text><text x="320" y="78" font-size="14">One zoo trip</text><text x="80" y="130" fill="#e03131" font-weight="bold">Everyone says no</text><text x="320" y="130" fill="#2f9e44" font-weight="bold">50% say yes</text><text x="320" y="152" font-size="14">(17% if asked cold)</text></svg>`,
          caption: "Door-in-the-face: the retreat to a smaller request feels like a concession worth returning.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "A Boy Scout wants to sell you $1 chocolate bars. Using door-in-the-face, how does he start?",
          options: [
            "By giving you a free chocolate bar",
            "By asking you to buy two $5 tickets to the circus",
            "By asking you to buy one bar, then asking you to buy five more",
          ],
          answer: [1],
          explain:
            "Big ask first (the tickets), a refusal, then the retreat to chocolate feels like a concession you should return. This really happened to the psychologist Robert Cialdini: he said no to the tickets and walked away with two chocolate bars he didn't even want. A free bar would be a plain gift, and one-then-five runs the other way (small first), which is the next idea.",
          hint: "Door-in-the-face goes from big to small.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Commitment and consistency",
          body:
            "Once we've taken a stand, we like to stay consistent with it, to others and to ourselves. A small “yes” quietly changes how we see ourselves, and bigger yeses follow.\n\nCommitments stick hardest when they're **active** (written or said aloud), **public**, and **freely chosen**.\n\nA classic test: researchers asked homeowners to let them put a large, ugly “Drive Carefully” sign on the front lawn. Asked cold, only about **17%** agreed. Another group had been asked two weeks earlier to put a tiny 3-inch “Be a safe driver” sign in a window, and nearly all of them had said yes to that.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt: "Guess: of the homeowners who had agreed to the tiny sign, what share then said yes to the big ugly one?",
          body:
            "About **76%**, more than four times as many. That's **foot-in-the-door**: get agreement to a small request first, and a larger, related one becomes much easier.\n\nThe tiny sign didn't create a debt. It changed how people saw themselves: *“I'm someone who cares about safe driving.”*",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Why did the tiny sign make such a big difference?",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 190" font-family="sans-serif" font-size="15" text-anchor="middle" fill="currentColor"><line x1="40" y1="150" x2="320" y2="150" stroke="currentColor" stroke-width="2"/><rect x="70" y="125" width="80" height="25" rx="4" opacity="0.35"/><rect x="210" y="40" width="80" height="110" rx="4" fill="#2f9e44"/><text x="110" y="116" font-weight="bold">17%</text><text x="250" y="31" font-weight="bold">76%</text><text x="110" y="174">Asked cold</text><text x="250" y="174">After tiny sign</text></svg>`,
          caption: "Homeowners who agreed to the big “Drive Carefully” lawn sign.",
          options: [
            "They felt they owed the researchers a favour",
            "Saying yes changed how they saw themselves, as people who support safe driving",
            "They had forgotten about the first request",
            "The big sign was described as smaller than it really was",
          ],
          answer: [1],
          explain:
            "It's consistency, not reciprocity: the researchers hadn't *given* them anything to repay. The small yes shifted their self-image, and the big sign fitted that new image. They may well have forgotten the researchers after two weeks, but not the way they now saw themselves.",
          hint: "Did the homeowners receive anything they'd need to pay back?",
        },
        {
          type: "order",
          phase: "understand",
          prompt: "A park volunteer coordinator uses foot-in-the-door. Put her requests in the order she should make them.",
          items: [
            "“Do you enjoy using this park?”",
            "“Would you sign our petition to keep it clean?”",
            "“Could you join one Saturday litter pick?”",
            "“Would you lead a monthly clean-up crew?”",
          ],
          explain:
            "Each request is a slightly bigger commitment that builds on the last: enjoying the park, then publicly supporting it, then one action, then an ongoing role. Jumping straight to “lead a crew” is where most people get a no.",
          hint: "Start with the smallest, easiest yes.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "Explain to a friend who has never heard of them: what are foot-in-the-door and door-in-the-face, and why does each one work?",
          keyPoints: [
            "Foot-in-the-door: ask for something small first, then something bigger and related",
            "It works through consistency: the small yes changes how people see themselves",
            "Door-in-the-face: make a big request that gets refused, then retreat to a smaller one",
            "It works through reciprocity: the retreat feels like a concession, so people concede back",
          ],
          model:
            "Both are about the order of your requests. With foot-in-the-door you start small: once someone agrees to a tiny request, they start to see themselves as someone who supports that cause, so a bigger related request feels consistent with who they are. With door-in-the-face you start big: when the other person refuses and you back down to a smaller request, your retreat feels like a favour, and they return it by saying yes. One runs on consistency, the other on reciprocity.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each technique to how it works.",
          pairs: [
            { left: "Reciprocity", right: "Give first, and people want to give back" },
            { left: "Door-in-the-face", right: "A big request is refused, so a smaller one feels like a concession" },
            { left: "Foot-in-the-door", right: "A small yes first makes a bigger, related yes easier" },
            { left: "Public commitment", right: "Announce a goal to friends, and you're more likely to follow through" },
          ],
          explain:
            "Door-in-the-face runs on reciprocity (a concession for a concession). Foot-in-the-door and public commitments run on consistency: we act in line with what we've already said or done.",
        },
        {
          type: "input",
          phase: "recall",
          prompt:
            "A coworker covered your shift last month. Today she asks you to cover hers, and you feel you can't say no. Which principle is at work?",
          answers: [
            "reciprocity",
            "reciprocation",
            "reciprocate",
            "reciprocity principle",
            "principle of reciprocity",
            "rule of reciprocity",
            "law of reciprocity",
            "norm of reciprocity",
            "reciprocal obligation",
          ],
          placeholder: "One word",
          explain:
            "**Reciprocity**: she gave first, so you feel you owe her. Here that's healthy, it's how cooperation works. It only turns sour when someone gives *in order to* collect.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "At a car dealership, the salesperson brings you a free coffee, then asks, “This one fits your family perfectly, doesn't it?” You say yes. Then: “Great, shall we do the paperwork today?” Which principles is she using? Select all that apply.",
          options: ["Reciprocity", "Commitment and consistency", "Door-in-the-face", "None, she's just being friendly"],
          answer: [0, 1],
          explain:
            "The coffee is a small gift (reciprocity), and getting you to say out loud that the car suits your family is a small public commitment she can build on (consistency). There's no big request followed by a smaller one, so it isn't door-in-the-face. Spotting this doesn't make her a villain, but it lets you feel the pull and still decide on the car's merits.",
          hint: "Look for a gift, and look for a small yes.",
        },
      ],
    },

    // ---- 2. Social proof, authority, liking, scarcity ----------------------------------
    {
      id: "four-shortcuts",
      title: "Crowds, Experts, Friends, Rarity",
      summary: "Social proof, authority, liking and scarcity: four mental shortcuts, and how to spot them in everyday life.",
      steps: [
        {
          type: "order",
          phase: "preview",
          prompt:
            "Four more shortcuts drive everyday yeses: crowds, experts, friends and rarity. First, crowds. A hotel tried three signs asking guests to reuse their towels. Predict: rank them from **least** to **most** effective.",
          items: [
            "“Help save the environment: please reuse your towels.”",
            "“Join your fellow guests: most guests reuse their towels.”",
            "“Most guests who stayed in this room reused their towels.”",
          ],
          explain:
            "Roughly **37%** of guests reused towels with the environmental appeal, **44%** with “most guests”, and **49%** with “most guests in this room”. Telling people what others like them *do* beat telling them what's good, and the more similar the others (the same room!), the stronger the pull.",
          hint: "Which sign tells you what people most like you actually do?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Social proof",
          body:
            "When we're unsure what to do, we look at what other people do, especially people **similar to us**. It's a useful shortcut: if everyone is queueing at one food stall, it's probably good.\n\nIt pulls hardest under **uncertainty** (a new hotel, a new job, a new app) and when the others feel like **“people like me”**.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 190" font-family="sans-serif" font-size="15" text-anchor="middle" fill="currentColor"><line x1="20" y1="150" x2="340" y2="150" stroke="currentColor" stroke-width="2"/><rect x="30" y="67" width="70" height="83" rx="4" opacity="0.35"/><rect x="145" y="51" width="70" height="99" rx="4" fill="#1c7ed6"/><rect x="260" y="40" width="70" height="110" rx="4" fill="#2f9e44"/><text x="65" y="59" font-weight="bold">37%</text><text x="180" y="43" font-weight="bold">44%</text><text x="295" y="32" font-weight="bold">49%</text><text x="65" y="174">Environment</text><text x="180" y="174">Most guests</text><text x="295" y="174">This room</text></svg>`,
          caption: "Guests who reused their towels, by sign.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Petrified Forest National Park was losing fossil wood to souvenir hunters. Which sign led to *more* theft?",
          options: [
            "“Many past visitors have removed petrified wood from the park, changing the natural state of the forest.”",
            "“Please don't remove the petrified wood from the park, in order to preserve the natural state of the forest.”",
          ],
          answer: [0],
          explain:
            "The first sign led to nearly **five times** as much theft (about 8% of marked pieces taken, versus under 2%). It meant to warn, but it announced that *lots of visitors take wood*: social proof for the very thing it wanted to stop. To discourage something, don't advertise how common it is.",
          hint: "Which sign tells visitors what *other visitors* do?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Authority",
          body:
            "We tend to follow credible experts. Usually that's sensible: your doctor probably does know more about your knee than you do.\n\nBut we often react to the **signals** of authority rather than the real thing: titles, uniforms, a confident tone, an expensive suit. Used honestly, authority means making your *real* expertise visible before you make your case, like a physiotherapist hanging her diplomas where patients can see them.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "Which of these are **authority** signals? Select all that apply.",
          options: [
            "A doctor's white coat",
            "The title “Professor” in an email signature",
            "“Over 10,000 happy customers!”",
            "“Offer ends Sunday!”",
            "“I've been repairing bikes for 20 years.”",
          ],
          answer: [0, 1, 4],
          explain:
            "Uniforms, titles and a track record all signal expertise. “10,000 happy customers” is social proof (what others do), and “ends Sunday” is a different lever you'll meet in a moment: scarcity.",
          hint: "Which ones say “this person knows their stuff”?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Liking",
          body:
            "We say yes more easily to people we like. And we like people who are **similar** to us, who **genuinely compliment** us, and who **cooperate** with us toward a shared goal.\n\nThat's why people buy more at a friend's home sales party than from a stranger's catalogue, and why good salespeople ask where you're from.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "Business students negotiated a deal by email. One group was told to get straight down to business. The other was told to first share a little about themselves and find something in common. What happened?",
          options: [
            "The straight-to-business group reached more deals: less small talk, more focus",
            "The find-something-in-common group reached agreement far more often",
            "There was no real difference",
          ],
          answer: [1],
          explain:
            "About **90%** of the find-something-in-common pairs reached a deal, versus about **55%** of the straight-to-business pairs. A few minutes of genuine similarity built enough liking to carry them through the hard parts.",
          hint: "Which principle did you just learn about?",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt:
            "People taste identical chocolate-chip cookies. Some come from a jar holding 10 cookies, others from a jar holding just 2. Which cookies get rated as more delicious?",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 200" font-family="sans-serif" font-size="15" text-anchor="middle" fill="currentColor"><rect x="40" y="40" width="110" height="125" rx="14" fill="none" stroke="currentColor" stroke-width="2"/><rect x="55" y="28" width="80" height="14" rx="4" opacity="0.5"/><rect x="210" y="40" width="110" height="125" rx="14" fill="none" stroke="currentColor" stroke-width="2"/><rect x="225" y="28" width="80" height="14" rx="4" opacity="0.5"/><g fill="#d9a066" stroke="#8a5a2b" stroke-width="1.5"><circle cx="62" cy="150" r="11"/><circle cx="84" cy="150" r="11"/><circle cx="106" cy="150" r="11"/><circle cx="128" cy="150" r="11"/><circle cx="62" cy="128" r="11"/><circle cx="84" cy="128" r="11"/><circle cx="106" cy="128" r="11"/><circle cx="128" cy="128" r="11"/><circle cx="73" cy="106" r="11"/><circle cx="95" cy="106" r="11"/><circle cx="254" cy="150" r="11"/><circle cx="276" cy="150" r="11"/></g><text x="95" y="190">Jar of 10</text><text x="265" y="190">Jar of 2</text></svg>`,
          caption: "The same cookies, served from two different jars.",
          body:
            "The ones from the jar of **2**: same cookies, same recipe. And cookies from a jar that went from 10 down to 2 *while people watched* were rated highest of all. Things seem more valuable when they're rare, and even more when they're *becoming* rare.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Scarcity",
          body:
            "We want what's rare, running out, or about to be lost: the last seats, the limited edition, the offer that ends tonight.\n\nThe honest use: if something really *is* limited (a real deadline, a few seats left, a feature nobody else has), say so clearly. The dishonest use is inventing it. You'll learn to spot that in the next lesson.",
        },
        {
          type: "explore",
          phase: "understand",
          title: "Losses loom larger",
          body:
            "Part of scarcity's pull: losing something feels worse than gaining the same thing feels good. The graph shows how strongly a gain (right) or a loss (left) of up to $100 is *felt*. At a loss weight of 1, losing $50 hurts exactly as much as winning $50 pleases.\n\nDrag the weight up to about **2**, roughly what experiments find: a loss hurts about twice as much as an equal gain. “Don't miss out” works by turning a choice into a possible loss.",
          min: 1,
          max: 3,
          step: 0.05,
          start: 1,
          label: "Loss weight",
          unit: "×",
          plot: "max(x,0) - v*max(-x,0)",
          xMin: -100,
          xMax: 100,
        },
        {
          type: "teach",
          phase: "explain",
          prompt: "Explain social proof, authority, liking and scarcity to a friend, with one everyday example of each.",
          keyPoints: [
            "Social proof: when unsure, we copy what similar people do (e.g. a “most popular” label)",
            "Authority: we follow credible experts, and sometimes just the signals of expertise (e.g. a white coat)",
            "Liking: we say yes to people we like, especially ones who are similar, friendly and on our side",
            "Scarcity: we want what's rare or running out, because missing out feels like a loss (e.g. “only 2 left”)",
            "They're usually useful shortcuts, which is exactly why fake versions work",
          ],
          model:
            "They're four mental shortcuts. Social proof: when we're not sure, we do what people like us are doing, which is why “most popular” labels sell dishes. Authority: we trust experts, so a dermatologist recommending a sunscreen persuades us, but sometimes so does anyone in a white coat. Liking: we agree more easily with people we like, and we like people who are similar and friendly to us, like a salesperson from our hometown. Scarcity: rare or disappearing things feel more valuable because missing out feels like a loss, hence “only 2 seats left”. Usually these shortcuts serve us well, which is exactly why fake versions of them work.",
        },
        {
          type: "match",
          phase: "recall",
          prompt: "From memory: match each line to the principle it uses.",
          pairs: [
            { left: "“Only 2 seats left at this price”", right: "Scarcity" },
            { left: "“Our bestselling blender this month”", right: "Social proof" },
            { left: "The salesperson mentions she grew up in your hometown too", right: "Liking" },
            { left: "A dermatologist explains why the sunscreen works", right: "Authority" },
          ],
          explain:
            "Scarcity says “it's running out”, social proof says “everyone's choosing it”, liking says “I'm like you”, and authority says “an expert backs it”. Real persuasion often stacks several at once, so it pays to recognise each one on its own.",
        },
        {
          type: "input",
          phase: "apply",
          prompt:
            "A restaurant in Beijing labelled a few dishes “Most popular”. Orders for those dishes rose by 13–20%. Which principle is this?",
          answers: [
            "social proof",
            "social-proof",
            "socialproof",
            "social proof principle",
            "principle of social proof",
            "consensus",
            "social validation",
          ],
          placeholder: "Two words",
          explain:
            "**Social proof.** Faced with a long, unfamiliar menu (uncertainty!), diners followed what other diners chose. No discount, no new recipe, just information about what others do.",
          hint: "It's about what *other diners* ordered.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt:
            "A charity letter reads: “Dr. Amira Lee, our lead malaria researcher, explains how each net saves lives. Over 2,000 people in your town have already given. We've enclosed a pen with your name on it. Our donor's match ends at midnight.” Which principles are at work? Select all that apply.",
          options: ["Authority", "Social proof", "Reciprocity", "Scarcity", "Liking"],
          answer: [0, 1, 2, 3],
          explain:
            "A named expert (authority), 2,000 people from your own town (social proof from similar others), a personalised gift sent first (reciprocity, just like the address labels in lesson 1), and a match that ends at midnight (scarcity of time). Nothing tries to make you like the sender, so liking isn't really in play. If the expert, the numbers and the deadline are real, this is fair persuasion, and you're still free to keep the pen and give nothing.",
          hint: "Go line by line: who is speaking, who else is doing it, what arrived first, and what's running out?",
        },
      ],
    },

    // ---- 3. Framing an ask, and persuading ethically -------------------------------------
    {
      id: "ethical-ask",
      title: "Asking Well, Spotting Manipulation",
      summary: "Build a request people want to say yes to, and recognise manipulation before it works on you.",
      steps: [
        {
          type: "choice",
          phase: "preview",
          prompt:
            "Now let's put the principles to work: how to ask well, and how to resist when someone asks badly. First, a prediction. Someone asks to cut in line at a photocopier to copy 5 pages. With no reason (“May I use the machine?”), 60% let them. With a real reason (“…because I'm in a rush?”), 94% did. What about an empty reason: “…because I have to make copies?”",
          options: [
            "About 60%: the reason adds nothing",
            "About 75%",
            "About 93%: nearly as good as a real reason",
          ],
          answer: [2],
          explain:
            "**93%.** The word *because* signals “there's a reason”, and for small requests people rarely check whether it's any good. But watch what happened when the request got bigger (next step).",
          hint: "Everyone at a copier has to make copies. Would a busy person in the queue stop to notice that?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Reasons matter more as the ask grows",
          body:
            "When the same person asked to copy **20 pages**, the empty reason stopped working: 24% said yes, exactly as many as with no reason at all. The real reason still helped (42%).\n\nFor small favours, people hear that a reason exists and wave you through. For anything that matters, they weigh it. So always give a reason, and make it a **true** one that matters to the other person.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 220" font-family="sans-serif" font-size="14" text-anchor="middle" fill="currentColor"><line x1="25" y1="160" x2="355" y2="160" stroke="currentColor" stroke-width="2"/><rect x="40" y="88" width="40" height="72" rx="3" opacity="0.35"/><rect x="85" y="48" width="40" height="112" rx="3" fill="#1c7ed6"/><rect x="130" y="47" width="40" height="113" rx="3" fill="#2f9e44"/><rect x="210" y="131" width="40" height="29" rx="3" opacity="0.35"/><rect x="255" y="131" width="40" height="29" rx="3" fill="#1c7ed6"/><rect x="300" y="110" width="40" height="50" rx="3" fill="#2f9e44"/><text x="60" y="82">60%</text><text x="105" y="42">93%</text><text x="150" y="41">94%</text><text x="230" y="125">24%</text><text x="275" y="125">24%</text><text x="320" y="104">42%</text><text x="105" y="180" font-size="15" font-weight="bold">5 pages</text><text x="275" y="180" font-size="15" font-weight="bold">20 pages</text><rect x="20" y="197" width="12" height="12" opacity="0.35"/><text x="37" y="207" text-anchor="start">No reason</text><rect x="130" y="197" width="12" height="12" fill="#1c7ed6"/><text x="147" y="207" text-anchor="start">Empty reason</text><rect x="255" y="197" width="12" height="12" fill="#2f9e44"/><text x="272" y="207" text-anchor="start">Real reason</text></svg>`,
          caption: "People who let someone cut in line at the copier.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Lead with their interest",
          body:
            "People are busy with their own goals. A request that opens with *your* problem asks them to care about you. A request that opens with *their* goal shows them why saying yes helps them too.\n\nInstead of: “I need you to review my doc.”\n\nTry: “You mentioned wanting fewer surprises at launch. Could you give the launch plan a 10-minute look by Thursday? That way we catch problems while they're cheap to fix.”\n\nNotice the second version also carries a real **reason**, aimed at what *they* care about.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt: "You want your manager to approve a new laptop. Which opening leads with *her* interest?",
          options: [
            "“My laptop is so slow, it's driving me crazy.”",
            "“Everyone else on the team already has a new one.”",
            "“You've wanted the weekly reports out faster. A new laptop would cut my build time from 20 minutes to 5.”",
            "“I've been here two years, so I think I've earned it.”",
          ],
          answer: [2],
          explain:
            "Only the third connects to something she already wants (faster reports), and it carries a concrete reason. The others are about your frustration, what others have, or what you feel you deserve. All real feelings, but none give her a reason that serves her goals.",
          hint: "Which one is about what *she* wants?",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Make it easy, and leave them free",
          body:
            "Vague asks are easy to put off. Make the yes **specific** (what, when, how long), **small** (a first step, not the whole mountain) and **low-effort** (you do the legwork: draft the email, book the room, bring the supplies).\n\nThen leave the door open: “and no worries if you can't.” Reminding people they're free to say no tends to make them *more* likely to say yes. In one street study, the share of strangers who gave someone money for the bus jumped from about 10% to nearly half.",
        },
        {
          type: "choice",
          phase: "understand",
          prompt:
            "The original ask: “Could you help with the school fundraiser sometime?” Which rewrites or additions make it easier to say yes? Select all that apply.",
          options: [
            "“Could you run the bake-sale table from 10 to 12 this Saturday?”",
            "“I've already set up the table and the cash box, so you'd just need to turn up.”",
            "“And honestly, no worries if you can't make it.”",
            "“Could you help out with a few things over the next few months?”",
            "“I need an answer in the next five minutes.”",
          ],
          answer: [0, 1, 2],
          explain:
            "Specific (what and when), low-effort (you've done the setup) and free to refuse all make a yes easier. “A few things over the next few months” is even vaguer than the original, and a five-minute deadline is pressure: it might get a yes today and resentment tomorrow.",
          hint: "Look for specific, easy and free. Avoid vague or pushy.",
        },
        {
          type: "order",
          phase: "understand",
          prompt:
            "Here's a message to a housemate, built with the recipe **their interest → the ask → the reason → make it easy → leave them free**. Put the sentences in that order.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 406 60" font-family="sans-serif" font-size="14" text-anchor="middle" fill="currentColor"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="70" height="40" rx="8"/><rect x="86" y="10" width="70" height="40" rx="8"/><rect x="168" y="10" width="70" height="40" rx="8"/><rect x="250" y="10" width="70" height="40" rx="8"/><rect x="332" y="10" width="70" height="40" rx="8"/></g><polygon points="77,24 84,30 77,36"/><polygon points="159,24 166,30 159,36"/><polygon points="241,24 248,30 241,36"/><polygon points="323,24 330,30 323,36"/><text x="39" y="35">Interest</text><text x="121" y="35">Ask</text><text x="203" y="35">Reason</text><text x="285" y="35">Easy</text><text x="367" y="35">Free</text></svg>`,
          caption: "The recipe: their interest, the ask, the reason, make it easy, leave them free.",
          items: [
            "I know you've been wanting the kitchen to feel less cluttered.",
            "Could we do a 20-minute clear-out together on Sunday morning?",
            "That's because the counters are so full we both end up cooking in one tiny corner.",
            "I'll bring bin bags and coffee, so you only need to bring yourself.",
            "And if Sunday doesn't suit you, just say so, no pressure.",
          ],
          explain:
            "Opening with what *they* already want makes the ask feel like help, not a chore. The reason follows the ask (“That's because…”), the offer to do the legwork removes friction, and the last line gives a real way out, which, as you saw, makes a yes more likely.",
          hint: "Start with what the housemate wants; end with their freedom to say no.",
        },
        {
          type: "explain",
          phase: "understand",
          title: "Persuasion or manipulation?",
          body:
            "Every principle in this course can be used honestly or dishonestly. The difference isn't the technique; it's **truth** and **whose interest it serves**.\n\n- **Persuasion:** real reasons, real deadlines, real expertise, and a request that's good for them too.\n- **Manipulation:** invented scarcity, borrowed authority, pressure to decide *right now*, hidden downsides.",
          figure: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180" font-family="sans-serif" font-size="15" text-anchor="middle" fill="currentColor"><rect x="20" y="6" width="320" height="64" rx="10" fill="none" stroke="currentColor" stroke-width="2"/><text x="180" y="32">Would it still work if they could</text><text x="180" y="54">see exactly what you are doing?</text><line x1="90" y1="70" x2="90" y2="108" stroke="currentColor" stroke-width="2"/><polygon points="90,118 84,106 96,106"/><line x1="270" y1="70" x2="270" y2="108" stroke="currentColor" stroke-width="2"/><polygon points="270,118 264,106 276,106"/><text x="100" y="98" text-anchor="start">Yes</text><text x="280" y="98" text-anchor="start">No</text><rect x="10" y="120" width="160" height="50" rx="10" fill="#2f9e44" fill-opacity="0.15" stroke="#2f9e44" stroke-width="2"/><text x="90" y="151" font-weight="bold">Persuasion</text><rect x="190" y="120" width="160" height="50" rx="10" fill="#e03131" fill-opacity="0.15" stroke="#e03131" stroke-width="2"/><text x="270" y="151" font-weight="bold">Manipulation</text></svg>`,
          caption: "A quick honesty test for any technique.",
        },
        {
          type: "match",
          phase: "understand",
          prompt: "Match each manipulation tactic to a good defence.",
          pairs: [
            {
              left: "A free “gift”, followed straight away by a hard sell",
              right: "See it as a sales tool rather than a kindness: you owe nothing back",
            },
            {
              left: "A countdown timer that resets every time you reload the page",
              right: "Treat the rush as a red flag and step away; a fair offer survives a night's sleep",
            },
            {
              left: "“You said you care about your family's safety, so you'll sign today, right?”",
              right: "Ask yourself: knowing what I know now, would I make that commitment again?",
            },
            {
              left: "An actor in a lab coat recommends a supplement",
              right: "Ask: is this person truly an expert, and do they have reasons to be honest with me?",
            },
          ],
          explain:
            "Each defence takes the pressure off by slowing down and checking the facts: a gift used as bait doesn't create a real debt, a real deadline doesn't reset, a past yes doesn't bind you when the facts are different, and a costume isn't expertise.",
          hint: "Match on the principle being abused: reciprocity, scarcity, consistency, authority.",
        },
        {
          type: "reveal",
          phase: "understand",
          prompt:
            "You're in a shop, nodding along, feeling a strong urge to say yes *right now*. What's one sentence that defuses almost every pressure tactic?",
          body:
            "**“I don't decide on the spot. I'll sleep on it.”**\n\nManipulation depends on speed: the rush of a deadline, the glow of a gift, the momentum of your last yes. A fair offer is usually still there tomorrow. If it vanishes the moment you ask for time, you've learned what you needed to know.",
        },
        {
          type: "teach",
          phase: "explain",
          prompt:
            "A friend wants to ask their manager if they can work from home on Fridays. Explain how to build the request, and how to be sure it's persuasion rather than manipulation.",
          keyPoints: [
            "Open with something the manager cares about",
            "Make one specific, small, easy request",
            "Give a true reason (“because…”)",
            "Leave the manager genuinely free to say no",
            "Honesty test: it should still work if they could see exactly what you're doing",
          ],
          model:
            "Start with what the manager wants: “You've wanted the quarterly report finished sooner.” Make one specific, small ask: “Could I try working from home on Fridays for the next month?” Give the true reason: “because Fridays are my deep-work day and I get far more done without interruptions.” Make it easy: “I'll stay on chat and move any Friday meetings.” Leave them free: “If it doesn't work for the team, we can drop it.” Then check the honesty test: nothing in the pitch would stop working if the manager could see exactly why it was built that way.",
        },
        {
          type: "order",
          phase: "recall",
          prompt: "From memory: put the five parts of a well-built request in order.",
          items: ["Lead with their interest", "Make one specific ask", "Give a true reason", "Make it easy", "Leave them free to say no"],
          explain:
            "Interest, ask, reason, easy, free. Their interest earns attention, the specific ask makes a yes possible, the reason makes it sensible, the legwork makes it effortless, and the way out makes it a free choice.",
        },
        {
          type: "input",
          phase: "apply",
          prompt:
            "A website says “Only 3 left in stock!” You check back a week later and it still says “Only 3 left!”. Which principle is being faked?",
          answers: [
            "scarcity",
            "scarcity principle",
            "principle of scarcity",
            "false scarcity",
            "fake scarcity",
            "artificial scarcity",
            "manufactured scarcity",
            "rarity",
          ],
          placeholder: "One word",
          explain:
            "**Scarcity.** Real scarcity is useful information; invented scarcity is a lie designed to rush you. A “limited” claim that never changes is a strong sign it's fake.",
          hint: "It's the cookie-jar principle.",
        },
        {
          type: "choice",
          phase: "apply",
          prompt: "You want your team to try a new code-review tool. Which pitch is both persuasive **and** ethical?",
          options: [
            "“You've all said reviews take too long. Could we trial this tool on one project for two weeks? It flags routine issues automatically, which should shorten reviews. I've set up the accounts, and if it doesn't help, we drop it.”",
            "“Every serious team uses this now. Sign up today or we'll fall behind.”",
            "“I've already told the director we're all switching, so we can't back out now.”",
            "“Trust me, I'm the most senior person here. Just start using it.”",
          ],
          answer: [0],
          explain:
            "The first pitch leads with the team's own complaint, makes a small, specific ask (one project, two weeks), gives a real reason, removes the effort, and offers a genuine way out. The others lean on vague social proof plus pressure, a commitment made on the team's behalf, and authority with no reasons at all.",
          hint: "Check each pitch against the recipe: their interest, a specific ask, a reason, easy, free.",
        },
        {
          type: "practice",
          phase: "apply",
          prompt:
            "Try it for real: pick one request you actually need to make today, at work, at home or with a friend. Draft it with the recipe, check it against the honesty test, then make it.",
          minutes: 5,
          focus: [
            "Open with something they care about",
            "One specific, small ask with a when",
            "A true reason: “because…”",
            "Do the legwork so saying yes is easy",
            "Give them a real way to say no",
          ],
          goal: "Make one real request today using all five parts, and notice how the other person responds.",
        },
      ],
    },
  ],
};

export default course;

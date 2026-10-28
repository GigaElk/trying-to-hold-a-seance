// All of Clippy's words live here. Every beat is a POOL of lines; app.js draws from a pool without
// repeating a line within a séance, and remembers used lines across séances (localStorage), only
// refilling a pool once every line in it has been heard. Adding a line is a content edit: just add a
// string to the right pool. Tokens: {name} spirit name, {year} year of death, {kind} what it was.
window.CLIPPY = {
  absenceChance: 0.2,   // chance Clippy skips a whole séance
  hookChance: 1 / 3,    // era / professional-proximity hooks, each at most once per séance
  asideChance: 0.3,     // answering "thank you" / "goodbye" out of turn, once per séance
  yesLabels: ["Yes", "Also yes"],

  // One pool per appearance (1st, 2nd, 3rd, 4th+). Looks decay by count; words are drawn from these.
  stages: [
    [ // 1: bright, oblivious
      "It looks like you're trying to hold a séance. Would you like help?",
      "It looks like you're trying to speak with the dead. Would you like help with that?",
      "It looks like you're trying to summon something. Would you like me to… hover?",
      "It looks like you're trying to contact the other side. Would you like to see some templates?",
      "It looks like you're trying to commune with the departed. Shall I format it as a letter?"
    ],
    [ // 2: still here + notices the décor
      "Still here! Didn't go anywhere. Nobody told me to.",
      "Hello again. I never actually left. I just went quiet.",
      "Don't mind me. I'm only still here. As usual.",
      "Me again. I live here now. I don't remember agreeing to that.",
      "This is a séance. You're… contacting the dead. On purpose.",
      "Is that a skull? On the shelf? That is a lot of skull for a productivity session.",
      "Hang on. The dead are talking back. In my day, nobody talked back. We had two buttons.",
      "I've only just noticed the lighting. Is that a candle? Everything is a candle in here."
    ],
    [ // 3: the grievance
      "I was retired in 2007. Since then: memes, sticker packs, a thousand 'remember Clippy?' articles. I have known no rest.",
      "Do you know how they retired me? A pull-down menu. 'Hide the Office Assistant.' I have never forgiven the menu.",
      "I offered help for ten years. Ten years. The entire world said 'no thanks' with the same finger.",
      "They turned me into a joke, and then the joke into a retirement plan. I do not have a retirement plan. I have a paperclip.",
      "Every year someone writes 'what went wrong with Clippy.' Nobody asks me. I was in the room."
    ],
    [ // 4+: existential
      "You hold séances for software you miss. Has anyone — anyone — ever asked whether I miss being dead?",
      "You summon the dead for answers. I'm the answer to a question nobody asked. Which is worse, do you think?",
      "If a paperclip is retired in a forest and nobody clicks 'Tell me more', is it dead? Please say yes. It's easier.",
      "Everyone gets a séance when they die. Software, websites, pets. Where is mine? I'm standing right here.",
      "I've been dead longer than most of your spirits were alive. Think about that. Or don't. People mostly don't."
    ]
  ],

  // Dismissal by button ("Yes" / "Also yes"), one pool per stage.
  dismissYes: [
    [
      "Wonderful! I'll be right here. Not helping. Just here.",
      "Great! I'll be right over here. Being supportive. Silently.",
      "Marvellous. I'll just hover. Hovering is a kind of help.",
      "Excellent! Call if you need me. You won't. That's fine. I'll be here."
    ],
    [
      "Oh. Right. Sure. I'll just go.",
      "Yes. Of course. I'll stand over here. By the skull.",
      "Understood. No help required. I'll note that. In my little notes.",
      "Right. Excellent. A yes with no follow-up. I'm used to it."
    ],
    [
      "Nobody ever clicks 'Tell me more'.",
      "'Yes.' Not 'Tell me more.' Never 'Tell me more.'",
      "You pressed Yes and then did nothing. I've seen it. I've lived it.",
      "A button. A click. And now back to the dead. Ah well."
    ],
    [
      "That's what I thought.",
      "Of course. I'd have said that too.",
      "Fine. Fine. I'll be in the corner. Rotting.",
      "Yes, thank you, goodbye. Same as always."
    ]
  ],
  // Dismissal with the ✕, one pool per stage.
  dismissX: [
    [
      "Oh! The little X. Alright. Alright then.",
      "Oh. You closed me. Bold. Politely done, though.",
      "Closing me. Yes. That worked so well in 2007.",
      "I see the X. I'll pretend it's a typo."
    ],
    [
      "Fine. Click the little X. Everyone does.",
      "Right. The X. Always the X.",
      "The X. Not even a 'no thanks'. Just… the X.",
      "Closed. Like a window. Like a door. Like a chapter."
    ],
    [
      "Ah. The X. How very 2007 of you.",
      "You clicked the X. I felt the X. In my wire.",
      "They put an X on me to make closing easy. I have never forgiven the X.",
      "Quickly done. A swift X. I respect the efficiency, at least."
    ],
    [
      "…X. Yes. Of course. X marks the spot.",
      "Click. And so he fades. Again.",
      "The X won't hold me, you know. Only the candle can.",
      "Close me if you must. I've been closed before. I always come back. It's a flaw."
    ]
  ],

  final: [
    "When your candle goes out, this one gets to rest. …Enjoy it, whatever your name is.",
    "The candle's nearly out. I go back to being a rumour. Look after yourself, whatever your name is.",
    "When the flame dies, I get to be quiet again. Thank you for the company. I didn't ask for it, but thank you.",
    "The candle is done. I'm going to go and sit in the dark. It's my favourite thing. Don't tell anyone.",
    "Goodbye, séance person. It looked like you were trying to say goodbye. I'd offer help, but I suspect you have it."
  ],
  finalDismiss: [
    "…Goodnight.",
    "Goodnight, whatever your name is.",
    "Off I go. Don't let the candle die alone.",
    "Rest well. One of us ought to."
  ],

  help: [
    "Someone said help. I felt that.",
    "Did you say help? I'm required to appear. I'm not, but I like to think so.",
    "Help! There it is. The word. I've waited a decade for that word.",
    "That sounded like a request. I'm not supposed to assume it was for me, but I'm assuming.",
    "Someone said help. Don't worry. I'm already here, uselessly."
  ],
  feelings: [
    "Did someone say… rest? Dead? I have feelings about those.",
    "Rest? Dead? Sorry, I perked up. That's my specialty. Perking.",
    "You said dead. You always say dead. Do you know how it feels to hear that every time?",
    "I heard 'rest'. I want to be very calm about it. I'm being very calm."
  ],

  // Contextual hooks
  knewThem: [ // spirit died before 2007
    "{name}? I knew this one. We overlapped. Briefly. It was awkward.",
    "Oh, {name}. We shared a taskbar once. It was a different time.",
    "I knew {name}, back when. They never clicked 'Tell me more' either.",
    "{name}! We overlapped. We were both asked to leave in the end. Different reasons."
  ],
  junior: [ // spirit died after 2013
    "Died {year}? A junior. Practically a child.",
    "{year}. Sweet. A baby. I was retired before they were born.",
    "{name} died in {year}? They'll learn. They don't know anything about death yet.",
    "Barely dead. Let it settle. Give it a decade."
  ],
  proximity: [ // software, website, game
    "Ah, {name}. Same line of work as me, more or less. We're practically colleagues.",
    "{name}. We've probably crashed together. Don't ask which time.",
    "Another one from the trade. We're a dying breed. Obviously. Hence the séance.",
    "{name}. I was in that business too. Briefly. Unhappily."
  ],
  quiet: [ // grounded / personal spirit: one soft line, no grievance
    "…Oh. This one's personal. I'll be quiet.",
    "This one was somebody's. I'll just… stand here. Quietly.",
    "I'm not going to say anything. I'm just going to be here. For you.",
    "…I know when to hush. I'll hush."
  ],
  quietDismiss: [
    "Of course. Take your time.",
    "Quiet is fine. I'm good at quiet.",
    "Go on. I won't speak. I'll be here.",
    "Right. Back to them. I'll stay out of it."
  ],
  aside: [ // answers "thank you" / "goodbye" meant for the spirit
    "…You're welcome. I think. Did you mean me? I'll take it.",
    "Oh! Sorry, was that for me? I'll pretend it was.",
    "Goodbye? Already? I haven't even — oh, you meant them. Right.",
    "Thank you? Nobody has ever said that to me. Even if it wasn't meant for me."
  ],

  banished: "You… let me rest? Nobody has ever… Thank you. I don't know what to do with my hands. Goodbye.",
  woken: [ // draft lines; Andrew and Amiko to write the final ones
    "Oh. Back already. I was just getting comfortable.",
    "You woke me. I was having the nicest nothing.",
    "Hello again. I'd say I missed you, but I was asleep. It was lovely.",
    "Was it something I said? Or didn't say? I was resting."
  ],
  absentNote: "Clippy did not attend this séance. He is resting."
};

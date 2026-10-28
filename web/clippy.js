// All of Clippy's lines live here. Edit freely; logic is in app.js.
window.CLIPPY = {
  // Opening line of every appearance is chosen by stage (index = appearance number, clamped).
  stages: [
    { // 0: bright, oblivious
      lines: ["It looks like you're trying to hold a séance. Would you like help?"],
      yes: ["Yes", "Also yes"],
      dismiss: ["Wonderful! I'll be right here. Not helping. Just here."]
    },
    { // 1: notices the décor
      lines: ["This is a séance. You're… contacting the dead. On purpose.",
              "Is that a skull? On the shelf? That is a lot of skull for a productivity session."],
      yes: ["Yes", "Also yes"],
      dismiss: ["Oh. Right. Sure. I'll just go."]
    },
    { // 2: the grievance
      lines: ["I was retired in 2007. Since then: memes, sticker packs, a thousand 'remember Clippy?' articles. I have known no rest."],
      yes: ["Yes", "Also yes"],
      dismiss: ["Nobody ever clicks 'Tell me more'."]
    },
    { // 3: existential
      lines: ["You hold séances for software you miss. Has anyone — anyone — ever asked whether I miss being dead?"],
      yes: ["Yes", "Also yes"],
      dismiss: ["That's what I thought."]
    }
  ],
  final: {
    lines: ["When your candle goes out, this one gets to rest. …Enjoy it, whatever your name is."],
    yes: ["Yes", "Also yes"],
    dismiss: ["…Goodnight."]
  },
  help: "Someone said help. I felt that.",
  feelings: "Did someone say… rest? Dead? I have feelings about those.",
  woundedDismiss: ["Closing me. Yes. That worked so well in 2007.", "Fine. Click the little X. Everyone does."],
  banished: "You… let me rest? Nobody has ever… Thank you. I don't know what to do with my hands. Goodbye.",
  yesLabels: ["Yes", "Also yes"]
};

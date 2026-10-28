# It Looks Like You're Trying to Hold a Séance

A séance for dead software, dead AIs, dead websites — anything digital that died and left you with questions. You describe who you want to summon; a **local open-weight model, run through [Ollama](https://ollama.com)**, forges that spirit and speaks as it, in character, for as long as the candle lasts. Then, uninvited, Clippy arrives.

> Nothing you say to the dead leaves this computer. No cloud, no account, no API key, no external assets.

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 4 — "Ghost in the Machine".

## Requirements

- **Python 3.8+** (standard library only; no `pip install`, no Node, no build step).
- **[Ollama](https://ollama.com)** running locally (default `http://127.0.0.1:11434`).
- **At least one pulled model**: `gemma3:4b` (default and the only tested model, about 3 GB). `qwen3:8b` and `llama3.1:8b` are supported alternatives but untested.
- A modern browser (Chrome, Edge, Firefox, Safari).
- Roughly 4 GB RAM/VRAM for `gemma3:4b`, about 8 GB for the 8B models. A GPU helps a lot.

## Quick start

```
git clone https://github.com/GigaElk/trying-to-hold-a-seance.git
cd trying-to-hold-a-seance
python start.py
```

`start.py` (or double-click `start.bat` on Windows, `./start.sh` on macOS/Linux) checks that Ollama is installed, starts it if it isn't running, offers to pull a model if you have none (`gemma3:4b` by default), starts the server and opens your browser. Options: `--model <name>`, `--port 9000`, `--no-browser`, `--yes` (don't ask before pulling). Ctrl+C closes everything it started.

Prefer doing it by hand? See Setup below.

## Setup

1. Install [Ollama](https://ollama.com) and make sure it is running.
2. Pull a model (the app picks the first one it finds, in this order):
   ```
   ollama pull gemma3:4b      # default, tested
   ollama pull qwen3:8b       # alternative, untested
   ollama pull llama3.1:8b    # alternative, untested
   ```
3. Start the parlour (Python 3, standard library only — nothing to install):
   ```
   python server.py
   ```
4. Open <http://127.0.0.1:8000>. Pick a specific model with `?model=llama3.1:8b`, or change `DEFAULT_MODEL` at the top of `web/app.js`.

Options: `python server.py --port 9000`; `OLLAMA_HOST=host:port` if Ollama is elsewhere.

**Tested model:** `gemma3:4b` only (Ollama on Windows, GPU). Run so far: a generated spirit (GeoCities), a grounded spirit from an uploaded file, and full 12-turn séances with the MSN Messenger and Internet Explorer presets, driven in a browser. The Forge returned valid JSON (the app flattens nested objects). `qwen3:8b` and `llama3.1:8b` are untested.

**Latency and length:** séance replies are capped at about 80 words (system prompt) and `num_predict: 220`, at temperature 0.65. While waiting for the first token the candle flickers harder and "The spirit is gathering itself…" shows. In testing, warm replies took roughly 1.5–3.5 s (first reply ~12 s while the model loaded); the Internet Explorer preset is deliberately slower (per-token delay).

**Honesty:** the spirit may only speak from its sheet and what you have told it. The prompt forbids inventing names, places or events and tells it to say the veil is cloudy and ask you to say more; a short reminder is sent every turn, and a stronger one (with the turns left) at turn 6. A 4B model can still occasionally slip, so treat this as strongly nudged, not guaranteed.

## How it works

- **The parlour** checks `/api/tags` through the server's proxy and shows setup instructions if Ollama or the model is missing.
- **The summoning card** collects name, kind, year of death, a seed memory and an optional question — or pick a preset spirit (MSN Messenger, Internet Explorer, Winamp, Netscape Navigator, Adobe Flash, Vine, the 14.4k Modem, Skype, Amiga, Sinclair ZX Spectrum). Internet Explorer, the modem and the Spectrum stream slowly via `delayMs`.
- **The Spirit Forge** calls `/api/chat` once, non-streaming with `format: "json"`, to produce a spirit sheet (name, epithet, voice, tics, memories, unfinished business, temperament, arrival line).
- **The séance** streams replies token by token. The system prompt is the séance rules + spirit sheet + the rules of the dead (first person, knows it is dead, only claims known memories — "the veil is cloudy there" — short replies, no breaking character).
- **The candle** is 12 visitor turns (`MAX_TURNS`). Small local models drift out of character over long chats, so the limit becomes ritual. On the final turn (or "Close the séance") the spirit is told the candle is going out and gives a parting line; the chat then locks.
- **The altar bar** is pinned at the top of a fixed-height frame; only the chat scrolls, so the candle is always visible (on narrow screens it collapses to a mini candle and the spirit's name). The wax drops one notch per turn, the flame is steady, restless from turn 8 and guttering for the last two, and goes out with a wisp of smoke on the parting line. The room darkens with each turn, a line of state text ("The candle stands tall." … "The candle is guttering.") says the same in words, and the glow pulses while the spirit gathers itself. Clippy sits bottom-right and the altar bar always stays above him.
- **Clippy** is scripted, not model-driven, but never the same twice. First appearance after your 2nd message, then every 4–5 turns (max 4 regular appearances), instantly on the word "help", sometimes on "dead/die/rest", and quietly once more as the candle ends. Every beat is a **pool of lines** in `web/clippy.js` (a content edit, not a code change, to add more). A line is never repeated within a séance, and used lines are remembered across séances in `localStorage`, so unheard lines are drawn first and a pool only resets once exhausted. He decays with each appearance, like the candle: pale, then green-tinged, then stitched, then fully zombie with one X eye; his title bar goes "Office Assistant" → "(Retired)" → "(Deceased)" → "(Do Not Resuscitate)". The look is deterministic by appearance count; only his words vary. He sometimes shows he's in *this* séance (knew a spirit who died before 2007, scorns one who died after 2013, claims professional proximity to software/games/websites, falls quiet once for a grounded spirit, answers a "thank you"/"goodbye" out of turn). The ✕ and the buttons get different exit lines. About 1 séance in 5 he doesn't attend at all (the end screen says so). Nothing in the UI mentions him before he appears. After his first entrance a quiet **Let Clippy rest** checkbox appears under the chat; ticking it banishes him for good (one thank-you line, no further appearances, "help" included; unticking wakes him with one grumpy line). `clippy_seen` and `clippy_resting` are saved in `localStorage`, so a returning visitor also gets the checkbox, discreetly, on the summoning card, and their choice persists. If he never attends a séance, no control appears.
- **The record** — download the summoning card, spirit sheet and full transcript (Clippy included) as Markdown.

### Ground a ghost in its own words

On the summoning card, attach any `.txt`/`.md` file; its first ~6000 characters are pinned into the spirit's prompt as the only text it may quote. To ship a private preset, add an entry with a `grounding` field to `web/spirits.js` (the public repo ships none; the empty slot is documented in that file's header).

## Why open matters

A ghost hosted on someone else's server can be deprecated and switched off mid-conversation. A local open-weight ghost cannot be taken away — and what you say to the dead stays on your machine.

## Status / known gaps

- Verified: server smoke test (`python tests\smoke_test.py`, fake Ollama) and a live browser run with `gemma3:4b` (parlour check, Forge, streaming, candle, parting and lock, Clippy appearances/dismissals/final line). Also exercised with `gemma3:4b`: the "Let Clippy rest" toggle, transcript download, grounding file upload and the Internet Explorer preset.
- The private "First Amiko" preset is intentionally not included.
- Screenshots/GIF and demo video link are not included yet.
- Clippy: the existential stage appears only if enough appearances occur (the cap and 4–5 turn spacing in a 12-turn séance make ~3 regular appearances typical, plus the final one). Lines are drafts; Andrew has final cut.

## Credits & AI-use disclosure

- **Concept & creative direction:** Andrew Hewitt. The Clippy grievance is his joke; the candle is his constraint made ritual.
- **Design doc & specs:** Amiko (Muse Spark), from the concept above.
- **Build:** GitHub Copilot (coding agent) wrote this implementation from the design doc.
- **Runtime:** an open-weight model through Ollama.
- Clippy is an affectionate parody, drawn from scratch as an inline SVG; no Microsoft assets are used.

## Licence

MIT — see [LICENSE](LICENSE).


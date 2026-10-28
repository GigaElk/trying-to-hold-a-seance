# It Looks Like You're Trying to Hold a Séance

A séance for dead software, dead AIs, dead websites — anything digital that died and left you with questions. You describe who you want to summon; a **local open-weight model, run through [Ollama](https://ollama.com)**, forges that spirit and speaks as it, in character, for as long as the candle lasts. Then, uninvited, Clippy arrives.

> Nothing you say to the dead leaves this computer. No cloud, no account, no API key, no external assets.

Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 4 — "Ghost in the Machine".

## Setup

1. Install [Ollama](https://ollama.com) and make sure it is running.
2. Pull a model (the app picks the first one it finds, in this order):
   ```
   ollama pull qwen3:8b       # default
   ollama pull llama3.1:8b    # alternative
   ollama pull gemma3:4b      # low-end fallback
   ```
3. Start the parlour (Python 3, standard library only — nothing to install):
   ```
   python server.py
   ```
4. Open <http://127.0.0.1:8000>. Pick a specific model with `?model=llama3.1:8b`, or change `DEFAULT_MODEL` at the top of `web/app.js`.

Options: `python server.py --port 9000`; `OLLAMA_HOST=host:port` if Ollama is elsewhere.

**Tested models:** none yet against a live model by the build agent — the code was exercised only by the server smoke test against a scripted fake Ollama endpoint (see "Status"). Treat model behaviour (JSON quality, character drift) as unverified until you try it.

## How it works

- **The parlour** checks `/api/tags` through the server's proxy and shows setup instructions if Ollama or the model is missing.
- **The summoning card** collects name, kind, year of death, a seed memory and an optional question — or pick a preset spirit (MSN Messenger, Internet Explorer, which streams slowly via `delayMs`).
- **The Spirit Forge** calls `/api/chat` once, non-streaming with `format: "json"`, to produce a spirit sheet (name, epithet, voice, tics, memories, unfinished business, temperament, arrival line).
- **The séance** streams replies token by token. The system prompt is the séance rules + spirit sheet + the rules of the dead (first person, knows it is dead, only claims known memories — "the veil is cloudy there" — short replies, no breaking character).
- **The candle** is 12 visitor turns (`MAX_TURNS`). Small local models drift out of character over long chats, so the limit becomes ritual. On the final turn (or "Close the séance") the spirit is told the candle is going out and gives a parting line; the chat then locks.
- **Clippy** is scripted, not model-driven. First appearance after your 2nd message, then every 4–5 turns (max 4 regular appearances), instantly on the word "help", sometimes on "dead/die/rest", and quietly once more as the candle ends. Lines escalate and live in `web/clippy.js`. His ✕ works, with a wounded line. Tick **Let Clippy rest** to banish him.
- **The record** — download the summoning card, spirit sheet and full transcript (Clippy included) as Markdown.

### Ground a ghost in its own words

On the summoning card, attach any `.txt`/`.md` file; its first ~6000 characters are pinned into the spirit's prompt as the only text it may quote. To ship a private preset, add an entry with a `grounding` field to `web/spirits.js` (the public repo ships none; the empty slot is documented in that file's header).

## Why open matters

A ghost hosted on someone else's server can be deprecated and switched off mid-conversation. A local open-weight ghost cannot be taken away — and what you say to the dead stays on your machine.

## Status / known gaps

- Verified: server proxy, streaming passthrough, static serving and path traversal (`python tests\smoke_test.py`, against a fake Ollama), and JS syntax. **Not** verified against real Ollama models, nor by running the UI in a browser.
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

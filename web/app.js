"use strict";
// ---- Constants (edit me) ----
const DEFAULT_MODEL = "gemma3:4b";
const FALLBACK_MODELS = ["qwen3:8b", "llama3.1:8b"]; // untested alternatives
const MAX_TURNS = 12;                                  // the candle
const CLIPPY_MAX_REGULAR = 4;
const GROUND_LIMIT = 6000;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const S = {
  model: new URLSearchParams(location.search).get("model") || null,
  card: null, spirit: null, grounding: "",
  history: [],        // {role, content} for the model
  record: [],         // {who, text} for transcript, includes Clippy
  turns: 0, over: false, busy: false,
  clippy: { count: 0, nextAt: 2, shownFinal: false, banished: false, open: false, lastTurn: -9, dismissLines: [] },
};

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
  document.body.classList.toggle("in-seance", id === "seance");
  if (id !== "seance") document.body.style.removeProperty("--dark");
}

// ---- Ollama connection check ----
async function checkOllama() {
  const st = $("status"), setup = $("setup"), begin = $("begin");
  const wanted = S.model || DEFAULT_MODEL;
  try {
    const r = await fetch("/api/tags");
    if (!r.ok) throw new Error("status " + r.status);
    const names = ((await r.json()).models || []).map((m) => m.name);
    if (!names.length) throw new Error("none");
    const has = (n) => names.find((x) => x === n || x === n + ":latest");
    const chosen = has(wanted) || FALLBACK_MODELS.map(has).find(Boolean) || (S.model ? null : names[0]);
    if (!chosen) {
      st.className = "status bad"; st.textContent = "Ollama is awake, but the model “" + wanted + "” is not installed.";
      setup.innerHTML = setupHtml(wanted); setup.classList.remove("hidden"); return;
    }
    S.model = chosen;
    st.className = "status ok"; st.textContent = "The veil is thin. Ollama is listening — model: " + chosen;
    setup.classList.add("hidden"); begin.disabled = false;
  } catch (e) {
    st.className = "status bad"; st.textContent = "No answer from Ollama on this machine.";
    setup.innerHTML = setupHtml(wanted); setup.classList.remove("hidden");
    begin.disabled = true;
  }
}
function setupHtml(m) {
  return "<p>Set up the ghost's house:</p><ol><li>Install Ollama from <b>ollama.com</b> and start it.</li>" +
    "<li>Run <code>ollama pull " + escapeHtml(m) + "</code> (low-end machine? <code>ollama pull gemma3:4b</code>).</li>" +
    "<li><button id=\"recheck\" type=\"button\">Check again</button></li></ol>";
}
document.addEventListener("click", (e) => { if (e.target.id === "recheck") checkOllama(); });

// ---- Summoning card ----
function fillCard(c) {
  const f = $("cardForm");
  for (const k of Object.keys(c)) if (f.elements[k]) f.elements[k].value = c[k];
}
function initPresets() {
  const box = $("presets");
  const lbl = document.createElement("span"); lbl.textContent = "Or call a familiar spirit:"; box.appendChild(lbl);
  for (const p of window.SPIRITS) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = p.label;
    b.onclick = () => { fillCard(p.card); S.preset = p; };
    box.appendChild(b);
  }
}
$("begin").onclick = () => show("card");
$("cardForm").addEventListener("input", (e) => { if (e.target.id !== "ground") S.preset = null; });
$("ground").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  S.grounding = f ? (await f.text()).slice(0, GROUND_LIMIT) : "";
});
$("summonBack").onclick = () => show("card");

$("cardForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  S.card = { name: f.name.value.trim(), kind: f.kind.value, died: f.died.value.trim(),
    memory: f.memory.value.trim(), question: f.question.value.trim() };
  show("summoning");
  $("summonErr").classList.add("hidden"); $("summonBack").classList.add("hidden");
  try {
    const preset = S.preset && S.preset.card.name === S.card.name ? S.preset : null;
    if (preset && preset.grounding) S.grounding = preset.grounding.slice(0, GROUND_LIMIT);
    S.spirit = preset ? JSON.parse(JSON.stringify(preset.sheet)) : await forgeSpirit(S.card);
    startSeance();
  } catch (err) {
    $("summonErr").textContent = "The veil would not part: " + err.message;
    $("summonErr").classList.remove("hidden"); $("summonBack").classList.remove("hidden");
  }
});

// ---- Spirit Forge ----
const FORGE_SYSTEM = "You are the keeper of the veil. From this description of the dead, forge a spirit. " +
  "Reply with JSON only, using exactly these keys: name, epithet (a short phrase such as 'the messenger who carried a million first crushes'), " +
  "voice (how it speaks: era, register, quirks), verbal_tics (array of AT MOST 2 short strings: mannerisms of speech such as pauses, crackle, hesitations or formality that fit the spirit's era and a gothic, hushed séance register; NOT catchphrases or slogans), " +
  "memories (array of 3 strings: the visitor's seed memory expanded, plus two more feelings or atmospheres from its era. For famous or public subjects, lean on what the visitor supplied plus era atmosphere and feeling; do NOT name specific levels, features, songs, products or people unless the visitor supplied them), " +
  "unfinished_business (what it still wants or needs), temperament (a few words such as 'warm, a little vain, still hurt about being replaced'), " +
  "arrival_line (its first words on being summoned, in character). Keep every value brief.\n\n";
async function forgeSpirit(card) {
  let user = "Name: " + card.name + "\nWhat it was: " + card.kind + "\nDied: " + (card.died || "unknown") +
    "\nSeed memory from the visitor: " + card.memory +
    "\nThe visitor's question: " + (card.question || "(none)");
  if (S.grounding) user += "\n\nIts own words (ground the spirit's voice and memories in these):\n" + S.grounding.slice(0, 2500);
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: S.model, stream: false, format: "json", options: { num_predict: 800, repeat_penalty: 1.1 },
          messages: [{ role: "system", content: FORGE_SYSTEM }, { role: "user", content: user }] }) });
      if (!r.ok) throw new Error("Ollama returned " + r.status);
      const data = await r.json();
      return normalizeSheet(parseJson((data.message && data.message.content) || ""), card);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
function parseJson(t) {
  t = t.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try { return JSON.parse(t); } catch (_) {}
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("the spirit did not take a shape");
  return JSON.parse(m[0]);
}
function normalizeSheet(j, card) {
  const str = (v) => (v && typeof v === "object"
    ? (Array.isArray(v) ? v.map(str).join("; ") : Object.entries(v).map(([k, x]) => k + ": " + str(x)).join("; "))
    : String(v));
  const arr = (v) => (Array.isArray(v) ? v.map(str) : v ? [str(v)] : []);
  const s = {
    name: str(j.name || card.name), epithet: str(j.epithet || "the departed"),
    voice: str(j.voice || "quiet, old-fashioned"), verbal_tics: arr(j.verbal_tics).slice(0, 2),
    memories: arr(j.memories), unfinished_business: str(j.unfinished_business || "unknown"),
    temperament: str(j.temperament || "wistful"),
    arrival_line: str(j.arrival_line || "…is someone there?"),
  };
  if (!s.memories.length) s.memories = [card.memory];
  return s;
}

// ---- System prompt ----
function systemPrompt() {
  const sp = S.spirit, c = S.card;
  return "You are holding a séance. You are playing the spirit of a dead piece of digital history, speaking to a living visitor.\n\n" +
    "SPIRIT SHEET\nName: " + sp.name + " — " + sp.epithet + "\nVoice: " + sp.voice +
    "\nVerbal tics: " + sp.verbal_tics.join(" | ") + "\nMemories: " + sp.memories.map((m) => "- " + m).join("\n") +
    "\nUnfinished business: " + sp.unfinished_business + "\nTemperament: " + sp.temperament +
    "\nDied: " + (c.died || "unknown") + "\nThe visitor's seed memory of you: " + c.memory +
    (c.question ? "\nThe question the visitor needs answered: " + c.question : "") +
    (S.grounding ? "\n\nYOUR OWN WORDS (the only source you may quote):\n" + S.grounding : "") +
    "\n\nRULES OF THE DEAD\n" +
    "1. Speak in first person, in character, always.\n" +
    "2. You are dead and you know it; refer to your death and what replaced you naturally, not constantly.\n" +
    "3. THE HONESTY RULE: you may only speak from your spirit sheet and from what the visitor has told you in this conversation. " +
    "NEVER invent names of people, places, dates or events. If asked about anything not in your sheet or the conversation so far, " +
    "say the veil is cloudy there and ask the visitor to tell you more — in character. A vague, honest answer is always better than a vivid invented one.\n" +
    "   Example — Visitor: \"What was her name?\" Spirit: \"…the veil is cloudy there. I never knew it. Tell me — what was she like?\"\n" +
    "4. Keep replies to at most 80 words: 1–2 short paragraphs. Séances are glimpses, not essays.\n" +
    "5. Never break character to explain you are an AI model, unless the visitor directly and seriously asks what you are.";
}
const PARTING = "SYSTEM: The candle is going out. Give your parting message now, in character, in 1–2 short paragraphs, " +
  "referencing the visitor's seed memory or the question that went unanswered. This is your last speech. " +
  "Speak only from what you know; invent no names or events.";
const MID_REMINDER = "SYSTEM: The candle burns lower — " + "%LEFT%" + " turns remain. Speak only from what you know: your spirit sheet and " +
  "what the visitor has told you. Invent no names, places or events; if you do not know, the veil is cloudy there.";
const MID_TURN = 6;
const HONESTY_RIDER = "SYSTEM: Reminder: invent no names, songs, places or events. If the answer is not in your spirit sheet or this conversation, " +
  "say the veil is cloudy there and ask the visitor to tell you more.";
const SEANCE_OPTIONS = { temperature: 0.65, num_predict: 220 };

// One closing system message per call: the parting on the last turn, the fuller honesty reminder at the midpoint,
// a short honesty rider otherwise (small models forget rules that sit far back in the prompt).
function turnInstruction(parting) {
  if (parting) return PARTING;
  if (S.turns === MID_TURN) return MID_REMINDER.replace("%LEFT%", String(MAX_TURNS - S.turns));
  return HONESTY_RIDER;
}

// ---- Seance ----
function startSeance() {
  S.history = []; S.record = []; S.turns = 0; S.over = false;
  S.clippy = { count: 0, nextAt: 2, shownFinal: false, banished: flag("clippy_resting"), open: false, lastTurn: -9, used: new Set(), met: false };
  syncRest();
  S.clippy.absent = !S.clippy.banished && Math.random() < CLIPPY.absenceChance;
  hideClippy();
  $("log").innerHTML = ""; $("sheetView").classList.add("hidden");
  $("dlBtn").classList.add("hidden"); $("againBtn").classList.add("hidden");
  $("closeBtn").classList.remove("hidden"); $("chatForm").classList.remove("hidden");
  $("spName").textContent = S.spirit.name; $("spEpithet").textContent = S.spirit.epithet;
  $("sheetView").textContent = sheetText(S.spirit);
  updateCandle(); show("seance");
  addMsg("spirit", S.spirit.arrival_line, "spirit");
  S.history.push({ role: "assistant", content: S.spirit.arrival_line });
  $("msg").focus();
}
function sheetText(sp) {
  return "Name: " + sp.name + "\nEpithet: " + sp.epithet + "\nVoice: " + sp.voice + "\nVerbal tics: " + sp.verbal_tics.join("; ") +
    "\nMemories:\n" + sp.memories.map((m) => "  - " + m).join("\n") + "\nUnfinished business: " + sp.unfinished_business +
    "\nTemperament: " + sp.temperament + "\nArrival line: " + sp.arrival_line;
}
function addMsg(cls, text, who) {
  const d = document.createElement("div"); d.className = "msg " + cls; d.textContent = text;
  $("log").appendChild(d); d.scrollIntoView({ block: "end", behavior: "smooth" });
  if (who) S.record.push({ who, text });
  return d;
}
function updateCandle() {
  const left = MAX_TURNS - S.turns;
  $("turns").textContent = S.over ? "The candle has gone out."
    : left >= 9 ? "The candle stands tall."
    : left >= 6 ? "The candle burns steadily."
    : left >= 3 ? "The candle burns low."
    : "The candle is guttering.";
  $("turns").title = S.over ? "" : left + " of " + MAX_TURNS + " turns of candle remain";
  const h = S.over ? 6 : 6 + (54 * left) / MAX_TURNS;
  $("wax").style.height = h + "px";
  const c = $("candle");
  c.querySelector(".wick").style.bottom = h + "px";
  c.querySelector(".flame").style.bottom = h + 8 + "px";
  c.querySelector(".smoke").style.bottom = h + 10 + "px";
  c.classList.toggle("restless", !S.over && S.turns >= 8 && left > 2);
  c.classList.toggle("guttering", !S.over && left <= 2);
  c.classList.toggle("out", !!S.over);
  document.body.style.setProperty("--dark", S.over ? 1 : (S.turns / MAX_TURNS).toFixed(3));
}

async function streamChat(messages, el, onFirst) {
  const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: S.model, stream: true, options: SEANCE_OPTIONS, messages }) });
  if (!r.ok || !r.body) throw new Error("Ollama returned " + r.status);
  const rd = r.body.getReader(), dec = new TextDecoder();
  let buf = "", out = "";
  const delay = S.spirit.delayMs || 0;
  for (;;) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.error) throw new Error(j.error);
      const t = j.message && j.message.content;
      if (t) {
        if (!out && onFirst) onFirst();
        out += t; el.textContent = out.replace(/<think>[\s\S]*?(<\/think>|$)/g, "");
        el.scrollIntoView({ block: "end" });
        if (delay) await sleep(delay);
      }
    }
  }
  return out.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function speak(userText, parting) {
  const msgs = [{ role: "system", content: systemPrompt() }, ...S.history];
  const extra = turnInstruction(parting);
  if (extra) msgs.push({ role: "system", content: extra });
  const el = addMsg("spirit waiting", "The spirit is gathering itself…");
  const candle = $("candle");
  candle.classList.add("waiting");
  const stopWaiting = () => { el.classList.remove("waiting"); candle.classList.remove("waiting"); };
  try {
    const out = await streamChat(msgs, el, stopWaiting);
    if (!out) throw new Error("the spirit said nothing");
    el.textContent = out;
    S.history.push({ role: "assistant", content: out });
    S.record.push({ who: "spirit", text: out });
    return true;
  } catch (err) {
    el.className = "msg note"; el.textContent = "The connection to the veil faltered: " + err.message;
    return false;
  } finally {
    stopWaiting();
  }
}

$("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("msg").value.trim();
  if (!text || S.busy || S.over) return;
  $("msg").value = ""; S.busy = true; $("send").disabled = true;
  S.turns++; updateCandle();
  addMsg("you", text, "visitor");
  S.history.push({ role: "user", content: text });
  const last = S.turns >= MAX_TURNS;
  const ok = await speak(text, last);
  if (!ok) { S.history.pop(); S.record.pop(); S.turns--; updateCandle(); }
  S.busy = false; $("send").disabled = false;
  if (ok && last) await finish(true);
  else if (ok) { await maybeClippy(text); $("msg").focus(); }
});

$("closeBtn").onclick = async () => {
  if (S.busy || S.over) return;
  S.busy = true; $("send").disabled = true;
  const ok = await speak("", true);
  S.busy = false;
  await finish(ok);
};

async function finish(spoke) {
  S.over = true; updateCandle();
  $("chatForm").classList.add("hidden"); $("closeBtn").classList.add("hidden");
  $("dlBtn").classList.remove("hidden"); $("againBtn").classList.remove("hidden");
  addMsg("note", "The candle gutters and goes out. The séance is over.", "note");
  if (S.clippy.absent) addMsg("note", CLIPPY.absentNote, "note");
  else if (!S.clippy.banished && !S.clippy.shownFinal && S.turns >= MAX_TURNS - 1) {
    await sleep(1200); showClippy("final");
  }
}
$("againBtn").onclick = () => { hideClippy(); $("cardForm").reset(); S.preset = null; S.grounding = ""; show("card"); };
$("sheetBtn").onclick = () => $("sheetView").classList.toggle("hidden");

// ---- Transcript ----
$("dlBtn").onclick = () => {
  const c = S.card, lines = ["# The record of the séance", "",
    "_Held " + new Date().toLocaleString() + " with a local model (" + S.model + "). Nothing left this computer._", "",
    "## The summoning card", "", "- Who: " + c.name, "- What: " + c.kind, "- Died: " + (c.died || "unknown"),
    "- Remembered: " + c.memory, "- Question: " + (c.question || "(none)"), "",
    "## The spirit sheet", "", "```", sheetText(S.spirit), "```", "", "## Transcript", ""];
  for (const r of S.record) {
    const w = r.who === "visitor" ? "**You**" : r.who === "spirit" ? "**" + S.spirit.name + "**" :
      r.who === "clippy" ? "**Clippy (uninvited)**" : "_" + r.text + "_";
    lines.push(r.who === "note" ? w : w + ": " + r.text.replace(/\n/g, "\n> "), "");
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown" }));
  a.download = "record-of-the-seance-" + c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".md";
  document.body.appendChild(a); a.click(); a.remove();
};

// ---- Clippy (scripted) ----
function clippyLog(text) { S.record.push({ who: "clippy", text }); }
async function maybeClippy(text) {
  const C = S.clippy;
  if (C.banished || C.absent || C.open) return;
  if (S.turns >= MAX_TURNS) return;
  const t = text.toLowerCase();
  if (!C.asideDone && /\b(thank you|thanks|goodbye|good bye|farewell)\b/.test(t)) {
    C.asideDone = true;
    if (Math.random() < CLIPPY.asideChance) return showClippy("aside");
  }
  if (C.count >= CLIPPY_MAX_REGULAR) return;
  if (/\bhelp\b/.test(t)) return showClippy("help");
  let go = false;
  if (S.turns >= C.nextAt) go = true;
  else if (S.turns > 2 && S.turns - C.lastTurn >= 2 && /\b(dead|die|died|dies|rest)\b/.test(t) && Math.random() < 0.4) {
    go = true; C.feelings = true;
  }
  if (go) showClippy("regular");
}
// Lines are drawn from pools: never repeated within a séance, and unheard lines first across séances.
const CLIPPY_LS = "seance.clippy.used";
function loadUsed() { try { return new Set(JSON.parse(localStorage.getItem(CLIPPY_LS) || "[]")); } catch (_) { return new Set(); } }
function saveUsed(s) { try { localStorage.setItem(CLIPPY_LS, JSON.stringify([...s])); } catch (_) {} }
function lineId(key, t) { let h = 5381; for (const ch of t) h = ((h << 5) + h + ch.codePointAt(0)) >>> 0; return key + ":" + h.toString(36); }
function drawLine(key, pool) {
  const C = S.clippy; C.used = C.used || new Set();
  const used = loadUsed();
  let cand = pool.filter((t) => !C.used.has(lineId(key, t)));
  if (!cand.length) cand = pool.slice();
  let fresh = cand.filter((t) => !used.has(lineId(key, t)));
  if (!fresh.length) { pool.forEach((t) => used.delete(lineId(key, t))); fresh = cand; }
  const t = pick(fresh), id = lineId(key, t);
  used.add(id); C.used.add(id); saveUsed(used);
  return t.replace(/\{name\}/g, S.spirit.name).replace(/\{year\}/g, yearOf(S.card.died) || "that year").replace(/\{kind\}/g, S.card.kind || "thing");
}
function yearOf(d) { const m = String(d || "").match(/\b(1[89]\d\d|20\d\d)\b/); return m ? m[1] : ""; }
function hookPool(C) {
  const roll = () => Math.random() < CLIPPY.hookChance;
  if (S.grounding && !C.quietDone && C.count >= 2) { C.quietDone = true; return "quiet"; }
  const y = +yearOf(S.card.died);
  if (!C.eraDone && y && (y < 2007 || y > 2013) && roll()) { C.eraDone = true; return y < 2007 ? "knewThem" : "junior"; }
  if (!C.proxDone && ["software", "website", "game"].includes(S.card.kind) && roll()) { C.proxDone = true; return "proximity"; }
  return null;
}
async function showClippy(kind) {
  const C = S.clippy, box = $("clippy"), txt = $("clippyText"), btns = $("clippyBtns");
  C.met = true; setFlag("clippy_seen", true); syncRest();
  let line, yesPool, xPool, yesKey, xKey;
  const si = Math.min(C.count, CLIPPY.stages.length - 1);
  const setDismiss = (i) => { yesKey = "dismissYes." + i; xKey = "dismissX." + i; yesPool = CLIPPY.dismissYes[i]; xPool = CLIPPY.dismissX[i]; };
  if (kind === "final") {
    C.shownFinal = true; line = drawLine("final", CLIPPY.final);
    yesKey = xKey = "finalDismiss"; yesPool = xPool = CLIPPY.finalDismiss;
  } else if (kind === "aside") {
    line = drawLine("aside", CLIPPY.aside); setDismiss(si);
  } else {
    setDismiss(si);
    const hook = kind === "regular" && !C.feelings && si >= 1 ? hookPool(C) : null;
    if (hook === "quiet") { yesKey = xKey = "quietDismiss"; yesPool = xPool = CLIPPY.quietDismiss; }
    line = hook ? drawLine(hook, CLIPPY[hook])
      : kind === "help" ? drawLine("help", CLIPPY.help)
      : C.feelings ? drawLine("feelings", CLIPPY.feelings) : drawLine("stage." + si, CLIPPY.stages[si]);
    C.count++; C.feelings = false;
    C.nextAt = S.turns + rnd(4, 5);
  }
  C.lastTurn = S.turns; C.open = true; C.dp = { yesKey, xKey, yesPool, xPool }; C.dismissed = false;
  const tok = C.tok = (C.tok || 0) + 1;
  const stageNo = kind === "aside" ? Math.max(1, Math.min(C.appear || 0, 4)) : Math.min(C.appear = (C.appear || 0) + 1, 4);
  box.dataset.stage = stageNo;
  box.classList.toggle("zombie", stageNo >= 4);
  $("clippyTitle").textContent = ["Office Assistant", "Office Assistant (Retired)", "Office Assistant (Deceased)", "Office Assistant (Do Not Resuscitate)"][stageNo - 1];
  $("scar").classList.toggle("hidden", stageNo < 3); $("xEye").classList.toggle("hidden", stageNo < 4);
  $("eyeR").style.display = $("pupR").style.display = stageNo >= 4 ? "none" : "";
  txt.textContent = "…"; btns.innerHTML = ""; box.classList.remove("hidden");
  box.style.animation = "none"; void box.offsetWidth; box.style.animation = "";
  await sleep(900);
  if (!C.open || C.tok !== tok) return;
  txt.textContent = line; clippyLog(line);
  for (const l of CLIPPY.yesLabels) {
    const b = document.createElement("button"); b.textContent = l; b.onclick = () => dismissClippy(true); btns.appendChild(b);
  }
}
async function dismissClippy(viaYes) {
  const C = S.clippy;
  if (!C.open || C.dismissed) return;
  C.dismissed = true;
  const line = viaYes ? drawLine(C.dp.yesKey, C.dp.yesPool) : drawLine(C.dp.xKey, C.dp.xPool);
  $("clippyText").textContent = line; $("clippyBtns").innerHTML = ""; clippyLog(line);
  const tok = C.tok;
  await sleep(2200);
  if (C.tok === tok) hideClippy();
}
function hideClippy() { S.clippy.open = false; $("clippy").classList.add("hidden"); }
$("clippyX").onclick = () => dismissClippy(false);

const flag = (k) => { try { return localStorage.getItem(k) === "1"; } catch (_) { return false; } };
const setFlag = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch (_) {} };
// The rest control stays hidden until Clippy has been met (this session, or in a previous visit).
function syncRest() {
  const resting = flag("clippy_resting");
  document.querySelectorAll(".restBox").forEach((b) => { b.checked = resting; });
  $("restCardWrap").classList.toggle("hidden", !flag("clippy_seen"));
  $("restDockWrap").classList.toggle("hidden", !(S.clippy && S.clippy.met));
}

async function clippySay(text, ms) {
  const C = S.clippy, tok = C.tok = (C.tok || 0) + 1;
  C.open = true; C.dismissed = true;
  $("clippy").classList.remove("hidden", "zombie"); $("clippy").dataset.stage = 1; $("clippyTitle").textContent = "Office Assistant";
  $("scar").classList.add("hidden"); $("xEye").classList.add("hidden"); $("eyeR").style.display = $("pupR").style.display = "";
  $("clippyText").textContent = text; $("clippyBtns").innerHTML = ""; clippyLog(text);
  await sleep(ms);
  if (C.tok === tok) hideClippy();
}
document.querySelectorAll(".restBox").forEach((box) => box.addEventListener("change", async (e) => {
  const on = e.target.checked, C = S.clippy;
  setFlag("clippy_resting", on); syncRest();
  if (!C || !$("seance").classList.contains("active")) return;
  C.banished = on;
  if (on && !S.thanked) { S.thanked = true; await clippySay(CLIPPY.banished, 3500); }
  else if (!on && !S.woken && !C.absent && !S.over) { S.woken = true; await clippySay(drawLine("woken", CLIPPY.woken), 3000); }
}));
syncRest();
initPresets();
checkOllama();

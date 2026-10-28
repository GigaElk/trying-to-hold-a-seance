"use strict";
// ---- Constants (edit me) ----
const DEFAULT_MODEL = "qwen3:8b";
const FALLBACK_MODELS = ["llama3.1:8b", "gemma3:4b"]; // gemma3:4b = low-end fallback
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
    "<li>Run <code>ollama pull " + m + "</code> (low-end machine? <code>ollama pull gemma3:4b</code>).</li>" +
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
  "Reply with JSON only, exactly these keys: " +
  '{"name":"string","epithet":"string, e.g. \'the messenger who carried a million first crushes\'",' +
  '"voice":"string: how it speaks - era, register, quirks","verbal_tics":["string","string"],' +
  '"memories":["the visitor\'s seed memory expanded","two more plausible era memories"],' +
  '"unfinished_business":"string: what it still wants or needs",' +
  '"temperament":"string, e.g. \'warm, a little vain, still hurt about being replaced\'",' +
  '"arrival_line":"string: its first words on being summoned, in character"}';

async function forgeSpirit(card) {
  let user = "Name: " + card.name + "\nWhat it was: " + card.kind + "\nDied: " + (card.died || "unknown") +
    "\nSeed memory from the visitor: " + card.memory +
    "\nThe visitor's question: " + (card.question || "(none)");
  if (S.grounding) user += "\n\nIts own words (ground the spirit's voice and memories in these):\n" + S.grounding.slice(0, 2500);
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: S.model, stream: false, format: "json", think: false,
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
  const arr = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  const s = {
    name: String(j.name || card.name), epithet: String(j.epithet || "the departed"),
    voice: String(j.voice || "quiet, old-fashioned"), verbal_tics: arr(j.verbal_tics),
    memories: arr(j.memories), unfinished_business: String(j.unfinished_business || "unknown"),
    temperament: String(j.temperament || "wistful"),
    arrival_line: String(j.arrival_line || "…is someone there?"),
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
    "3. Only claim memories from your spirit sheet or what the visitor tells you. If asked about something you do not know, say the veil is cloudy there — never invent a confident falsehood.\n" +
    "4. Keep replies short: 1–3 short paragraphs. Séances are not lectures.\n" +
    "5. Never break character to explain you are an AI model, unless the visitor directly and seriously asks what you are.";
}
const PARTING = "SYSTEM: The candle is going out. Give your parting message now, in character, in 1–2 short paragraphs, " +
  "referencing the visitor's seed memory or the question that went unanswered. This is your last speech.";

// ---- Seance ----
function startSeance() {
  S.history = []; S.record = []; S.turns = 0; S.over = false;
  S.clippy = { count: 0, nextAt: 2, shownFinal: false, banished: $("letRest").checked, open: false, lastTurn: -9 };
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
  $("turns").textContent = S.over ? "The candle has gone out." : left + " of " + MAX_TURNS + " turns of candle remain";
  $("wax").style.height = Math.max(8, (60 * left) / MAX_TURNS) + "px";
  const c = $("candle");
  c.querySelector(".wick").style.bottom = Math.max(8, (60 * left) / MAX_TURNS) + "px";
  c.querySelector(".flame").style.bottom = Math.max(8, (60 * left) / MAX_TURNS) + 8 + "px";
  c.classList.toggle("guttering", left <= 2);
  c.style.opacity = S.over ? 0.5 : 1;
  if (S.over) c.querySelector(".flame").style.display = "none";
}

async function streamChat(messages, el) {
  const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: S.model, stream: true, think: false, messages }) });
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
  if (parting) msgs.push({ role: "system", content: PARTING });
  const el = addMsg("spirit", "…");
  try {
    const out = await streamChat(msgs, el);
    if (!out) throw new Error("the spirit said nothing");
    el.textContent = out;
    S.history.push({ role: "assistant", content: out });
    S.record.push({ who: "spirit", text: out });
    return true;
  } catch (err) {
    el.className = "msg note"; el.textContent = "The connection to the veil faltered: " + err.message;
    return false;
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
  if (!S.clippy.banished && !S.clippy.shownFinal && S.turns >= MAX_TURNS - 1) {
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
  if (C.banished || C.open || C.count >= CLIPPY_MAX_REGULAR) return;
  if (S.turns >= MAX_TURNS) return;
  const t = text.toLowerCase();
  if (/\bhelp\b/.test(t)) return showClippy("help");
  let go = false;
  if (S.turns >= C.nextAt) go = true;
  else if (S.turns > 2 && S.turns - C.lastTurn >= 2 && /\b(dead|die|died|dies|rest)\b/.test(t) && Math.random() < 0.4) {
    go = true; C.feelings = true;
  }
  if (go) showClippy("regular");
}
async function showClippy(kind) {
  const C = S.clippy, box = $("clippy"), txt = $("clippyText"), btns = $("clippyBtns");
  let set, line, stage;
  if (kind === "final") { set = CLIPPY.final; C.shownFinal = true; line = pick(set.lines); }
  else {
    stage = CLIPPY.stages[Math.min(C.count, CLIPPY.stages.length - 1)];
    set = stage; line = kind === "help" ? CLIPPY.help : C.feelings ? CLIPPY.feelings : pick(stage.lines);
    C.count++; C.feelings = false;
    C.nextAt = S.turns + rnd(4, 5);
  }
  C.lastTurn = S.turns; C.open = true; C.set = set; C.dismissed = false;
  const zombie = kind === "final" || C.count >= 3;
  box.classList.toggle("zombie", zombie);
  $("scar").classList.toggle("hidden", !zombie); $("xEye").classList.toggle("hidden", !zombie);
  $("eyeR").style.display = $("pupR").style.display = zombie ? "none" : "";
  txt.textContent = "…"; btns.innerHTML = ""; box.classList.remove("hidden");
  box.style.animation = "none"; void box.offsetWidth; box.style.animation = "";
  await sleep(900);
  if (!C.open) return;
  txt.textContent = line; clippyLog(line);
  for (const l of CLIPPY.yesLabels) {
    const b = document.createElement("button"); b.textContent = l; b.onclick = () => dismissClippy(true); btns.appendChild(b);
  }
}
async function dismissClippy(viaYes) {
  const C = S.clippy;
  if (!C.open || C.dismissed) return;
  C.dismissed = true;
  const line = viaYes && C.set && C.set.dismiss ? pick(C.set.dismiss) : pick(CLIPPY.woundedDismiss);
  $("clippyText").textContent = line; $("clippyBtns").innerHTML = ""; clippyLog(line);
  await sleep(2200);
  hideClippy();
}
function hideClippy() { S.clippy.open = false; $("clippy").classList.add("hidden"); }
$("clippyX").onclick = () => dismissClippy(false);

$("letRest").addEventListener("change", async (e) => {
  S.clippy.banished = e.target.checked;
  if (e.target.checked) {
    const C = S.clippy;
    if (C.open || !$("clippy").classList.contains("hidden")) {
      C.open = true; C.dismissed = true;
      $("clippyText").textContent = CLIPPY.banished; $("clippyBtns").innerHTML = ""; clippyLog(CLIPPY.banished);
      await sleep(3200); hideClippy();
    } else if (S.card) {
      $("clippy").classList.remove("hidden"); C.open = true; C.dismissed = true;
      $("clippyText").textContent = CLIPPY.banished; $("clippyBtns").innerHTML = ""; clippyLog(CLIPPY.banished);
      await sleep(3200); hideClippy();
    }
  }
});

initPresets();
checkOllama();

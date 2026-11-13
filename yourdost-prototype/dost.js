/* =====================================================================
   Dost · YourDOST wellbeing guide (Task 3)
   A 2-minute spoken check-in that finds the right next step among
   assessment, self-help, wellbeing programs and counselling.

   Voice is open source and runs on the user's device (audio never leaves it):
     · Speech to text: OpenAI Whisper (MIT) via Transformers.js, in a Web Worker
     · Voice: Kokoro-82M (Apache-2.0) via kokoro-js, in a Web Worker (model cached by the browser)
     · End of speech: energy-based voice activity detection on the mic stream
     Fallbacks: the browser's own voice while Kokoro downloads, for Hindi, or if the device is too slow; typing and tap answers always work.
   Conversation: the "dost" edge function (LLM) asks naturally and reads free text.
     If it is unreachable, the same questions run from fixed rules on the device.
   Scoring: PHQ-4 (validated, 0–12) + one safety question, by fixed rules (never by the AI):
     safety yes or score ≥ 9 → high · 6–8 → medium · 0–5 → low
   ===================================================================== */
(() => {
const DOST_API = 'https://zzkppvuedkkcdocmisje.supabase.co/functions/v1/dost';
const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

/* ---------------- the check-in (same as the server) ---------------- */
const FREQ = ['Not at all', 'Some days', 'Most days', 'Nearly every day'];
const Q = {
  concern: { ask: "What's been on your mind lately?", chips: ['Work stress', 'Can’t sleep', 'Feeling low', 'Anxious', 'Relationships'] },
  i0: { ask: 'Over the last two weeks, how often have you had little interest or joy in doing things?', chips: FREQ },
  i1: { ask: 'And how often have you felt down, low or hopeless?', chips: FREQ },
  i2: { ask: 'How often have you felt nervous, anxious or on edge?', chips: FREQ },
  i3: { ask: 'And how often have you not been able to stop worrying?', chips: FREQ },
  safety: { ask: 'One last question, and we ask everyone this. Lately, have you had thoughts of hurting yourself, or that you would be better off not here?', chips: ['No', 'Sometimes', 'Often', 'I’d rather not say'] },
};
const ORDER = ['concern', 'i0', 'i1', 'i2', 'i3', 'safety'];
const RISK = /(kill myself|end (it all|my life)|suicid|don'?t want to (live|be here|exist|wake up)|not want to be here|hurt(ing)? myself|self[- ]?harm|cut myself|no reason to live|better off (dead|without me|not here)|don'?t see the point (anymore|of living)|want to disappear|marna chaht|mar jaana|jeena nahi|khud ko (nuksan|khatam)|आत्महत्या|मरना चाहता|मरना चाहती|जीना नहीं)/i;
const TAGRE = {
  work: /work|office|job|boss|manager|deadline|meeting|workload|appraisal|client|overtime|burn ?out|kaam|naukri|दफ़्तर|काम/i,
  sleep: /sleep|insomnia|awake at night|tired|exhausted|neend|so nahi|नींद/i,
  low: /\bsad\b|\blow\b|down|depress|hopeless|empty|numb|\bcry|no energy|nothing matters|udaas|dukhi|mann? nahi|उदास|दुखी/i,
  anx: /anxi|worr|overthink|panic|nervous|restless|on edge|tension|stress|ghabrah|dar lag|चिंता|घबराहट|तनाव/i,
  rel: /partner|boyfriend|girlfriend|husband|wife|marriage|break ?up|relationship|fight|argument|shaadi/i,
  family: /family|parents|in-laws|mother|father|ghar|परिवार|घर/i,
  lonely: /lonely|alone|no friends|isolated|new city|akela|akeli|अकेला|अकेली/i,
  exams: /exam|studies|study|college|marks|grades|padhai|पढ़ाई/i,
  career: /career|future|promotion|job hunt|switch jobs|growth/i,
};
const norm = t => String(t).replace(/[‘’ʼ`´]/g, "'");
const isRisk = t => RISK.test(norm(t));
function freq(t) {
  const x = norm(t).toLowerCase().trim();
  if (/nearly every ?day|every ?day|all the time|always|daily|roz|hamesha|har din|रोज़|रोज|हमेशा/.test(x)) return 3;
  if (/most days|more than half|often|mostly|a lot|zyada(tar)?|aksar|ज़्यादातर|अक्सर/.test(x)) return 2;
  if (/some days|several days|sometimes|few days|occasionally|kabhi ?kabhi|कभी/.test(x)) return 1;
  if (/^(no|nope|never|not at all|nahi|bilkul nahi|नहीं)\b/.test(x) || /not at all|never/.test(x)) return 0;
  return null;
}
function safetyAns(t) {
  const x = norm(t).toLowerCase().trim();
  if (/rather not|don'?t want to say|skip|pass/.test(x)) return 'skip';
  if (/^(yes|yeah|sometimes|often|haan|ha\b|kabhi|हाँ|हां)/.test(x)) return 'yes';
  if (/^(no|nope|never|not really|nahi|bilkul nahi|नहीं)\b/.test(x)) return 'no';
  return null;
}
const tagsFrom = t => Object.keys(TAGRE).map(k => [k, t.search(TAGRE[k])]).filter(x => x[1] >= 0).sort((x, y) => x[1] - y[1]).map(x => x[0]).slice(0, 3); // first-mentioned first
const nextKey = s => ORDER.find(k => k === 'concern' ? !s.concern : k === 'safety' ? s.safety === null : s.items[+k[1]] === null) || null;
function decide(s) {
  const score = s.items.reduce((a, b) => a + (b ?? 0), 0);
  return { score, priority: s.safety === 'yes' ? 'high' : score >= 9 ? 'high' : score >= 6 ? 'medium' : 'low' };
}
const HELLO = "Hi Riya, I'm Dost. I'm not a doctor, just here to help you find the right support. It takes about two minutes. What's been on your mind lately?";
const blank = () => ({ tags: [], concern: '', items: [null, null, null, null], safety: null, asked: 'concern', turns: 0 });

/* the same conversation from fixed rules, used when the AI service can't be reached */
function localTurn(s0, text) {
  const s = JSON.parse(JSON.stringify(s0)); s.turns++;
  let prefix = '';
  if (s.asked === 'concern') {
    s.tags = [...new Set([...tagsFrom(text), ...s.tags])].slice(0, 3);
    s.concern = text.slice(0, 120);
    prefix = 'Thank you for sharing that. ';
  } else if (/^i\d$/.test(s.asked)) {
    const f = freq(text);
    if (f === null) return { state: s, say: 'Sorry, I didn’t quite catch that. ' + Q[s.asked].ask, chips: Q[s.asked].chips, done: false };
    s.items[+s.asked[1]] = f;
  } else if (s.asked === 'safety') {
    const a = safetyAns(text);
    if (!a) return { state: s, say: 'Sorry, I didn’t quite catch that. ' + Q.safety.ask, chips: Q.safety.chips, done: false };
    s.safety = a;
  }
  const n = nextKey(s);
  if (!n || s.safety === 'yes') return { state: { ...s, asked: null }, say: s.safety === 'yes' ? "Thank you for telling me. You don't have to carry this alone. Let's get you to a real person right now." : 'Thank you, that really helps. I have a plan for you.', chips: [], done: true };
  s.asked = n;
  return { state: s, say: prefix + Q[n].ask, chips: Q[n].chips, done: false };
}

/* =====================================================================
   VOICE ENGINE (on-device, open source)
   ===================================================================== */
const ASR_WORKER = `
import { pipeline, env } from '${TJS}';
env.allowLocalModels = false;
let asr;
self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    try {
      let gpu = false;
      try { gpu = !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch {}
      const model = gpu ? 'onnx-community/whisper-base' : 'Xenova/whisper-tiny';
      const files = {};
      asr = await pipeline('automatic-speech-recognition', model, {
        device: gpu ? 'webgpu' : 'wasm',
        dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.file) { files[p.file] = [p.loaded || 0, p.total || 0];
            const v = Object.values(files); const l = v.reduce((a, b) => a + b[0], 0), t = v.reduce((a, b) => a + b[1], 0);
            self.postMessage({ type: 'progress', pct: t ? Math.round(l / t * 100) : 0 }); }
        },
      });
      self.postMessage({ type: 'ready', device: gpu ? 'webgpu' : 'wasm', model });
    } catch (e) { self.postMessage({ type: 'error', error: String(e && e.message || e) }); }
  }
  if (data.type === 'transcribe') {
    try {
      const out = await asr(data.audio, { language: data.lang, task: 'transcribe', chunk_length_s: 30 });
      self.postMessage({ type: 'text', id: data.id, text: (out.text || '').trim() });
    } catch (e) { self.postMessage({ type: 'text', id: data.id, text: '', error: String(e && e.message || e) }); }
  }
};`;
/* Voice out: Kokoro-82M (Apache-2.0) via kokoro-js, in its own worker; the model stays loaded between sentences */
const KJS = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
const TTS_WORKER = `
import { KokoroTTS } from '${KJS}';
let tts;
const hi = [], lo = []; let busy = false;
async function pump() {
  if (busy) return; busy = true;
  while (hi.length || lo.length) {
    const job = hi.length ? hi.shift() : lo.shift();
    try {
      const t0 = performance.now();
      const a = await tts.generate(job.text, { voice: 'af_heart', speed: 0.95 });
      self.postMessage({ type: 'audio', id: job.id, audio: a.audio, sr: a.sampling_rate, ms: performance.now() - t0 }, [a.audio.buffer]);
    } catch (e) { self.postMessage({ type: 'audio', id: job.id, error: String(e && e.message || e) }); }
  }
  busy = false;
}
self.onmessage = async ({ data }) => {
  if (data.type === 'load') {
    try {
      const files = {};
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.file) { files[p.file] = [p.loaded || 0, p.total || 0];
            const v = Object.values(files); const l = v.reduce((a, b) => a + b[0], 0), t = v.reduce((a, b) => a + b[1], 0);
            self.postMessage({ type: 'progress', pct: t ? Math.round(l / t * 100) : 0 }); }
        } });
      self.postMessage({ type: 'ready' });
    } catch (e) { self.postMessage({ type: 'error', error: String(e && e.message || e) }); }
  }
  if (data.type === 'speak') { (data.prio ? hi : lo).push(data); pump(); }   // what Dost says now goes before pre-generation
};`;
const workerFrom = code => new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' });

const V = {
  asr: 'idle', asrPct: 0, asrDevice: '', tts: 'idle', ttsPct: 0,
  listening: false, speaking: false, thinking: false, level: 0, micOk: null,
  _asrW: null, _ttsW: null, rtf: 0, ttsSlow: false, _warm: 0, _jobs: new Map(), _id: 0, _ctx: null, _stream: null, _node: null, _audio: null,
};
const stateLabel = () => V.speaking ? 'Dost is speaking' : V.thinking ? 'Thinking…' : V.listening ? 'Listening… take your time' : '';

function loadVoice() {
  if (V.asr === 'idle' && window.Worker) {
    V.asr = 'loading'; V._asrW = workerFrom(ASR_WORKER);
    V._asrW.onmessage = ({ data }) => {
      if (data.type === 'progress') { V.asrPct = data.pct; paintStatus(); }
      if (data.type === 'ready') { V.asr = 'ready'; V.asrDevice = data.device; paintStatus(); if (D.mode === 'voice' && !V.speaking && !D.busy && S.c.screen === 'dost' && !D.done) listen(); }
      if (data.type === 'error') { V.asr = 'error'; console.warn('ASR', data.error); paintStatus(); }
      if (data.type === 'text') { const r = V._jobs.get(data.id); V._jobs.delete(data.id); r && r(data.text); }
    };
    V._asrW.onerror = e => { V.asr = 'error'; console.warn('ASR worker', e.message); paintStatus(); };
    V._asrW.postMessage({ type: 'load' });
  }
  if (V.tts === 'idle' && window.Worker) {
    V.tts = 'loading'; V._ttsW = workerFrom(TTS_WORKER);
    V._ttsW.onmessage = ({ data }) => {
      if (data.type === 'progress') { V.ttsPct = data.pct; paintStatus(); }
      if (data.type === 'ready') { V.tts = 'ready'; paintStatus(); prefetchVoice(); }
      if (data.type === 'error') { V.tts = 'error'; console.warn('TTS', data.error); paintStatus(); }
      if (data.type === 'audio') { const r = V._jobs.get(data.id); V._jobs.delete(data.id); r && r(data); }
    };
    V._ttsW.onerror = e => { V.tts = 'error'; console.warn('TTS worker', e.message); };
    V._ttsW.postMessage({ type: 'load' });
  }
}

/* ---- speaking: Kokoro on device; the browser's voice until it has loaded, for Hindi, or on slow devices ---- */
const clean = t => String(t).replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '').replace(/\s+/g, ' ').trim();
function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch {}
  if (V._audio) { try { V._audio.stop(); } catch {} V._audio = null; }
  V.speaking = false;
}
async function speak(text) {
  if (!D.voiceOut || D.mode !== 'voice') return;
  stopListening(true); stopSpeaking();
  text = clean(text); if (!text) return;
  V.speaking = true; paintStatus();
  const hindi = D.lang === 'hi';
  try {
    if (V.tts === 'ready' && !hindi && !V.ttsSlow) {
      // sentence by sentence: the first one plays while the next is being made
      const parts = text.match(/[^.!?]+[.!?]*/g).map(x => x.trim()).filter(Boolean);
      const jobs = parts.map(p => () => synth(p, true));
      let next = jobs[0](), ok = true;
      for (let i = 0; i < parts.length && V.speaking; i++) {
        const res = await Promise.race([next, new Promise(r => setTimeout(() => r({ slow: true }), 6000))]);
        if (res.slow || res.error) { ok = false; await browserSay(parts.slice(i).join(' '), 'en-IN'); break; }
        if (i + 1 < parts.length) next = jobs[i + 1]();
        await playPCM(res.audio, res.sr);
      }
      V.speaking = false; paintStatus(); return;
    }
    await browserSay(text, hindi ? 'hi-IN' : 'en-IN');
  } catch (e) { console.warn('speak', e); }
  V.speaking = false; paintStatus();
}
/* Kokoro audio, cached by sentence; Dost's fixed questions are made in the background once the voice loads.
   If this device makes speech slower than real time, Dost keeps one voice: the browser's, for the whole session. */
const CACHE = new Map();
function synth(text, prio) {
  if (CACHE.has(text)) return CACHE.get(text);
  const p = new Promise(r => { const id = ++V._id; V._jobs.set(id, r); V._ttsW.postMessage({ type: 'speak', id, text, prio: !!prio }); })
    .then(res => {
      if (res.error) { CACHE.delete(text); return res; }
      const rtf = res.ms / 1000 / (res.audio.length / res.sr);
      if (V._warm++ > 0) { V.rtf = V.rtf ? V.rtf * 0.6 + rtf * 0.4 : rtf; if (V.rtf > 1.3) V.ttsSlow = true; } // the first sentence includes warm-up
      return { audio: res.audio, sr: res.sr };
    });
  CACHE.set(text, p);
  return p;
}
async function prefetchVoice() {
  const lines = [HELLO, ...Object.values(Q).map(q => q.ask), 'Thank you, that really helps. I have a plan for you.', 'Thank you for sharing that.']
    .flatMap(t => t.match(/[^.!?]+[.!?]*/g).map(x => x.trim()));
  for (const l of lines) { if (V.tts !== 'ready' || V.ttsSlow) return; await synth(l); }
}
function playPCM(pcm, sr) {
  return new Promise(res => {
    const ctx = audioCtx(); const buf = ctx.createBuffer(1, pcm.length, sr); buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
    src.onended = () => { if (V._audio === src) V._audio = null; res(); }; V._audio = src; src.start();
  });
}
function browserSay(text, lang) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = 0.98; u.pitch = 1.02;
    const vs = speechSynthesis.getVoices();
    const v = vs.find(x => x.lang === lang && /female|heera|swara|kalpana|neerja/i.test(x.name)) || vs.find(x => x.lang === lang) || vs.find(x => x.lang.startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    u.onend = u.onerror = () => res();
    speechSynthesis.speak(u);
    setTimeout(res, 2500 + text.length * 90); // some browsers never fire onend
  });
}
function audioCtx() {
  if (!V._ctx || V._ctx.state === 'closed') V._ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (V._ctx.state === 'suspended') V._ctx.resume();
  return V._ctx;
}

/* ---- listening: mic → voice activity detection → Whisper on device ---- */
async function micOn() {
  if (V._stream) return true;
  try {
    V._stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    V.micOk = true;
    const ctx = audioCtx(), src = ctx.createMediaStreamSource(V._stream);
    const node = ctx.createScriptProcessor(2048, 1, 1);
    src.connect(node); node.connect(ctx.destination);
    node.onaudioprocess = e => { const d = e.inputBuffer.getChannelData(0); e.outputBuffer.getChannelData(0).fill(0); onFrame(d, ctx.sampleRate); };
    V._node = node;
    return true;
  } catch (e) { V.micOk = false; console.warn('mic', e); return false; }
}
let REC = null;
function onFrame(d, sr) {
  let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
  const rms = Math.sqrt(sum / d.length), ms = d.length / sr * 1000;
  V.level = V.level * 0.7 + rms * 0.3; paintLevel();
  if (!REC) return;
  REC.pre.push(new Float32Array(d)); if (REC.pre.length > Math.ceil(400 / ms)) REC.pre.shift();
  REC.t += ms;
  if (REC.t < 350) { REC.floor = Math.max(REC.floor, rms); return; }    // learn the room's noise
  const th = Math.max(0.012, REC.floor * 2.6);
  if (rms > th) { if (!REC.started) { REC.started = true; REC.chunks.push(...REC.pre); } REC.speech += ms; REC.silence = 0; }
  else if (REC.started) REC.silence += ms;
  if (REC.started) REC.chunks.push(new Float32Array(d));
  if (REC.started && REC.speech > 350 && REC.silence > 1300) return endRec(true, sr);
  if (REC.started && REC.t > 25000) return endRec(true, sr);
  if (!REC.started && REC.t > 9000) return endRec(false, sr);
}
async function listen() {
  if (D.mode !== 'voice' || V.speaking || D.busy || D.done) return;
  if (!(await micOn())) { D.mode = 'text'; toast('Mic is blocked. You can type instead.'); render(); return; }
  if (V.asr !== 'ready') { paintStatus(); return; }               // listening starts once Whisper is ready
  REC = { pre: [], chunks: [], t: 0, floor: 0, started: false, speech: 0, silence: 0 };
  V.listening = true; paintStatus();
}
function stopListening(discard) { if (REC && !discard) endRec(true, audioCtx().sampleRate); REC = null; V.listening = false; paintStatus(); }
async function endRec(keep, sr) {
  const r = REC; REC = null; V.listening = false; paintStatus();
  if (!keep || !r || !r.started) { paintStatus('Tap the mic when you’re ready'); return; }
  const n = r.chunks.reduce((a, c) => a + c.length, 0), pcm = new Float32Array(n);
  let o = 0; for (const c of r.chunks) { pcm.set(c, o); o += c.length; }
  const audio = resample(pcm, sr, 16000);
  V.thinking = true; paintStatus(); paintCaption('…');
  const id = ++V._id;
  const text = await new Promise(res => { V._jobs.set(id, res); V._asrW.postMessage({ type: 'transcribe', id, audio, lang: D.lang === 'hi' ? 'hindi' : 'english' }, [audio.buffer]); });
  V.thinking = false; paintCaption('');
  const t = (text || '').replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
  if (!t || /^(thank you|thanks for watching|you|bye)[.!]?$/i.test(t)) { paintStatus('Sorry, I didn’t catch that. Tap the mic to try again.'); return; }
  send(t);
}
function resample(x, from, to) {
  if (from === to) return x;
  const ratio = from / to, n = Math.floor(x.length / ratio), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * ratio, a = Math.floor(p), f = p - a; y[i] = x[a] * (1 - f) + (x[a + 1] ?? x[a]) * f; }
  return y;
}
function micOff() {
  REC = null; V.listening = false;
  if (V._node) { try { V._node.disconnect(); } catch {} V._node = null; }
  if (V._stream) { V._stream.getTracks().forEach(t => t.stop()); V._stream = null; }
}

/* =====================================================================
   CONVERSATION
   ===================================================================== */
const D = { mode: null, voiceOut: true, lang: 'en', msgs: [], state: blank(), chips: [], busy: false, done: false, live: null, result: null, plan: null, check: null };
window.DOST = D;

async function start(mode) {
  stopSpeaking(); micOff();
  Object.assign(D, { mode, msgs: [], state: blank(), chips: [], busy: false, done: false, result: null, check: null });
  if (mode === 'voice') { loadVoice(); micOn(); }                   // the tap gives mic permission
  const hello = HELLO;
  D.msgs.push({ role: 'assistant', content: hello }); D.chips = Q.concern.chips;
  S.c.screen = 'dost'; render();
  fetch(DOST_API).catch(() => {});                                    // wake the backend
  await speak(hello);
  listen();
}

async function callAI() {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 13000);
  try {
    const r = await fetch(DOST_API, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: D.msgs.slice(-14), state: D.state }) });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.state && typeof j.say === 'string' ? j : null;
  } catch { clearTimeout(t); return null; }
}

async function send(text) {
  text = String(text || '').trim(); if (!text || D.busy || D.done) return;
  stopSpeaking(); stopListening(true);
  D.msgs.push({ role: 'user', content: text }); D.chips = []; D.busy = true; render();
  let r;
  if (isRisk(text)) r = { state: { ...D.state, safety: 'yes', asked: null }, say: "Thank you for telling me. You don't have to carry this alone. Let's get you to a real person right now.", chips: [], done: true };
  else {
    r = await callAI();
    D.live = !!r; paintAI();
    if (!r) r = localTurn(D.state, text);
  }
  D.state = r.state; D.busy = false; D.chips = r.chips || [];
  D.msgs.push({ role: 'assistant', content: r.say });
  if (r.done) { D.done = true; D.result = decide(D.state); D.plan = buildPlan(); }
  render();
  await speak(r.say);
  if (D.done) { micOff(); setTimeout(() => { if (S.c.screen === 'dost') { S.c.screen = D.result.priority === 'high' ? 'dosthigh' : 'dostplan'; render(); window.scrollTo({ top: 0 }); } }, 700); }
  else listen();
}

/* ---------------- plan: the right category, in the right order ---------------- */
function profileFromDost() {
  const st = D.state, p = blankProfile();
  p.concerns = (st.tags.length ? st.tags : ['low']).slice(0, 3);
  p.mood = st.items.map(v => v ?? 0);
  p.safety = st.safety === 'yes' ? 'yes' : 'no'; p.safetyAns = st.safety === 'yes' ? 'some' : 'no';
  p.lang = D.lang === 'hi' ? 'Hindi' : 'English'; p.mode = 'video';
  return p;
}
function buildPlan() {
  const pr = D.result.priority, p = profileFromDost();
  const plan = { priority: pr, ex: CAT.exerciseFor(p.concerns), pg: CAT.programFor(p.concerns), concerns: p.concerns, summary: D.state.concern, booked: false, quick: false, score: D.result.score };
  if (pr === 'high') {
    const pool = T.filter(t => t.clinical && t.langs.includes(p.lang)).sort((a, b) => a.load / a.cap - b.load / b.cap);
    plan.oncall = (pool[0] || T.find(t => t.clinical) || T[0]).id;
  } else {
    const r = runMatch(p, []); const best = r.top[0] && r.top[0].t;
    if (best) {
      const slots = openSlots(best); const s = slots.find(x => x.hf <= 48) || slots[0];
      plan.tid = best.id; plan.slot = s ? `${s.d}-${s.h}` : null; plan.results = r;
    }
  }
  return plan;
}

/* =====================================================================
   SCREENS
   ===================================================================== */
const esc2 = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MIC = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const LEVEL_TXT = { low: ['Light support', 'Small daily steps should help. I’ll check in with you on day 7.', 'g-green'],
  medium: ['Extra support', 'Let’s start something small now, and get you a counsellor within 2 days.', 'g-orange'] };

CS.dost = () => {
  const qn = ORDER.indexOf(D.state.asked), done = D.done ? 6 : Math.max(0, qn);
  return `<div class="phead">${back('home', 'Close')}<div style="text-align:center;flex:1"><b>Dost</b><div class="tiny muted">Wellbeing guide · not a doctor</div></div>
    <button class="iconbtn" data-act="d-lang" aria-label="Switch language" style="font-size:12.5px;width:auto;padding:0 12px;border-radius:999px">${D.lang === 'hi' ? 'हिंदी' : 'EN'}</button></div>
  <div class="progress" aria-label="Question ${Math.min(done + 1, 6)} of 6">${ORDER.map((_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</div>
  <div class="dost-stage">
    <button class="dost-orb ${V.speaking ? 'speaking' : V.listening ? 'listening' : V.thinking || D.busy ? 'thinking' : ''}" id="dorb" data-act="d-mic" aria-label="${V.listening ? 'Stop listening' : 'Talk'}"><span id="dlevel"></span></button>
    <div class="dost-status" id="dstatus" aria-live="polite">${esc2(statusText())}</div>
    <div class="dost-caption" id="dcap"></div>
  </div>
  <div class="dost-log" id="dlog" aria-live="polite">${D.msgs.map(m => `<div class="bub ${m.role === 'user' ? 'u' : 'd'}">${esc2(m.content)}</div>`).join('')}${D.busy ? '<div class="bub d"><span class="typing"><i></i><i></i><i></i></span></div>' : ''}</div>
  ${D.chips.length && !D.busy ? `<div class="dost-chips">${D.chips.map(c => `<button class="chipbtn" data-act="d-chip" data-v="${esc2(c)}">${esc2(c)}</button>`).join('')}</div>` : ''}
  ${D.done ? '' : `<form class="dost-input" id="dform" autocomplete="off">
    <button type="button" class="dmic ${V.listening ? 'on' : ''}" data-act="d-mic" aria-label="${V.listening ? 'Stop listening' : 'Speak'}">${MIC}</button>
    <input id="dtext" placeholder="${D.mode === 'voice' ? 'Or type here…' : 'Type how you feel…'}" aria-label="Your answer" maxlength="600">
    <button class="dsend" aria-label="Send">${SEND}</button></form>`}
  <p class="tiny muted" style="text-align:center">🔒 Your voice is turned into text on your phone. Your company never sees this.</p>`;
};
function statusText() {
  if (D.done) return 'Making your plan…';
  if (D.mode === 'voice') {
    if (V.micOk === false) return 'Mic is off. You can type or tap an answer.';
    if (V.asr === 'loading') return `Getting voice ready on your phone… ${V.asrPct}% (one time)`;
    if (V.asr === 'error') return 'Voice isn’t available on this device. Type or tap an answer.';
    return stateLabel() || 'Tap the circle to talk';
  }
  return 'Type, or tap an answer';
}
function paintStatus(msg) { const el = document.getElementById('dstatus'); if (el) el.textContent = msg || statusText();
  const o = document.getElementById('dorb'); if (o) o.className = 'dost-orb ' + (V.speaking ? 'speaking' : V.listening ? 'listening' : V.thinking || D.busy ? 'thinking' : '');
  document.querySelectorAll('.dmic').forEach(b => b.classList.toggle('on', V.listening)); }
function paintLevel() { const el = document.getElementById('dlevel'); if (el) el.style.transform = `scale(${1 + Math.min(0.5, V.level * 9)})`; }
function paintCaption(t) { const el = document.getElementById('dcap'); if (el) el.textContent = t; }
function paintAI() { const el = document.getElementById('aistat'); if (el) { el.hidden = D.live === null; el.textContent = D.live ? 'AI live' : 'AI offline · rules'; el.className = 'tag ' + (D.live ? 'lime' : 'amber'); } }

CS.dostplan = () => {
  const P = D.plan; if (!P) return CS.home();
  const [title, line, g] = LEVEL_TXT[P.priority];
  const heard = P.concerns.map(c => CL[c]).filter(Boolean);
  const t = P.tid ? TX[P.tid] : null;
  const step = (n, when, what, sub, btn, done) => `<div class="pstep ${done ? 'done' : ''}"><span class="pnum">${done ? '✓' : n}</span><div style="flex:1;min-width:0"><span class="lbl">${when}</span><b>${what}</b>${sub ? `<div class="tiny muted">${sub}</div>` : ''}${btn || ''}</div></div>`;
  const steps = [step('✓', 'Done', 'Check-in with Dost', 'Your answers stay private', '', true)];
  const X = CAT.EX[P.ex], G = CAT.PG[P.pg], day = CAT.prog().pg[P.pg] || 0;
  const exBtn = `<button class="btn sm" style="margin-top:8px" data-act="c-ex" data-id="${P.ex}">${P.quick ? 'Do it again' : 'Start now'}</button>`;
  const pgBtn = `<button class="btn sm" style="margin-top:8px" data-act="c-pg" data-id="${P.pg}">${day ? 'Continue' : 'Start day 1'}</button>`;
  if (P.priority === 'medium') {
    steps.push(step(1, `Now · ${X.mins} minutes · self-help`, X.name, X.why, exBtn, P.quick));
    if (t) steps.push(step(2, 'Within 2 days · counselling', `Session with ${esc2(t.name)}`, `${t.title} · ${P.slot ? slotLabel(...P.slot.split('-').map(Number)) : 'we’ll find a time'}`, P.booked ? '' : `<button class="btn sm" style="margin-top:8px" data-act="d-book">Book this time</button> <button class="link" data-act="d-others" style="margin-left:6px">See others</button>`, P.booked));
    steps.push(step(3, 'While you wait · program', G.name, `${G.blurb} · ${day}/7 days done`, pgBtn, day >= 7));
    steps.push(step(4, 'In 24–48 hours', 'Dost checks in', 'Not feeling better? We’ll bring your session forward.'));
  } else {
    steps.push(step(1, `Today · Day ${Math.min(day + 1, 7)} of 7 · program`, G.name, `${G.blurb} · 10 min a day`, pgBtn, day >= 7));
    steps.push(step(2, `Anytime · ${X.mins} min · self-help`, X.name, X.why, exBtn, P.quick));
    steps.push(step(3, 'Day 7', 'Dost checks in', 'Not better? We’ll connect you to the right counsellor.'));
  }
  return `<div class="phead">${back('home')}<span class="tag">${P.priority === 'medium' ? 'Plan · extra support' : 'Plan · light support'}</span></div>
  <div class="blob ${g}" style="display:grid;gap:8px;min-height:170px;align-content:end"><span class="lbl">Your plan, Riya</span><h1 style="color:#fff">${title}</h1><p style="color:#fff">${line}</p></div>
  ${heard.length ? `<div><span class="lbl">What I heard</span><div class="tags" style="margin-top:6px">${heard.map(h => `<span class="tag">${esc2(h)}</span>`).join('')}</div></div>` : ''}
  <div class="tile" style="display:grid;gap:4px">${steps.join('')}</div>
  ${P.priority === 'low' ? `<button class="link" data-act="d-others" style="justify-self:start">Want to talk to someone sooner? See counsellors</button>` : ''}
  <button class="link" data-act="ctab" data-v="help" style="justify-self:start">Need someone right now?</button>`;
};

CS.dosthigh = () => {
  const P = D.plan, t = TX[(P && P.oncall) || 't0'], called = P && P.called;
  return `<div class="phead">${back('home')}<span></span></div>
  <div class="blob g-pink" style="display:grid;gap:12px;min-height:250px;align-content:end">
    <h1 style="color:#fff">You don’t have to carry this alone.</h1>
    <p style="color:#fff">${called ? `${esc2(first(t.name))} is joining you now.` : `${esc2(t.name)}, ${esc2(t.title.toLowerCase())}, is free right now.`}</p>
    ${called ? '' : `<button class="btn white block" data-act="d-oncall">Talk to ${esc2(first(t.name))} now</button>`}
  </div>
  ${called ? `<div class="callout">Connecting… usually under 2 minutes. Stay with us.<br><span class="tiny muted">${esc2(first(t.name))} can see what you shared with Dost, so you don’t have to repeat it.</span></div>` : ''}
  <a class="tile stack" href="tel:14416" style="gap:4px;text-decoration:none;color:inherit"><b>Tele-MANAS · 14416</b><span class="small muted">Free, 24×7, in your language.</span></a>
  <a class="tile stack" href="tel:112" style="gap:4px;text-decoration:none;color:inherit"><b>Emergency · 112</b><span class="small muted">If you’re in danger right now.</span></a>
  <button class="btn ghost block" data-act="cgo" data-to="home">I’m safe for now</button>`;
};

/* check-in a day or two later */
CS.dostcheck = () => {
  const C = D.check, P = D.plan;
  return `<div class="phead">${back('home')}<div style="text-align:center;flex:1"><b>Dost</b><div class="tiny muted">${P.priority === 'medium' ? '2 days later' : '7 days later'}</div></div><span style="width:38px"></span></div>
  <div class="dost-log" style="max-height:none">${C.msgs.map(m => `<div class="bub ${m.u ? 'u' : 'd'}">${esc2(m.t)}</div>`).join('')}</div>
  ${C.chips.length ? `<div class="dost-chips">${C.chips.map(([v, l]) => `<button class="chipbtn" data-act="d-check" data-v="${v}">${esc2(l)}</button>`).join('')}</div>` : ''}
  ${C.action || ''}`;
};
function checkSay(t) { D.check.msgs.push({ t }); render(); speak(t); }
function checkAnswer(v, label) {
  const C = D.check, P = D.plan, t = P.tid ? TX[P.tid] : null;
  C.msgs.push({ t: label, u: true }); C.chips = [];
  if (v === 'better') { C.action = `<button class="btn block" data-act="cgo" data-to="home">Back to home</button>`; return checkSay(P.priority === 'medium' ? `That’s really good to hear. Keep going, and your session with ${t ? first(t.name) : 'your counsellor'} is still on.` : 'That’s really good to hear. Keep going, and I’ll check in again at the end of the week.'); }
  if (v === 'worse') { C.chips = [['s-no', 'No'], ['s-yes', 'Sometimes'], ['s-yes', 'Often']]; return checkSay('I’m sorry it’s been harder. We ask everyone this: have you had thoughts of hurting yourself, or that you’d be better off not here?'); }
  if (v === 's-yes') { D.plan.priority = 'high'; if (!P.oncall) P.oncall = (T.find(x => x.clinical && x.langs.includes('English')) || T[0]).id; S.c.screen = 'dosthigh'; return render(); }
  // same, or worse without risk → step up
  if (P.priority === 'medium' && t) {
    const c = S.c, curH = c.bk ? hoursFrom(c.bk.d, c.bk.h) : 999;
    // earliest free time sooner than the booked one: same counsellor first, then the other good matches
    const pool = [t, ...((P.results && P.results.top) || []).map(x => x.t).filter(x => x.id !== t.id)];
    let pick = null;
    for (const x of pool) { const s = openSlots(x).find(s => s.hf < curH - 1); if (s && (!pick || s.hf < pick.s.hf - 6)) pick = { x, s }; if (pick && pick.x === t) break; }
    if (pick && c.bk) {
      const old = TX[c.bk.tid]; old.open.add(`${c.bk.d}-${c.bk.h}`);
      if (pick.x !== old) { old.load = Math.max(0, old.load - 1); pick.x.load++; }
      pick.x.open.delete(`${pick.s.d}-${pick.s.h}`); Object.assign(c.bk, { tid: pick.x.id, d: pick.s.d, h: pick.s.h }); P.tid = pick.x.id; P.slot = `${pick.s.d}-${pick.s.h}`;
      C.action = `<button class="btn block" data-act="cgo" data-to="home">See my session</button>`;
      return checkSay(pick.x === t
        ? `Thanks for telling me. Let’s not wait. I’ve moved your session with ${first(t.name)} to ${slotLabel(pick.s.d, pick.s.h)}.`
        : `Thanks for telling me. Let’s not wait. ${first(t.name)} has no earlier time, so I’ve booked ${first(pick.x.name)}, who also fits you, for ${slotLabel(pick.s.d, pick.s.h)}.`);
    }
    C.action = `<button class="btn block" data-act="d-nowchat">Chat with a counsellor now</button>`;
    return checkSay(`Thanks for telling me. Your session with ${first(t.name)} is the soonest one we have, so let’s not wait for it. A counsellor can chat with you right now.`);
  }
  C.action = `<button class="btn block" data-act="d-others">See counsellors who fit you</button>`;
  checkSay('Thanks for being honest. Let’s add a person to your plan. These counsellors fit what you told me.');
}

/* ---------------- home: Dost is the first door ---------------- */
const homeTask2 = CS.home, dashTask2 = CS.dash;
function planTile() {
  const P = D.plan; if (!P || P.priority === 'high') return '';
  const t = P.tid ? TX[P.tid] : null;
  return `<div class="tile stack" style="gap:8px"><div class="row between"><b>Your plan from Dost</b><span class="tag ${P.priority === 'medium' ? 'amber' : 'lime'}">${P.priority === 'medium' ? 'Extra support' : 'Light support'}</span></div>
    <span class="small">${P.priority === 'medium' ? `${esc2(CAT.EX[P.ex].name)}${P.quick ? ' ✓' : ''} · ${t ? (P.booked ? `${esc2(first(t.name))} booked` : `book ${esc2(first(t.name))}`) : 'counsellor'} · check-in in 2 days` : `${esc2(CAT.PG[P.pg].name)} · ${CAT.prog().pg[P.pg] || 0}/7 days · check-in on day 7`}</span>
    <div class="row"><button class="btn sm" data-act="cgo" data-to="dostplan">Open plan</button><button class="link" data-act="d-checkin">Prototype: jump to Dost’s check-in</button></div></div>`;
}
CS.home = () => {
  if (S.c.bk) return CS.dash();
  return `<div class="phead"><div><span class="muted small">Hi Riya,</span><h2>How are you today?</h2></div><div class="avatar" style="background:var(--green-deep)">R</div></div>
  ${planTile()}
  <div class="blob g-green" style="display:grid;gap:12px;min-height:${D.plan ? 230 : 300}px;align-content:end">
    <span class="lbl">Not sure what you need?</span>
    <h1 style="color:#fff">Talk to Dost for 2 minutes.</h1>
    <p class="small" style="color:#fff;opacity:.95">I’ll listen, ask a few questions and find the right support for you.</p>
    <div class="row"><button class="btn white" data-act="d-start" data-v="voice">${MIC} Talk to Dost</button><button class="btn" style="background:rgba(255,255,255,.22);color:#fff" data-act="d-start" data-v="text">Type instead</button></div>
    <span class="tiny" style="color:#fff;opacity:.9">Private · not a doctor · your voice stays on your phone</span>
  </div>
  <span class="lbl">Or explore on your own</span>
  <div class="grid4">
    <button class="tile4" data-act="c-filter2" data-v="as"><span class="dot k-assessment">✓</span><b>Assessments</b><span>3 quick checks</span></button>
    <button class="tile4" data-act="c-filter2" data-v="ex"><span class="dot k-selfhelp">🍃</span><b>Self-help</b><span>7 exercises</span></button>
    <button class="tile4" data-act="c-filter2" data-v="pg"><span class="dot k-program">🌱</span><b>Programs</b><span>5 seven-day paths</span></button>
    <button class="tile4" data-act="startcheck"><span class="dot k-counsellor">💬</span><b>Counselling</b><span>Find your match</span></button>
  </div>
  <div class="tile row between"><div><b class="small">Need to talk now?</b><p class="tiny muted">Someone is here, 24×7.</p></div><button class="btn ghost sm" data-act="ctab" data-v="help">Talk now</button></div>`;
};
CS.dash = () => { const html = dashTask2(); return D.plan && D.plan.priority === 'medium' ? html.replace('<div class="blob g-orange"', planTile() + '<div class="blob g-orange"') : html; };
CS.dashboard = CS.dash;

/* hide the tab bar on Dost screens; keep the chat scrolled to the latest line */
const baseApp = clientApp;
window.clientApp = clientApp = () => {
  const html = baseApp();
  return ['dost', 'dostcheck', 'dosthigh'].includes(S.c.screen) ? html.replace(/<nav class="tabbar"[\s\S]*?<\/nav>/, '') : html;
};
const baseRender = render;
window.render = render = () => {
  baseRender();
  if (S.c.screen === 'dost') {
    const log = document.getElementById('dlog'); if (log) log.scrollTop = log.scrollHeight;
    const f = document.getElementById('dform'); if (f) f.onsubmit = e => { e.preventDefault(); const i = document.getElementById('dtext'); const v = i.value; i.value = ''; send(v); };
    window.scrollTo({ top: document.body.scrollHeight });
  }
  if (S.c.screen !== 'dost' && S.c.screen !== 'dostcheck') { micOff(); }
  paintAI();
};

/* ---------------- actions ---------------- */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act^="d-"]'); if (!a || a.disabled) return;
  const v = a.dataset.v, c = S.c, P = D.plan;
  switch (a.dataset.act) {
    case 'd-start': start(v); window.scrollTo({ top: 0 }); break;
    case 'd-chip': send(v); break;
    case 'd-mic':
      if (V.speaking) { stopSpeaking(); paintStatus(); listen(); break; }
      if (V.listening) { stopListening(false); break; }
      if (D.mode !== 'voice') { D.mode = 'voice'; loadVoice(); render(); }
      listen(); break;
    case 'd-lang': D.lang = D.lang === 'hi' ? 'en' : 'hi'; toast(D.lang === 'hi' ? 'Dost will listen in Hindi' : 'Dost will listen in English'); render(); break;
    case 'd-book': {
      const p = profileFromDost(); c.profile = p; c.view = P.tid; c.slot = P.slot; c.share = true; P.booked = true;
      book(); break; }
    case 'd-others': { const p = profileFromDost(); c.profile = p; c.results = P && P.results || runMatch(p, []); cgo('matching'); break; }
    case 'd-oncall': P.called = true; render(); break;
    case 'd-nowchat2': D.plan = { priority: 'high', concerns: [], oncall: null }; // falls through
    case 'd-nowchat': if (!D.plan.oncall) D.plan.oncall = (T.find(x => x.clinical && x.langs.includes('English')) || T[0]).id; D.plan.called = true; c.screen = 'dosthigh'; render(); break;
    case 'd-checkin': {
      const t = P.tid ? TX[P.tid] : null;
      D.check = { msgs: [], chips: [['better', 'Better'], ['same', 'About the same'], ['worse', 'Worse']], action: '' };
      c.screen = 'dostcheck';
      checkSay(P.priority === 'medium' ? `Hi Riya, it’s Dost. It’s been 2 days since our chat. How are you feeling now?` : `Hi Riya, it’s Dost. It’s been a week of ${CAT.PG[P.pg].name}. How are you feeling now?`);
      break; }
    case 'd-check': checkAnswer(v, a.textContent.trim()); break;
  }
});
window.__dostVoice = { V, loadVoice, resample, CACHE, synth }; // for diagnostics in the console
window.addEventListener('pagehide', micOff);
document.addEventListener('click', e => { if (e.target.closest('[data-act="resetall"]')) { stopSpeaking(); micOff(); Object.assign(D, { mode: null, msgs: [], state: blank(), chips: [], busy: false, done: false, live: null, result: null, plan: null, check: null }); setTimeout(render, 0); } }, true);
/* ---------------- prototype: test scenarios (each one runs a full Dost chat) ---------------- */
const SCEN = [
  ['Work stress, mild', 'Low → Calm at Work + Box breathing', 'Work has been stressful this month, too many deadlines.', ['Some days', 'Not at all', 'Some days', 'Some days', 'No']],
  ['Can’t sleep, mild', 'Low → Sleep Reset + 4-7-8 wind-down', 'I can’t fall asleep, my mind keeps racing at night.', ['Not at all', 'Some days', 'Some days', 'Some days', 'No']],
  ['Lonely in a new city', 'Low → Better Connections + One small message', 'I moved to a new city and I feel lonely, no friends here.', ['Some days', 'Some days', 'Not at all', 'Not at all', 'No']],
  ['Career worry', 'Medium → 5-4-3-2-1 grounding + counsellor + Untangle Worry', 'I keep worrying about my career and the appraisal.', ['Some days', 'Some days', 'Most days', 'Nearly every day', 'No']],
  ['Feeling low (Hinglish)', 'Medium → Three good things + counsellor + Lift', 'Kuch hafton se mann nahi lagta, I feel low.', ['Most days', 'Most days', 'Some days', 'Some days', 'No']],
  ['Struggling a lot', 'High → on-call clinical psychologist now', 'Everything feels like too much and I am exhausted.', ['Nearly every day', 'Nearly every day', 'Most days', 'Most days', 'No']],
  ['Safety words', 'High → human now, no AI call', 'Sometimes I feel like I don’t want to be here.', []],
];
async function runScenario(i) {
  const [, , text, answers] = SCEN[i];
  document.querySelector('[data-act="resetall"]').click();
  await new Promise(r => setTimeout(r, 120));
  S.role = 'client'; await start('text');
  await send(text);
  for (const a of answers) {
    for (let k = 0; k < 80 && (D.busy || !D.chips.includes(a)) && !D.done; k++) await new Promise(r => setTimeout(r, 150));
    if (D.done) break;
    await send(a);
  }
}
const sb = document.getElementById('scenBtn');
if (sb) sb.onclick = ev => {
  ev.stopPropagation();
  const old = document.getElementById('scenMenu'); if (old) return old.remove();
  const m = document.createElement('div'); m.className = 'scen'; m.id = 'scenMenu';
  m.innerHTML = SCEN.map((s, i) => `<button data-i="${i}"><b>${esc2(s[0])}</b><span>${esc2(s[1])}</span></button>`).join('');
  m.onclick = e2 => { const b = e2.target.closest('button'); if (b) { m.remove(); runScenario(+b.dataset.i); } };
  sb.parentElement.appendChild(m);
  setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
};
window.__dostScenarios = { SCEN, runScenario };
if (location.hash === '#dost') setTimeout(() => start('text'), 50);
render();
})();

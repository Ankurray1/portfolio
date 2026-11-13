/* =====================================================================
   YourDOST catalogue (sample data): self-help exercises, wellbeing programs,
   assessments and counselling, with players for each. Dost (dost.js) routes
   users into these items; users can also browse them in Explore.
   ===================================================================== */
(() => {
/* ---------------- self-help exercises ---------------- */
const EX = {
  ex_box: { name: 'Box breathing', mins: 4, kind: 'breath', helps: ['work', 'anx'], why: 'Slows your heart rate when stress spikes.',
    pattern: [['Breathe in', 4], ['Hold', 4], ['Breathe out', 4], ['Hold', 4]], cycles: 4 },
  ex_478: { name: '4-7-8 wind-down', mins: 5, kind: 'breath', helps: ['sleep'], why: 'A longer out-breath tells your body it’s time to rest.',
    pattern: [['Breathe in', 4], ['Hold', 7], ['Breathe out', 8]], cycles: 4 },
  ex_ground: { name: '5-4-3-2-1 grounding', mins: 3, kind: 'steps', helps: ['anx', 'exams'], why: 'Brings you back to now when your mind races.',
    steps: ['Look around. Name 5 things you can see.', 'Notice 4 things you can feel, like your feet on the floor.', 'Listen for 3 sounds, near or far.', 'Find 2 things you can smell, or think of 2 smells you like.', 'Notice 1 thing you can taste, or take a sip of water.', 'Take one slow breath. You’re here, right now.'] },
  ex_body: { name: 'Body scan for sleep', mins: 8, kind: 'steps', helps: ['sleep', 'work'], why: 'Lets go of tension you didn’t know you were holding.',
    steps: ['Lie down or sit back. Let your eyes close if that feels okay.', 'Notice your feet and legs. Let them feel heavy.', 'Move to your stomach and chest. Let each breath slow down.', 'Notice your shoulders. Let them drop away from your ears.', 'Soften your jaw, your forehead, the space between your eyes.', 'Stay here for a few breaths. Nothing to do, nowhere to be.'] },
  ex_good: { name: 'Three good things', mins: 3, kind: 'journal', helps: ['low'], why: 'Noticing small good moments slowly lifts mood.',
    prompts: ['One good thing from today, however small', 'Why did it happen?', 'One more good thing'] },
  ex_worry: { name: 'Worry time', mins: 5, kind: 'journal', helps: ['anx', 'exams', 'career', 'work'], why: 'A worry on paper is smaller than a worry in your head.',
    prompts: ['What’s the worry, in one line?', 'Is it in your control: yes, partly or no?', 'One small thing you can do about it this week', 'If it’s not in your control, what would you tell a friend?'] },
  ex_reach: { name: 'One small message', mins: 2, kind: 'journal', helps: ['lonely', 'rel', 'family'], why: 'Connection grows from small, easy steps.',
    prompts: ['Who is one person you’d like to feel closer to?', 'Write a short, easy message to them. You don’t have to send it.'] },
};

/* ---------------- wellbeing programs (7 days; each day = a tip + an exercise) ---------------- */
const PG = {
  pg_calm: { name: 'Calm at Work', helps: ['work'], blurb: 'Small daily habits to switch off after work', days: [
    ['Notice your stress', 'ex_box', 'Stress is a signal, not a failure. Today, just notice when it shows up.'],
    ['Worry on paper', 'ex_worry', 'Writing a worry down makes it smaller than it feels.'],
    ['A switch-off ritual', 'ex_box', 'Pick one thing that ends your workday: close the laptop, change clothes, a short walk.'],
    ['Rest your body', 'ex_body', 'Tension hides in the shoulders and jaw. Let them go tonight.'],
    ['One small boundary', 'ex_worry', 'Choose one thing you can say “later” to this week.'],
    ['What went well', 'ex_good', 'Notice what you handled well this week.'],
    ['Your toolkit', 'ex_box', 'Which tool helped most this week? Keep that one.']] },
  pg_sleep: { name: 'Sleep Reset', helps: ['sleep'], blurb: 'A wind-down routine for calmer nights', days: [
    ['Same time, every night', 'ex_478', 'Pick a bedtime you can keep for 7 days, even on weekends.'],
    ['Screens down', 'ex_body', 'Put your phone away 30 minutes before bed tonight.'],
    ['Park your worries', 'ex_worry', 'Write tomorrow’s worries down so your mind can rest.'],
    ['Slow breath', 'ex_478', 'If you wake up, try this before reaching for your phone.'],
    ['Light in the morning', 'ex_box', 'Get 10 minutes of daylight soon after waking.'],
    ['Body at rest', 'ex_body', 'Let your body learn that bed is for rest.'],
    ['Keep what works', 'ex_478', 'Which part of the routine helped most? Keep it going.']] },
  pg_lift: { name: 'Lift', helps: ['low'], blurb: 'Gentle daily steps to lift a low mood', days: [
    ['One good thing', 'ex_good', 'Low mood hides good moments. Today, look for one.'],
    ['Move a little', 'ex_box', 'A 10-minute walk counts. So does stretching by the window.'],
    ['Reach out', 'ex_reach', 'One small message to someone you like.'],
    ['Do one small task', 'ex_worry', 'Pick one tiny task and finish it. Notice how that feels.'],
    ['Be kind to you', 'ex_good', 'What would you say to a friend feeling this way?'],
    ['Something you used to enjoy', 'ex_good', 'Try 10 minutes of it, even if you don’t feel like it.'],
    ['Look back', 'ex_good', 'Notice any small shift this week. It counts.']] },
  pg_worry: { name: 'Untangle Worry', helps: ['anx', 'exams', 'career'], blurb: 'Simple tools to quiet a racing mind', days: [
    ['Catch the worry', 'ex_worry', 'Notice when worry starts. Name it: “there’s that worry again”.'],
    ['Come back to now', 'ex_ground', 'When your mind races ahead, bring it back to the room.'],
    ['Slow the body', 'ex_box', 'A calm body helps a calm mind.'],
    ['Worry time', 'ex_worry', 'Give worry 10 minutes a day, then close the notebook.'],
    ['What’s in your control', 'ex_worry', 'Split worries into “can act” and “can’t control”.'],
    ['Ground again', 'ex_ground', 'Use this whenever the spiral starts.'],
    ['Your plan', 'ex_box', 'Pick the two tools you’ll keep using.']] },
  pg_connect: { name: 'Better Connections', helps: ['rel', 'family', 'lonely'], blurb: 'Feel closer to the people who matter', days: [
    ['Who matters', 'ex_reach', 'Think of people who make you feel a bit lighter.'],
    ['A small hello', 'ex_reach', 'Send one easy message. No need for a long chat.'],
    ['Listen fully', 'ex_box', 'In one conversation today, just listen without fixing.'],
    ['Say what you need', 'ex_worry', 'Try “I feel… when… and I need…”.'],
    ['After a hard talk', 'ex_ground', 'Steady yourself before you reply.'],
    ['Notice the good', 'ex_good', 'One kind moment with someone this week.'],
    ['Keep it going', 'ex_reach', 'Plan one small catch-up for next week.']] },
};

/* ---------------- assessments ---------------- */
const FREQ = ['Not at all', 'Some days', 'Most days', 'Nearly every day'];
const AS = {
  as_wellbeing: { name: 'Wellbeing check', mins: 1, tag: null, validated: 'PHQ-4', max: 12, opts: FREQ,
    qs: ['Little interest or joy in doing things?', 'Feeling down, low or hopeless?', 'Feeling nervous, anxious or on edge?', 'Not being able to stop worrying?'],
    bands: [[2, 'You seem to be doing okay'], [5, 'Some stress'], [8, 'A fair amount of stress'], [12, 'A lot to carry right now']] },
  as_sleep: { name: 'Sleep check', mins: 2, tag: 'sleep', max: 15, opts: FREQ,
    qs: ['Trouble falling asleep?', 'Waking up in the night?', 'Waking too early and not getting back to sleep?', 'Feeling tired during the day?', 'Worrying about your sleep?'],
    bands: [[4, 'Your sleep seems okay'], [9, 'Some sleep trouble'], [15, 'Sleep is really hard right now']] },
  as_burnout: { name: 'Burnout check', mins: 2, tag: 'work', max: 15, opts: FREQ,
    qs: ['Feeling drained after work?', 'Finding it hard to switch off?', 'Feeling cynical or distant about work?', 'Feeling less effective than usual?', 'Dreading the start of the week?'],
    bands: [[4, 'Low burnout signs'], [9, 'Some burnout signs'], [15, 'Strong burnout signs']] },
};

/* ---------------- routing: topic → the right item ---------------- */
const EX_FOR = { work: 'ex_box', sleep: 'ex_478', low: 'ex_good', anx: 'ex_ground', exams: 'ex_worry', career: 'ex_worry', rel: 'ex_reach', family: 'ex_reach', lonely: 'ex_reach' };
const PG_FOR = { work: 'pg_calm', sleep: 'pg_sleep', low: 'pg_lift', anx: 'pg_worry', exams: 'pg_worry', career: 'pg_worry', rel: 'pg_connect', family: 'pg_connect', lonely: 'pg_connect' };
const exerciseFor = tags => EX_FOR[(tags || [])[0]] || 'ex_box';
const programFor = tags => PG_FOR[(tags || [])[0]] || 'pg_calm';

/* progress lives in the demo state */
const prog = () => (S.cat = S.cat || { pg: {}, ex: {}, journal: {}, feel: [] });
window.CAT = { EX, PG, AS, exerciseFor, programFor, prog };

/* =====================================================================
   SCREENS
   ===================================================================== */
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const KIND = { breath: 'Breathing', steps: 'Guided', journal: 'Journal' };
const helps = list => list.map(t => CL[t]).filter(Boolean).slice(0, 2).join(' · ');
const card = (act, id, dot, cls, title, meta, extra = '') =>
  `<button class="libcard" data-act="${act}" data-id="${id}"><span class="dot ${cls}">${dot}</span><div style="flex:1;min-width:0"><b>${e(title)}</b><span>${e(meta)}</span></div>${extra}</button>`;

let FILTER = 'all';
CS.explore = () => {
  const P = prog();
  const sec = (k, label, html) => (FILTER === 'all' || FILTER === k) ? `<span class="lbl" style="margin-top:4px">${label}</span>${html}` : '';
  return `<div class="phead"><div><span class="muted small">YourDOST</span><h2>Explore</h2></div></div>
  <div class="segs">${[['all', 'All'], ['as', 'Assessments'], ['ex', 'Self-help'], ['pg', 'Programs'], ['co', 'Counselling']].map(([k, l]) => `<button data-act="c-filter" data-v="${k}" aria-pressed="${FILTER === k}">${l}</button>`).join('')}</div>
  <button class="tile row between" style="border:0;text-align:left;background:var(--primary-soft)" data-act="d-start" data-v="text"><div><b class="small">Not sure where to start?</b><p class="tiny muted">Dost will point you to the right one</p></div><span class="tag lime">2 min</span></button>
  ${sec('as', 'Assessments', Object.entries(AS).map(([id, a]) => card('c-as', id, '✓', 'k-assessment', a.name, `${a.qs.length} questions · ${a.mins} min${a.validated ? ' · ' + a.validated : ''}`)).join(''))}
  ${sec('ex', 'Self-help exercises', Object.entries(EX).map(([id, x]) => card('c-ex', id, '🍃', 'k-selfhelp', x.name, `${KIND[x.kind]} · ${x.mins} min · ${helps(x.helps)}`, P.ex[id] ? `<span class="tag">✓ ${P.ex[id]}</span>` : '')).join(''))}
  ${sec('pg', 'Wellbeing programs', Object.entries(PG).map(([id, p]) => card('c-pg', id, '🌱', 'k-program', p.name, `7 days · 10 min a day · ${helps(p.helps)}`, P.pg[id] ? `<span class="tag">${P.pg[id]}/7</span>` : '')).join(''))}
  ${sec('co', 'Counselling', card('startcheck', 'x', '💬', 'k-counsellor', 'Find a counsellor', 'Matched to your concerns and style · 3 min') + card('ctab', 'help', '♡', 'k-counsellor', 'Talk to someone now', 'On-call counsellor · Tele-MANAS 14416').replace('data-id="help"', 'data-v="help"'))}`;
};

/* ---- exercise player ---- */
let X = null, T = null;
function openEx(id, from, day) { X = { id, from: from || 'explore', day: day ?? null, step: 0, t: 0, answers: [] }; cgo('ex'); }
CS.ex = () => {
  const x = EX[X.id];
  const head = `<div class="phead"><button class="iconbtn" data-act="c-exback" aria-label="Back">←</button><span class="tag">${KIND[x.kind]} · ${x.mins} min</span></div>
  <div><h2>${e(x.name)}</h2><p class="small muted">${e(x.why)}</p></div>`;
  if (x.kind === 'breath') {
    const total = x.pattern.reduce((a, p) => a + p[1], 0) * x.cycles;
    return head + `<div class="breathe"><div class="bcircle" id="bc">Ready</div></div>
    <div class="row between small muted"><span id="bphase">Tap start</span><span id="bcount">Round 1 of ${x.cycles}</span></div>
    <div class="meter"><i id="bbar" style="width:0%"></i></div>
    <button class="btn block" id="bstart" data-act="c-breath">Start · ${Math.round(total / 60) || 1} min</button>
    <button class="btn ghost block" data-act="c-exdone">I’m done</button>`;
  }
  if (x.kind === 'steps') {
    const i = X.step, last = i >= x.steps.length - 1;
    return head + `<div class="progress">${x.steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="blob g-sky" style="min-height:220px;display:grid;align-content:center"><h2 style="color:#fff">${e(x.steps[i])}</h2></div>
    <p class="small muted center">Take your time. Tap next when you’re ready.</p>
    <button class="btn block" data-act="${last ? 'c-exdone' : 'c-step'}">${last ? 'Finish' : 'Next'}</button>`;
  }
  return head + `<div class="stack">${x.prompts.map((p, k) => `<div class="field"><label class="lbl" for="jp${k}">${e(p)}</label><textarea id="jp${k}" rows="2" data-k="${k}"></textarea></div>`).join('')}</div>
  <p class="tiny muted">🔒 Saved only on this phone.</p>
  <button class="btn block" data-act="c-exdone">Save</button>`;
};
function runBreathing() {
  const x = EX[X.id]; clearInterval(T);
  const cyc = x.pattern.reduce((a, p) => a + p[1], 0), total = cyc * x.cycles;
  let t = 0;
  const tick = () => {
    const bc = document.getElementById('bc'); if (!bc || S.c.screen !== 'ex') return clearInterval(T);
    if (t >= total) { clearInterval(T); return finishEx(); }
    let r = t % cyc, k = 0; while (r >= x.pattern[k][1]) { r -= x.pattern[k][1]; k++; }
    const [label, len] = x.pattern[k];
    bc.textContent = `${label} · ${len - r}`;
    bc.style.transform = `scale(${label === 'Breathe in' ? 1 + 0.2 * (r + 1) / len : label === 'Breathe out' ? 1.2 - 0.2 * (r + 1) / len : (k === 1 ? 1.2 : 1)})`;
    document.getElementById('bphase').textContent = label;
    document.getElementById('bcount').textContent = `Round ${Math.min(x.cycles, Math.floor(t / cyc) + 1)} of ${x.cycles}`;
    document.getElementById('bbar').style.width = (t / total * 100) + '%';
    t++;
  };
  tick(); T = setInterval(tick, 1000);
}
function finishEx() {
  clearInterval(T);
  const P = prog(), x = EX[X.id];
  if (x.kind === 'journal') { P.journal[X.id] = [...document.querySelectorAll('textarea[data-k]')].map(t => t.value); }
  P.ex[X.id] = (P.ex[X.id] || 0) + 1;
  if (X.day !== null) { const pg = X.from.split(':')[1]; P.pg[pg] = Math.max(P.pg[pg] || 0, X.day + 1); }
  if (window.DOST && DOST.plan && DOST.plan.ex === X.id) DOST.plan.quick = true;
  cgo('exdone');
}
CS.exdone = () => `<div class="center" style="display:grid;gap:12px;justify-items:center;padding-top:30px">
  <div class="big-ic">♡</div><h2>Nice work.</h2><p class="muted">${X.day !== null ? `Day ${X.day + 1} done. See you tomorrow.` : 'That counts. Small steps add up.'}</p></div>
  <span class="lbl" style="text-align:center">How do you feel now?</span>
  <div class="scale" style="justify-content:center">${[['better', 'A bit better'], ['same', 'About the same'], ['worse', 'Worse']].map(([v, l]) => `<button data-act="c-feel" data-v="${v}">${l}</button>`).join('')}</div>`;

/* ---- programs ---- */
let PGID = null;
CS.pg = () => {
  const p = PG[PGID], done = prog().pg[PGID] || 0;
  return `<div class="phead">${back(window.DOST && DOST.plan ? 'dostplan' : 'explore')}<span class="tag">Wellbeing program</span></div>
  <div class="blob g-orange" style="display:grid;gap:6px;min-height:170px;align-content:end"><span class="lbl">7 days · 10 min a day</span><h1 style="color:#fff">${e(p.name)}</h1><p style="color:#fff">${e(p.blurb)}</p></div>
  <div class="row between small"><span>${done} of 7 days done</span><span class="muted">${helps(p.helps)}</span></div>
  <div class="meter"><i style="width:${done / 7 * 100}%"></i></div>
  <div class="tile" style="display:grid;gap:2px">${p.days.map(([t, ex, tip], i) => `<div class="pstep ${i < done ? 'done' : ''}" style="${i > done ? 'opacity:.55' : ''}"><span class="pnum">${i < done ? '✓' : i + 1}</span><div style="flex:1;min-width:0"><span class="lbl">Day ${i + 1}${i === done ? ' · today' : ''}</span><b>${e(t)}</b><div class="tiny muted">${e(EX[ex].name)} · ${EX[ex].mins} min</div></div></div>`).join('')}</div>
  ${done < 7 ? `<button class="btn block" data-act="c-day" data-v="${done}">Start day ${done + 1}</button>` : '<div class="callout">Program complete. Well done.</div>'}`;
};
let DAY = 0;
CS.pgday = () => {
  const p = PG[PGID], [t, ex, tip] = p.days[DAY], x = EX[ex];
  return `<div class="phead"><button class="iconbtn" data-act="c-pg" data-id="${PGID}" aria-label="Back">←</button><span class="tag">${e(p.name)} · Day ${DAY + 1} of 7</span></div>
  <div><h2>${e(t)}</h2></div>
  <div class="tile"><span class="lbl">Today’s tip</span><p style="margin-top:6px">${e(tip)}</p></div>
  ${card('c-dayex', ex, '🍃', 'k-selfhelp', x.name, `${KIND[x.kind]} · ${x.mins} min`)}
  <button class="btn block" data-act="c-dayex" data-id="${ex}">Start the exercise</button>`;
};

/* ---- assessments ---- */
let A = null;
CS.as = () => {
  const a = AS[A.id], i = A.ans.length;
  return `<div class="phead"><button class="iconbtn" data-act="${i ? 'c-asback' : 'cgo'}" data-to="explore" aria-label="Back">←</button><span class="tag">${e(a.name)} · ${i + 1} of ${a.qs.length}</span></div>
  <div class="progress">${a.qs.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
  <div><span class="lbl">Over the last 2 weeks, how often…</span><h2 style="margin-top:6px">${e(a.qs[i])}</h2></div>
  <div class="stack" style="gap:8px">${a.opts.map((o, v) => `<button class="opt2" data-act="c-asans" data-v="${v}">${o}</button>`).join('')}</div>
  <p class="tiny muted">🔒 Your answers stay private.</p>`;
};
function asResult() {
  const a = AS[A.id], score = A.ans.reduce((x, y) => x + y, 0);
  const band = a.bands.findIndex(b => score <= b[0]), label = a.bands[band][1];
  let tags = a.tag ? [a.tag] : [];
  if (!a.tag) { const anx = A.ans[2] + A.ans[3], low = A.ans[0] + A.ans[1]; tags = [anx >= low ? 'anx' : 'low']; }
  // priority, the same rule as Dost for the validated PHQ-4; topic checks never go above "medium" (no safety question)
  const pr = A.id === 'as_wellbeing' ? (score >= 9 ? 'high' : score >= 6 ? 'medium' : 'low') : (band >= 2 ? 'medium' : 'low');
  return { score, label, tags, pr, band };
}
CS.asres = () => {
  const a = AS[A.id], r = asResult(), ex = EX[exerciseFor(r.tags)], pgid = programFor(r.tags), pg = PG[pgid];
  const g = r.pr === 'high' ? 'g-pink' : r.pr === 'medium' ? 'g-orange' : 'g-green';
  return `<div class="phead">${back('explore')}<span class="tag">${e(a.name)}</span></div>
  <div class="blob ${g}" style="display:grid;gap:6px;min-height:170px;align-content:end"><span class="lbl">Your result</span><h1 style="color:#fff">${e(r.label)}</h1><p style="color:#fff">${r.pr === 'high' ? 'Please talk to someone today. You don’t have to carry this alone.' : r.pr === 'medium' ? 'A counsellor could really help, alongside a few small daily steps.' : 'A few small daily steps should help.'}</p></div>
  <span class="lbl">What helps</span>
  ${r.pr === 'high' ? card('d-nowchat2', 'x', '♡', 'k-counsellor', 'Talk to a counsellor now', 'On-call · usually under 5 minutes') : ''}
  ${card('c-ex', exerciseFor(r.tags), '🍃', 'k-selfhelp', ex.name, `Self-help · ${ex.mins} min · try it now`)}
  ${card('c-pg', pgid, '🌱', 'k-program', pg.name, '7-day program · 10 min a day')}
  ${r.pr !== 'low' ? card('c-match', r.tags.join(','), '💬', 'k-counsellor', 'Book a counsellor', `Matched to ${CL[r.tags[0]] ? CL[r.tags[0]].toLowerCase() : 'you'} · free`) : ''}
  <p class="tiny muted">${a.validated ? `Based on the ${a.validated}, a short validated screen.` : 'A short sample check, not a diagnosis.'} It doesn’t diagnose.</p>`;
};

/* ---------------- wiring ---------------- */
const baseRender = render;
window.render = render = () => { baseRender(); if (S.c.screen !== 'ex') clearInterval(T); };
const baseApp = clientApp;
window.clientApp = clientApp = () => { const h = baseApp(); return ['ex', 'as', 'exdone', 'pgday'].includes(S.c.screen) ? h.replace(/<nav class="tabbar"[\s\S]*?<\/nav>/, '') : h; };

document.addEventListener('click', ev => {
  const a = ev.target.closest('[data-act^="c-"]'); if (!a || a.disabled) return;
  const v = a.dataset.v, id = a.dataset.id;
  switch (a.dataset.act) {
    case 'c-filter': FILTER = v; render(); break;
    case 'c-filter2': FILTER = v; cgo('explore'); break;
    case 'c-ex': openEx(id, S.c.screen === 'dostplan' ? 'dostplan' : S.c.screen === 'asres' ? 'asres' : 'explore'); break;
    case 'c-exback': clearInterval(T); cgo(X.from.startsWith('pg:') ? 'pgday' : X.from); break;
    case 'c-breath': a.disabled = true; a.textContent = 'Follow the circle…'; runBreathing(); break;
    case 'c-step': X.step++; render(); break;
    case 'c-exdone': finishEx(); break;
    case 'c-feel': {
      const P = prog(); P.feel.push({ ex: X.id, v });
      const to = X.from.startsWith('pg:') ? 'pg' : X.from;
      if (v === 'worse') { toast('Thanks for telling us.'); if (window.DOSTX) DOSTX.offerHuman(); else cgo('help'); break; }
      if (window.DOSTX && DOSTX.afterStep(X, v)) break;  // guided plan from Dost: Dost leads to the next step
      if (v === 'same' && X.day === null) toast('Thanks. Try another exercise, or talk to Dost.');
      else toast(v === 'better' ? 'Glad it helped.' : 'Thanks. Keep going, it adds up.');
      if (to === 'pg') PGID = X.from.split(':')[1];
      cgo(to); break; }
    case 'c-pg': PGID = id; cgo('pg'); break;
    case 'c-day': DAY = +v; cgo('pgday'); break;
    case 'c-dayex': openEx(id, 'pg:' + PGID, DAY); break;
    case 'c-as': A = { id, ans: [] }; cgo('as'); break;
    case 'c-asans': A.ans.push(+v); cgo(A.ans.length >= AS[A.id].qs.length ? 'asres' : 'as'); break;
    case 'c-asback': A.ans.pop(); render(); break;
    case 'c-match': { const p = blankProfile(); p.concerns = id.split(','); const r = asResult(); p.mood = AS[A.id].validated ? A.ans.slice(0, 4) : [1, 1, 1, 1]; S.c.profile = p; S.c.results = runMatch(p, []); cgo('matching'); break; }
  }
});
window.CATX = { openEx, openPg: id => { PGID = id; cgo('pg'); } };
})();

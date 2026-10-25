/* Builds the Ask Ankur knowledge base from the site's own content.
   Usage: node kb/build-kb.js index.html kb/chunks.json
   Only what a visitor can see goes in: hidden cards are skipped, images and data URIs are dropped. */
const fs = require('fs');
const [src, out] = process.argv.slice(2);
const html = fs.readFileSync(src, 'utf8');
const A = '<script type="application/json" id="state">', B = '</script><script id="app">';
const st = JSON.parse(html.slice(html.indexOf(A) + A.length, html.indexOf(B)));

const MAX = 1600; // gte-small reads at most 512 tokens; ~1,600 characters stays inside that
const chunks = [];
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/\s([.,;:])/g, '$1').trim();
/* flatten any block or value to readable text, skipping images, links-only fields and layout keys */
const SKIP = new Set(['t', 'tone', 'id', 'slot', 'img', 'poster', 'photo', 'cardImg', 'cardViz', 'mock', 'logos', 'heroLogos', 'skills', 'skillAt', 'goto', 'pdf', 'shot', 'probLabel']);
const text = v => {
  if (v == null) return '';
  if (typeof v === 'string') return /^data:|^docs\/.+\.(webp|jpg|png|pdf)$/.test(v) ? '' : v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(' · ');
  if (typeof v === 'object') return Object.entries(v).filter(([k]) => !SKIP.has(k)).map(([, x]) => text(x)).filter(Boolean).join(' · ');
  return '';
};
const add = (kind, title, url, body, section) => {
  body = clean(body);
  if (!body) return;
  const head = clean(title + (section ? ' — ' + section : ''));
  /* split long sections on sentence boundaries so every chunk embeds whole */
  const parts = [];
  let cur = '';
  for (const s of body.split(/(?<=[.!?])\s+/)) {
    if ((cur + ' ' + s).length > MAX - head.length - 4 && cur) { parts.push(cur); cur = s; }
    else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) parts.push(cur);
  parts.forEach((p, n) => chunks.push({
    id: kind + ':' + url.replace(/^#/, '') + ':' + (section || 'main').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + (parts.length > 1 ? '-' + (n + 1) : ''),
    kind, title: clean(title), section: section ? clean(section) : '', url,
    content: head + '\n' + p
  }));
};
/* docs are lists of blocks; a new chunk starts at each top heading */
const addDoc = (kind, title, url, blocks) => {
  let section = 'Overview', buf = [];
  const flush = () => { add(kind, title, url, buf.join(' '), section); buf = []; };
  for (const b of blocks || []) {
    if (b.t === 'h') { flush(); section = clean(b.x); continue; }
    if (['imgs', 'loopanim', 'pipeline', 'inbox', 'stepper', 'evalviz'].includes(b.t)) continue;
    const t = text(b);
    if (t) buf.push((b.title ? clean(b.title) + ': ' : '') + t + '.');
  }
  flush();
};

/* profile and home page */
const p = st.profile;
add('profile', 'Profile summary', '#', [p.role, p.intro, p.facts, 'Location: ' + p.location, 'LinkedIn headline: ' + p.liHeadline, 'Email: ' + p.email].join(' '));
add('profile', 'Background at a glance', '#', 'Organisations: ' + String(p.orgs || '').split('\n').map(l => l.split('|').slice(0, 2).join(', ')).join('; '));
(st.highlights || []).filter(h => h.on !== false).forEach(h => add('highlight', clean(h.title || 'Highlight'), '#', text(h)));

/* product career page */
const pm = st.pm;
add('pm', 'Product career overview', '#pm', [pm.headline + ' ' + pm.italic + '.', pm.intro].join(' '));
add('pm', 'Headline numbers', '#pm', String(pm.stats || '').split('\n').map(l => l.split('|').slice(0, 3).map(x => x.trim()).join(' ')).join('. '));
add('pm', pm.aboutTitle || 'Working with Microsoft', '#pm', pm.about);
add('pm', 'Skills', '#pm', 'Skills: ' + pm.skills + '.');
add('pm', 'Teams and roles collaborated with', '#pm', String(pm.people || '').replace(/\n/g, '. '));
add('pm', 'Clients', '#pm', text(pm.clients) + ' ' + (pm.clientsNote || '') + ' Client logos: ' + (pm.clientLogos || []).join(', ') + '.');
add('people', 'People worked with: names and roles', '#pm', (pm.peopleLinks || []).filter(x => x.name).map(x => x.name + (x.role ? ', ' + x.role : '') + (x.org ? ' at ' + x.org : '')).join('; ') + '.');
(pm.peopleLinks || []).filter(x => x.quote && x.quote.text).forEach(x => add('testimonial', 'Testimonial from ' + x.name, '#pm', '"' + x.quote.text + '" — ' + x.quote.by + ', ' + x.quote.role + '.'));

/* case study cards: hidden ones are not on the site, so they are not in the knowledge base */
pm.items.filter(i => !i.hidden).forEach(i => {
  const url = i.slug ? '#case/' + i.slug : '#pm';
  add('card', i.title, url, [i.org + ' · ' + (i.year || '') + ' · ' + (i.role || ''), 'Result: ' + i.metric + ' — ' + i.metricLabel + '.', i.summary, i.problem && 'Problem: ' + i.problem, i.approach && 'Approach: ' + i.approach, i.outcome && 'Outcome: ' + i.outcome, i.keys && 'Skills shown: ' + i.keys + '.'].filter(Boolean).join(' '));
});
/* full case study pages */
pm.cases.forEach(c => {
  const url = '#case/' + c.slug;
  add('case', c.title, url, [c.tag, c.lede, (c.probLabel || 'The problem') + ': ' + c.hook, 'What I did: ' + (c.did || []).join('; ') + '.', c.topMetrics ? 'Metrics: ' + text(c.topMetrics.tiles) + '. ' + (c.topMetrics.note || '') : '', c.heroBlocks ? text(c.heroBlocks) : ''].join(' '), 'Summary');
  (c.doc || []).forEach(d => addDoc('case', c.title, url, d.blocks));
});

/* career timeline */
pm.career.forEach(c => add('career', clean(c.title + (c.org ? ' — ' + c.org : '')), '#timeline', [c.when + (c.duration ? ' (' + c.duration + ')' : '') + (c.place ? ', ' + c.place : '') + '.', c.summary, c.milestones && 'Milestones: ' + String(c.milestones).replace(/\n/g, '; ') + '.', c.points && 'What I did: ' + String(c.points).replace(/\n/g, ' ') , c.tags && 'Tags: ' + c.tags + '.'].filter(Boolean).join(' ')));
add('career', 'Education and timeline', '#timeline', String(pm.timeline || '').replace(/\n/g, '. '));

/* certifications */
(pm.certs || []).forEach(c => add('cert', clean(c.title || c.name || 'Certification'), '#certs', text(c)));

/* projects */
(pm.projectCards || []).filter(x => x.title).forEach(pr => {
  const url = '#project/' + pr.slug;
  const head = {}; for (const k in pr) if (!['doc', 'rice', 'sections'].includes(k)) head[k] = pr[k];
  add('project', pr.title, url, text(head) + (pr.sections ? ' ' + text(pr.sections) : ''), 'Summary');
  (pr.doc || []).forEach(d => addDoc('project', pr.title + (d.name ? ' (' + d.name + ')' : ''), url, d.blocks));
});

/* posts and blogs */
(pm.posts || []).forEach(x => add('post', clean(x.title || 'Post'), '#blogs', text(x)));

/* founder journey */
const f = st.founder;
add('founder', 'Founder journey overview', '#founder', text({ eyebrow: f.eyebrow, headline: f.headline, intro: f.intro, about: f.about, stats: f.stats }));
(f.items || []).forEach(i => add('founder', clean(i.title), '#founder', text(i)));
if (f.story) Object.entries(f.story).forEach(([k, v]) => add('founder', 'NAI Productions story', '#founder', text(v), k));

const seen = new Set();
const uniq = chunks.filter(c => { if (seen.has(c.id)) { let n = 2; while (seen.has(c.id + '-' + n)) n++; c.id += '-' + n; } seen.add(c.id); return c.content.length > 60; });
fs.writeFileSync(out, JSON.stringify({ built: new Date().toISOString(), count: uniq.length, chunks: uniq }, null, 1));
const by = {}; uniq.forEach(c => by[c.kind] = (by[c.kind] || 0) + 1);
console.log('chunks', uniq.length, JSON.stringify(by), 'chars', uniq.reduce((a, c) => a + c.content.length, 0), 'max', Math.max(...uniq.map(c => c.content.length)));

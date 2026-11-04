// Ask Ankur insights · the numbers behind the site assistant, for Ankur only.
// POST {"days": 7 | 30 | 90, "human"?: boolean} (or {"day": "YYYY-MM-DD"} for one day in detail) with header x-insights-key → summary, daily counts, outcomes, top questions,
// feedback (votes with their reasons and notes) and recent questions. The key is checked against SHA-256 hashes in public.insights_keys.
// Website traffic comes from the GA4 Data API when the secrets GA4_PROPERTY_ID (the numeric property id) and
// GA4_SERVICE_ACCOUNT (a service account's JSON key, added to the property as a Viewer) are set; otherwise ga.connected is false.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [/^https:\/\/ankurray1\.github\.io$/, /^https:\/\/([a-z0-9-]+--)?ankurray[a-z0-9-]*\.netlify\.app$/, /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/];
const FAILS_PER_HOUR = 10; // wrong keys allowed per visitor per hour
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.some((r) => r.test(origin)) ? origin : 'https://ankurray1.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-insights-key',
  'Vary': 'Origin',
  'Cache-Control': 'no-store',
});
const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

type Row = { id: string; created_at: string; question: string; status: string; answer: string | null; feedback: number | null; first_token_ms: number | null; total_ms: number | null; has_jd: boolean; unverified: string[] | null; feedback_reasons: string[] | null; feedback_note: string | null };

/* GA4 Data API: a service-account token (signed here, cached for its hour), then one batch of reports and a realtime count */
let gaToken: { value: string; exp: number } | null = null;
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const enc = new TextEncoder();
async function gaAccessToken(sa: { client_email: string; private_key: string }) {
  if (gaToken && gaToken.exp > Date.now()) return gaToken.value;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64u(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claim)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64u(sig) }) });
  const j = await r.json();
  if (!r.ok) throw new Error('Google sign-in failed: ' + (j.error_description || j.error));
  gaToken = { value: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return gaToken.value;
}
/* likely bots: visits from US data-centre locations, where link scanners and crawlers run (e.g. mail security
   opening shared links from cloud regions). Real visitors from these towns are rare enough to drop. */
const BOT_CITIES = ['(not set)', 'Ashburn', 'Boardman', 'Council Bluffs', 'Des Moines', 'Flint Hill', 'The Dalles', 'Quincy', 'Moses Lake', 'Sterling', 'Leesburg'];
const humanFilter = { notExpression: { andGroup: { expressions: [
  { filter: { fieldName: 'country', stringFilter: { value: 'United States' } } },
  { filter: { fieldName: 'city', inListFilter: { values: BOT_CITIES } } },
] } } };
type GaRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
const gaRows = (rep: { rows?: GaRow[] } | undefined) => (rep?.rows ?? []).map((r) => ({ d: (r.dimensionValues ?? []).map((x) => x.value), m: (r.metricValues ?? []).map((x) => Number(x.value)) }));
async function gaTraffic(days: number, human: boolean) {
  const property = Deno.env.get('GA4_PROPERTY_ID'), saJson = Deno.env.get('GA4_SERVICE_ACCOUNT');
  if (!property || !saJson) return { connected: false };
  try {
    const token = await gaAccessToken(JSON.parse(saJson));
    const api = (path: string, body: unknown) => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(9000) });
    const range = [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }];
    const f = human ? { dimensionFilter: humanFilter } : {};
    const m = (...names: string[]) => names.map((name) => ({ name }));
    const d = (...names: string[]) => names.map((name) => ({ name }));
    const [batch, live] = await Promise.all([
      api('batchRunReports', { requests: [
        { ...f, dateRanges: range, metrics: m('activeUsers', 'sessions', 'screenPageViews', 'newUsers') },
        { ...f, dateRanges: range, dimensions: d('date'), metrics: m('activeUsers', 'sessions'), orderBys: [{ dimension: { dimensionName: 'date' } }] },
        { ...f, dateRanges: range, dimensions: d('country', 'city'), metrics: m('activeUsers', 'sessions'), orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 250 },
        // each portfolio section is sent as its own page_view titled "Ankur Ray · <section>"; split by country for the filter
        { ...f, dateRanges: range, dimensions: d('pageTitle', 'country'), metrics: m('screenPageViews', 'activeUsers'), orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 1000 },
        // everyone, bots included, so the dashboard can say how many the filter left out
        { dateRanges: range, metrics: m('activeUsers') },
      ] }),
      api('runRealtimeReport', { ...f, metrics: m('activeUsers') }),
    ]);
    const bj = await batch.json(), lj = await live.json().catch(() => ({}));
    if (!batch.ok) return { connected: true, error: bj.error?.message ?? 'Google Analytics request failed.' };
    const [tot, daily, places, sections, everyone] = (bj.reports ?? []).map(gaRows);
    const t = tot?.[0]?.m ?? [0, 0, 0, 0];
    const all = everyone?.[0]?.m[0] ?? t[0];
    return {
      connected: true,
      human,
      bots_hidden: human ? Math.max(0, all - t[0]) : 0,
      active_now: gaRows(lj).reduce((a, r) => a + (r.m[0] || 0), 0),
      totals: { active_users: t[0], sessions: t[1], page_views: t[2], new_users: t[3] },
      daily: (daily ?? []).map((r) => ({ day: `${r.d[0].slice(0, 4)}-${r.d[0].slice(4, 6)}-${r.d[0].slice(6)}`, users: r.m[0], sessions: r.m[1] })),
      places: (places ?? []).map((r) => ({ country: r.d[0], city: r.d[1], users: r.m[0], sessions: r.m[1] })),
      sections: (sections ?? []).map((r) => ({ title: r.d[0], country: r.d[1], views: r.m[0], users: r.m[1] })),
    };
  } catch (e) {
    return { connected: true, error: String((e as Error).message ?? e) };
  }
}

/* one day in detail: who came (in aggregate), from where, on what, and what they did. GA4 never identifies a person. */
async function gaDay(day: string, human: boolean) {
  const property = Deno.env.get('GA4_PROPERTY_ID'), saJson = Deno.env.get('GA4_SERVICE_ACCOUNT');
  if (!property || !saJson) return { connected: false };
  try {
    const token = await gaAccessToken(JSON.parse(saJson));
    const range = [{ startDate: day, endDate: day }];
    const f = human ? { dimensionFilter: humanFilter } : {};
    const q = (dims: string[], mets: string[], limit = 50) => ({ ...f, dateRanges: range, dimensions: dims.map((name) => ({ name })), metrics: mets.map((name) => ({ name })), limit, orderBys: [{ metric: { metricName: mets[0] }, desc: true }] });
    const reports: [string, ReturnType<typeof q>][] = [
      ['totals', { ...f, dateRanges: range, dimensions: [], metrics: ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'engagementRate', 'screenPageViews', 'averageSessionDuration', 'userEngagementDuration', 'eventCount'].map((name) => ({ name })), limit: 1, orderBys: [] } as ReturnType<typeof q>],
      ['places', q(['country', 'region', 'city'], ['activeUsers', 'sessions'])],
      ['devices', q(['deviceCategory', 'operatingSystem', 'browser'], ['activeUsers', 'sessions'])],
      ['sources', q(['sessionSource', 'sessionMedium'], ['activeUsers', 'sessions', 'engagedSessions'])],
      ['pages', q(['pageTitle'], ['screenPageViews', 'activeUsers'])],
      ['events', q(['eventName'], ['eventCount', 'totalUsers'])],
      ['hours', q(['hour'], ['activeUsers', 'sessions'], 24)],
      ['visitors', q(['newVsReturning'], ['activeUsers', 'sessions'])],
      ['landing', q(['landingPage'], ['sessions', 'activeUsers'])],
      ['languages', q(['language'], ['activeUsers'])],
      ['everyone', { dateRanges: range, dimensions: [], metrics: [{ name: 'activeUsers' }], limit: 1, orderBys: [] } as ReturnType<typeof q>],
    ];
    const call = (reqs: unknown[]) => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:batchRunReports`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: reqs }), signal: AbortSignal.timeout(12000) }).then((r) => r.json());
    const out: Record<string, unknown> = { connected: true, day, human };
    for (let i = 0; i < reports.length; i += 5) {
      const chunk = reports.slice(i, i + 5), j = await call(chunk.map((r) => r[1]));
      if (j.error) return { connected: true, error: j.error.message };
      chunk.forEach(([name, req], n) => {
        const mets = (req.metrics as { name: string }[]).map((m) => m.name), dims = (req.dimensions as { name: string }[]).map((d) => d.name);
        out[name] = gaRows(j.reports?.[n]).map((r) => Object.fromEntries([...dims.map((d, k) => [d, r.d[k]]), ...mets.map((m, k) => [m, r.m[k]])]));
      });
    }
    const shown = Number((out.totals as Record<string, number>[])?.[0]?.activeUsers ?? 0), all = Number((out.everyone as Record<string, number>[])?.[0]?.activeUsers ?? shown);
    out.bots_hidden = human ? Math.max(0, all - shown) : 0;
    delete out.everyone;
    return out;
  } catch (e) {
    return { connected: true, error: String((e as Error).message ?? e) };
  }
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

  // wrong keys are rate limited per hashed IP, so the key can't be guessed
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const key = req.headers.get('x-insights-key') ?? '';
  const { data: match } = key ? await db.from('insights_keys').select('label').eq('key_hash', await sha256(key)).maybeSingle() : { data: null };
  if (!match) {
    const hour = new Date().toISOString().slice(0, 13);
    const { data: allowed } = await db.rpc('ask_rate_hit', { p_bucket: 'ins' + (await sha256('ins|' + ip + '|' + hour)).slice(0, 29), p_limit: FAILS_PER_HOUR });
    return reply({ error: allowed ? 'That key is not valid.' : 'Too many attempts. Try again in an hour.' }, allowed ? 401 : 429);
  }

  const body = await req.json().catch(() => ({}));
  const human = body.human !== false; // likely bots are left out unless the dashboard asks for everything
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.day ?? ''))) {
    const day = String(body.day), from = new Date(day + 'T00:00:00+05:30'), to = new Date(from.getTime() + 864e5);
    const [ga, { data: asks }, { data: cvs }] = await Promise.all([
      gaDay(day, human),
      db.from('ask_log').select('created_at, question, status, feedback, feedback_reasons, total_ms, has_jd').gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).order('created_at'),
      db.from('cv_requests').select('requested_at, email').gte('requested_at', from.toISOString()).lt('requested_at', to.toISOString()).order('requested_at'),
    ]);
    return reply({ ga_day: ga, asks: asks ?? [], cv_requests: cvs ?? [] });
  }
  const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
  const since = new Date(Date.now() - days * 864e5);
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: rows, error }, { count: cvCount }, ga] = await Promise.all([
    db.from('ask_log').select('id, created_at, question, status, answer, feedback, first_token_ms, total_ms, has_jd, unverified, feedback_reasons, feedback_note')
      .gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(5000),
    db.from('cv_requests').select('id', { count: 'exact', head: true }).gte('requested_at', since.toISOString()),
    gaTraffic(days, human),
  ]);
  if (error) return reply({ error: 'Could not read the log.' }, 500);
  const log = (rows ?? []) as Row[];

  // one bucket per day, oldest first, including days with no questions
  const daily: { day: string; questions: number; answered: number }[] = [];
  for (let d = new Date(since); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) daily.push({ day: d.toISOString().slice(0, 10), questions: 0, answered: 0 });
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const outcomes: Record<string, number> = {};
  const top = new Map<string, { question: string; count: number; answered: number }>();
  for (const r of log) {
    const b = byDay.get(r.created_at.slice(0, 10));
    if (b) { b.questions++; if (r.status === 'answered') b.answered++; }
    outcomes[r.status] = (outcomes[r.status] ?? 0) + 1;
    const k = r.question.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const t = top.get(k) ?? { question: r.question, count: 0, answered: 0 };
    t.count++; if (r.status === 'answered') t.answered++;
    top.set(k, t);
  }
  const up = log.filter((r) => r.feedback === 1).length, down = log.filter((r) => r.feedback === -1).length;
  const answered = log.filter((r) => r.status === 'answered');

  return reply({
    days,
    ga,
    summary: {
      questions: log.length,
      answered: answered.length,
      thumbs_up: up,
      thumbs_down: down,
      median_first_word_ms: median(answered.map((r) => r.first_token_ms).filter((x): x is number => x != null)),
      median_total_ms: median(answered.map((r) => r.total_ms).filter((x): x is number => x != null)),
      job_fit_checks: log.filter((r) => r.has_jd).length,
      cv_requests: cvCount ?? 0,
    },
    daily,
    outcomes,
    top_questions: [...top.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    // every vote with the reasons and note that came with it; the answer text travels with thumbs-down only
    feedback: log.filter((r) => r.feedback).slice(0, 30).map((r) => ({ created_at: r.created_at, question: r.question, vote: r.feedback, reasons: r.feedback_reasons ?? [], note: r.feedback_note, answer: r.feedback === -1 ? r.answer : null })),
    reasons: Object.entries(log.reduce((m: Record<string, { reason: string; vote: number; count: number }>, r) => {
      for (const x of r.feedback_reasons ?? []) { const k = r.feedback + x; m[k] = m[k] ?? { reason: x, vote: r.feedback ?? 0, count: 0 }; m[k].count++; }
      return m;
    }, {})).map(([, v]) => v).sort((a, b) => b.count - a.count),
    caught: log.filter((r) => r.unverified?.length).slice(0, 20).map(({ created_at, question, unverified, status }) => ({ created_at, question, unverified, status })),
    recent: log.slice(0, 40).map(({ created_at, question, status, feedback, total_ms, has_jd }) => ({ created_at, question, status, feedback, total_ms, has_jd })),
  });
});

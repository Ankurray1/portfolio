// Ask Ankur insights · the numbers behind the site assistant, for Ankur only.
// POST {"days": 7 | 30 | 90} with header x-insights-key → summary, daily counts, outcomes, top questions,
// feedback (votes with their reasons and notes) and recent questions. The key is checked against SHA-256 hashes in public.insights_keys.
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
  const days = [7, 30, 90].includes(Number(body.days)) ? Number(body.days) : 30;
  const since = new Date(Date.now() - days * 864e5);
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: rows, error }, { count: cvCount }] = await Promise.all([
    db.from('ask_log').select('id, created_at, question, status, answer, feedback, first_token_ms, total_ms, has_jd, unverified, feedback_reasons, feedback_note')
      .gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(5000),
    db.from('cv_requests').select('id', { count: 'exact', head: true }).gte('requested_at', since.toISOString()),
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

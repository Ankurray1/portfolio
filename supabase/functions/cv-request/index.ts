// View CV · a visitor leaves their email; Ankur gets an email about it and sends the CV by hand.
// POST {"email": "...", "source": "page"} → { status }
//   status "received"      saved; Ankur is emailed when RESEND_API_KEY is set (notified tells which)
//   status "invalid" | "rate_limited" | "error"
// Every request is kept in public.cv_requests, so none is lost even if the email fails.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [/^https:\/\/ankurray1\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const PER_HOUR = 5;          // requests per visitor per hour
const REPEAT_MINUTES = 30;   // the same email asking again within this window is not emailed twice
const NOTIFY_TO = 'john.ankur.ray@gmail.com';
const FROM = Deno.env.get('CV_FROM') ?? 'Portfolio <onboarding@resend.dev>'; // Resend's test sender only delivers to the account owner, which is Ankur
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.some((r) => r.test(origin)) ? origin : 'https://ankurray1.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Vary': 'Origin',
});

const sha256 = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function notify(email: string, when: string): Promise<string | null> {
  const key = Deno.env.get('RESEND_API_KEY');
  // names only (never values), so a misnamed secret is easy to spot
  if (!key) return `RESEND_API_KEY not set (similar names: ${Object.keys(Deno.env.toObject()).filter((k) => /resend/i.test(k)).join(', ') || 'none'})`;
  const subject = `CV request from ${email}`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [NOTIFY_TO],
      reply_to: email,
      subject,
      text: `${email} asked for your CV on your portfolio (${when} UTC).\n\nReply to this email to send it; the reply goes straight to them.`,
      html: `<p><b>${html(email)}</b> asked for your CV on your portfolio (${html(when)} UTC).</p><p>Reply to this email to send it; the reply goes straight to them.</p>`,
    }),
  });
  return r.ok ? null : `resend ${r.status}: ${(await r.text()).slice(0, 300)}`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = cors(origin);
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ status: 'invalid', error: 'POST only' }, 405);
  if (origin && !ALLOWED_ORIGINS.some((r) => r.test(origin))) return reply({ status: 'invalid', error: 'origin not allowed' }, 403);

  const body = await req.json().catch(() => ({}));
  if (body.website) return reply({ status: 'received' }); // honeypot field: bots fill it, people never see it
  const email = String(body.email ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return reply({ status: 'invalid', error: 'Enter a valid email address, like name@company.com.' }, 400);
  const source = String(body.source ?? '').slice(0, 120) || null;

  // one counter per visitor per hour; the IP is hashed and never stored
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const { data: allowed, error: rateErr } = await db.rpc('ask_rate_hit', { p_bucket: 'cv' + (await sha256('cv|' + ip + '|' + hour)).slice(0, 30), p_limit: PER_HOUR });
  if (rateErr) return reply({ status: 'error', error: 'Something went wrong. Please try again.' }, 500);
  if (!allowed) return reply({ status: 'rate_limited', error: `Too many requests from here. Please try again later, or email ${NOTIFY_TO}.` }, 429);

  const since = new Date(Date.now() - REPEAT_MINUTES * 60_000).toISOString();
  const { data: recent } = await db.from('cv_requests').select('id').eq('email', email).eq('notified', true).gte('requested_at', since).limit(1);

  const { data: row, error: insErr } = await db.from('cv_requests').insert({ email, source }).select('id, requested_at').single();
  if (insErr || !row) return reply({ status: 'error', error: 'Something went wrong. Please try again.' }, 500);

  let notified = !!recent?.length; // already emailed about this address a moment ago
  if (!notified) {
    const err = await notify(email, String(row.requested_at).slice(0, 16).replace('T', ' ')).catch((e) => String(e));
    notified = !err;
    await db.from('cv_requests').update({ notified, notify_error: err }).eq('id', row.id);
  }
  return reply({ status: 'received', notified });
});

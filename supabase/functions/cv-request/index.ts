// View CV · a visitor leaves their email and gets Ankur's CV straight away, sent from his Gmail with the PDF attached.
// POST {"email": "...", "source": "page"} → { status }
//   status "received"      the CV is on its way (sent tells whether this call emailed it, or it went out a moment ago)
//   status "invalid" | "rate_limited" | "error"
// Every request is kept in public.cv_requests (notified = the CV was emailed, notify_error = why not), so none is lost.
// The PDF lives in the private Storage bucket "cv" at CV_PATH; replace it in the Supabase dashboard to update the CV, no redeploy needed.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';
import { cvEmail } from './email.js';

// the live site on GitHub Pages and Netlify (production plus its deploy previews), and local testing
const ALLOWED_ORIGINS = [/^https:\/\/ankurray1\.github\.io$/, /^https:\/\/([a-z0-9-]+--)?ankurray[a-z0-9-]*\.netlify\.app$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const PER_HOUR = 5;          // requests per visitor per hour
const REPEAT_MINUTES = 30;   // the same email asking again within this window is not sent the CV twice
const PER_DAY = 40;          // CVs sent per day in total, well under Gmail's limit, so a script can't burn through Ankur's account
const ANKUR = 'john.ankur.ray@gmail.com';
const SITE = 'https://ankurray1.github.io/portfolio/';
const LINKEDIN = 'https://www.linkedin.com/in/ankur-ray-b9818a11a/';
const CV_BUCKET = 'cv';
const CV_PATH = 'Ankur-Ray-CV.pdf';
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

// Ankur's own Gmail sends both emails (SMTP over SSL on 465; Edge Functions block 25 and 587).
// GMAIL_APP_PASSWORD is a Google App Password for ANKUR, added by Ankur as a Supabase secret.
const gmail = () => {
  const pass = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
  return pass ? nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: ANKUR, pass } }) : null;
};

// fetched once per warm instance; the bucket is private, so only this function (service role) can read it
let cvPdf: Uint8Array | null = null;
async function loadCv(): Promise<Uint8Array> {
  if (cvPdf) return cvPdf;
  const { data, error } = await db.storage.from(CV_BUCKET).download(CV_PATH);
  if (error || !data) throw new Error(`cv download: ${error?.message ?? 'no file'}`);
  return (cvPdf = new Uint8Array(await data.arrayBuffer()));
}

// returns null when the CV went out, or the reason it didn't
async function sendCv(to: string, when: string): Promise<string | null> {
  const mail = gmail();
  if (!mail) return 'no sender set: add the GMAIL_APP_PASSWORD secret';
  const pdf = await loadCv().catch(() => null);
  if (!pdf) {
    // no PDF in the bucket yet: fall back to asking Ankur to reply with it by hand, so the visitor still gets it
    await mail.sendMail({
      from: `Portfolio CV request <${ANKUR}>`, to: ANKUR, replyTo: to, subject: `CV request from ${to} (send by hand)`,
      text: `${to} asked for your CV on your portfolio (${when} UTC), but there's no PDF at ${CV_BUCKET}/${CV_PATH} in Supabase Storage, so it wasn't sent automatically.\n\nReply to this email with the CV attached; the reply goes straight to them. Upload the PDF to that bucket and future requests are sent for you.`,
    });
    return 'no CV in storage: Ankur was asked to send it by hand';
  }
  const { subject, html: body, text } = cvEmail({ to, site: SITE, linkedin: LINKEDIN, from: ANKUR });
  try {
    await mail.sendMail({
      from: `Ankur Ray <${ANKUR}>`, to, replyTo: ANKUR, subject, text, html: body,
      attachments: [{ filename: 'Ankur-Ray-CV.pdf', content: pdf, contentType: 'application/pdf' }],
    });
  } catch (e) {
    return `gmail: ${String((e as Error)?.message ?? e).slice(0, 300)}`;
  }
  // a heads-up for Ankur; replying to it goes straight to the visitor. Failing here doesn't undo the send.
  await mail.sendMail({
    from: `Portfolio <${ANKUR}>`, to: ANKUR, replyTo: to, subject: `Your CV was sent to ${to}`,
    text: `${to} asked for your CV on your portfolio (${when} UTC) and it was emailed to them with the PDF attached.\n\nReply to this email to follow up; it goes straight to them.`,
    html: `<p><b>${html(to)}</b> asked for your CV on your portfolio (${html(when)} UTC) and it was emailed to them with the PDF attached.</p><p>Reply to this email to follow up; it goes straight to them.</p>`,
  }).catch(() => {});
  return null;
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
  if (!allowed) return reply({ status: 'rate_limited', error: `Too many requests from here. Please try again later, or email ${ANKUR}.` }, 429);

  const since = new Date(Date.now() - REPEAT_MINUTES * 60_000).toISOString();
  const { data: recent } = await db.from('cv_requests').select('id').eq('email', email).eq('notified', true).gte('requested_at', since).limit(1);

  const { data: row, error: insErr } = await db.from('cv_requests').insert({ email, source }).select('id, requested_at').single();
  if (insErr || !row) return reply({ status: 'error', error: 'Something went wrong. Please try again.' }, 500);

  if (recent?.length) return reply({ status: 'received', sent: false }); // already emailed a moment ago; don't send it twice

  const today = new Date().toISOString().slice(0, 10);
  const { count } = await db.from('cv_requests').select('id', { count: 'exact', head: true }).eq('notified', true).gte('requested_at', today);
  if ((count ?? 0) >= PER_DAY) {
    await db.from('cv_requests').update({ notified: false, notify_error: 'daily limit reached' }).eq('id', row.id);
    return reply({ status: 'rate_limited', error: `Lots of requests today. Please email ${ANKUR} and Ankur will send it.` }, 429);
  }

  const err = await sendCv(email, String(row.requested_at).slice(0, 16).replace('T', ' ')).catch((e) => String(e?.message ?? e));
  await db.from('cv_requests').update({ notified: !err, notify_error: err }).eq('id', row.id);
  if (err?.startsWith('no CV in storage')) return reply({ status: 'received', sent: false, manual: true });
  return err
    ? reply({ status: 'error', error: `The CV couldn't be sent just now. Please email ${ANKUR}.` }, 502)
    : reply({ status: 'received', sent: true });
});

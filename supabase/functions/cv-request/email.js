// The email a visitor gets after asking for the CV. Plain JS so the same file runs in the Edge Function and in a local preview.
// Built with tables and inline styles because Gmail and Outlook ignore most CSS; the gradient band falls back to a solid colour.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const C = { bg: '#ECECEA', card: '#FFFFFF', ink: '#151515', muted: '#6C6C67', line: '#E3E3DF', sunk: '#F4F4F1', accent: '#D4405F', band: '#17141C' };
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'SF Mono',Menlo,Consolas,monospace";

const PROOF = [
  ['200+ MAU', 'in 2 weeks', 'An AI agent I launched inside Microsoft Copilot at a Fortune 500 account, later featured by Microsoft.'],
  ['34K → 150K', 'monthly users', 'Platform growth at Vantage Circle, driven by funnel and cohort analysis and A/B tests.'],
  ['75% → 89%', 'eval pass rate', 'An LLM-as-judge evaluation set I built, validated by Microsoft’s partner team.'],
];

export function cvEmail({ to, site, linkedin, from }) {
  const subject = 'My CV, as promised · Ankur Ray';
  const preheader = 'Attached: my CV as a PDF. Plus the 30-second version, in case you are between meetings.';
  const chat = `mailto:${from}?subject=${encodeURIComponent('Let’s talk')}`;

  const proofRows = PROOF.map(([big, unit, line]) => `
    <tr><td style="padding:0 0 10px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sunk};border-radius:14px">
        <tr><td style="padding:16px 18px">
          <div style="font:600 22px/1.1 ${SANS};letter-spacing:-.02em;color:${C.ink}">${esc(big)} <span style="font:400 13px ${SANS};color:${C.muted};letter-spacing:0">${esc(unit)}</span></div>
          <div style="font:400 14px/1.5 ${SANS};color:${C.muted};padding-top:6px">${esc(line)}</div>
        </td></tr>
      </table>
    </td></tr>`).join('');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">

    <!-- band: the same dark "photo" strip as the site's top bar -->
    <tr><td bgcolor="${C.band}" style="border-radius:22px 22px 0 0;background-color:${C.band};background-image:radial-gradient(70% 160% at 0% 30%,rgba(201,102,122,.75) 0,rgba(201,102,122,0) 70%),radial-gradient(60% 160% at 100% 20%,rgba(91,63,134,.9) 0,rgba(91,63,134,0) 75%);padding:30px 32px 28px">
      <div style="font:500 11px/1 ${MONO};letter-spacing:.14em;text-transform:uppercase;color:rgba(244,243,239,.75)">AI Product Manager · B2B SaaS</div>
      <div style="font:500 34px/1.05 ${SANS};letter-spacing:-.035em;color:#F4F3EF;padding-top:14px">Here’s my <span style="font:italic 400 36px/1 ${SERIF};letter-spacing:-.01em">CV</span>, as promised.</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>
        <td style="background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:7px 12px;font:500 12px/1 ${MONO};color:#F4F3EF">&#128206;&nbsp; Ankur-Ray-CV.pdf is attached</td>
      </tr></table>
    </td></tr>

    <!-- body -->
    <tr><td bgcolor="${C.card}" style="background:${C.card};border-radius:0 0 22px 22px;padding:30px 32px 32px">
      <p style="margin:0 0 14px;font:400 16px/1.6 ${SANS};color:${C.ink}">Hi there,</p>
      <p style="margin:0 0 14px;font:400 16px/1.6 ${SANS};color:${C.ink}">Thanks for stopping by my portfolio and asking for my CV. It’s attached to this email as a PDF.</p>
      <p style="margin:0 0 22px;font:400 16px/1.6 ${SANS};color:${C.ink}">I’m an AI product manager with about four years in B2B SaaS: I take AI products from idea to enterprise adoption. If you only have 30 seconds, here’s what I’d want you to know:</p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${proofRows}</table>

      <p style="margin:14px 0 22px;font:400 16px/1.6 ${SANS};color:${C.ink}">If any of that fits what you’re building, I’d love to talk. Just reply to this email and it comes straight to me.</p>

      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td bgcolor="${C.ink}" style="border-radius:999px"><a href="${esc(chat)}" style="display:inline-block;padding:13px 22px;font:500 14px/1 ${SANS};color:#F4F3EF;text-decoration:none;border-radius:999px">Set up a chat &rarr;</a></td>
        <td style="width:10px"></td>
        <td style="border-radius:999px;border:1px solid ${C.line}"><a href="${esc(site)}" style="display:inline-block;padding:12px 20px;font:500 14px/1 ${SANS};color:${C.ink};text-decoration:none;border-radius:999px">See my work</a></td>
      </tr></table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;border-top:1px solid ${C.line}"><tr><td style="padding-top:22px">
        <div style="font:italic 400 22px/1.2 ${SERIF};color:${C.ink}">Ankur Ray</div>
        <div style="font:400 13px/1.6 ${SANS};color:${C.muted};padding-top:4px">AI Product Manager · India<br>
          <a href="${esc(site)}" style="color:${C.ink}">Portfolio</a> &nbsp;·&nbsp; <a href="${esc(linkedin)}" style="color:${C.ink}">LinkedIn</a> &nbsp;·&nbsp; <a href="mailto:${esc(from)}" style="color:${C.ink}">${esc(from)}</a></div>
      </td></tr></table>
    </td></tr>

    <tr><td style="padding:18px 20px 0;font:400 12px/1.6 ${SANS};color:${C.muted};text-align:center">
      You’re getting this one email because ${esc(to)} asked for my CV on my portfolio. There’s no mailing list, so nothing else will follow.
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;

  const text = [
    'Hi there,', '',
    'Thanks for stopping by my portfolio and asking for my CV. It’s attached to this email as a PDF.', '',
    'If you only have 30 seconds:',
    ...PROOF.map(([big, unit, line]) => `- ${big} ${unit}: ${line}`), '',
    'If any of that fits what you’re building, I’d love to talk. Just reply to this email.', '',
    'Ankur Ray', 'AI Product Manager · India', `Portfolio: ${site}`, `LinkedIn: ${linkedin}`, '',
    `You’re getting this one email because ${to} asked for my CV on my portfolio. There’s no mailing list.`,
  ].join('\n');

  return { subject, html, text };
}

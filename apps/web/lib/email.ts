/**
 * Transactional email via Resend (ADR-004). Plain HTTP against the Resend API — no SDK,
 * keeps the dependency surface small and the call sites synchronous.
 *
 * Resend is optional: with no API key configured every send is a no-op and callers fall
 * back to in-app notifications only. A domain you don't own sends from Resend's shared
 * onboarding address, which is fine for staging but gets rate-limited and lands in spam
 * for real users — set EMAIL_FROM to your own verified domain before launch.
 */

export type Email = { to: string; subject: string; text: string; html?: string };

const RESEND_API = 'https://api.resend.com';

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** From address, defaulting to Resend's onboarding sender when unset. */
function fromAddress(): string {
  return process.env.EMAIL_FROM || 'Learnovize <onboarding@resend.dev>';
}

/**
 * Absolute link for emails. In-app we use relative paths, but a mail client has no
 * origin to resolve them against, so relative links are dead on arrival.
 */
export function absoluteUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  if (!base) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Flat email shell — inline styles only, no images, no external CSS. Mail clients strip
 * <style> blocks and block remote assets, so a template that looks right in a browser
 * renders blank in Gmail.
 */
export function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2b33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe5e8;border-radius:8px">
<tr><td style="padding:24px 28px 8px 28px">
<p style="margin:0 0 4px 0;font-size:15px;font-weight:700;letter-spacing:.02em;color:#1b7e8d">Learnovize</p>
<p style="margin:0;font-size:20px;font-weight:700;line-height:1.3">${escapeHtml(title)}</p>
</td></tr>
<tr><td style="padding:8px 28px 24px 28px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #eef1f3;font-size:12px;color:#6b7378">
You are receiving this because you use Learnovize.
</td></tr>
</table></td></tr></table></body></html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

export function button(href: string, label: string): string {
  return `<p style="margin:20px 0 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1b7e8d;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:11px 20px;border-radius:6px">${escapeHtml(label)}</a></p>`;
}

/**
 * Send one email. Returns true only when Resend accepted it. Never throws — a failed
 * email must not roll back the in-app notification or the payment that triggered it.
 */
export async function sendEmail(msg: Email): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const r = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[email] Resend rejected:', r.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] send failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

/** Send the same message to many recipients, one request each (Resend has no batch send). */
export async function sendEmailMany(msgs: Email[]): Promise<{ sent: number; failed: number }> {
  const results = await Promise.all(msgs.map((m) => sendEmail(m)));
  return { sent: results.filter(Boolean).length, failed: results.filter((r) => !r).length };
}

/* ------------------------------------------------------------------ templates */

export function trainingAnnouncedEmail(opts: {
  trainerName: string; title: string; registerPath: string;
}): Email {
  const href = absoluteUrl(opts.registerPath);
  return {
    to: '', // filled per-recipient
    subject: `${opts.trainerName} announced: ${opts.title}`,
    text: `${opts.trainerName} just announced "${opts.title}".\n\nRegister: ${href}`,
    html: shell(
      `${opts.trainerName} just announced a training`,
      `<p style="margin:0 0 8px 0">You're following ${escapeHtml(opts.trainerName)}, so you heard about this first.</p>
       <p style="margin:0;font-weight:600;font-size:17px">${escapeHtml(opts.title)}</p>
       ${button(href, 'View training')}`,
    ),
  };
}

export function seatConfirmedEmail(opts: { trainingTitle: string; seatPath: string }): Email {
  const href = absoluteUrl(opts.seatPath);
  return {
    to: '',
    subject: `You're in: ${opts.trainingTitle}`,
    text: `Your seat is confirmed for "${opts.trainingTitle}".\n\nDetails: ${href}`,
    html: shell(
      'Your seat is confirmed',
      `<p style="margin:0 0 8px 0">You're registered for <strong>${escapeHtml(opts.trainingTitle)}</strong>.</p>
       <p style="margin:0;color:#6b7378;font-size:14px">Attendance is free. Join the live room from your seats page.</p>
       ${button(href, 'Open my seats')}`,
    ),
  };
}

export function sessionStartingEmail(opts: { trainingTitle: string; startsAtUtc: string; roomPath: string }): Email {
  const href = absoluteUrl(opts.roomPath);
  const when = new Date(opts.startsAtUtc).toUTCString();
  return {
    to: '',
    subject: `Starting soon: ${opts.trainingTitle}`,
    text: `"${opts.trainingTitle}" starts ${when}.\n\nJoin: ${href}`,
    html: shell(
      'Starting soon',
      `<p style="margin:0 0 8px 0"><strong>${escapeHtml(opts.trainingTitle)}</strong> starts at ${escapeHtml(when)}.</p>
       <p style="margin:0;color:#6b7378;font-size:14px">Sessions are not recorded. Be on time.</p>
       ${button(href, 'Join the room')}`,
    ),
  };
}

export function certificateReadyEmail(opts: { trainingTitle: string; number: string; certsPath: string }): Email {
  const href = absoluteUrl(opts.certsPath);
  const verify = absoluteUrl(`/verify/${opts.number}`);
  return {
    to: '',
    subject: `Your certificate is ready: ${opts.number}`,
    text: `You earned a certificate for "${opts.trainingTitle}".\n\nNumber: ${opts.number}\nVerify: ${verify}`,
    html: shell(
      'Your certificate is ready',
      `<p style="margin:0 0 8px 0">You completed <strong>${escapeHtml(opts.trainingTitle)}</strong>.</p>
       <p style="margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;background:#f6f8f9;border:1px solid #dfe5e8;border-radius:6px;padding:10px 12px">${escapeHtml(opts.number)}</p>
       ${button(href, 'Download certificate')}
       <p style="margin:14px 0 0 0;font-size:13px;color:#6b7378">Share it, or let anyone check it: ${escapeHtml(verify)}</p>`,
    ),
  };
}

export function paymentReceiptEmail(opts: {
  trainingTitle: string; amountNgn: number; reference: string; certsPath: string;
}): Email {
  const href = absoluteUrl(opts.certsPath);
  return {
    to: '',
    subject: `Payment received: ₦${opts.amountNgn.toLocaleString('en-NG')}`,
    text: `We received your payment for "${opts.trainingTitle}".\n\nAmount: ₦${opts.amountNgn}\nReference: ${opts.reference}\n\nYour certificate: ${href}`,
    html: shell(
      'Payment received',
      `<p style="margin:0 0 12px 0">Thanks — your payment for <strong>${escapeHtml(opts.trainingTitle)}</strong> is confirmed.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px">
         <tr><td style="padding:2px 16px 2px 0;color:#6b7378">Amount</td><td style="padding:2px 0;font-weight:600">₦${opts.amountNgn.toLocaleString('en-NG')}</td></tr>
         <tr><td style="padding:2px 16px 2px 0;color:#6b7378">Reference</td><td style="padding:2px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">${escapeHtml(opts.reference)}</td></tr>
       </table>
       ${button(href, 'View my certificates')}`,
    ),
  };
}
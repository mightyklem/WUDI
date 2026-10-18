import { lagosWhenLabel } from './lagos';

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
  // Delegates to the health check rather than repeating a looser version of it. Two
  // definitions of "can we send" is how sendEmail ended up guarded differently from the
  // callers that ask this question first.
  return emailHealth().canDeliver;
}

/**
 * From address.
 *
 * Resend's onboarding@resend.dev sender is a TESTING sender: Resend rejects every send to
 * anyone but the account owner's own address with a 403. Falling back to it in production
 * therefore does not "send something that might not arrive" -- it guarantees that nothing
 * arrives, silently, to every real user. That is exactly how new signups ended up told
 * "we sent a 6-digit code" and never receiving one.
 *
 * So it is allowed in development, where sending to your own inbox is the point, and refused
 * in production, where the only safe behaviour is to not pretend.
 */
function fromAddress(): string | null {
  const configured = process.env.EMAIL_FROM?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV !== 'production') return 'Learnovize <onboarding@resend.dev>';
  return null;
}

/**
 * Whether real mail can leave this deployment, as booleans only.
 *
 * Nothing here returns a secret or a full key -- it is safe to show an admin, because the
 * question "is email working" had no answer at all until now, and an outage nobody can see
 * is how a broken signup goes unreported for days.
 */
export function emailHealth(): {
  apiKeySet: boolean;
  fromConfigured: boolean;
  fromIsResendSandbox: boolean;
  canDeliver: boolean;
  problem: string | null;
} {
  const apiKeySet = Boolean(process.env.RESEND_API_KEY);
  const from = fromAddress();
  const sandbox = from?.includes('resend.dev') ?? false;
  const canDeliver = apiKeySet && from !== null && !(sandbox && process.env.NODE_ENV === 'production');
  let problem: string | null = null;
  if (!apiKeySet) problem = 'RESEND_API_KEY is not set.';
  else if (!from) problem = 'EMAIL_FROM is not set. Without it Resend only allows sending to the account owner, so nothing would reach a real user.';
  else if (sandbox && process.env.NODE_ENV === 'production') problem = 'EMAIL_FROM is not set in production; the resend.dev test sender cannot deliver to real users.';
  return { apiKeySet, fromConfigured: from !== null, fromIsResendSandbox: sandbox, canDeliver, problem };
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
  const health = emailHealth();
  if (!health.canDeliver) {
    // Loud, greppable, and honest about the fact that this is a deployment problem rather
    // than a bad address. Previously this returned false with no trace at the call site,
    // so a total mail outage looked exactly like a quiet, successful signup.
    console.error('[email] NOT SENT —', health.problem ?? 'mail is not configured', '| to:', msg.to, '| subject:', msg.subject);
    return false;
  }
  try {
    const r = await fetch(`${RESEND_API}/emails`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress()!,
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

export function passwordResetEmail(opts: { resetPath: string }): Email {
  const href = absoluteUrl(opts.resetPath);
  return {
    to: '', // filled per-recipient
    subject: 'Reset your Learnovize password',
    text: `Someone asked to reset the password on this account.\n\nReset it here: ${href}\n\nThe link works once and expires in 30 minutes. If this wasn't you, ignore this email — your password has not changed.`,
    html: shell(
      'Reset your password',
      `<p style="margin:0 0 8px 0">Someone asked to reset the password for this account.</p>
       <p style="margin:0 0 8px 0;color:#6b7378;font-size:14px">The link works once and expires in 30 minutes.</p>
       ${button(href, 'Choose a new password')}
       <p style="margin:14px 0 0 0;font-size:13px;color:#6b7378">If this wasn't you, ignore this email — nothing has changed.</p>`,
    ),
  };
}

export function moderatorInvitedEmail(opts: {
  trainerName: string; title: string; trainingPath: string;
}): Email {
  const href = absoluteUrl(opts.trainingPath);
  return {
    to: '', // filled per-recipient
    subject: `${opts.trainerName} invited you to moderate "${opts.title}"`,
    text: `${opts.trainerName} invited you to be a moderator for "${opts.title}".\n\nAccept: ${href}`,
    html: shell(
      'You have been invited to moderate a class',
      `<p style="margin:0 0 8px 0"><strong>${escapeHtml(opts.trainerName)}</strong> invited you to moderate
         <strong>${escapeHtml(opts.title)}</strong>.</p>
       <p style="margin:0;color:#6b7378;font-size:14px">As a moderator you can allow learners to speak and mute
         anyone talking over the lesson. Nobody can be removed from a class.</p>
       ${button(href, 'View the class')}`,
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

/**
 * The reminder about what somebody is booked into.
 *
 * Two kinds, because they are read at two different moments. "Soon" is planning -- they may
 * be on a laptop and can note the time. "Today" is the nudge, and it is deliberately terse:
 * by then the only useful thing is the hour and the link, and anything longer gets skipped.
 *
 * Takes a list rather than one class, because somebody booked into a course with three
 * sessions tomorrow should get one email listing three, not three emails.
 *
 * Times are Lagos, not GMT. The old version printed toUTCString(), which told a learner in
 * Lagos their 3pm class was at "14:00:00 GMT" -- and every other time in this product is
 * already in their timezone.
 */
export function sessionsReminderEmail(
  items: { trainingTitle: string; startsAtUtc: string; roomPath: string }[],
  kind: 'soon' | 'today',
): Email {
  const today = kind === 'today';
  const list = items
    .map((i) => ({ ...i, when: lagosWhenLabel(i.startsAtUtc), href: absoluteUrl(i.roomPath) }));

  const rows = list
    .map(
      (i) => `<tr>
        <td style="padding:10px 0;border-top:1px solid var(--line,#e6ebee);font-size:15px">
          <strong style="display:block">${escapeHtml(i.trainingTitle)}</strong>
          <span style="color:#6b7378;font-size:14px">${escapeHtml(i.when)}</span>
        </td>
        <td style="padding:10px 0;border-top:1px solid var(--line,#e6ebee);text-align:right;white-space:nowrap">
          <a href="${escapeHtml(i.href)}" style="font-size:14px;font-weight:600;color:#1b7e8d;text-decoration:none">Join room &rsaquo;</a>
        </td>
      </tr>`,
    )
    .join('');

  const subject = today
    ? list.length === 1
      ? `Today: ${list[0].trainingTitle}`
      : `Today: ${list.length} classes`
    : `Coming up: ${list.length === 1 ? list[0].trainingTitle : `${list.length} classes`}`;

  const text = list.map((i) => `${i.trainingTitle} — ${i.when}\n${i.href}`).join('\n\n');

  return {
    to: '',
    subject,
    text: `${text}\n\nSessions are not recorded. Be on time.`,
    html: shell(
      today ? 'Your class today' : 'Coming up',
      `<p style="margin:0 0 14px 0;font-size:15px">${
        today
          ? 'You have a class today. Rooms are not recorded, so be on time.'
          : 'You are booked into these. Rooms are not recorded, so be on time.'
      }</p>
       <table role="presentation" style="width:100%;border-collapse:collapse">${rows}</table>
       ${button(absoluteUrl('/me/registrations'), 'All my seats')}`,
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
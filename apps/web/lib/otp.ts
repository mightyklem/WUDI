import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';
import { absoluteUrl, button, escapeHtml, sendEmail, shell } from '@/lib/email';

/**
 * Email OTP verification (ADR-002).
 *
 * The code is never stored in the clear — only a sha256 of it, so a database leak cannot be
 * replayed into verified accounts. Codes are compared with timingSafeEqual so the endpoint
 * does not leak how many digits were correct through response timing.
 */

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60_000;

/** Cryptographically random 6-digit code, zero-padded. */
export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Constant-time compare of a submitted code against a stored hash. */
export function otpMatches(code: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function otpExpired(expiresAt: Date | null, now = new Date()): boolean {
  return !expiresAt || expiresAt.getTime() <= now.getTime();
}

export function attemptsLeft(attempts: number): number {
  return Math.max(0, MAX_ATTEMPTS - attempts);
}

export type OtpUser = {
  id: string;
  email: string;
  emailOtpExpiresAt: Date | null;
};

/**
 * Mint a code, store only its hash, and email it.
 *
 * Returns whether the mail was actually accepted by the provider, because the caller has to
 * be able to tell the truth. Signup used to answer "we sent a 6-digit code" from a hardcoded
 * true while the send quietly failed, which is how people were told to check an inbox that
 * was never going to receive anything.
 *
 * The plaintext code is returned for local dev logging only — never return it from a route.
 */
export async function issueOtp(
  user: OtpUser,
  now = new Date(),
): Promise<{ sent: boolean; code: string | null }> {
  // One code per minute per account, so an attacker cannot flood someone's inbox or burn
  // through our Resend quota.
  const issuedAt = user.emailOtpExpiresAt
    ? user.emailOtpExpiresAt.getTime() - CODE_TTL_MINUTES * 60_000
    : 0;
  if (user.emailOtpExpiresAt && now.getTime() - issuedAt < RESEND_COOLDOWN_MS) {
    return { sent: false, code: null };
  }

  const code = newOtpCode();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailOtpHash: hashOtp(code),
      emailOtpExpiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
      emailOtpAttempts: 0,
    },
  });
  const sent = await sendEmail({ ...verificationCodeEmail(code), to: user.email });
  if (!sent) {
    // Clear the hash so the account is not left holding a code that was never delivered.
    // Otherwise "I never got a code" is unfixable without a rate-limit bypass: the stored
    // code is real, the cooldown is armed, and resend returns early for a minute with
    // nothing sent either.
    await prisma.user.update({
      where: { id: user.id },
      data: { emailOtpHash: null, emailOtpExpiresAt: null },
    }).catch(() => undefined);
  }
  return { sent, code };
}

export function verificationCodeEmail(code: string): { subject: string; text: string; html: string } {
  const href = absoluteUrl('/login');
  return {
    subject: `${code} is your Learnovize code`,
    text: `Your Learnovize verification code is ${code}.\n\nIt expires in ${CODE_TTL_MINUTES} minutes.\nEnter it at: ${href}`,
    html: shell(
      'Confirm your email',
      `<p style="margin:0 0 12px 0">Use this code to confirm your email address:</p>
       <p style="margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:30px;letter-spacing:6px;font-weight:700;background:#f6f8f9;border:1px solid #dfe5e8;border-radius:8px;padding:14px 18px;text-align:center">${escapeHtml(code)}</p>
       <p style="margin:14px 0 0 0;font-size:14px;color:#6b7378">Expires in ${CODE_TTL_MINUTES} minutes. If you did not create a Learnovize account, you can ignore this email.</p>
       ${button(href, 'Enter the code')}`,
    ),
  };
}
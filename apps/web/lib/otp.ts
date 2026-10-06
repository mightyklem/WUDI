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
 * Mint a code, store only its hash, and email it. Returns the plaintext code so callers
 * can log it in local dev — never return it from an HTTP route.
 */
export async function issueOtp(user: OtpUser, now = new Date()): Promise<string | null> {
  // One code per minute per account, so an attacker cannot flood someone's inbox or burn
  // through our Resend quota.
  const issuedAt = user.emailOtpExpiresAt
    ? user.emailOtpExpiresAt.getTime() - CODE_TTL_MINUTES * 60_000
    : 0;
  if (user.emailOtpExpiresAt && now.getTime() - issuedAt < RESEND_COOLDOWN_MS) return null;

  const code = newOtpCode();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailOtpHash: hashOtp(code),
      emailOtpExpiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60_000),
      emailOtpAttempts: 0,
    },
  });
  await sendEmail({ ...verificationCodeEmail(code), to: user.email });
  return code;
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
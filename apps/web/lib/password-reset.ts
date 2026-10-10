import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { hashPassword, hashRefreshToken } from '@/lib/auth';

/**
 * Password reset (ADR-002 "password reset via OTP, rate-limit 5/hr/IP + 3/hr/account").
 *
 * Security notes that drove the shape:
 *
 * - Only the SHA-256 hash of the token is stored. A database leak then cannot be turned
 *   into account takeovers, which is the whole reason refresh tokens were already
 *   stored this way.
 * - The caller of /forgot-password learns nothing about whether the account exists.
 *   An enumeration oracle here would tell an attacker who has an account, which is a
 *   step towards a credential-stuffing target list.
 * - Resetting a password revokes every existing refresh token. Otherwise a thief who
 *   stole a session keeps it after the real owner recovers the account, and "I reset my
 *   password" would mean nothing.
 */

const TOKEN_TTL_MINUTES = 30;
const PER_ACCOUNT_PER_HOUR = 3;

export function resetTokenExpiry(): Date {
  return new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
}

/** Raw token goes in the email; only its hash is persisted. */
export function newResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashRefreshToken(token) };
}

/**
 * Create a reset token unless this account has asked for too many recently.
 * Returns null when the per-account limit is hit, which the caller reports as the same
 * generic success it gives for an unknown email.
 */
export async function createResetToken(userId: string): Promise<string | null> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.passwordResetToken.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (recent >= PER_ACCOUNT_PER_HOUR) return null;

  const { token, tokenHash } = newResetToken();
  const row = await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt: resetTokenExpiry() },
    select: { id: true },
  });
  // Invalidate every other unused token for this account. Otherwise a link forwarded
  // or left in an old inbox stays usable alongside the one just issued, and only the
  // most recent request should work.
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null, id: { not: row.id } },
    data: { usedAt: new Date() },
  });
  return token;
}

export type ResetFailure = 'invalid' | 'expired' | 'used';

/** Look up a token and report precisely why it is unusable. */
export async function checkResetToken(token: string): Promise<{ userId: string } | { error: ResetFailure }> {
  if (!token || typeof token !== 'string' || token.length < 32) return { error: 'invalid' };
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { error: 'invalid' };
  if (row.usedAt) return { error: 'used' };
  if (row.expiresAt.getTime() < Date.now()) return { error: 'expired' };
  return { userId: row.userId };
}

/** Consume the token, set the new password, and kill every existing session. */
export async function completeReset(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { error: ResetFailure | 'password' }> {
  const check = await checkResetToken(token);
  if ('error' in check) return { error: check.error };

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: check.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { tokenHash: hashRefreshToken(token) }, data: { usedAt: now } }),
    // Recovery is pointless if an attacker keeps the session they already hold.
    prisma.refreshToken.updateMany({ where: { userId: check.userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  return { ok: true };
}

/** bcrypt truncates beyond 72 bytes, so a longer password is silently weaker. */
export function passwordProblem(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Use at least 8 characters.';
  if (pw.length > 72) return 'Use 72 characters or fewer.';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Mix letters and numbers.';
  return null;
}
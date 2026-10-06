import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { signAccessToken, newRefreshToken } from '@/lib/auth';
import { MAX_ATTEMPTS, attemptsLeft, otpExpired, otpMatches } from '@/lib/otp';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify-email { email, code }
// Confirms address ownership and, on success, returns the session. A wrong code burns an
// attempt so the 6-digit space cannot be brute-forced (1e6 codes, 5 tries).
export async function POST(req: Request) {
  const { email, code } = (await req.json().catch(() => ({}))) as {
    email?: string; code?: string;
  };
  if (!email || !code) {
    return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Do not reveal whether the address exists.
  if (!user) return NextResponse.json({ error: 'Invalid email or code' }, { status: 400 });
  if (user.emailVerifiedAt) {
    return NextResponse.json({ error: 'Email already verified — log in instead' }, { status: 409 });
  }
  if (user.emailOtpAttempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts — request a new code' }, { status: 429 });
  }

  if (otpExpired(user.emailOtpExpiresAt)) {
    return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 });
  }
  if (!otpMatches(code, user.emailOtpHash)) {
    const left = attemptsLeft(user.emailOtpAttempts + 1);
    await prisma.user.update({
      where: { id: user.id },
      data: { emailOtpAttempts: { increment: 1 } },
    });
    return NextResponse.json({ error: 'Incorrect code', attemptsLeft: left }, { status: 400 });
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      emailOtpAttempts: 0,
    },
  });
  const access = await signAccessToken(verified.id);
  const { token: refresh, tokenHash } = newRefreshToken();
  await prisma.refreshToken.create({ data: { userId: verified.id, tokenHash } });
  return NextResponse.json({
    user: { id: verified.id, email: verified.email },
    access,
    refresh,
  });
}
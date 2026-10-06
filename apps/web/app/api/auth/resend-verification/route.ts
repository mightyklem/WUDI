import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { issueOtp } from '@/lib/otp';

export const dynamic = 'force-dynamic';

// POST /api/auth/resend-verification { email }
// Re-sends the code to an unverified account. Always answers 200 so the endpoint cannot be
// used to discover which addresses are registered (same posture as login).
export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (user && !user.emailVerifiedAt) {
    // issueOtp enforces the per-account cooldown and swallows the result.
    await issueOtp({
      id: user.id,
      email: user.email,
      emailOtpExpiresAt: user.emailOtpExpiresAt,
    });
  }
  return NextResponse.json({ ok: true });
}
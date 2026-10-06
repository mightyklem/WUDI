import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { issueOtp } from '@/lib/otp';

export const dynamic = 'force-dynamic';

// POST /api/auth/signup { email, password }
// Creates the account UNVERIFIED and emails a 6-digit code. No session is issued here —
// the caller must verify first (ADR-002), so an address nobody owns cannot be used to host
// a training or submit ID documents.
export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string; password?: string;
  };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be 8+ characters' }, { status: 400 });
  }
  const lower = email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email: lower } })) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email: lower, passwordHash: await hashPassword(password) },
  });
  // Best effort: if mail fails the account still exists and the resend endpoint covers it.
  await issueOtp({ id: user.id, email: user.email, emailOtpExpiresAt: null });

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email },
      verificationRequired: true,
      emailSent: true,
    },
    { status: 201 },
  );
}
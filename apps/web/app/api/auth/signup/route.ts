import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { issueOtp } from '@/lib/otp';

export const dynamic = 'force-dynamic';

// POST /api/auth/signup { email, password, fullName? }
// Creates the account UNVERIFIED and emails a 6-digit code. No session is issued here —
// the caller must verify first (ADR-002), so an address nobody owns cannot be used to host
// a training or submit ID documents.
export async function POST(req: Request) {
  const { email, password, fullName } = (await req.json().catch(() => ({}))) as {
    email?: string; password?: string; fullName?: string;
  };
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be 8+ characters' }, { status: 400 });
  }

  // Trimmed, collapsed whitespace and length-capped, because this string is printed on a
  // document and laid out in the middle of a PDF. A name is not a place to paste a
  // paragraph, a style, or a second address. Optional -- a blank one is not worth
  // refusing somebody an account over, and every surface falls back to the email until set.
  const name = typeof fullName === 'string' ? fullName.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  if (name.length > 0 && name.length < 2) {
    return NextResponse.json({ error: 'Please give a name of at least two characters' }, { status: 400 });
  }

  const lower = email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email: lower } })) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email: lower, passwordHash: await hashPassword(password), fullName: name || null },
  });
  // The account exists either way — refusing to create it because a mail provider is
  // misconfigured would strand the person with no way back in. But the answer must say
  // truthfully whether the code went anywhere, because the screen tells them to go and
  // look for it.
  const { sent } = await issueOtp({ id: user.id, email: user.email, emailOtpExpiresAt: null });

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email, fullName: user.fullName },
      verificationRequired: true,
      emailSent: sent,
    },
    { status: 201 },
  );
}
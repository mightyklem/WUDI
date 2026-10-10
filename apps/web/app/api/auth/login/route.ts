import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { checkPassword, signAccessToken, newRefreshToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth/login { email, password }
export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as {
    email?: string; password?: string;
  };
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Same message either way: no account enumeration.
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (user.suspended) {
    return NextResponse.json({ error: 'Account suspended — contact support' }, { status: 403 });
  }
  // Erasure anonymises rather than deletes the row, so the account still exists here.
  // Without this check the placeholder address could still be used to sign in.
  if (user.deletedAt) {
    return NextResponse.json({ error: 'This account has been deleted' }, { status: 410 });
  }
  // Unverified addresses cannot hold a session (ADR-002). Password was already checked, so
  // this leaks nothing that the generic invalid-credentials response does not.
  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: 'Confirm your email address to continue', verificationRequired: true },
      { status: 403 },
    );
  }
  const access = await signAccessToken(user.id);
  const { token: refresh, tokenHash } = newRefreshToken();
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash } });
  return NextResponse.json({ user: { id: user.id, email: user.email }, access, refresh });
}

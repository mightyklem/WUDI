import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, signAccessToken, newRefreshToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth/signup { email, password, name? }
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
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), passwordHash: await hashPassword(password) },
  });
  const access = await signAccessToken(user.id);
  const { token: refresh, tokenHash } = newRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash },
  });
  return NextResponse.json({ user: { id: user.id, email: user.email }, access, refresh });
}

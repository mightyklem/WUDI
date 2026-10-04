import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/auth/refresh { refresh }
// Rotates: consumes the presented token, issues a new pair.
// Reuse of a consumed token revokes the whole chain (theft detection).
export async function POST(req: Request) {
  const { refresh } = (await req.json().catch(() => ({}))) as { refresh?: string };
  if (!refresh) return NextResponse.json({ error: 'Refresh token required' }, { status: 400 });

  const presented = hashRefreshToken(refresh);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: presented } });
  if (!stored || stored.revokedAt) {
    // Possible reuse: if token belonged to a user, revoke all their tokens.
    if (stored) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
  }
  await prisma.refreshToken.update({
    where: { tokenHash: presented },
    data: { revokedAt: new Date() },
  });
  const { token: next, tokenHash } = newRefreshToken();
  await prisma.refreshToken.create({ data: { userId: stored.userId, tokenHash } });
  const access = await signAccessToken(stored.userId);
  return NextResponse.json({ access, refresh: next });
}

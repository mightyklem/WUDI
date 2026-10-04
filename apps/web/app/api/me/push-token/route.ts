import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/me/push-token { token, platform } — register an Expo push token.
// De-duped by token; tokens die with the account.
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { token: pushToken, platform } = (await req.json().catch(() => ({}))) as {
    token?: string; platform?: string;
  };
  if (!pushToken || pushToken.length > 255) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }
  await prisma.pushToken.upsert({
    where: { token: pushToken },
    create: { token: pushToken, userId, platform: (platform || 'unknown').slice(0, 20) },
    update: { userId, platform: (platform || 'unknown').slice(0, 20) },
  });
  return NextResponse.json({ ok: true });
}

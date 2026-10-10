import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { releasePayout } from '@/lib/payout-release';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/payouts/release { payoutId }
 *
 * One payout at a time, and only when that payout is actually releasable.
 *
 * This replaced a bulk route that marked every due payout 'paid' in a loop with a
 * comment where the transfer should go. It told trainers they had been paid and sent
 * nothing. Nothing about that was recoverable, because nothing was ever attempted.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { payoutId } = (await req.json().catch(() => ({}))) as { payoutId?: string };
  if (!payoutId) return NextResponse.json({ error: 'payoutId required' }, { status: 400 });

  const result = await releasePayout(payoutId, actorId);
  if (!result.ok) {
    // 409 for "we won't do this yet", 502 for "the provider said no". Different problems
    // deserve different handling by whoever is looking at the screen.
    const status = ['not-found', 'already-paid'].includes(result.code)
      ? 404
      : result.code === 'transfer-failed'
        ? 502
        : 409;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  // `ok` comes from the result itself, so do not also put it in the spread.
  return NextResponse.json({ ...result, ok: true });
}
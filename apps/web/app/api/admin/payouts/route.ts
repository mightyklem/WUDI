import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { availableBalanceNgn, payoutQueue } from '@/lib/payout-release';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payouts — the release queue.
 *
 * Each payout carries its blockers, so an admin sees "no payout account on file" or
 * "below the ₦5,000 minimum" before clicking rather than after.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [queue, balance] = await Promise.all([payoutQueue(), availableBalanceNgn()]);

  return NextResponse.json({
    queue,
    balanceNgn: balance,
    // Told plainly rather than inferred: a null balance means we could not read it.
    balanceKnown: balance !== null,
    minPayoutNgn: Number(process.env.PAYOUT_MIN_NGN || 5000),
  });
}
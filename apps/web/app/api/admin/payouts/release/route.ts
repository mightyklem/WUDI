import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { releaseTrainerBalance } from '@/lib/payout-release';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/payouts/release { trainerId, acknowledge }
 *
 * One trainer's balance at a time, and only when that balance is actually releasable.
 *
 * This replaced a bulk route that marked every due payout 'paid' in a loop with a
 * comment where the transfer should go. It told trainers they had been paid and sent
 * nothing. Nothing about that was recoverable, because nothing was ever attempted.
 *
 * The unit is the trainer, not the payout, because a trainer's earnings add up: money
 * from three small classes is one balance and one transfer.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { trainerId, acknowledge } = (await req.json().catch(() => ({}))) as {
    trainerId?: string;
    acknowledge?: boolean;
  };
  if (!trainerId) return NextResponse.json({ error: 'trainerId required' }, { status: 400 });

  const result = await releaseTrainerBalance(trainerId, actorId, { acknowledge: acknowledge === true });
  if (!result.ok) {
    // 409 for "we won't do this yet", 502 for "the provider said no". Different problems
    // deserve different handling by whoever is looking at the screen.
    const status = ['not-found'].includes(result.code)
      ? 404
      : result.code === 'transfer-failed'
        ? 502
        : 409;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  // `ok` comes from the result itself, so do not also put it in the spread.
  return NextResponse.json({ ...result, ok: true });
}

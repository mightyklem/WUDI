import { NextResponse } from 'next/server';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { payoutAccountRecords } from '@/lib/payout-accounts';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payout-accounts -- the account details, for every trainer.
 *
 * The release queue shows a trainer's account only once they have a payout waiting.
 * This shows all of them: a verified trainer with no account on file, and a trainer
 * whose account was changed after their identity was approved.
 *
 * The account number is not here and never will be. It is encrypted at rest and is
 * only used at the moment a transfer is made.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const records = await payoutAccountRecords();

  return NextResponse.json({ records });
}

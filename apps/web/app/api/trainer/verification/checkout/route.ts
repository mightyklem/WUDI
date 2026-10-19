import { NextResponse } from 'next/server';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/trainer/verification/checkout — RETIRED. Always refuses.
 *
 * The paid badge is gone. It charged N10,000 to open a review, then unlocked nothing:
 * after the rule change that stopped paid classes needing approval, the badge's stated
 * benefit ("does not unlock paid classes or payouts") became literally true, and
 * charging money for a signal that gates nothing is not defensible.
 *
 * The route is kept as a refusal rather than deleted, and it refuses BEFORE touching
 * Paystack. Deleting the file would make any caller 404, which is ambiguous -- it looks
 * like a broken link rather than a retired feature, and a 404 invites people to keep
 * retrying. Anyone with a stale tab or a bookmark gets a plain sentence instead.
 *
 * Identity verification is free, has a real purpose, and lives at /trainer/approval.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(
    {
      error: 'The paid verification badge has been retired.',
      detail:
        'It is no longer charged for, and nothing was taken from your account. ' +
        'Identity verification is free and unlocks your first payout — start it at ' +
        '/trainer/approval.',
      retired: true,
    },
    { status: 410 },
  );
}

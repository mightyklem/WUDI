import { NextResponse } from 'next/server';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { provider } from '@/lib/payments';
import { reconcilePendingPayments } from '@/lib/reconcile';

export const dynamic = 'force-dynamic';

// POST /api/payments/reconcile — catches payments the provider charged but our webhook missed (FR-9.1).
// Scoped to the caller's own registrations; never settles anyone else's payment.
export async function POST(req: Request) {
  if (provider() !== 'paystack') {
    return NextResponse.json({ error: 'Reconciliation is only available on Paystack' }, { status: 404 });
  }
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await reconcilePendingPayments({ userId });
  return NextResponse.json({ ok: true, ...result });
}
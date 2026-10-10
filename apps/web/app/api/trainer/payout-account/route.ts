import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { accountNumberProblem } from '@/lib/secretbox';
import { payoutAccountFor, resolveAccount, savePayoutAccount } from '@/lib/payout-account';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.trainerProfile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  // Only the masked view. The account number is never sent to the browser, not even to
  // the trainer who entered it.
  return NextResponse.json({ account: await payoutAccountFor(userId) });
}

/**
 * POST /api/trainer/payout-account { bankCode, bankName, accountNumber }
 *
 * The number is resolved against Paystack before anything is stored, and the resolved
 * account name is returned so the trainer can see whose account it is. Catching a
 * mistyped digit here costs nothing; catching it after a transfer has gone costs the
 * trainer their money, because a transfer to the wrong account is not recoverable.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.trainerProfile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  const { bankCode, bankName, accountNumber } = (await req.json().catch(() => ({}))) as {
    bankCode?: string; bankName?: string; accountNumber?: string;
  };

  const numberProblem = accountNumberProblem(accountNumber || '');
  if (numberProblem) return NextResponse.json({ error: numberProblem }, { status: 400 });
  if (!bankCode || !/^[A-Za-z0-9]+$/.test(bankCode)) {
    // Not digits-only: 12 legitimate Nigerian banks use codes like MFB50094.
    return NextResponse.json({ error: 'Choose a bank' }, { status: 400 });
  }

  const resolved = await resolveAccount((accountNumber || '').replace(/\s/g, ''), bankCode);
  if ('error' in resolved) {
    // Pass Paystack's own words through. They name the actual cause — a test-mode daily
    // cap, or the bank code test mode expects — which is the only way someone can act on
    // it. A generic "check both and try again" makes them retype a number that was right.
    return NextResponse.json({ error: resolved.error }, { status: 422 });
  }

  await savePayoutAccount(userId, {
    bankCode,
    bankName: bankName || bankCode,
    accountNumber: accountNumber || '',
    accountName: resolved.accountName,
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'payout-account.set',
      target: `user:${userId}`,
      reason: `bank ${bankCode}`,
    },
  });

  return NextResponse.json({ ok: true, account: await payoutAccountFor(userId) });
}
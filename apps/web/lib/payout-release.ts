import { prisma } from '@/lib/db';
import { paystackGet, paystackPost, toKobo } from '@/lib/payments';
import { ensureRecipient } from '@/lib/payout-account';

/**
 * Releasing a trainer's money.
 *
 * The previous version of this marked payouts paid and told the trainer they had been
 * paid, with a comment where the transfer should go. Everything below exists so that
 * "paid" means Paystack confirmed it.
 *
 * Order matters: check everything, transfer, and only then write paid. Optimistically
 * marking a payout paid before the transfer is the failure that costs a trainer real
 * money, because nothing would ever retry it.
 */

export const MIN_PAYOUT_NGN = Number(process.env.PAYOUT_MIN_NGN || 5000);

export type Blocker = { code: string; message: string };

export type EligiblePayout = {
  id: string;
  amountNet: number;
  trainerId: string;
  trainerName: string;
  trainingTitle: string;
  ready: boolean;
  blockers: Blocker[];
  account: { bankName: string; accountLast4: string; accountName: string } | null;
};

/** Everything an admin needs to decide, and everything that would stop us. */
export async function payoutQueue(): Promise<EligiblePayout[]> {
  const held = await prisma.payout.findMany({
    where: { status: { in: ['held', 'failed'] } },
    orderBy: { holdUntil: 'asc' },
    include: { training: { select: { title: true } } },
  });
  if (!held.length) return [];

  // Payout.trainerId is a plain column, not a relation, so the profiles are fetched
  // separately rather than joined. Two queries beat re-modelling the table here.
  const profiles = await prisma.trainerProfile.findMany({
    where: { userId: { in: [...new Set(held.map((p) => p.trainerId))] } },
    select: { userId: true, displayName: true, payoutAccounts: true },
  });
  const byId = new Map(profiles.map((p) => [p.userId, p]));

  return held.map((p) => {
    const blockers: Blocker[] = [];
    const profile = byId.get(p.trainerId);
    const account = profile?.payoutAccounts[0] || null;

    if (p.status === 'failed') {
      blockers.push({
        code: 'previously-failed',
        message: `Last attempt failed: ${p.failureReason || 'no reason recorded'}`,
      });
    }
    if (p.holdUntil && p.holdUntil.getTime() > Date.now()) {
      blockers.push({
        code: 'still-held',
        message: `Held until ${p.holdUntil.toISOString().slice(0, 10)}`,
      });
    }
    if (!account) {
      blockers.push({ code: 'no-account', message: 'Trainer has not set a payout account' });
    } else if (!account.verifiedAt) {
      blockers.push({ code: 'unverified', message: 'Payout account not verified with the bank' });
    }
    // ₦5,000 floor. Below that a ₦10 transfer fee is a real cut of what the trainer is
    // owed, and it also floods the admin queue with approvals for trivial amounts.
    if (p.amountNet < MIN_PAYOUT_NGN) {
      blockers.push({
        code: 'below-minimum',
        message: `Below the ₦${MIN_PAYOUT_NGN.toLocaleString('en-NG')} minimum (₦${p.amountNet.toLocaleString('en-NG')})`,
      });
    }

    return {
      id: p.id,
      amountNet: p.amountNet,
      trainerId: p.trainerId,
      trainerName: profile?.displayName || 'Unknown trainer',
      trainingTitle: p.training.title,
      ready: blockers.length === 0,
      blockers,
      account: account
        ? {
            bankName: account.bankName,
            accountLast4: account.accountNumberLast4,
            accountName: account.accountName,
          }
        : null,
    };
  });
}

/** Available balance in naira, or null when it cannot be read. */
export async function availableBalanceNgn(): Promise<number | null> {
  const res = await paystackGet<{ status?: boolean; data?: { available?: number } }>('/balance');
  if (!res.status || typeof res.data?.available !== 'number') return null;
  return res.data.available / 100;
}

export type ReleaseResult =
  | { ok: true; payoutId: string; transferRef: string }
  | { ok: false; code: string; message: string };

/**
 * Pay one payout. Checks, transfers, then records.
 *
 * A failed transfer leaves the payout in 'failed' with the reason attached rather than
 * reverting to 'held', so it stops being silently retried and an admin can look at it.
 */
export async function releasePayout(payoutId: string, adminId: string): Promise<ReleaseResult> {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
  });
  if (!payout) return { ok: false, code: 'not-found', message: 'No such payout' };
  if (payout.status === 'paid') {
    return { ok: false, code: 'already-paid', message: 'Already released' };
  }
  if (payout.holdUntil && payout.holdUntil.getTime() > Date.now()) {
    return { ok: false, code: 'still-held', message: 'The hold period has not passed' };
  }

  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: payout.trainerId },
    select: { payoutAccounts: true },
  });
  const account = profile?.payoutAccounts[0];
  if (!account?.verifiedAt) {
    return { ok: false, code: 'no-account', message: 'Trainer has no verified payout account' };
  }
  if (payout.amountNet < MIN_PAYOUT_NGN) {
    return { ok: false, code: 'below-minimum', message: `Below the ₦${MIN_PAYOUT_NGN} minimum` };
  }

  const recipientCode = await ensureRecipient(account.id);
  if (!recipientCode) {
    return { ok: false, code: 'no-recipient', message: 'Could not register the account with Paystack' };
  }

  // Paystack rejects an overdraft with an opaque error; checking first turns that into
  // something an admin can act on.
  const balance = await availableBalanceNgn();
  if (balance !== null && balance < payout.amountNet) {
    return {
      ok: false,
      code: 'insufficient-funds',
      message: `Paystack balance ₦${balance.toLocaleString('en-NG')} is short of ₦${payout.amountNet.toLocaleString('en-NG')}`,
    };
  }

  const transferRef = `PO-${payout.id.slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const res = await paystackPost<{
    status?: boolean;
    message?: string;
    data?: { reference?: string; transfer_code?: string; status?: string };
  }>('/transfer', {
    amount: toKobo(payout.amountNet),
    recipient: recipientCode,
    reference: transferRef,
    reason: `Learnovize payout for ${payout.trainingId.slice(-8)}`,
  });

  if (!res.status || !res.data) {
    const reason = res.message || 'Paystack declined the transfer';
    await prisma.payout.update({
      where: { id: payoutId },
      data: { status: 'failed', failureReason: reason.slice(0, 300) },
    });
    await prisma.notification.create({
      data: { userId: payout.trainerId, type: 'payout-failed', payload: { reason: reason.slice(0, 200) } },
    });
    await prisma.auditLog.create({
      data: { actorId: adminId, action: 'payout.failed', target: `payout:${payoutId}`, reason: reason.slice(0, 300) },
    });
    return { ok: false, code: 'transfer-failed', message: reason };
  }

  // Paid, but only now, and only because Paystack said so.
  await prisma.$transaction([
    prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: 'paid',
        approvedById: adminId,
        approvedAt: new Date(),
        transferRef: res.data.reference || transferRef,
        transferId: res.data.transfer_code || null,
        failureReason: null,
      },
    }),
    prisma.notification.create({
      data: { userId: payout.trainerId, type: 'payout-paid', payload: { amountNet: payout.amountNet } },
    }),
    prisma.auditLog.create({
      data: { actorId: adminId, action: 'payout.released', target: `payout:${payoutId}`, reason: `₦${payout.amountNet}` },
    }),
  ]);

  return { ok: true, payoutId, transferRef: res.data.reference || transferRef };
}

/**
 * Reconcile a transfer that Paystack later reversed or failed.
 *
 * Webhooks can arrive after we have already written 'paid' -- a transfer that Paystack
 * accepts and then reverses would otherwise leave a trainer marked paid for money that
 * was clawed back. This is the only thing that corrects it.
 */
export async function reconcileReversal(reference: string, reason: string): Promise<boolean> {
  // findFirst, not findUnique: transferRef carries a *partial* unique index (WHERE NOT
  // NULL), which Prisma does not model as a unique field. The database still enforces it.
  const payout = await prisma.payout.findFirst({ where: { transferRef: reference } });
  if (!payout) return false;

  // AuditLog.actorId is required, and every audit should name someone accountable. For a
  // reversal that is the admin who approved the payout -- not a synthetic system user,
  // which would misattribute a provider action to a person.
  await prisma.payout.update({
    where: { id: payout.id },
    data: { status: 'failed', failureReason: reason.slice(0, 300) },
  });
  await prisma.notification.create({
    data: { userId: payout.trainerId, type: 'payout-reversed', payload: { reason: reason.slice(0, 200) } },
  });
  if (payout.approvedById) {
    await prisma.auditLog.create({
      data: {
        actorId: payout.approvedById,
        action: 'payout.reversed',
        target: `payout:${payout.id}`,
        reason: reason.slice(0, 300),
      },
    });
  }
  return true;
}
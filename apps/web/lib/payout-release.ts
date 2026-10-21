import { prisma } from '@/lib/db';
import { paystackGet, paystackPost, toKobo } from '@/lib/payments';
import { ensureRecipient } from '@/lib/payout-account';
import { MIN_PAYOUT_NGN, nameCheckFor } from '@/lib/payout-accounts';
import { accountChangedSinceApproval } from '@learnovize/shared/account-name';
import { payoutBalance } from '@learnovize/shared/payout-balance';

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
 *
 * SMALL PAYOUTS ACCUMULATE.
 *
 * A payout below the minimum used to sit there forever. It could not be released, it
 * could not be combined with anything, and a trainer who had earned ₦1,125 was never
 * going to be paid it. The minimum exists because a ₦10 transfer fee is a real cut of a
 * small amount, and because an admin queue full of trivial approvals is a queue nobody
 * works through -- not because a trainer's small earnings should be confiscated.
 *
 * So a trainer's money is a balance. Everything they have earned that has cleared its
 * hold period is added up, and when the balance reaches the minimum the whole of it
 * goes in one transfer. Each class still keeps its own hold period, so money from a
 * class that finished last month is not held up by a class that finished yesterday.
 */

export { MIN_PAYOUT_NGN };

export type Blocker = { code: string; message: string };

export type NameResult = 'match' | 'partial' | 'mismatch' | 'unknown';

export type QueuedTrainer = {
  trainerId: string;
  trainerName: string;
  teachingName: string;
  email: string;
  /** Money that has cleared its hold and can be released now. */
  dueNgn: number;
  dueCount: number;
  dueClasses: { id: string; title: string; amountNet: number }[];
  /** Money still inside a hold period. */
  waitingNgn: number;
  waitingUntil: string | null;
  /** How much more is needed before the balance can be released. */
  shortByNgn: number;
  ready: boolean;
  blockers: Blocker[];
  account: {
    bankName: string;
    accountLast4: string;
    /** What the bank calls the account. */
    accountName: string;
    /** What the trainer calls it. */
    declaredName: string | null;
    holderType: string;
  } | null;
  accountCheck: {
    nameResult: NameResult;
    nameDetail: string;
    changedSinceApproval: boolean;
    needsAcknowledgement: boolean;
    holderType: string;
  } | null;
};

/** Everything an admin needs to decide, and everything that would stop us. */
export async function payoutQueue(): Promise<QueuedTrainer[]> {
  const now = Date.now();
  const held = await prisma.payout.findMany({
    where: { status: { in: ['held', 'failed'] } },
    orderBy: { holdUntil: 'asc' },
    include: { training: { select: { title: true } } },
  });
  if (!held.length) return [];

  // One balance per trainer. A trainer's money is theirs, not tied to a class, and the
  // whole of it is released together once it is worth releasing.
  const byTrainer = new Map<string, typeof held>();
  for (const p of held) {
    const list = byTrainer.get(p.trainerId) || [];
    list.push(p);
    byTrainer.set(p.trainerId, list);
  }
  const trainerIds = [...byTrainer.keys()];

  // Payout.trainerId is a plain column, not a relation, so the profiles are fetched
  // separately rather than joined. Two queries beat re-modelling the table here.
  const [profiles, users] = await Promise.all([
    prisma.trainerProfile.findMany({
      where: { userId: { in: trainerIds } },
      select: {
        userId: true, displayName: true, payoutAccounts: true,
        approvalState: true, paidCertApproved: true, approvals: true,
      },
    }),
    prisma.user.findMany({
      where: { id: { in: trainerIds } },
      select: { id: true, fullName: true, email: true },
    }),
  ]);
  const profileById = new Map(profiles.map((p) => [p.userId, p]));
  const userById = new Map(users.map((u) => [u.id, u]));

  return trainerIds.map((trainerId) => {
    const rows = byTrainer.get(trainerId)!;
    const profile = profileById.get(trainerId);
    const user = userById.get(trainerId);
    const account = profile?.payoutAccounts[0] || null;

    // Cleared of its hold, and so releasable; and still inside one, and so not. The rule
    // is in the shared package, where it is tested on its own.
    const balance = payoutBalance(
      rows.map((p) => ({ amountNet: p.amountNet, holdUntil: p.holdUntil })),
      { minNgn: MIN_PAYOUT_NGN, now: new Date(now) },
    );
    const due = rows.filter((p) => !p.holdUntil || p.holdUntil.getTime() <= now);
    const waiting = rows.filter((p) => p.holdUntil && p.holdUntil.getTime() > now);
    const dueNgn = balance.dueNgn;
    const waitingNgn = balance.waitingNgn;
    const shortByNgn = balance.shortByNgn;

    const blockers: Blocker[] = [];

    const failed = rows.find((p) => p.status === 'failed');
    if (failed) {
      blockers.push({
        code: 'previously-failed',
        message: `Last attempt failed: ${failed.failureReason || 'no reason recorded'}`,
      });
    }

    // Identity, before money.
    //
    // A verified bank account says the account exists. It says nothing about whose it
    // is: PayoutAccount has no link to any identity record, so anyone who can enter a
    // Nigerian account number -- including one belonging to someone else -- can receive
    // a transfer of other people's money. Checking the bank was never an identity check.
    //
    // This is what gives the ID-document flow a purpose. Without it, identity
    // verification gates nothing at all, which is why the paid badge page had started
    // advertising a benefit that no longer existed.
    if (profile?.approvalState !== 'approved') {
      blockers.push({
        code: 'identity-unverified',
        message: 'Trainer identity is not verified yet — an approved ID document is required before payout',
      });
    }

    if (!account) {
      blockers.push({ code: 'no-account', message: 'Trainer has not set a payout account' });
    } else if (!account.verifiedAt) {
      blockers.push({ code: 'unverified', message: 'Payout account not verified with the bank' });
    }

    // The floor, and how far off it the balance is. Small earnings are not lost, they
    // are waiting for the rest to arrive.
    if (dueNgn < MIN_PAYOUT_NGN) {
      blockers.push({
        code: 'below-minimum',
        message:
          `₦${dueNgn.toLocaleString('en-NG')} is waiting — ₦${shortByNgn.toLocaleString('en-NG')} ` +
          `more before it can be released (the minimum is ₦${MIN_PAYOUT_NGN.toLocaleString('en-NG')})`,
      });
    }

    let accountCheck: QueuedTrainer['accountCheck'] = null;
    if (account) {
      const check = nameCheckFor(account.declaredName, account.accountName);
      const approval = profile?.approvals?.find((a) => a.status === 'approved');
      const changedSinceApproval = accountChangedSinceApproval(
        approval?.decidedAt ? approval.decidedAt.toISOString() : null,
        account.updatedAt.toISOString(),
      );
      accountCheck = {
        nameResult: check.result,
        nameDetail: check.detail,
        changedSinceApproval,
        // Only a name that plainly is not the one the account is in has to be looked
        // at by a person before the money moves.
        needsAcknowledgement: check.result === 'mismatch',
        holderType: account.holderType || 'personal',
      };
    }

    return {
      trainerId,
      trainerName: profile?.displayName || user?.fullName || 'Unknown trainer',
      teachingName: profile?.displayName || '',
      email: user?.email || '',
      dueNgn,
      dueCount: due.length,
      dueClasses: due.map((p) => ({ id: p.id, title: p.training.title, amountNet: p.amountNet })),
      waitingNgn,
      waitingUntil: balance.nextReleaseAt,
      shortByNgn,
      ready: blockers.length === 0,
      blockers,
  account: account
    ? {
        bankName: account.bankName,
        accountLast4: account.accountNumberLast4,
        accountName: account.accountName,
        declaredName: account.declaredName,
        holderType: account.holderType || 'personal',
      }
    : null,

      accountCheck,
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
  | { ok: true; trainerId: string; amountNgn: number; transferRef: string; payouts: number }
  | { ok: false; code: string; message: string };

/**
 * Pay a trainer's balance.
 *
 * Everything they have earned that has cleared its hold period goes in one transfer.
 * Checks, transfer, then record.
 *
 * A failed transfer leaves the balance in 'failed' with the reason attached rather than
 * reverting to 'held', so it stops being silently retried and an admin can look at it.
 *
 * `acknowledge` is the admin saying they have seen that the name on a personal account
 * is not the trainer's name. It does not unlock anything else -- a balance with a
 * blocker is still refused -- it only records that a person looked at the one warning
 * that a judgement is needed on.
 */
export async function releaseTrainerBalance(
  trainerId: string,
  adminId: string,
  options: { acknowledge?: boolean } = {},
): Promise<ReleaseResult> {
  const now = Date.now();
  const all = await prisma.payout.findMany({
    where: { trainerId, status: { in: ['held', 'failed'] } },
    orderBy: { holdUntil: 'asc' },
  });
  if (!all.length) return { ok: false, code: 'not-found', message: 'Nothing waiting for this trainer' };

  // Only what has cleared its hold. The rest waits for its own class.
  const balance = payoutBalance(
    all.map((p) => ({ amountNet: p.amountNet, holdUntil: p.holdUntil })),
    { minNgn: MIN_PAYOUT_NGN, now: new Date(now) },
  );
  const due = all.filter((p) => !p.holdUntil || p.holdUntil.getTime() <= now);
  if (!due.length) {
    const until = all[0].holdUntil;
    return {
      ok: false,
      code: 'still-held',
      message: `The hold period has not passed${until ? ` (until ${until.toISOString().slice(0, 10)})` : ''}`,
    };
  }

  const amountNgn = balance.dueNgn;
  if (amountNgn < MIN_PAYOUT_NGN) {
    return {
      ok: false,
      code: 'below-minimum',
      message:
        `₦${amountNgn.toLocaleString('en-NG')} is waiting — ₦${balance.shortByNgn.toLocaleString('en-NG')} ` +
        `more before it can be released.`,
    };
  }

  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: trainerId },
    select: { payoutAccounts: true, approvalState: true, displayName: true, approvals: true },
  });
  // Re-checked here, not only in the blocker list. The list is what the admin sees; this
  // is what actually stops the money, and the two have to agree or the display is a lie.
  if (profile?.approvalState !== 'approved') {
    return {
      ok: false,
      code: 'identity-unverified',
      message: 'Trainer identity is not verified — payout blocked until an ID document is approved',
    };
  }
  const account = profile?.payoutAccounts[0];
  if (!account?.verifiedAt) {
    return { ok: false, code: 'no-account', message: 'Trainer has no verified payout account' };
  }

  // The name the trainer gave the account, against the name the bank gave it.
  //
  // This is not a check that the account is in the trainer's own name -- a business
  // account is in the name of the business, and a bank writes a name its own way. It
  // is a check that the name given is the name the account is actually in, which is
  // what stops a trainer naming somebody else's account as their own.
  const nameCheck = nameCheckFor(account.declaredName, account.accountName);
  if (nameCheck.result === 'mismatch' && !options.acknowledge) {
    return {
      ok: false,
      code: 'needs-acknowledgement',
      message:
        `The name given for this account (${account.declaredName}) is not the name the ` +
        `bank has it under (${account.accountName}). Look at it, then release it again ` +
        'with the warning acknowledged.',
    };
  }

  const recipientCode = await ensureRecipient(account.id);
  if (!recipientCode) {
    return { ok: false, code: 'no-recipient', message: 'Could not register the account with Paystack' };
  }

  // Paystack rejects an overdraft with an opaque error; checking first turns that into
  // something an admin can act on.
  const paystackBalance = await availableBalanceNgn();
  if (paystackBalance !== null && paystackBalance < amountNgn) {
    return {
      ok: false,
      code: 'insufficient-funds',
      message: `Paystack balance ₦${paystackBalance.toLocaleString('en-NG')} is short of ₦${amountNgn.toLocaleString('en-NG')}`,
    };
  }

  const transferRef = `PO-${trainerId.slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const res = await paystackPost<{
    status?: boolean;
    message?: string;
    data?: { reference?: string; transfer_code?: string; status?: string };
  }>('/transfer', {
    amount: toKobo(amountNgn),
    recipient: recipientCode,
    reference: transferRef,
    reason: `Learnovize payout for ${trainerId.slice(-8)}`,
  });

  if (!res.status || !res.data) {
    const reason = res.message || 'Paystack declined the transfer';
    await prisma.payout.updateMany({
      where: { id: { in: due.map((p) => p.id) } },
      data: { status: 'failed', failureReason: reason.slice(0, 300) },
    });
    await prisma.notification.create({
      data: { userId: trainerId, type: 'payout-failed', payload: { reason: reason.slice(0, 200) } },
    });
    await prisma.auditLog.create({
      data: { actorId: adminId, action: 'payout.failed', target: `trainer:${trainerId}`, reason: reason.slice(0, 300) },
    });
    return { ok: false, code: 'transfer-failed', message: reason };
  }

  const paidRef = res.data.reference || transferRef;
  const transferId = res.data.transfer_code || null;

  // Paid, but only now, and only because Paystack said so.
  //
  // One transfer covered several classes, so each of their payout rows records it.
  // The reference column is unique, so the first row carries Paystack's reference and
  // the rest carry it with a number on the end; the transfer code is the same on all of
  // them, and that is what ties them together as one payment.
  await prisma.$transaction([
    ...due.map((p, i) =>
      prisma.payout.update({
        where: { id: p.id },
        data: {
          status: 'paid',
          approvedById: adminId,
          approvedAt: new Date(),
          transferRef: i === 0 ? paidRef : `${paidRef}-${i + 1}`,
          transferId,
          failureReason: null,
        },
      }),
    ),
    prisma.notification.create({
      data: { userId: trainerId, type: 'payout-paid', payload: { amountNet: amountNgn } },
    }),
    prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'payout.released',
        target: `trainer:${trainerId}`,
        reason: `₦${amountNgn} across ${due.length} payout${due.length === 1 ? '' : 's'}`,
      },
    }),
  ]);

  // The acknowledgement is recorded on its own, so that a balance released over a name
  // that did not match carries the fact that somebody looked at it and said so.
  if (options.acknowledge) {
    await prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'payout.released.name-mismatch-acknowledged',
        target: `trainer:${trainerId}`,
        reason:
          `Account name "${account.accountName}" does not match the trainer's name. ` +
          `Name check: ${nameCheck.detail}`,
      },
    });
  }

  return { ok: true, trainerId, amountNgn, transferRef: paidRef, payouts: due.length };
}

/**
 * Reconcile a transfer that Paystack later reversed or failed.
 *
 * Webhooks can arrive after we have already written 'paid' -- a transfer that Paystack
 * accepts and then reverses would otherwise leave a trainer marked paid for money that
 * was clawed back. This is the only thing that corrects it.
 *
 * One transfer can have covered several classes, so every row that carries the same
 * transfer code is reversed together. Reversing only the first would leave the trainer
 * marked paid for the rest of a payment that never arrived.
 */
export async function reconcileReversal(reference: string, reason: string): Promise<boolean> {
  // findFirst, not findUnique: transferRef carries a *partial* unique index (WHERE NOT
  // NULL), which Prisma does not model as a unique field. The database still enforces it.
  const payout = await prisma.payout.findFirst({
    where: { OR: [{ transferRef: reference }, { transferId: reference }] },
  });
  if (!payout) return false;

  // Every row that was paid by the same transfer.
  const siblings = payout.transferId
    ? await prisma.payout.findMany({ where: { transferId: payout.transferId } })
    : [payout];
  const ids = siblings.map((s) => s.id);

  // AuditLog.actorId is required, and every audit should name someone accountable. For a
  // reversal that is the admin who approved the payout -- not a synthetic system user,
  // which would misattribute a provider action to a person.
  await prisma.payout.updateMany({
    where: { id: { in: ids } },
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
        target: `trainer:${payout.trainerId}`,
        reason: reason.slice(0, 300),
      },
    });
  }
  return true;
}

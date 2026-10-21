import { prisma } from '@/lib/db';
import { compareAccountName, accountChangedSinceApproval } from '@learnovize/shared/account-name';

/**
 * The trainer's account details, seen from the admin side.
 *
 * A verified trainer has to have somewhere an admin can find their account, and the
 * answer to "whose account is this?" has to be one click rather than a search through
 * two different queues. So this gathers, for every trainer who is verified or who has
 * an account on file:
 *
 *   - who they are and whether their identity has been approved
 *   - the account itself: bank, the name the bank gave for it, and the last four digits
 *   - whether the name on the account is the trainer's name
 *   - whether the account was changed after the identity was approved
 *   - how much is waiting for them
 *
 * The account number is never in here. It is encrypted at rest and it is only ever
 * used at the moment a transfer is made, and there is deliberately no route that
 * hands it to a screen.
 */

/**
 * The smallest amount worth releasing.
 *
 * It exists because a ₦10 transfer fee is a real cut of a small payment, and because
 * an admin queue full of trivial approvals is a queue nobody works through. It is not
 * a floor on what a trainer earns: earnings below it are held and added to the next
 * ones, and the whole balance goes when it reaches this.
 */
export const MIN_PAYOUT_NGN = Number(process.env.PAYOUT_MIN_NGN || 5000);

export type NameCheck = {
  result: 'match' | 'partial' | 'mismatch' | 'unknown';
  detail: string;
};

export type AccountRecord = {
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  teachingName: string;
  identityState: string;
  identityApprovedAt: string | null;
  approvalId: string | null;
  hasIdentityDocument: boolean;
  hasBankStatement: boolean;
  /** A statement in the name of a business payout account. */
  hasAccountStatement: boolean;
  account: {
    bankCode: string;
    bankName: string;
    /** The name the bank gave the account. */
    accountName: string;
    /** The name the trainer gave the account. */
    declaredName: string | null;
    accountLast4: string;
    holderType: string;
    setAt: string;
    changedSinceApproval: boolean;
  } | null;
  nameCheck: NameCheck;
  pendingNgn: number;
  pendingCount: number;
  /** How much more is needed before the balance can be released. */
  shortByNgn: number;
  /** Money still inside a hold period. */
  waitingNgn: number;
};

/**
 * The name the trainer gave the account, against the name the bank gave it.
 *
 * This checks a claim against a fact. It is not a check of identity -- the identity is
 * the document and the bank statement, which a person reads -- and it is not a check
 * that the account is in the trainer's own name, because that is not always so: a
 * business account is in the name of the business, and a bank writes a name its own
 * way.
 *
 * What it catches is a name typed wrong, and a name that is not the one the account is
 * actually in. Those are worth a look before money moves, and the trainer is told the
 * same thing first, so it should never arrive here.
 */
export function nameCheckFor(
  declaredName: string | null | undefined,
  bankName: string | null | undefined,
): NameCheck {
  if (!declaredName) {
    return {
      result: 'unknown',
      detail: 'No name was given for this account. The trainer was asked for one.',
    };
  }
  if (!bankName) {
    return {
      result: 'unknown',
      detail: 'The bank did not give a name for this account.',
    };
  }
  const check = compareAccountName(bankName, declaredName) as {
    result: NameCheck['result'];
    detail: string;
  };
  const detail =
    check.result === 'match'
      ? 'The name given is the name your bank has.'
      : check.result === 'partial'
        ? `Your bank writes it as “${bankName}”. Close enough to be the same name.`
        : check.result === 'mismatch'
          ? `Your bank calls this account “${bankName}”, which is not the name that was given.`
          : check.detail;
  return { result: check.result, detail };
}


/**
 * Every trainer an admin might need to look at.
 *
 * A trainer who is verified but has no account is on this list, because that is the
 * case that needs chasing: the money is waiting and there is nowhere to send it.
 */
export async function payoutAccountRecords(): Promise<AccountRecord[]> {
  const profiles = await prisma.trainerProfile.findMany({
    where: {
      OR: [
        { approvalState: 'approved' },
        { payoutAccounts: { some: {} } },
      ],
    },
    select: {
      userId: true,
      displayName: true,
      approvalState: true,
      payoutAccounts: {
        select: {
          id: true,
          bankCode: true,
          bankName: true,
          accountName: true,
          declaredName: true,
          accountNumberLast4: true,
          recipientCode: true,
          holderType: true,
          statementKey: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      approvals: {
        select: {
          id: true,
          status: true,
          decidedAt: true,
          bankStatementKey: true,
          idDocUrls: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!profiles.length) return [];

  const trainerIds = profiles.map((p) => p.userId);

  const [users, payouts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: trainerIds } },
      select: { id: true, email: true, fullName: true },
    }),
    prisma.payout.groupBy({
      by: ['trainerId'],
      where: { trainerId: { in: trainerIds }, status: { in: ['held', 'failed'] } },
      _sum: { amountNet: true },
      _count: { _all: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const pendingById = new Map(payouts.map((p) => [p.trainerId, p]));

  // The money that is still inside a hold period, so the admin can see that a balance
  // is not waiting on them but on the clock.
  const now = Date.now();
  const waiting = await prisma.payout.groupBy({
    by: ['trainerId'],
    where: {
      trainerId: { in: trainerIds },
      status: { in: ['held', 'failed'] },
      holdUntil: { gt: new Date(now) },
    },
    _sum: { amountNet: true },
  });
  const waitingById = new Map(waiting.map((p) => [p.trainerId, p]));

  return profiles.map((p) => {
    const user = userById.get(p.userId);
    const account = p.payoutAccounts[0] || null;
    const approval = p.approvals[0] || null;
    const pending = pendingById.get(p.userId);
    const stillWaiting = waitingById.get(p.userId);

    // The identity has to be approved for the approval to count, and the date it was
    // approved on is the date the bank statement stopped being about this account.
    const approved = approval?.status === 'approved' ? approval : null;
    const approvedAt = approved?.decidedAt ? approved.decidedAt.toISOString() : null;

    const pendingNgn = pending?._sum.amountNet || 0;
    const holderType = account?.holderType || 'personal';

    return {
      trainerId: p.userId,
      trainerName: user?.fullName || p.displayName || 'Unnamed trainer',
      trainerEmail: user?.email || '',
      teachingName: p.displayName,
      identityState: p.approvalState,
      identityApprovedAt: approvedAt,
      approvalId: approval?.id || null,
      hasIdentityDocument: !!approval?.idDocUrls?.length,
      hasBankStatement: !!approval?.bankStatementKey,
      hasAccountStatement: !!account?.statementKey,
      account: account
        ? {
            bankCode: account.bankCode,
            bankName: account.bankName,
            accountName: account.accountName,
            declaredName: account.declaredName,
            accountLast4: account.accountNumberLast4,
            holderType,
            setAt: account.createdAt.toISOString(),
            changedSinceApproval: accountChangedSinceApproval(approvedAt, account.updatedAt),
          }
        : null,
      // What the trainer called the account, against what the bank calls it.
      nameCheck: nameCheckFor(account?.declaredName, account?.accountName),
      pendingNgn,
      pendingCount: pending?._count._all || 0,
      shortByNgn: Math.max(0, MIN_PAYOUT_NGN - pendingNgn),
      waitingNgn: stillWaiting?._sum.amountNet || 0,
    };
  });
}

/**
 * The same checks, for one trainer. Used where a single trainer is being looked at.
 */
export async function payoutAccountRecord(trainerId: string): Promise<AccountRecord | null> {
  const all = await payoutAccountRecords();
  return all.find((r) => r.trainerId === trainerId) || null;
}

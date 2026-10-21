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
  account: {
    bankCode: string;
    bankName: string;
    accountName: string;
    accountLast4: string;
    setAt: string;
    changedSinceApproval: boolean;
  } | null;
  nameCheck: NameCheck;
  pendingNgn: number;
  pendingCount: number;
};

/**
 * Compare the name on the bank account with the names we hold.
 *
 * Two names are worth trying: the one the trainer gave us, which is the name on
 * their certificate, and the one they teach under, which is what appears on their
 * classes. Either one being close is a reason to look.
 */
export function nameCheckFor(
  accountName: string | null | undefined,
  fullName: string | null | undefined,
  displayName: string | null | undefined,
): NameCheck {
  // The helper is plain JavaScript with no types on it, so the result is widened to a
  // plain string here. It is narrowed back on the way out, because the four results
  // are a closed set and a fifth one would be a bug rather than a new state.
  const check = compareAccountName(accountName || '', fullName || '', displayName || '') as {
    result: NameCheck['result'];
    detail: string;
  };
  return { result: check.result, detail: check.detail };
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
          accountNumberLast4: true,
          recipientCode: true,
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

  return profiles.map((p) => {
    const user = userById.get(p.userId);
    const account = p.payoutAccounts[0] || null;
    const approval = p.approvals[0] || null;
    const pending = pendingById.get(p.userId);

    // The identity has to be approved for the approval to count, and the date it was
    // approved on is the date the bank statement stopped being about this account.
    const approved = approval?.status === 'approved' ? approval : null;
    const approvedAt = approved?.decidedAt ? approved.decidedAt.toISOString() : null;

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
      account: account
        ? {
            bankCode: account.bankCode,
            bankName: account.bankName,
            accountName: account.accountName,
            accountLast4: account.accountNumberLast4,
            setAt: account.createdAt.toISOString(),
            changedSinceApproval: accountChangedSinceApproval(approvedAt, account.updatedAt),
          }
        : null,
      nameCheck: nameCheckFor(account?.accountName, user?.fullName, p.displayName),
      pendingNgn: pending?._sum.amountNet || 0,
      pendingCount: pending?._count._all || 0,
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

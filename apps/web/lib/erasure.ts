import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { removeObject } from '@/lib/storage';

/**
 * NDPA erasure (right to erasure).
 *
 * Anonymise, do not cascade-delete. Payment, payout and attendance records carry a
 * statutory retention period, so deleting the User row would take the financial ledger
 * with it. Instead every field that identifies a person is replaced with a placeholder
 * and the row survives as a pseudonymous counterparty.
 *
 * What is destroyed outright: the identity document (the ID consent text promises it
 * can be deleted), sessions, push tokens, and anything published under their name.
 *
 * What is retained, and why: payments, payouts, certificates and attendance. These are
 * the books, not the person. A privacy request should not create an accounting hole.
 */

export type ErasureBlocker = { code: string; message: string };

export async function erasureBlockers(userId: string): Promise<ErasureBlocker[]> {
  const out: ErasureBlocker[] = [];

  // Admins are a handful of people and deleting one silently would leave the platform
  // without an operator. Support handles it deliberately instead.
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  if (u?.isAdmin) {
    out.push({ code: 'admin', message: 'Admin accounts are removed by staff, not self-service.' });
  }

  // A trainer with money still owed to them cannot just vanish — the payout has a
  // real recipient attached to it.
  const pending = await prisma.payout.count({
    where: { trainerId: userId, status: { in: ['pending', 'held'] } },
  });
  if (pending > 0) {
    out.push({
      code: 'payout',
      message: `You have ${pending} payout${pending === 1 ? '' : 's'} not yet released. Contact support to settle those first.`,
    });
  }

  return out;
}

export async function eraseAccount(
  userId: string,
): Promise<{ deletedAt: Date; failedKeys: string[] }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true },
  });
  if (!user) throw new Error('No such user');

  // Identity documents hang off the trainer's approvals, which hang off their profile.
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId },
    select: { approvals: { select: { idDocUrls: true } } },
  });

  // Identity documents first, while we still know what they are. The consent wording
  // promises deletion, and a database row pointing at a file still in the bucket is not
  // deletion. Any that fail are collected for the response rather than swallowed.
  const failedKeys: string[] = [];
  const docKeys = (profile?.approvals ?? []).flatMap((a) => a.idDocUrls);
  for (const key of docKeys) {
    const okd = await removeObject('private', key);
    if (!okd) failedKeys.push(key);
  }

  const deletedAt = new Date();
  // A random password means the old hash stops matching anything, without needing a
  // schema change or a special case in the login check.
  const deadHash = randomBytes(32).toString('hex');

  // Order matters: detach the things that are deleted outright first, then overwrite
  // identity. If one step throws, the account is still reachable rather than half-erased.
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.pushToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    // Kill live sessions: erasure means the account stops working now, not in 15
    // minutes when the current access token happens to expire.
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: deletedAt } }),
    // Stop publishing anything they consented to be listed publicly.
    prisma.registration.updateMany({
      where: { userId },
      data: { certConsentPublic: false },
    }),
    prisma.follow.deleteMany({ where: { followerId: userId } }),
    prisma.like.deleteMany({ where: { userId } }),
    prisma.save.deleteMany({ where: { userId } }),
    prisma.moderator.deleteMany({ where: { userId } }),
    prisma.orgMember.deleteMany({ where: { userId } }),
    // Their published posts: a live e-card carrying someone's name outlives an erasure.
    prisma.feedPost.deleteMany({ where: { authorId: userId } }),
    // Erase the identifying fields.
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`,
        phone: null,
        passwordHash: deadHash,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        isAdmin: false,
        isOfficial: false,
        deletedAt,
      },
    }),
  ]);

  // TrainerProfile holds a public display name; blank it so it does not outlive them.
  // The approval rows go too: they reference identity documents that are now deleted,
  // and keeping an approval for a withdrawn trainer is misleading to an admin.
  if (profile) {
    await prisma.trainerProfile.update({
      where: { userId },
      data: { displayName: 'Withdrawn', approvalState: 'none', paidCertApproved: false },
    });
  }
  await prisma.trainerApproval.deleteMany({ where: { trainerId: userId } });

  return { deletedAt, failedKeys };
}
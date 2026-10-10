import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken, checkPassword } from '@/lib/auth';
import { eraseAccount, erasureBlockers } from '@/lib/erasure';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/me { password }
 *
 * NDPA erasure. Password is re-entered deliberately: an XSS or a hijacked session must
 * not be enough to destroy someone's account, and erasure is not reversible.
 */
export async function DELETE(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, passwordHash: true, deletedAt: true },
  });
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.deletedAt) return NextResponse.json({ error: 'This account has already been erased' }, { status: 410 });

  // The email is overwritten on erasure, so it has to be matched first — afterwards
  // there is nothing left to confirm against.
  if (!password || !(await checkPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'That password is not correct' }, { status: 403 });
  }

  const blockers = await erasureBlockers(userId);
  if (blockers.length) {
    return NextResponse.json({ error: blockers[0].message, blockers }, { status: 409 });
  }

  const { deletedAt, failedKeys } = await eraseAccount(userId);

  // Recorded so the audit trail explains why the identity fields look empty later.
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'account.erased',
      target: `user:${userId}`,
      reason: 'NDPA erasure requested by the account holder',
    },
  });

  return NextResponse.json({
    ok: true,
    deletedAt: deletedAt.toISOString(),
    // Anything we could not delete is reported rather than quietly dropped: a privacy
    // request that silently leaves a passport in a bucket is a broken promise.
    undeletedDocuments: failedKeys,
  });
}
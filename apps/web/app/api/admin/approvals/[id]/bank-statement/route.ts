import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { isLocalStorage, signPrivate, localPathFor } from '@/lib/storage';
import { readFile } from 'fs/promises';
import { ID_ACCESS_AUDIT } from '@/lib/id-access';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/approvals/[id]/bank-statement — open the statement a trainer supplied.
 *
 * Mirrors the identity-document route exactly, and for the same reasons: the recording
 * has to sit on the path to the bytes, not in the admin UI where it could be bypassed by
 * anyone calling the storage layer directly.
 *
 * A bank statement is more revealing than an ID card. It carries the full account number
 * and sort code, the running balance, and every transaction on the page -- which is why
 * it is private, why it expires as a short signed URL, why it is always a download rather
 * than rendered in our origin, and why it is optional. It corroborates ownership; it is
 * never the claim itself.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const approval = await prisma.trainerApproval.findUnique({ where: { id } });
  if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const key = approval.bankStatementKey;
  if (!key || !key.startsWith('bankstatement/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // Same ownership check as the ID route: reading the key from the approval's own row is
  // not sufficient on its own, because a wrong row would hand staff one trainer's
  // statement while attributing it to another.
  if (!key.startsWith(`bankstatement/${approval.trainerId}/`)) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: ID_ACCESS_AUDIT.REFUSED,
        target: key,
        reason: `approval=${approval.id} trainer=${approval.trainerId} ownership mismatch`,
      },
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: ID_ACCESS_AUDIT.VIEWED,
      target: key,
      reason: `approval=${approval.id} trainer=${approval.trainerId} bank-statement`,
    },
  });

  if (isLocalStorage()) {
    const filePath = localPathFor(['private', key].join('/'));
    if (!filePath) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    try {
      const data = await readFile(filePath);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': 'attachment',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const url = await signPrivate(key, ID_ACCESS_AUDIT.SIGNED_URL_SECONDS);
  return NextResponse.json({ url, expiresInSeconds: ID_ACCESS_AUDIT.SIGNED_URL_SECONDS });
}
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { isLocalStorage, signPrivate, localPathFor } from '@/lib/storage';
import { readFile } from 'fs/promises';
import { ID_ACCESS_AUDIT } from '@/lib/id-access';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/payout-accounts/[trainerId]/statement -- the statement for a business
 * payout account.
 *
 * Mirrors the identity-document route, for the same reasons. A bank statement carries a
 * full account number, a balance and every transaction on the page, so it is private, it
 * is a short signed URL rather than a rendering, it is always a download, and the access
 * is recorded on the route that serves the bytes rather than in the screen that links
 * to it.
 *
 * The recording is written before the bytes are read, not after. A read that fails
 * because the object is missing still leaves a row, because a staff member attempting
 * to open a statement is the event worth keeping.
 */
export async function GET(req: Request, { params }: { params: Promise<{ trainerId: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { trainerId } = await params;
  const account = await prisma.payoutAccount.findFirst({ where: { trainerId } });
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const key = account.statementKey;
  if (!key || !key.startsWith('accountstatement/')) {
    return NextResponse.json({ error: 'No statement on file for this account' }, { status: 404 });
  }
  // Same ownership check as the ID route: reading the key from the account's own row
  // is not sufficient on its own, because a wrong row would hand staff one trainer's
  // statement while attributing it to another.
  if (!key.startsWith(`accountstatement/${trainerId}/`)) {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: ID_ACCESS_AUDIT.REFUSED,
        target: key,
        reason: `trainer=${trainerId} ownership mismatch`,
      },
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: ID_ACCESS_AUDIT.VIEWED,
      target: key,
      reason: `trainer=${trainerId} payout-account-statement`,
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

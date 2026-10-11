import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { isLocalStorage, signPrivate } from '@/lib/storage';
import { readFile } from 'fs/promises';
import { localPathFor } from '@/lib/storage';
import { ID_ACCESS_AUDIT } from '@/lib/id-access';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/approvals/[id]/document/[index] — open one identity document.
 *
 * This is the ONLY route that may hand a staff member an identity document, and it
 * exists so that opening one is inseparable from recording it. The consent text a
 * trainer ticks says "Staff who open it are recorded", so the recording cannot live in
 * the admin UI where it could be bypassed by someone calling the storage layer
 * directly -- it has to be on the path to the bytes.
 *
 * The audit row is written BEFORE the document is read. If the read then fails, the log
 * records a failed attempt, which is the record that matters: a staff member trying to
 * open a document they should not is exactly the event worth keeping.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id, index } = await params;
  const approval = await prisma.trainerApproval.findUnique({ where: { id } });
  if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const i = Number(index);
  const key = Number.isInteger(i) && i >= 0 ? approval.idDocUrls[i] : undefined;
  // Never echo back a key that is not in this approval's own list, whatever was asked
  // for. This route must not double as a general private-object reader.
  if (!key || !key.startsWith('id/')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  // And the document must belong to the trainer who submitted it. Reading the key from
  // the approval's own list is not enough on its own: if that list were ever wrong --
  // a bad import, a hand-edited row, a bug in an earlier upload path -- this route
  // would happily hand staff one trainer's passport while attributing it to another.
  // The upload route namespaces keys by uploader, so the check is a prefix comparison.
  if (!key.startsWith(`id/${approval.trainerId}/`)) {
    // Recorded, because staff reaching for a document that is not the one they asked
    // about is precisely the event an access log exists to surface. Without this row
    // the attempt would leave no trace at all, which is the opposite of what the
    // consent promises.
    await prisma.auditLog.create({
      data: {
        actorId,
        action: ID_ACCESS_AUDIT.REFUSED,
        target: key,
        reason: `approval=${approval.id} trainer=${approval.trainerId} doc=${i} ownership mismatch`,
      },
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      action: ID_ACCESS_AUDIT.VIEWED,
      target: key,
      reason: `approval=${approval.id} trainer=${approval.trainerId} doc=${i}`,
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
          // Always a download. An identity document must never render in our origin,
          // and must not be cached anywhere in the browser.
          'content-disposition': 'attachment',
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  // Cloud storage: a short-lived signed URL, so the bytes never transit the app and the
  // grant expires on its own.
  const url = await signPrivate(key, ID_ACCESS_AUDIT.SIGNED_URL_SECONDS);
  return NextResponse.json({ url, expiresInSeconds: ID_ACCESS_AUDIT.SIGNED_URL_SECONDS });
}

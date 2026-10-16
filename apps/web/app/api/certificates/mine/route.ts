import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/certificates/mine — every certificate I hold, with its status.
//
// Both statuses, deliberately. This used to filter to status='valid', which meant a
// revoked certificate simply stopped existing for the person holding it: their list got
// shorter, with no explanation and no trace that it had ever been theirs. That is the
// worst way to be revoked -- not told, just gone. They would have found out by noticing
// their number no longer verified, and had no way to ask why.
//
// A revoked certificate is returned with its reason so the holder can see it and contest
// it. Revocation is trainer-only, so "contest" currently means support; making it a
// direct appeal is worth doing, but silently deleting the record is not acceptable
// either way.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const certs = await prisma.certificate.findMany({
    where: { userId },
    include: {
      training: { select: { title: true, trainer: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({
    certificates: certs.map((c) => ({
      id: c.id,
      number: c.number,
      // Kept as a real path rather than the stored column: the PDF is served by the
      // download route, which re-checks consent, revocation and the stored hash before
      // returning a byte.
      // Keyed on the row id, not the certificate number. The download route takes [id]
      // to match the revoke and restore routes beside it -- and two different parameter
      // names for the same URL shape makes every route in the app fail at runtime. This
      // one was missed when that moved, so the holder's own Download button 404'd while
      // the public verify page worked.
      pdfUrl: `/api/certificates/${c.id}/download`,
      status: c.status,
      revokedReason: c.revokedReason,
      scopeLabel: c.scopeLabel,
      pctAttended: c.pctAttended,
      createdAt: c.createdAt.toISOString(),
      training: c.training,
    })),
  });
}

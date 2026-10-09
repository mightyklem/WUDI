import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { ID_CONSENT_VERSION } from '@/lib/consent';

export const dynamic = 'force-dynamic';

// POST /api/trainer/approval { idDocKeys: string[], evidence?: string, consent?: boolean }
// Any trainer can request paid-certification approval (FR-2.3).
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  const { idDocKeys, evidence, consent } = (await req.json().catch(() => ({}))) as {
    idDocKeys?: string[]; evidence?: string; consent?: boolean;
  };
  // Enforced here, not just in the form. The form previously had no checkbox at all, so
  // an identity document was being stored with no recorded basis for processing it. The
  // checkbox is the visible half; this is the half that actually holds.
  if (consent !== true) {
    return NextResponse.json(
      { error: 'You must agree to us storing your ID document before we can review it.' },
      { status: 400 },
    );
  }
  if (!Array.isArray(idDocKeys) || idDocKeys.length < 1 || idDocKeys.length > 5) {
    return NextResponse.json({ error: 'Upload 1–5 ID documents first (kind=id)' }, { status: 400 });
  }
  if (idDocKeys.some((k) => typeof k !== 'string' || !k.startsWith(`id/${userId}/`))) {
    return NextResponse.json({ error: 'ID keys must be your own uploads' }, { status: 400 });
  }
  const approval = await prisma.trainerApproval.create({
    data: {
      trainerId: userId,
      idDocUrls: idDocKeys,
      expertiseEvidence: (evidence || '').slice(0, 2000) || null,
      consentAt: new Date(),
      consentVersion: ID_CONSENT_VERSION,
      status: 'pending',
    },
  });
  await prisma.trainerProfile.update({
    where: { userId },
    data: { approvalState: 'pending', rejectionReason: null },
  });
  return NextResponse.json({ approval }, { status: 201 });
}

// GET /api/trainer/approval — my latest request + state
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [profile, latest] = await Promise.all([
    prisma.trainerProfile.findUnique({ where: { userId } }),
    prisma.trainerApproval.findFirst({ where: { trainerId: userId }, orderBy: { createdAt: 'desc' } }),
  ]);
  return NextResponse.json({
    approvalState: profile?.approvalState || 'none',
    paidCertApproved: profile?.paidCertApproved || false,
    rejectionReason: profile?.rejectionReason || null,
    latest,
  });
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/trainer/approval { idDocKeys: string[], evidence?: string }
// Any trainer can request paid-certification approval (FR-2.3).
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  const { idDocKeys, evidence } = (await req.json().catch(() => ({}))) as {
    idDocKeys?: string[]; evidence?: string;
  };
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

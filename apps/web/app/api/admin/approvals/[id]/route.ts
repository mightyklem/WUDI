import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// POST /api/admin/approvals/[id] { decision: approve|reject|revoke, reason? }
// Approve/reject with reason, or revoke an existing approval (FR-2.4).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const { decision, reason } = (await req.json().catch(() => ({}))) as {
    decision?: string; reason?: string;
  };
  const approval = await prisma.trainerApproval.findUnique({ where: { id } });
  if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (decision === 'approve') {
    await prisma.$transaction([
      prisma.trainerApproval.update({ where: { id }, data: { status: 'approved', reviewerId: actorId, decidedAt: new Date() } }),
      prisma.trainerProfile.update({
        where: { userId: approval.trainerId },
        data: { approvalState: 'approved', paidCertApproved: true, rejectionReason: null },
      }),
      prisma.auditLog.create({
        data: { actorId, action: 'trainer.approve', target: `trainer:${approval.trainerId}`, reason: null },
      }),
      prisma.notification.create({
        data: { userId: approval.trainerId, type: 'approval-approved', payload: { training: null } },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }
  if (decision === 'reject') {
    if (!reason) return NextResponse.json({ error: 'Rejection needs a reason' }, { status: 400 });
    await prisma.$transaction([
      prisma.trainerApproval.update({ where: { id }, data: { status: 'rejected', reviewerId: actorId, decidedAt: new Date() } }),
      prisma.trainerProfile.update({
        where: { userId: approval.trainerId },
        data: { approvalState: 'rejected', paidCertApproved: false, rejectionReason: reason.slice(0, 300) },
      }),
      prisma.auditLog.create({
        data: { actorId, action: 'trainer.reject', target: `trainer:${approval.trainerId}`, reason: reason.slice(0, 300) },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }
  if (decision === 'revoke') {
    await prisma.$transaction([
      prisma.trainerApproval.update({ where: { id }, data: { status: 'revoked', reviewerId: actorId, decidedAt: new Date() } }),
      prisma.trainerProfile.update({
        where: { userId: approval.trainerId },
        data: { approvalState: 'revoked', paidCertApproved: false },
      }),
      prisma.auditLog.create({
        data: { actorId, action: 'trainer.revoke', target: `trainer:${approval.trainerId}`, reason: (reason || '').slice(0, 300) || null },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'decision must be approve|reject|revoke' }, { status: 400 });
}

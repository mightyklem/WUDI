import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { awardAttendance, revokeAttendance } from '@/lib/points';

export const dynamic = 'force-dynamic';

// PATCH /api/sessions/[id]/attendance { userId, present, reason }
// Trainer or active moderator corrects a flag (FR-7.3). Every override is audit-logged.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { userId, present, reason } = (await req.json().catch(() => ({}))) as {
    userId?: string; present?: boolean; reason?: string;
  };
  if (!userId || typeof present !== 'boolean') {
    return NextResponse.json({ error: 'userId + present required' }, { status: 400 });
  }
  const session = await prisma.session.findUnique({
    where: { id }, include: { training: true },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const isTrainer = session.training.trainerId === actorId;
  const mod = await prisma.moderator.findUnique({
    where: { trainingId_userId: { trainingId: session.trainingId, userId: actorId } },
  });
  if (!isTrainer && (!mod || mod.status !== 'active')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const log = await prisma.attendanceLog.upsert({
    where: { sessionId_userId: { sessionId: id, userId } },
    create: { sessionId: id, userId, present, correctedBy: actorId, correctionReason: reason?.slice(0, 300) || null },
    update: { present, correctedBy: actorId, correctionReason: reason?.slice(0, 300) || null },
  });
  await prisma.auditLog.create({
    data: {
      actorId, action: 'attendance.override',
      target: `session:${id} user:${userId}`,
      reason: reason?.slice(0, 300) || null,
    },
  });
  await prisma.notification.create({
    data: {
      userId, type: 'attendance-corrected',
      payload: { trainingId: session.trainingId, sessionId: id, present },
    },
  });
  // A correction that flips presence must also flip the points they earned.
  if (present) {
    await awardAttendance({ userId, sessionId: id });
  } else {
    await revokeAttendance({ userId, sessionId: id });
  }
  return NextResponse.json({ log });
}

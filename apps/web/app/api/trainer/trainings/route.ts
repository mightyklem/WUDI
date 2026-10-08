import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isEligible, programPct } from '@learnovize/shared';

export const dynamic = 'force-dynamic';

// GET /api/trainer/trainings — the trainer's own workspace.
// Everything a host needs to run a cohort: seats, next session, and who is now
// certificate-eligible so they know exactly what to approve.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: 'Not a trainer' }, { status: 403 });

  const trainings = await prisma.training.findMany({
    where: { trainerId: userId },
    include: {
      sessions: { orderBy: { startsAtUtc: 'asc' } },
      registrations: { where: { status: 'active' }, select: { userId: true, certPaid: true } },
      certificates: { select: { id: true, userId: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const out = await Promise.all(
    trainings.map(async (t) => {
      const attendance = await prisma.attendanceLog.findMany({
        where: { session: { trainingId: t.id }, userId: { in: t.registrations.map((r) => r.userId) } },
        select: { userId: true, present: true },
      });
      const perUser = new Map<string, number>();
      for (const a of attendance) {
        if (!a.present) continue;
        perUser.set(a.userId, (perUser.get(a.userId) || 0) + 1);
      }
      const sessionsSoFar = t.sessions.filter((s) => s.endsAtUtc.getTime() <= now.getTime()).length;

      // Who can be certified right now — attendance met, and paid where required.
      const eligibleUsers = t.registrations.filter((r) => {
        const pct = programPct(perUser.get(r.userId) || 0, sessionsSoFar);
        return isEligible({ pct, minPct: t.minPct, certMode: t.certMode, paid: r.certPaid });
      }).map((r) => r.userId);
      const issued = new Set(t.certificates.map((c) => c.userId));
      const pendingApproval = eligibleUsers.filter((uid) => !issued.has(uid)).length;

      return {
        id: t.id,
        title: t.title,
        slug: t.slug,
        status: t.status,
        certMode: t.certMode,
        cap: t.cap,
        seatsTaken: t.seatsTaken,
        seatsLeft: Math.max(0, t.cap - t.seatsTaken),
        sessionCount: t.sessions.length,
        sessionsSoFar,
        // Next session that has not finished — drives the "go live" prompt.
        nextSession: t.sessions.find((s) => s.endsAtUtc.getTime() > now.getTime())?.id ?? null,
        nextSessionAt: t.sessions.find((s) => s.endsAtUtc.getTime() > now.getTime())?.startsAtUtc ?? null,
        eligible: eligibleUsers.length,
        issuedCount: t.certificates.length,
        pendingApproval,
      };
    }),
  );

  return NextResponse.json({
    trainer: {
      displayName: profile.displayName,
      approvalState: profile.approvalState,
      canOfferPaidCert: profile.paidCertApproved,
      plan: profile.plan,
    },
    trainings: out,
  });
}
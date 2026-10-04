import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/trainer/plan { plan: pro|business }
// DEV/Phase-6 note: plan upgrades are recorded directly here. Real recurring billing
// (Paystack Plans + subscriptions) is the follow-up before public launch; the plan value
// already drives caps (POST /api/trainings) and commission (settlePaidPayment).
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { plan } = (await req.json().catch(() => ({}))) as { plan?: string };
  if (plan !== 'pro' && plan !== 'business') {
    return NextResponse.json({ error: 'plan must be pro|business' }, { status: 400 });
  }
  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });
  await prisma.trainerProfile.update({ where: { userId }, data: { plan } });
  await prisma.auditLog.create({
    data: { actorId: userId, action: 'trainer.plan', target: `trainer:${userId}`, reason: plan },
  });
  return NextResponse.json({ plan });
}

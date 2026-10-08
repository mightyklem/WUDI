import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';


// GET /api/me — identity + role, so the app can route each person to the right home.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { trainerProfile: true },
  });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Three roles. Admin wins, then trainer, then participant.
  const role = user.isAdmin ? 'admin' : user.trainerProfile ? 'trainer' : 'participant';
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role,
      isTrainer: !!user.trainerProfile,
      isAdmin: user.isAdmin,
      verified: !!user.emailVerifiedAt,
    },
    trainer: user.trainerProfile
      ? {
          displayName: user.trainerProfile.displayName,
          approvalState: user.trainerProfile.approvalState,
          // Free trainings are allowed immediately; paid certificates need platform approval.
          canOfferPaidCert: user.trainerProfile.paidCertApproved,
          plan: user.trainerProfile.plan,
        }
      : null,
  });
}

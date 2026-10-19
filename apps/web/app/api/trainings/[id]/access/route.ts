import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/trainings/[id]/access — does this person run this class?
 *
 * The class page is a Server Component and auth lives in a Bearer token on the client, so
 * the server cannot tell who is reading the page. That is how every trainer tool on it --
 * pricing, moderators, certificates, the curriculum -- ended up rendered for learners, who
 * could see the controls but not use them.
 *
 * One small question, asked once, that lets the client hide the lot. Deliberately not the
 * curriculum endpoint: deciding whether to show a form should not require fetching the form.
 *
 * This is a display gate. Every one of those endpoints independently verifies ownership, so
 * nothing here is the thing standing between a learner and a trainer's pricing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ isOwner: false });

  const { id } = await params;
  const t = await prisma.training.findUnique({
    where: { id },
    select: { trainerId: true },
  });
  if (!t) return NextResponse.json({ isOwner: false });

  // An admin can act on a trainer's behalf, so they see the tools too -- which is the point
  // of the role when somebody has left mid-class.
  if (t.trainerId === userId) return NextResponse.json({ isOwner: true });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return NextResponse.json({ isOwner: Boolean(u?.isAdmin) }, { headers: { 'cache-control': 'no-store' } });
}
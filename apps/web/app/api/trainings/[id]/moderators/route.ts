import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { emailEnabled, moderatorInvitedEmail, sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

async function ownerTraining(req: Request, trainingId: string) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return null;
  // The trainer's name goes into the invitation email, so the relation has to be loaded.
const t = await prisma.training.findUnique({
    where: { id: trainingId },
    include: { trainer: { select: { displayName: true } } },
  });
  return t && t.trainerId === userId ? t : null;
}

// POST /api/trainings/[id]/moderators { email } — trainer invites a moderator (FR-3.7).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await ownerTraining(req, id);
  if (!t) return NextResponse.json({ error: 'Not found or not owner' }, { status: 404 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return NextResponse.json({ error: 'No Learnovize account with that email' }, { status: 404 });
  if (user.id === t.trainerId) return NextResponse.json({ error: 'Trainer is already in charge' }, { status: 400 });
  const mod = await prisma.moderator.upsert({
    where: { trainingId_userId: { trainingId: id, userId: user.id } },
    create: { trainingId: id, userId: user.id, status: 'invited' },
    update: { status: 'invited' },
  });
  await prisma.notification.create({
    data: { userId: user.id, type: 'moderator-invited', payload: { trainingId: id, title: t.title } },
  });
  // Handing someone the ability to mute a paying trainer's class is an intervention
  // capability, so it belongs in the event log like every other one. It was previously
  // invisible: the invite wrote a row and a notification and nothing recorded who did it.
  // The actor is the owner, which the guard at the top of this route has already proved.
  await prisma.auditLog.create({
    data: {
      actorId: t.trainerId,
      action: 'moderator.invite',
      target: `training:${id} user:${user.id}`,
    },
  });

  // The invite created a row and an in-app notification but sent no mail, so the
  // moderator heard nothing unless they happened to open the app. Report honestly
  // whether the email actually went out, rather than claiming success either way.
  const mail = moderatorInvitedEmail({
    trainerName: t.trainer.displayName,
    title: t.title,
    trainingPath: `/trainings/${id}`,
  });
  const emailSent = await sendEmail({ ...mail, to: user.email });

  return NextResponse.json(
    { moderator: mod, emailSent, emailConfigured: emailEnabled() },
    { status: 201 },
  );
}

// GET /api/trainings/[id]/moderators — roster.
//
// The comment above used to say "owner sees all, others see actives" and the handler did
// neither: it returned every moderator, including their email address, to anybody with a
// valid session. That handed a signed-in user's roster to anyone who asked, which is both
// a privacy problem and a way to enumerate trainers' collaborators. Now the owner gets
// the full roster with emails; everyone else gets the active moderators by name only, and
// only if they are actually on this training.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isOwner = await prisma.training.count({ where: { id, trainerId: userId } }) > 0;
  if (isOwner) {
    const moderators = await prisma.moderator.findMany({
      where: { trainingId: id },
      include: { user: { select: { email: true, trainerProfile: { select: { displayName: true } } } } },
    });
    return NextResponse.json({ moderators, scope: 'owner' });
  }

  // Not the owner: only people actually moderating, and only their display name.
  const inRoom = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId: id, userId } },
    select: { status: true },
  });
  if (!inRoom || inRoom.status !== 'active') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const active = await prisma.moderator.findMany({
    where: { trainingId: id, status: 'active' },
    include: { user: { select: { trainerProfile: { select: { displayName: true } } } } },
  });
  return NextResponse.json({ moderators: active, scope: 'attendee' });
}

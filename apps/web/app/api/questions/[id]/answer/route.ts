import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_LEN = 1500;

/** POST /api/questions/[id]/answer — trainer answers, author is notified. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { answer } = (await req.json().catch(() => ({}))) as { answer?: string };
  const text = typeof answer === 'string' ? answer.trim() : '';
  if (text.length < 2) {
    return NextResponse.json({ error: 'Write an answer first' }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `Keep it under ${MAX_LEN} characters` }, { status: 400 });
  }

  const { id } = await params;
  const question = await prisma.question.findUnique({
    where: { id },
    include: { training: { select: { trainerId: true, title: true } } },
  });
  if (!question) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Trainers, and admins acting on a trainer's behalf. Anything else is somebody else
  // writing on this class, which is the whole thing the question asked to avoid.
  if (question.training.trainerId !== userId) {
    const isAdmin = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!isAdmin?.isAdmin) {
      return NextResponse.json({ error: 'Only the trainer can answer this' }, { status: 403 });
    }
  }

  const answered = await prisma.question.update({
    where: { id },
    data: { answer: text, answeredAt: new Date() },
  });

  // The person who asked gets told. They asked it because they wanted an answer, and an
  // answer that arrives silently is an answer they never find.
  void prisma.notification
    .create({
      data: {
        userId: question.authorId,
        type: 'question-answered',
        payload: {
          trainingId: question.trainingId,
          title: question.training.title,
          // Not the answer itself. A notification payload is rendered inside a list; a
          // 1500-character answer in a bell makes the bell unusable.
          preview: text.slice(0, 140),
        },
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ answeredAt: answered.answeredAt });
}
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/trainings/[id]/questions
 *
 * Questions are public to anyone signed in. That is deliberate and it is the point: the
 * question that decides whether somebody enrols is usually the one they are slightly
 * embarrassed to ask in public ("I am self-taught, is this too basic?"), and reading a
 * stranger's answer to exactly that question is worth more than any description the trainer
 * could write.
 *
 * The author can be anonymous to other readers. The trainer never sees an anonymous author,
 * because an answer to the wrong question is worse than no answer.
 */

const MAX_LEN = 600;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const viewerId = token ? await verifyAccessToken(token) : null;
  if (!viewerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const questions = await prisma.question.findMany({
    where: { trainingId: id },
    orderBy: [{ answeredAt: 'asc' }, { createdAt: 'desc' }],
    include: { author: { select: { id: true, fullName: true, email: true } } },
  });

  const isTrainer = await prisma.training.findUnique({
    where: { id },
    select: { trainerId: true },
  });

  return NextResponse.json(
    {
      questions: questions.map((q) => ({
        id: q.id,
        body: q.body,
        answer: q.answer,
        answeredAt: q.answeredAt,
        createdAt: q.createdAt,
        // Anonymous to the crowd, named to the trainer and to the person who asked.
        authorName:
          q.anonymous && isTrainer?.trainerId !== viewerId && q.authorId !== viewerId
            ? 'Anonymous'
            : q.author.fullName || q.author.email.split('@')[0],
        isMine: q.authorId === viewerId,
        canAnswer: isTrainer?.trainerId === viewerId,
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { body, anonymous } = (await req.json().catch(() => ({}))) as {
    body?: string; anonymous?: boolean;
  };
  const text = typeof body === 'string' ? body.trim().replace(/\s+/g, ' ') : '';
  if (text.length < 8) {
    return NextResponse.json({ error: 'Ask a bit more than that' }, { status: 400 });
  }
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `Keep it under ${MAX_LEN} characters` }, { status: 400 });
  }

  const { id } = await params;
  const training = await prisma.training.findUnique({
    where: { id },
    select: { id: true, title: true, trainerId: true, status: true },
  });
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (training.trainerId === userId) {
    // Asking your own class a question and notifying yourself about it is noise.
    return NextResponse.json({ error: 'That is your own class' }, { status: 400 });
  }

  const question = await prisma.question.create({
    data: { trainingId: id, authorId: userId, body: text, anonymous: Boolean(anonymous) },
  });

  // The trainer is notified. Fire-and-forget on purpose: a failed notification must not lose
  // the question, which is the part somebody actually cares about.
  void prisma.notification
    .create({
      data: {
        userId: training.trainerId,
        type: 'question-asked',
        payload: {
          trainingId: id,
          title: training.title,
          // The question itself, capped, so the trainer can read it in the alert list
          // without opening. The full text lives on the class page.
          preview: text.slice(0, 140),
        },
      },
    })
    .catch(() => undefined);

  return NextResponse.json({ id: question.id }, { status: 201 });
}
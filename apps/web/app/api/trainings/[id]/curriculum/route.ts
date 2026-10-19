import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { curriculumMarkdown, curriculumPdf } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';

const CAP = 4000;

const txt = (v: unknown, max = CAP) =>
  typeof v === 'string' ? v.trim().replace(/\r\n/g, '\n').slice(0, max) : null;

/** True only for the trainer who owns this class (or an admin). */
async function owns(trainingId: string, userId: string): Promise<boolean> {
  const t = await prisma.training.findUnique({
    where: { id: trainingId },
    select: { trainerId: true },
  });
  if (!t) return false;
  if (t.trainerId === userId) return true;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return Boolean(u?.isAdmin);
}

/**
 * GET  /api/trainings/[id]/curriculum            → the draft
 * GET  ?format=md | pdf                            → the document
 * POST /api/trainings/[id]/curriculum            → save the draft
 * PUT  ?format=md  or  ?format=pdf                → download
 *
 * Trainer-only, and private by default. A curriculum is a trainer's own plan for their class,
 * including the parts where they admit what went wrong -- none of which belongs in front of a
 * learner who has not enrolled yet. The document is for the trainer to prepare with, not for
 * the sales page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await owns(id, userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const format = new URL(req.url).searchParams.get('format');

  const doc = await prisma.curriculum.findUnique({
    where: { trainingId: id },
    include: {
      modules: { orderBy: { position: 'asc' } },
      faqs: { orderBy: { position: 'asc' } },
      training: {
        select: {
          title: true,
          sessions: { select: { id: true, startsAtUtc: true, endsAtUtc: true } },
          trainer: { select: { displayName: true } },
        },
      },
    },
  });

  const training = await prisma.training.findUnique({
    where: { id },
    select: {
      title: true,
      sessions: { select: { id: true, startsAtUtc: true, endsAtUtc: true } },
      trainer: { select: { displayName: true } },
    },
  });
  if (!training) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const shape = (d: typeof doc) => ({
    audience: d?.audience ?? '',
    outcomes: d?.outcomes ?? '',
    promise: d?.promise ?? '',
    storyStart: d?.storyStart ?? '',
    storyWentWrong: d?.storyWentWrong ?? '',
    storyAdvice: d?.storyAdvice ?? '',
    modules: (d?.modules ?? []).map((m) => ({
      id: m.id, position: m.position, title: m.title,
      minutes: m.minutes, body: m.body, sessionId: m.sessionId,
    })),
    faqs: (d?.faqs ?? []).map((f) => ({ id: f.id, position: f.position, question: f.question, answer: f.answer })),
  });

  if (format !== 'md' && format !== 'pdf') {
    return NextResponse.json(
      { ...shape(doc), sessions: training.sessions, exists: Boolean(doc) },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  const payload = {
    trainingTitle: training.title,
    trainerName: training.trainer.displayName || 'Learnovize trainer',
    audience: doc?.audience ?? null,
    outcomes: doc?.outcomes ?? null,
    promise: doc?.promise ?? null,
    storyStart: doc?.storyStart ?? null,
    storyWentWrong: doc?.storyWentWrong ?? null,
    storyAdvice: doc?.storyAdvice ?? null,
    modules: (doc?.modules ?? []).map((m) => ({
      position: m.position, title: m.title, minutes: m.minutes, body: m.body, sessionId: m.sessionId,
    })),
    faqs: (doc?.faqs ?? []).map((f) => ({ position: f.position, question: f.question, answer: f.answer })),
  };

  const slug = training.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

  if (format === 'md') {
    return new NextResponse(curriculumMarkdown(payload, training.sessions), {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        // Attachment, not inline: the document is a working file, not a page to be read in
        // the browser next to the editor it came from.
        'content-disposition': `attachment; filename="${slug || 'curriculum'}-curriculum.md"`,
        'cache-control': 'no-store',
      },
    });
  }

  const pdf = await curriculumPdf(payload, training.sessions);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${slug || 'curriculum'}-curriculum.pdf"`,
      'cache-control': 'no-store',
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  if (!(await owns(id, userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    audience?: unknown; outcomes?: unknown; promise?: unknown;
    storyStart?: unknown; storyWentWrong?: unknown; storyAdvice?: unknown;
    modules?: unknown; faqs?: unknown;
  };

  const modules = Array.isArray(body.modules) ? body.modules : [];
  const faqs = Array.isArray(body.faqs) ? body.faqs : [];

  const cleanModules = modules
    .map((m, i) => {
      const o = m as Record<string, unknown>;
      const title = txt(o.title, 160);
      if (!title) return null;
      const mins = Number(o.minutes);
      return {
        position: i,
        title: title as string,
        // Clamped rather than rejected: a typo of 600 should not lose the whole curriculum,
        // and a curriculum entry is not a financial quantity.
        minutes: Number.isFinite(mins) ? Math.max(5, Math.min(600, Math.round(mins))) : 60,
        body: txt(o.body, CAP) ?? '',
        sessionId: typeof o.sessionId === 'string' && o.sessionId ? o.sessionId : null,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const cleanFaqs = faqs
    .map((f, i) => {
      const o = f as Record<string, unknown>;
      const q = txt(o.question, 200);
      if (!q) return null;
      return { position: i, question: q as string, answer: txt(o.answer, CAP) ?? '' };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const saved = await prisma.curriculum.upsert({
    where: { trainingId: id },
    create: {
      trainingId: id,
      authorId: userId,
      audience: txt(body.audience),
      outcomes: txt(body.outcomes),
      promise: txt(body.promise),
      storyStart: txt(body.storyStart),
      storyWentWrong: txt(body.storyWentWrong),
      storyAdvice: txt(body.storyAdvice),
    },
    update: {
      audience: txt(body.audience),
      outcomes: txt(body.outcomes),
      promise: txt(body.promise),
      storyStart: txt(body.storyStart),
      storyWentWrong: txt(body.storyWentWrong),
      storyAdvice: txt(body.storyAdvice),
    },
  });

  // Replaced wholesale rather than diffed. The trainer is editing an ordered list of a dozen
  // things at once; a positional diff is more code to get wrong than it is worth, and the
  // rows have no meaning outside this document.
  await prisma.$transaction([
    prisma.curriculumModule.deleteMany({ where: { curriculumId: saved.id } }),
    prisma.curriculumFaq.deleteMany({ where: { curriculumId: saved.id } }),
    ...(cleanModules.length
      ? [prisma.curriculumModule.createMany({ data: cleanModules.map((m) => ({ ...m, curriculumId: saved.id })) })]
      : []),
    ...(cleanFaqs.length
      ? [prisma.curriculumFaq.createMany({ data: cleanFaqs.map((f) => ({ ...f, curriculumId: saved.id })) })]
      : []),
  ]);

  return NextResponse.json({ ok: true, modules: cleanModules.length, faqs: cleanFaqs.length });
}
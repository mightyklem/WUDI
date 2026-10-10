import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { validateAnswers, scoreForm } from '@learnovize/shared';
import { badgeState, VERIFICATION_FEE_NGN } from '@/lib/verification';

export const dynamic = 'force-dynamic';

/** GET /api/trainer/verification — current state, safe to show the trainer themselves. */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const app = await prisma.trainerApplication.findUnique({ where: { trainerId: userId } });
  return NextResponse.json({
    application: app
      ? {
          status: app.status,
          formSubtotal: app.formSubtotal,
          totalScore: app.totalScore,
          band: app.band,
          finalRating: app.finalRating,
          reviewNotes: app.reviewNotes,
          paidAt: app.paidAt,
          amountPaidNgn: app.amountPaidNgn,
          refundPending: app.refundPending,
          badgeExpiresAt: app.badgeExpiresAt,
        }
      : null,
    badge: badgeState(app),
    feeNgn: VERIFICATION_FEE_NGN,
  });
}

/**
 * POST /api/trainer/verification — save or submit the questionnaire.
 *
 * Saving is separate from submitting on purpose: a sixteen-question form is long, and
 * someone should be able to leave and come back. Submitting is the point of no return
 * because it is what makes the application reviewable — and, if they have paid, what
 * makes a refund owed if they are turned down.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.trainerProfile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  let body: { answers?: Record<string, unknown>; submit?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const existing = await prisma.trainerApplication.findUnique({ where: { trainerId: userId } });

  // A decided application is closed. Re-editing answers after a reviewer looked at
  // them would let someone be rejected for one set of work and reapply on another.
  if (existing && existing.status === 'verified') {
    return NextResponse.json({ error: 'This application has been decided' }, { status: 409 });
  }

  const checked = validateAnswers(body.answers);
  const errors: string[] = checked.errors;

  if (!body.submit) {
    // Draft saves tolerate partial answers, otherwise losing work by navigating away
    // would punish someone halfway through a long form.
    if (!existing) {
      const created = await prisma.trainerApplication.create({
        data: { trainerId: userId, answers: (checked.answers ?? {}) as never, status: 'draft' },
      });
      return NextResponse.json({ ok: true, status: created.status, formSubtotal: 0 });
    }
    const saved = await prisma.trainerApplication.update({
      where: { id: existing.id },
      data: { answers: (checked.answers ?? {}) as never },
    });
    return NextResponse.json({ ok: true, status: saved.status, formSubtotal: saved.formSubtotal });
  }

  if (errors.length) {
    return NextResponse.json({ error: 'Some answers are incomplete', problems: errors }, { status: 422 });
  }

  // Only the auto-scoreable part. Proof is a person's judgement and is deliberately
  // absent, so the form can never present itself as a strong application on its own.
  const score = scoreForm(checked.answers);

  const saved = existing
    ? await prisma.trainerApplication.update({
        where: { id: existing.id },
        data: {
          answers: checked.answers as never,
          formSubtotal: score.formSubtotal,
          status: 'submitted',
        },
      })
    : await prisma.trainerApplication.create({
        data: {
          trainerId: userId,
          answers: checked.answers as never,
          formSubtotal: score.formSubtotal,
          status: 'submitted',
        },
      });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'verification.submitted',
      target: saved.id,
      reason: `form subtotal ${score.formSubtotal}`,
    },
  });

  return NextResponse.json({ ok: true, status: saved.status, formSubtotal: saved.formSubtotal });
}
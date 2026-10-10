import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { decideVerification } from '@/lib/verification-review';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/verification/[id] { approve, proofGrade, finalRating, notes }
 *
 * Grade proof and issue or refuse the badge.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const reviewerId = token ? await verifyAccessToken(token) : null;
  if (!reviewerId || !(await isAdmin(reviewerId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

  let body: { approve?: boolean; proofGrade?: string; finalRating?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.approve !== 'boolean') {
    return NextResponse.json({ error: 'approve must be a boolean' }, { status: 400 });
  }
  const proof = body.proofGrade;
  if (!proof || !['none', 'weak', 'clear'].includes(proof)) {
    return NextResponse.json({ error: 'proofGrade must be none, weak or clear' }, { status: 400 });
  }
  const rating = body.finalRating;
  if (body.approve && (!rating || !['A', 'B', 'C'].includes(rating))) {
    return NextResponse.json({ error: 'finalRating A, B or C is required to approve' }, { status: 400 });
  }

  const result = await decideVerification({
    applicationId: id,
    reviewerId,
    approve: body.approve,
    proofGrade: proof as 'none' | 'weak' | 'clear',
    finalRating: rating as 'A' | 'B' | 'C' | undefined,
    notes: body.notes,
  });

  if (!result.ok) {
    const status = result.code === 'NOT_FOUND' ? 404 : result.code === 'REFUND_FAILED' ? 502 : 409;
    return NextResponse.json({ error: result.code }, { status });
  }
  return NextResponse.json({ ok: true, application: result.application });
}

/** GET /api/admin/verification/[id] — the full application for a reviewer. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const adminId = token ? await verifyAccessToken(token) : null;
  if (!adminId || !(await isAdmin(adminId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const app = await prisma.trainerApplication.findUnique({
    where: { id },
    include: { trainer: { include: { user: { select: { email: true } } } } },
  });
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    application: {
      ...app,
      // The trainer's email is needed to contact them; nothing sensitive beyond that.
      trainer: {
        displayName: app.trainer.displayName,
        email: app.trainer.user.email,
      },
    },
  });
}
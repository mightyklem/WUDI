import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { autoIssueForSession } from '@/lib/certs';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sessions/[id]/issue — run auto-issue for a session now.
 *
 * Auto-issue normally fires when a room ends. It cannot help a session that ended before
 * it existed: a trainer who closed the tab and walked away sends no room_ended, a
 * platform that dropped the connection sends none either, and the webhook for a session
 * that finished days ago is not coming. This is the manual way to settle one.
 *
 * Also the answer to "a learner paid, attended, and has nothing" -- which is exactly the
 * state the first release of auto-issue was written to fix, and which still applies to
 * every session that finished before it shipped.
 *
 * Staff only, and audited, because it hands out credentials in bulk and skips the
 * trainer entirely. Idempotent: anyone already holding a valid certificate is counted,
 * not re-issued, and a revoked one is refused rather than replaced.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, status: true, endsAtUtc: true, trainingId: true, training: { select: { title: true } } },
  });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const stillRunning = session.status === 'live' && session.endsAtUtc.getTime() > Date.now();
  if (stillRunning) {
    return NextResponse.json(
      { error: 'That session is still running. Certificates are issued after it ends.' },
      { status: 409 },
    );
  }

  const result = await autoIssueForSession(id);

  // Bulk issuance with no trainer involvement is exactly the action a dispute would be
  // argued over, so it gets a row of its own, not a silent return value.
  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: 'certificate.auto-issue',
      target: `session:${id}`,
      reason:
        `manual run for "${session.training.title}": issued ${result.issued.length}, ` +
        `already held ${result.alreadyHeld}, not eligible ${result.notEligible}, ` +
        `revoked ${result.revoked}, failed ${result.failed}`,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}
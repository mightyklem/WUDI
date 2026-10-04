import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';

// POST /api/admin/posts/[id]/moderate { action: hide|remove|restore }
// Immediate hide-while-investigating (FR-12.8). Reporter + trainer are notified.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId || !(await isAdmin(actorId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const post = await prisma.feedPost.findUnique({
    where: { id }, include: { training: true },
  });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = action === 'hide' || action === 'remove' ? action === 'hide' ? 'hidden' : 'removed'
    : action === 'restore' ? 'live' : null;
  if (!status) return NextResponse.json({ error: 'action must be hide|remove|restore' }, { status: 400 });
  await prisma.feedPost.update({ where: { id }, data: { status } });
  await prisma.report.updateMany({ where: { targetType: 'post', targetId: id, status: 'open' }, data: { status: 'actioned' } });
  await prisma.auditLog.create({
    data: { actorId, action: `post.${action}`, target: `post:${id}`, reason: null },
  });
  await notify({
    userIds: [post.training.trainerId], type: `post-${action}`,
    payload: { postId: id, trainingId: post.trainingId },
    email: null,
  });
  return NextResponse.json({ ok: true, status });
}

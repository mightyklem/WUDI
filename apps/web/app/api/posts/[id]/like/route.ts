import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/posts/[id]/like — toggle like (FR-10.4)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const post = await prisma.feedPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const existing = await prisma.like.findUnique({
    where: { userId_postId: { userId, postId: id } },
  });
  if (existing) {
    await prisma.like.delete({ where: { userId_postId: { userId, postId: id } } });
    return NextResponse.json({ liked: false });
  }
  await prisma.like.create({ data: { userId, postId: id } });
  return NextResponse.json({ liked: true }, { status: 201 });
}

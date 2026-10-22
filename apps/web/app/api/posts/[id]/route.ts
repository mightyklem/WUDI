import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_TITLE = 140;
const MAX_BODY = 1000;

/**
 * PUT /api/posts/[id] { title, body } -- change my own post.
 *
 * Only the author's own post, and only the writing on it. The picture belongs to the
 * class, and the class is changed on the class, not from here -- otherwise a promo
 * could show one thing and the class page another.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const post = await prisma.feedPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (post.authorId !== userId) {
    return NextResponse.json({ error: 'That is not your post' }, { status: 403 });
  }
  if (post.status === 'removed') {
    return NextResponse.json({ error: 'That post has been removed' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { title?: string; body?: string };

  const title = typeof body.title === 'string' ? body.title.trim() : undefined;
  const text = typeof body.body === 'string' ? body.body.trim() : undefined;

  if (title !== undefined && title.length > MAX_TITLE) {
    return NextResponse.json({ error: `Keep the title under ${MAX_TITLE} characters.` }, { status: 400 });
  }
  if (text !== undefined && text.length > MAX_BODY) {
    return NextResponse.json({ error: `Keep the text under ${MAX_BODY} characters.` }, { status: 400 });
  }

  const updated = await prisma.feedPost.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title: title || null } : {}),
      ...(text !== undefined ? { body: text || null } : {}),
    },
    select: { id: true, title: true, body: true },
  });

  return NextResponse.json({ post: updated });
}

/**
 * DELETE /api/posts/[id] -- take my own post down.
 *
 * The row is kept and marked removed rather than deleted, because a post is evidence:
 * a class that was promoted and then withdrawn should still be on the record, and
 * deleting the row would take the report history with it.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const post = await prisma.feedPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (post.authorId !== userId) {
    return NextResponse.json({ error: 'That is not your post' }, { status: 403 });
  }

  await prisma.feedPost.update({ where: { id }, data: { status: 'removed' } });
  return NextResponse.json({ removed: true });
}

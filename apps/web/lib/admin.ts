import { prisma } from '@/lib/db';

/** Platform staff gate. Admins are promoted via DB (isAdmin) — no self-service. */
export async function isAdmin(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } });
  return u?.isAdmin === true;
}

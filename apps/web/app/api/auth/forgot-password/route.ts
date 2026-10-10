import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail, passwordResetEmail } from '@/lib/email';
import { createResetToken } from '@/lib/password-reset';

export const dynamic = 'force-dynamic';

// POST /api/auth/forgot-password { email }
//
// Always answers the same way whether or not the account exists. Returning a different
// status for an unknown address would turn this into an oracle for who has an account,
// which is exactly the target list a credential-stuffing run wants. The ADR rate limit
// is 5/hr/IP (in middleware) and 3/hr/account (enforced here).
export async function POST(req: Request) {
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  const generic = NextResponse.json({ ok: true });

  const normalised = (email || '').trim().toLowerCase();
  if (!normalised || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalised)) return generic;

  const user = await prisma.user.findUnique({
    where: { email: normalised },
    select: { id: true, email: true, suspended: true },
  });
  if (!user || user.suspended) return generic;

  const token = await createResetToken(user.id);
  // null means the per-account cap was hit. Also generic: telling the difference would
  // leak that the account exists.
  if (!token) return generic;

  await sendEmail({
    ...passwordResetEmail({ resetPath: `/reset-password?token=${encodeURIComponent(token)}` }),
    to: user.email,
  });

  return generic;
}
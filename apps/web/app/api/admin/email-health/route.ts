import { NextResponse } from 'next/server';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { emailHealth } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/email-health — can this deployment actually send mail?
 *
 * Added because a total mail outage was invisible from inside the product. Signup answered
 * 201 with "emailSent: true" from a hardcoded literal, sendEmail returned false without
 * throwing, and the only trace was a console line nobody reads. So every new user was told
 * to check an inbox that was never going to receive anything, and the people reporting it
 * were told to check their spam folder.
 *
 * Booleans and a reason only. No key material, no address values — this is safe to open in
 * front of somebody, because "is email working" is a question that has to be answerable by
 * the people who own the deployment, not by guessing from user reports.
 */
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(emailHealth(), { headers: { 'cache-control': 'no-store' } });
}
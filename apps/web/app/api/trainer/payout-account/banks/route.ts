import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { nigeriaBanks } from '@/lib/payout-account';

export const dynamic = 'force-dynamic';

// GET /api/trainer/payout-account/banks — Nigerian banks for the dropdown.
// Paystack returns 288 banks worldwide, which is not something to render as a list.
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await prisma.trainerProfile.findUnique({ where: { userId }, select: { userId: true } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  try {
    const banks = await nigeriaBanks();
    return NextResponse.json({ banks });
  } catch {
    // Say why rather than showing an empty dropdown, which reads as "no banks available".
    return NextResponse.json(
      { error: 'Could not load banks from Paystack. Try again shortly.' },
      { status: 502 },
    );
  }
}
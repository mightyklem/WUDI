import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { initCheckout, newReference, provider, providerIssue } from '@/lib/payments';
import { MATERIAL_PREFIX } from '@/lib/material-settle';

export const dynamic = 'force-dynamic';

/**
 * POST /api/materials/[id]/purchase — buy (or take, when free) a material.
 *
 * Free: granted immediately. Paid: a Paystack checkout is initialized against
 * a MAT- reference and the grant lands via the webhook; on the mock provider
 * (dev only) the grant is immediate since there is no hosted page to visit.
 * One row per buyer per material: buying twice is buying nothing new.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const material = await prisma.material.findUnique({ where: { id } });
  if (!material || material.status !== 'live') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (material.trainerId === userId) {
    return NextResponse.json({ error: 'This is your own material' }, { status: 409 });
  }

  const existing = await prisma.materialPurchase.findUnique({
    where: { materialId_userId: { materialId: id, userId } },
  });
  if (existing?.status === 'granted') {
    return NextResponse.json({ granted: true, already: true });
  }

  if (material.priceNgn <= 0) {
    await prisma.materialPurchase.upsert({
      where: { materialId_userId: { materialId: id, userId } },
      create: { materialId: id, userId, amountNgn: 0, provider: 'none', status: 'granted' },
      update: { status: 'granted' },
    });
    return NextResponse.json({ granted: true }, { status: 201 });
  }

  const issue = providerIssue();
  if (issue) {
    console.error('[materials/purchase] payments provider misconfigured:', issue);
    return NextResponse.json(
      { error: 'Payments are not configured on this deployment.', detail: 'Nothing was charged.' },
      { status: 503 },
    );
  }

  const buyer = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!buyer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (provider() === 'mock') {
    await prisma.materialPurchase.upsert({
      where: { materialId_userId: { materialId: id, userId } },
      create: { materialId: id, userId, amountNgn: material.priceNgn, provider: 'mock', status: 'granted' },
      update: { status: 'granted', amountNgn: material.priceNgn, provider: 'mock' },
    });
    return NextResponse.json({ granted: true, mock: true }, { status: 201 });
  }

  if (existing?.status === 'pending' && existing.providerRef) {
    return NextResponse.json({ reference: existing.providerRef, resumed: true }, { status: 200 });
  }

  const reference = newReference(MATERIAL_PREFIX);
  const init = await initCheckout({
    email: buyer.email, amountNgn: material.priceNgn, reference,
  });
  await prisma.materialPurchase.upsert({
    where: { materialId_userId: { materialId: id, userId } },
    create: {
      materialId: id, userId, amountNgn: material.priceNgn,
      provider: 'paystack', providerRef: reference, status: 'pending',
    },
    update: { amountNgn: material.priceNgn, provider: 'paystack', providerRef: reference, status: 'pending' },
  });
  return NextResponse.json(
    { reference: init.reference, payUrl: init.payUrl, amountNgn: material.priceNgn },
    { status: 201 },
  );
}

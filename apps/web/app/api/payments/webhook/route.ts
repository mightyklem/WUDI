import { NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db';
import { provider, validPaystackSignature, verifyPaystack } from '@/lib/payments';
import { settlePaidPayment } from '@/lib/settle';
import { reconcileReversal } from '@/lib/payout-release';

export const dynamic = 'force-dynamic';

// POST /api/payments/webhook — Paystack charge.success events (FR-9.1).
// Signature-verified (HMAC-SHA512), idempotent on providerRef.
export async function POST(req: Request) {
  if (provider() !== 'paystack') {
    return NextResponse.json({ error: 'Paystack not enabled' }, { status: 404 });
  }
  const raw = await req.text();
  const signature = req.headers.get('x-paystack-signature');
  if (!validPaystackSignature(raw, signature)) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }
  const evt = JSON.parse(raw) as {
    event?: string;
    data?: { reference?: string; status?: string; reason?: string; transfer_code?: string };
  };
  const webhookJson = JSON.parse(raw) as Record<string, unknown>; // stored verbatim as dispute evidence

  // Transfer lifecycle. A transfer we accepted can still be reversed by Paystack later,
  // and without this a trainer stays marked paid for money that was clawed back.
  if (evt.event?.startsWith('transfer.')) {
    const reference = evt.data?.reference;
    if (reference && ['transfer.failed', 'transfer.reversed'].includes(evt.event)) {
      const reason = evt.data?.reason || evt.event;
      await reconcileReversal(reference, reason);
      await prisma.payment.updateMany({
        where: { providerRef: reference },
        data: { rawWebhook: webhookJson as Prisma.InputJsonValue },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (evt.event !== 'charge.success' || !evt.data?.reference) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  // Trust-but-verify: confirm with Paystack before crediting.
  const v = await verifyPaystack(evt.data.reference);
  if (!v.paid) return NextResponse.json({ ok: true, ignored: true });
  try {
    await settlePaidPayment({
      providerRef: evt.data.reference, amountNgn: v.amountNgn, providerFeeNgn: v.feeNgn,
    });
    // Keep the provider's payload verbatim — dispute/refund evidence (FR-9.4).
    await prisma.payment.updateMany({
      where: { providerRef: evt.data.reference },
      data: { rawWebhook: webhookJson as Prisma.InputJsonValue },
    });
  } catch (e) {
    if (e instanceof Error && ['UNKNOWN_REF', 'BAD_STATE', 'UNDERPAID'].includes((e as { code?: string }).code || '')) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}

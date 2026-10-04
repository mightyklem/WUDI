import { NextResponse } from 'next/server';
import { provider, validPaystackSignature, verifyPaystack } from '@/lib/payments';
import { settlePaidPayment } from '@/lib/settle';

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
  const evt = JSON.parse(raw) as { event?: string; data?: { reference?: string; status?: string } };
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
  } catch (e) {
    if (e instanceof Error && ['UNKNOWN_REF', 'BAD_STATE', 'UNDERPAID'].includes((e as { code?: string }).code || '')) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}

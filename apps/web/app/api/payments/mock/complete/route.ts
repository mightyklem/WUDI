import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { provider } from '@/lib/payments';
import { settlePaidPayment } from '@/lib/settle';

export const dynamic = 'force-dynamic';

// POST /api/payments/mock/complete { reference }
// LOCAL DEV ONLY (mock provider): simulates the participant completing payment.
// Returns 404 unless PAYMENTS_PROVIDER=mock. Real money flows via Paystack webhook.
export async function POST(req: Request) {
  if (provider() !== 'mock') {
    return NextResponse.json({ error: 'Mock completions disabled' }, { status: 404 });
  }
  const { reference } = (await req.json().catch(() => ({}))) as { reference?: string };
  if (!reference) return NextResponse.json({ error: 'reference required' }, { status: 400 });
  const pending = await prisma.payment.findUnique({ where: { providerRef: reference } });
  if (!pending) return NextResponse.json({ error: 'Unknown reference' }, { status: 404 });
  try {
    const payment = await settlePaidPayment({
      providerRef: reference, amountNgn: pending.amountNgn, providerFeeNgn: 0,
    });
    return NextResponse.json({ ok: true, payment: { id: payment.id, status: payment.status } });
  } catch (e) {
    if (e instanceof Error && ['UNKNOWN_REF', 'BAD_STATE', 'UNDERPAID'].includes((e as { code?: string }).code || '')) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}

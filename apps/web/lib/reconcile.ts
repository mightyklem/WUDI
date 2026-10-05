import { prisma } from '@/lib/db';
import { provider, verifyPaystack } from '@/lib/payments';
import { settlePaidPayment } from '@/lib/settle';

/**
 * Safety net for dropped provider webhooks (FR-9.1).
 *
 * Paystack retries `charge.success` a handful of times, then stops. If every retry fails
 * (our deploy is down, the tunnel drops, a 500 escapes), the participant has paid but the
 * payment sits on `pending` forever: no `certPaid`, no certificate, no trainer payout.
 * Re-verify against the provider and settle anything that actually succeeded.
 *
 * Idempotent — `settlePaidPayment` is a no-op on already-paid rows, so calling this
 * repeatedly (page loads, retries, a future cron sweep) is safe.
 */
export async function reconcilePendingPayments(opts: { paymentId?: string; userId?: string }) {
  const empty = { checked: 0, settled: 0, rejected: 0 };
  if (provider() !== 'paystack') return empty;

  const payments = await prisma.payment.findMany({
    where: {
      status: 'pending',
      provider: 'paystack',
      ...(opts.paymentId ? { id: opts.paymentId } : {}),
      ...(opts.userId ? { registration: { userId: opts.userId } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  let settled = 0;
  let rejected = 0;
  for (const payment of payments) {
    let result: Awaited<ReturnType<typeof verifyPaystack>>;
    try {
      result = await verifyPaystack(payment.providerRef);
    } catch {
      continue; // provider unreachable — stay pending, try again later
    }
    if (!result.paid) continue;

    try {
      await settlePaidPayment({
        providerRef: payment.providerRef,
        amountNgn: result.amountNgn,
        providerFeeNgn: result.feeNgn,
      });
      settled += 1;
    } catch (e) {
      const code = (e as { code?: string }).code || '';
      if (code === 'BAD_STATE') continue; // settled concurrently by the webhook — fine
      // Underpaid or otherwise payable-but-invalid: close it so it stops being retried,
      // and leave a durable trail for the trainer to chase with support.
      if (code === 'UNDERPAID') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'failed', rawWebhook: { reconciled: true, reason: 'UNDERPAID', at: new Date().toISOString() } },
        });
        rejected += 1;
      }
    }
  }
  return { checked: payments.length, settled, rejected };
}
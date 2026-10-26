import { prisma } from '@/lib/db';
import { provider, verifyPaystack } from '@/lib/payments';

/** Material purchases ride a distinct reference prefix so the webhook can route
 *  them away from registration payments without guessing from the amount. */
export const MATERIAL_PREFIX = 'MAT';

/**
 * Grant a paid material purchase.
 *
 * Idempotent: a replayed webhook must not double-grant, and a purchase that is
 * already granted stays granted. Underpayment grants nothing.
 */
export async function settleMaterial({ providerRef, amountNgn }: { providerRef: string; amountNgn: number }) {
  const purchase = await prisma.materialPurchase.findUnique({ where: { providerRef } });
  if (!purchase) return { ok: false as const, code: 'UNKNOWN_REF' };
  if (purchase.status === 'granted') return { ok: true as const, already: true };

  const material = await prisma.material.findUnique({ where: { id: purchase.materialId } });
  if (!material || material.status !== 'live') return { ok: false as const, code: 'BAD_STATE' };
  if (amountNgn < material.priceNgn) return { ok: false as const, code: 'UNDERPAID' };

  await prisma.$transaction([
    prisma.materialPurchase.update({
      where: { id: purchase.id },
      data: { status: 'granted', amountNgn },
    }),
    prisma.auditLog.create({
      data: {
        actorId: purchase.userId,
        action: 'material.paid',
        target: providerRef,
        reason: `${amountNgn} naira for material ${material.id}`,
      },
    }),
  ]);

  return { ok: true as const, purchaseId: purchase.id };
}

/**
 * Trust-but-verify against Paystack before crediting, mirroring the registration
 * webhook. Returns the outcome rather than throwing, because a webhook that 500s
 * on an unknown reference will be retried forever by the provider.
 */
export async function settleMaterialFromWebhook(providerRef: string) {
  if (provider() !== 'paystack') return { ok: false as const, code: 'NOT_PAYSTACK' };
  const v = await verifyPaystack(providerRef);
  if (!v.paid) return { ok: false as const, code: 'UNPAID' };
  return settleMaterial({ providerRef, amountNgn: v.amountNgn });
}

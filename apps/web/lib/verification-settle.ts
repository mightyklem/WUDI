import { prisma } from '@/lib/db';
import { provider, verifyPaystack } from '@/lib/payments';

/** Verification fees ride a distinct reference prefix so the webhook can route them
 *  away from registration payments without guessing from the amount. */
export const VERIFICATION_PREFIX = 'LRNV';

/**
 * Settle a paid verification fee onto the application.
 *
 * Credits the payment record and marks the application as paid — and nothing else. It
 * does not touch `status`, does not set `badgeExpiresAt`, and does not grant the badge.
 * Those belong to a reviewer's decision, and if a successful charge could set them, the
 * badge would just be a receipt with better marketing.
 */
export async function settleVerification({ providerRef, amountNgn }: { providerRef: string; amountNgn: number }) {
  const app = await prisma.trainerApplication.findFirst({ where: { paymentRef: providerRef } });
  if (!app) return { ok: false as const, code: 'UNKNOWN_REF' };

  // Idempotent: a replayed webhook must not overwrite a decision already recorded.
  if (app.paidAt) return { ok: true as const, already: true };

  if (amountNgn <= 0) return { ok: false as const, code: 'UNDERPAID' };

  await prisma.$transaction([
    prisma.trainerApplication.update({
      where: { id: app.id },
      data: { paidAt: new Date(), amountPaidNgn: amountNgn },
    }),
    prisma.auditLog.create({
      data: {
        actorId: app.trainerId,
        action: 'verification.paid',
        target: providerRef,
        reason: `${amountNgn} naira for application ${app.id}`,
      },
    }),
  ]);

  return { ok: true as const, applicationId: app.id };
}

/**
 * Trust-but-verify against Paystack before crediting, mirroring the registration
 * webhook. Returns the outcome rather than throwing, because a webhook that 500s on an
 * unknown reference will be retried forever by the provider.
 */
export async function settleVerificationFromWebhook(providerRef: string) {
  if (provider() !== 'paystack') return { ok: false as const, code: 'NOT_PAYSTACK' };
  const v = await verifyPaystack(providerRef);
  if (!v.paid) return { ok: false as const, code: 'UNPAID' };
  return settleVerification({ providerRef, amountNgn: v.amountNgn });
}
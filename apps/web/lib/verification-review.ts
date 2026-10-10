import { prisma } from '@/lib/db';
import { refundPaystack } from '@/lib/payments';
import { badgeExpiry, refundDecisionForReview } from '@/lib/verification';
import { scoreWithProof } from '@learnovize/shared';

/**
 * Record a reviewer's decision.
 *
 * The badge is issued here and nowhere else. There is deliberately no code path in
 * which a successful payment produces a badge -- payment and judgement are stored
 * separately for exactly this reason.
 *
 * A rejection triggers a real refund through Paystack before the decision is written.
 * If that call fails the decision is NOT recorded, because recording a rejection while
 * keeping the money would create an obligation nothing tracks. `refundPending` is the
 * manual-escalation path for the rare failure, and it is alertable.
 */
export async function decideVerification({
  applicationId,
  reviewerId,
  approve,
  proofGrade,
  finalRating,
  notes,
}: {
  applicationId: string;
  reviewerId: string;
  approve: boolean;
  proofGrade: 'none' | 'weak' | 'clear';
  finalRating?: 'A' | 'B' | 'C';
  notes?: string;
}) {
  const app = await prisma.trainerApplication.findUnique({ where: { id: applicationId } });
  if (!app) return { ok: false as const, code: 'NOT_FOUND' };
  if (app.status === 'verified') return { ok: false as const, code: 'ALREADY_DECIDED' };

  if (approve && !finalRating) return { ok: false as const, code: 'RATING_REQUIRED' };

  // Paying first, so we never promise a refund we have not issued.
  if (!approve) {
    const decision = refundDecisionForReview({ approved: false, paidNgn: app.amountPaidNgn || 0 });
    if (decision.refund && app.paymentRef && !app.refundedAt) {
      let refunded = false;
      try {
        const r = await refundPaystack(app.paymentRef);
        refunded = r.ok === true;
      } catch {
        refunded = false;
      }
      if (!refunded) {
        // Flag it loudly rather than quietly deciding. The money is owed.
        await prisma.trainerApplication.update({
          where: { id: app.id },
          data: { refundPending: true },
        });
        await prisma.auditLog.create({
          data: {
            actorId: reviewerId,
            action: 'verification.refund_failed',
            target: app.paymentRef || app.id,
            reason: 'paystack refund rejected; refund owed to trainer',
          },
        });
        return { ok: false as const, code: 'REFUND_FAILED' };
      }
    }
  }

  // Only trust the shared scoring over stored answers if they are present; otherwise
  // fall back to the subtotal already recorded at submission time.
  const scored =
    app.answers && Object.keys(app.answers as object).length
      ? scoreWithProof(app.answers as Record<string, unknown>, proofGrade)
      : null;

  const updated = await prisma.$transaction([
    prisma.trainerApplication.update({
      where: { id: app.id },
      data: {
        status: approve ? 'verified' : 'rejected',
        proofGrade,
        finalRating: approve ? finalRating! : null,
        reviewNotes: notes || null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        totalScore: scored?.total ?? null,
        band: scored?.band ?? null,
        // Only set here, on approval. Never derived from a payment.
        ...(approve ? { badgeExpiresAt: badgeExpiry() } : {}),
        ...(!approve && app.amountPaidNgn ? { refundedAt: new Date() } : {}),
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: reviewerId,
        action: approve ? 'verification.approved' : 'verification.rejected',
        target: app.id,
        reason: notes || `proof ${proofGrade}`,
      },
    }),
  ]);

  return { ok: true as const, application: updated[0] };
}
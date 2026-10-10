/**
 * Trainer verification pricing and the badge rules.
 *
 * The model: anyone may teach for free. The badge is a paid upgrade that opens a review.
 * The one thing payment must never do is stand in for the judgement -- so the two are
 * tracked separately and `verifiedBadge` only reflects a decision a person made.
 *
 * PRICING IS A PLACEHOLDER. Every number here is an assumption, not a finding:
 *
 *   VERIFICATION_FEE_NGN 10,000 -- about ₦417/month over 24 months. Chosen to sit below
 *     the cost of data for most Nigerian learners and trainers, and to cover the admin
 *     time a review actually costs. Nothing was researched; this is a starting point
 *     to change once real trainers have reacted to it.
 *
 *   BADGE_VALID_MONTHS 24 -- long enough that renewal is not nagging, short enough that
 *     a trainer who has left the profession stops being presented as current.
 *
 * One-off rather than a subscription on purpose: a subscription means failed payments,
 * dunning, and a badge that lapses because someone's card expired. None of that is worth
 * it before there is a reason for it.
 */

export const VERIFICATION_FEE_NGN = Number(process.env.VERIFICATION_FEE_NGN || 10000);
export const BADGE_VALID_MONTHS = Number(process.env.BADGE_VALID_MONTHS || 24);

/** What the badge actually asserts. Kept short because it is displayed publicly. */
export const BADGE_LABEL = 'Verified trainer';

export function badgeExpiry(from = new Date()) {
  return new Date(from.getTime() + BADGE_VALID_MONTHS * 30 * 24 * 3600 * 1000);
}

/**
 * The public badge state.
 *
 * Deliberately derived rather than stored: if it were a boolean column, it could drift
 * out of step with the review that justified it, and an expired badge would keep being
 * displayed forever. Only a verified review, inside its validity window, counts.
 */
export function badgeState(app, now = new Date()) {
  if (!app) return { verified: false, label: null, reason: 'not-applied' };
  if (app.status !== 'verified') {
    return { verified: false, label: null, reason: app.status };
  }
  if (app.badgeExpiresAt && new Date(app.badgeExpiresAt) <= now) {
    // Lapsed, but still a verified person -- distinguish from never-verified so the
    // UI can say "needs renewing" rather than "not verified".
    return { verified: false, expired: true, label: null, reason: 'expired' };
  }
  const rating = app.finalRating;
  return {
    verified: true,
    rating: rating || null,
    // The rating is worth showing: B means skilled and checked, just little teaching
    // history, which is not a warning sign to a learner.
    label: rating ? `${BADGE_LABEL} · ${rating}` : BADGE_LABEL,
    reason: 'verified',
  };
}

/**
 * What a rejected application gets back.
 *
 * A refund is owed, not discretionary. Someone paid to be assessed, was assessed, and
 * was told no; keeping the money for that would be selling a decision rather than a
 * service, and it is the fastest way to make the badge meaningless to the people it is
 * meant to reassure.
 */
export function refundDecisionForReview({ approved, paidNgn }) {
  if (approved) return { refund: false, reason: 'approved' };
  if (!paidNgn || paidNgn <= 0) return { refund: false, reason: 'nothing-paid' };
  return { refund: true, reason: 'review-rejected', amountNgn: paidNgn };
}

/** One purchase per application. A second payment for the same application is refused. */
export function canPurchaseBadge(app) {
  if (!app) return { ok: true, reason: 'new' };
  if (app.paidAt && !app.refundedAt && app.status !== 'rejected') {
    return { ok: false, reason: 'already-paid' };
  }
  return { ok: true, reason: app.status === 'rejected' ? 'retry-after-rejection' : 'new' };
}
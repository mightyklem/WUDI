/**
 * Points and level ranks (FR-13).
 *
 * Points are awarded on VERIFIED ATTENDANCE only. The API recomputes them from
 * attendance records and never trusts a client-reported value, and there is one
 * PointsEvent per (user, session) so a replayed request cannot double-count.
 *
 * Points are deliberately not proportional to price. A N500,000 Premium day
 * would otherwise dwarf every other earn and turn rank into a spending receipt.
 */

/** Points awarded per event. Keep these as the single source of truth. */
export const POINTS = Object.freeze({
  freeDayAttended: 10,
  paidDayAttended: 20,
  allEnrolledDaysCompleted: 25,
  certificateEarned: 50,
  // One review is worth up to this, scaled by the stars it was given. See
  // pointsForReview for why one and two stars award nothing.
  reviewReceivedMax: 15,
  /**
   * What a trainer earns when someone actually turns up to their class.
   *
   * This is the missing half of loyalty. Until now a trainer's standing came only from
   * reviews, which is the one thing they can influence least -- and it does nothing at
   * all for a trainer who has just taught their hundredth session and has no reviews left
   * to write. Delivering a class to a room is the work, and this is the reward for it.
   *
   * Flat, and deliberately not scaled by price, for the same reason the learner's awards
   * are not: weighting by what a class costs would send a trainer after the most expensive
   * room rather than the best one, and rank would become a receipt again.
   *
   * Above the learner's 20, so a trainer delivering a five-session programme lands about
   * where a learner who completed one and earned the certificate does. Both earned it.
   */
  sessionTaught: 30,
});

/** Reasons recorded against a PointsEvent. */
export const POINT_REASONS = Object.freeze({
  sessionAttended: 'session_attended',
  programCompleted: 'program_completed',
  certificateEarned: 'certificate_earned',
  reviewReceived: 'review_received',
  sessionTaught: 'session_taught',
  manualAdjustment: 'manual_adjustment',
});

/**
 * What one learner review is worth to the trainer who received it.
 *
 * Scales with the stars, and awards nothing at one or two. A trainer should not be able
 * to raise their standing by collecting complaints, and a one-star review says nothing
 * about whether they are any good -- it usually says more about the learner than the
 * teaching. So the floor is at three, which is neutral, and only clear positives count.
 *
 *   5 stars  15    4 stars  10    3 stars  5    1-2 stars  0
 *
 * This is bounded on purpose. The only thing standing between a trainer and a farmed
 * reputation is that each learner can review each session once and only after turning
 * up, so this should not be a number big enough to make that worth breaking.
 */
export function pointsForReview(rating) {
  const r = Math.floor(Number(rating));
  if (!Number.isFinite(r) || r <= 3) return r === 3 ? 5 : 0;
  return (r - 2) * (POINTS.reviewReceivedMax / 3);
}

/**
 * The rank ladder, ascending. Lifetime points, no decay — a learner's history
 * should not be erased just because they stopped for a while.
 *
 * The same ladder carries a trainer's standing, which comes from reviews rather than
 * attendance. One ladder for both keeps one definition of progress on the platform
 * instead of two that quietly disagree about what "good" means.
 *
 * Each rank costs 4x the points of the rank before it, so every promotion is
 * visibly harder than the last. Gold is deliberately a long road: a full paid
 * program with a certificate is 175 points, so Gold is roughly 37 of them.
 */
export const RANKS = Object.freeze([
  Object.freeze({ key: 'stone', label: 'Stone', icon: '🪨', min: 0 }),
  Object.freeze({ key: 'bronze', label: 'Bronze', icon: '🥉', min: 400 }),
  Object.freeze({ key: 'silver', label: 'Silver', icon: '🥈', min: 1600 }),
  Object.freeze({ key: 'gold', label: 'Gold', icon: '🥇', min: 6400 }),
]);

/** The highest rank, for copy that needs a ceiling ("you have topped out"). */
export const TOP_RANK = RANKS[RANKS.length - 1];

export function isRankKey(key) {
  return typeof key === 'string' && RANKS.some((r) => r.key === key);
}

/**
 * The rank a learner sits at for a given total. Derived, never stored as the
 * source of truth, so it can never drift out of sync with the points total.
 */
export function rankFor(points) {
  const p = normalisePoints(points);
  let current = RANKS[0];
  for (const r of RANKS) {
    if (p >= r.min) current = r;
  }
  return current;
}

/** The next rank up, or null when already at the top. */
export function nextRankFor(points) {
  const p = normalisePoints(points);
  const next = RANKS.find((r) => r.min > p);
  return next || null;
}

/** Points still needed for the next rank, or null at the top. */
export function pointsToNextRank(points) {
  const next = nextRankFor(points);
  if (!next) return null;
  return next.min - normalisePoints(points);
}

/**
 * Progress within the current rank, 0–100. Useful for a thin progress bar, but
 * the UI should show the numbers rather than making this the headline.
 */
export function rankProgress(points) {
  const p = normalisePoints(points);
  const current = rankFor(p);
  const next = nextRankFor(p);
  if (!next) return { current, next: null, into: 0, span: 0, pct: 100 };
  const into = p - current.min;
  const span = next.min - current.min;
  return { current, next, into, span, pct: Math.round((into / span) * 100) };
}

/**
 * Points for one attended day. No bonus lives here on purpose: this is called
 * once per day, so anything conditional on finishing the whole program would
 * get multiplied by the number of days.
 */
export function pointsForAttendanceDay({ accessType } = {}) {
  // Unknown access type is treated as free, never as paid.
  return accessType === 'paid' ? POINTS.paidDayAttended : POINTS.freeDayAttended;
}

/** The once-only bonus for attending every day the learner enrolled in. */
export function pointsForProgramCompletion() {
  return POINTS.allEnrolledDaysCompleted;
}

export function pointsForCertificate() {
  return POINTS.certificateEarned;
}

/** Coerce anything to a usable, non-negative whole point total. */
export function normalisePoints(points) {
  const n = Number(points);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/**
 * What to print when we have to name a person.
 *
 * One function, because the alternative is every surface inventing its own version. The
 * giveaway derived a name from an email, the roster did the same, and the certificate did
 * something worse -- it printed the email address itself, so a paid graduate held a PDF
 * with "mightyklemaugustine@gmail.com" across the middle of it. None of those should have
 * existed as three separate decisions.
 *
 * Falls back to the local part of the address, which is a person in the way that the
 * string itself is not, and returns null when there is nothing at all rather than printing
 * "undefined" onto a credential.
 */
export function personName(user) {
  if (!user) return null;
  const full = typeof user.fullName === 'string' ? user.fullName.trim() : '';
  if (full) return full;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (!email) return null;
  const local = email.split('@')[0];
  return local || null;
}

/**
 * Whether a name was supplied rather than derived. Used where the difference matters:
 * a certificate should be able to say the holder has not given their real name yet, rather
 * than presenting a mangled email as if it were one.
 */
export function hasRealName(user) {
  const full = typeof user?.fullName === 'string' ? user.fullName.trim() : '';
  return full.length > 0;
}
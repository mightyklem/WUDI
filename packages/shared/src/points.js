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
});

/** Reasons recorded against a PointsEvent. */
export const POINT_REASONS = Object.freeze({
  sessionAttended: 'session_attended',
  programCompleted: 'program_completed',
  certificateEarned: 'certificate_earned',
  manualAdjustment: 'manual_adjustment',
});

/**
 * The rank ladder, ascending. Lifetime points, no decay — a learner's history
 * should not be erased just because they stopped for a while.
 */
export const RANKS = Object.freeze([
  Object.freeze({ key: 'stone', label: 'Stone', icon: '🪨', min: 0 }),
  Object.freeze({ key: 'bronze', label: 'Bronze', icon: '🥉', min: 100 }),
  Object.freeze({ key: 'silver', label: 'Silver', icon: '🥈', min: 400 }),
  Object.freeze({ key: 'gold', label: 'Gold', icon: '🥇', min: 1000 }),
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
  // Points can be clawed back, so a negative total still has to resolve to a rank.
  return Math.max(0, Math.floor(n));
}
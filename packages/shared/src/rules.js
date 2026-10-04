/**
 * Learnovize shared business rules — pure functions, no I/O.
 * Source of truth for: PRD FR-7 (attendance), FR-8 (certificates),
 * FR-9 (commission/refunds), FR-3.3/5.4 (seat caps).
 * The API MUST re-validate every result server-side; clients use these read-only.
 */

export const PRESENT_THRESHOLD = 0.75; // FR-7.1: present = stayed >= 75% of session
export const DEFAULT_MIN_PCT = 80; // FR-3.6 default
export const MIN_PCT_FLOOR = 60;
export const MIN_PCT_CEIL = 100;

export const PLAN_CAPS = Object.freeze({ free: 50, pro: 200, business: 500 });
export const PLAN_COMMISSION = Object.freeze({ free: 0.05, pro: 0.03, business: 0.01 });

/** Clamp trainer-set minimum attendance % to 60–100 (FR-3.6). */
export function clampMinPct(raw, fallback = DEFAULT_MIN_PCT) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MIN_PCT_CEIL, Math.max(MIN_PCT_FLOOR, Math.round(n)));
}

/** FR-7.1: present in a session if stayed >= 75% of its duration. */
export function isPresent(sessionDurationMs, stayedMs) {
  if (!Number.isFinite(sessionDurationMs) || sessionDurationMs <= 0) return false;
  if (!Number.isFinite(stayedMs) || stayedMs < 0) return false;
  return stayedMs >= sessionDurationMs * PRESENT_THRESHOLD;
}

/** FR-7.4: program % = present sessions / total sessions (0–100). */
export function programPct(presentSessions, totalSessions) {
  if (!Number.isFinite(totalSessions) || totalSessions <= 0) return 0;
  const p = Math.min(Math.max(presentSessions, 0), totalSessions);
  return Math.round((p / totalSessions) * 100);
}

/**
 * FR-8.1: eligible iff attendance % meets the training minimum
 * AND (cert is not paid OR participant paid).
 */
export function isEligible({ pct, minPct = DEFAULT_MIN_PCT, certMode = 'none', paid = false }) {
  const min = clampMinPct(minPct);
  if (!Number.isFinite(pct) || pct < min) return false;
  if (certMode === 'paid' && !paid) return false;
  return true;
}

/**
 * FR-9.2: Learnovize commission in kobo-safe integer NGN.
 * Amounts are whole naira; result rounded to nearest naira.
 */
export function commission(plan, amountNgn) {
  const rate = PLAN_COMMISSION[plan];
  if (rate === undefined) throw new RangeError(`Unknown plan: ${plan}`);
  if (!Number.isFinite(amountNgn) || amountNgn < 0) throw new RangeError('amount must be >= 0');
  return Math.round(amountNgn * rate);
}

/** FR-9.3: trainer net = amount − provider fee − commission. */
export function trainerNet({ amountNgn, providerFeeNgn, plan }) {
  const c = commission(plan, amountNgn);
  const net = amountNgn - providerFeeNgn - c;
  if (net < 0) throw new RangeError('fees exceed amount');
  return { providerFeeNgn, commissionNgn: c, netNgn: net };
}

/**
 * Pure seat-claim helper. The DB enforces the cap atomically
 * (UPDATE ... WHERE seats_taken < cap RETURNING); this mirrors the rule for UI/tests.
 */
export function tryClaimSeat(seatsTaken, cap) {
  if (!Number.isInteger(seatsTaken) || seatsTaken < 0) throw new RangeError('bad seatsTaken');
  if (!Number.isInteger(cap) || cap <= 0) throw new RangeError('bad cap');
  if (seatsTaken >= cap) return { ok: false, seatsTaken };
  return { ok: true, seatsTaken: seatsTaken + 1 };
}

/**
 * FR-9.5 refund policy.
 * cancelledBy: 'trainer' | 'participant' | null (no-show / completed)
 * Returns { refund: boolean, reason }.
 */
export function refundDecision({ cancelledBy, hoursBeforeStart = 0, trainerHeld = true }) {
  if (cancelledBy === 'trainer' || trainerHeld === false) {
    return { refund: true, reason: 'trainer-cancelled-or-no-show' };
  }
  if (cancelledBy === 'participant' && hoursBeforeStart >= 24) {
    return { refund: true, reason: 'participant-cancelled-24h-plus' };
  }
  return { refund: false, reason: 'no-refund' };
}

/** Certificate number format LEARNOVIZE-YYYY-XXXXXX (ADR-006). */
const CERT_RE = /^LEARNOVIZE-(19|20)\d{2}-[A-Z0-9]{6}$/;
export function isCertNumber(s) {
  return typeof s === 'string' && CERT_RE.test(s);
}

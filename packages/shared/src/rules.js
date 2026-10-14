/**
 * Learnovize shared business rules — pure functions, no I/O.
 * Source of truth for: PRD FR-7 (attendance), FR-8 (certificates),
 * FR-9 (commission/refunds), FR-3.3/5.4 (seat caps).
 * The API MUST re-validate every result server-side; clients use these read-only.
 */

export const PRESENT_THRESHOLD = 0.75; // FR-7.1: present = stayed >= 75% of session
// 60% is the floor as well as the default, so a new class asks for the least the
// platform permits and a trainer who cares can raise it per class. Was 80%, which sat
// 20 points above the floor and made the "attended most of it" promise easy to miss.
// Note this only affects classes created from here on: minPct is stored per training,
// so existing ones keep whatever they were created with.
export const DEFAULT_MIN_PCT = 60;
export const MIN_PCT_FLOOR = 60;
export const MIN_PCT_CEIL = 100;

export const PLAN_CAPS = Object.freeze({ free: 50, pro: 200, business: 500 });

/**
 * Seat ceiling for a trainer's plan.
 *
 * Free is 50, which is where a class stops being self-serve: 51 and above is
 * reached by upgrading the plan. This is the only thing that bounds class size —
 * paid classes are not separately gated, so a verified trainer may run a free or
 * a paid class up to their ceiling.
 *
 * Anything that is not exactly 'pro' or 'business' resolves to the free ceiling,
 * so an unknown, missing or tampered plan value can never widen it.
 */
export function planCapCeiling(plan) {
  return plan === 'pro' || plan === 'business' ? PLAN_CAPS[plan] : PLAN_CAPS.free;
}

/**
 * The governing rule for how many seats a class may hold.
 *
 * Returns an error message when the cap is above the trainer's plan ceiling,
 * otherwise null. Both the create and the update route must call this: a ceiling
 * enforced only on create is one a trainer can walk past with a follow-up edit.
 */
export function capOverPlanError(cap, plan) {
  const ceiling = planCapCeiling(plan);
  if (cap <= ceiling) return null;
  return `Cap ${cap} exceeds your ${plan || 'free'} plan (${ceiling}). Upgrade to raise it.`;
}

/**
 * Learnovize's commission: a flat 25%.
 *
 * Where this number comes from. Live-class marketplaces charge roughly 18-33% for
 * bringing the student: Wyzant 25%, Outschool 30%, italki 30% on group classes, Preply
 * 33% at entry. Self-serve creator platforms charge 0-3%, but only because the trainer
 * brings their own traffic. 25% sits with the marketplaces because that is what a
 * learner-facing platform is actually doing.
 *
 * At the real volume this is priced for -- 50 seats on a N1,500 class is N75,000 gross
 * -- the trainer still nets about N55,000, or N1,101 per learner, for a day of
 * teaching. The platform keeps ~N20,000 per class, which is the first number in this
 * file that actually covers LiveKit, storage and the time spent reviewing trainers.
 *
 * The free/pro/business tiers were designed to cut this to 3% and 1%, but nothing in
 * the product ever sold them, so every trainer sat on 'free' regardless. Splitting by
 * plan now would advertise a discount nobody can buy.
 */
export const COMMISSION_RATE = 0.25;

/** Retained so callers can keep passing a plan; the rate no longer varies by one. */
export const PLAN_COMMISSION = Object.freeze({ free: COMMISSION_RATE, pro: COMMISSION_RATE, business: COMMISSION_RATE });

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
 * Fold one more attendance window into a learner's running total.
 *
 * A learner's stay is not continuous. They drop on a bad network, a phone sleeps, the
 * app is backgrounded, and they come back. Each is a separate window, and the question
 * that decides a certificate is how much of the session they were actually present for --
 * not whether they were connected the entire time.
 *
 * So windows ACCUMULATE. The webhook used to zero stayedMs on every rejoin, which quietly
 * destroyed the earlier stay: a learner who attended 40 minutes, dropped, and rejoined for
 * the last 20 was recorded as having stayed 20 -- under the 75% presence threshold, so
 * marked absent, so denied a certificate they had earned. Nobody was cheating; a phone was.
 *
 * Capped at the session length. Without it a duplicated webhook, or a session whose end
 * time is wrong, could report more time present than the session contains -- 130%
 * attendance, which makes the percentage meaningless.
 *
 * Returns the merged total and the presence decision together, so a caller cannot store
 * one and compute the other.
 */
export function mergeAttendanceWindow(priorStayedMs, windowMs, sessionDurationMs) {
  const prior = Number.isFinite(priorStayedMs) && priorStayedMs > 0 ? priorStayedMs : 0;
  const window = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;
  const cap = Number.isFinite(sessionDurationMs) && sessionDurationMs > 0 ? sessionDurationMs : Infinity;
  const stayedMs = Math.min(prior + window, cap);
  return { stayedMs, present: isPresent(sessionDurationMs, stayedMs) };
}

/**
 * FR-9.2: Learnovize commission in kobo-safe integer NGN.
 * Amounts are whole naira; result rounded to nearest naira.
 */
export function commission(plan, amountNgn) {
  if (!Number.isFinite(amountNgn) || amountNgn < 0) throw new RangeError('amount must be >= 0');
  if (plan !== 'free' && plan !== 'pro' && plan !== 'business') {
    throw new RangeError(`Unknown plan: ${plan}`);
  }
  return Math.round(amountNgn * COMMISSION_RATE);
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

// Paid-class pricing (FR-11) lives in its own module but ships from the same
// entrypoint so callers keep one import.
export * from './pricing.js';

// Points and level ranks (FR-13), same reasoning.
export * from './points.js';

// Trainer application questions and scoring. Pure so the same arithmetic runs in the
// browser, the API and the tests -- inconsistent scoring is what makes an approval
// queue arbitrary.
export * from './trainer-application.js';

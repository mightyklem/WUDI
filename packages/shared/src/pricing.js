/**
 * Paid-class pricing rules (FR-11).
 *
 * A class is either FREE or PAID. Free classes never issue a certificate —
 * if a class certifies, attendance itself is paid. Paid classes are quoted per
 * DAY, and the participant pays (price per day x number of billable days).
 *
 * All amounts are whole naira, matching the rest of Wudi. Paystack converts to
 * kobo at the payment edge, never here.
 *
 * Tier bounds come straight from the product spec:
 *   Basic    from N1,500
 *   Standard N5,000 up to N499,999
 *   Premium  N500,000 and above
 */

export const PRICING_TIERS = Object.freeze({
  basic: { key: 'basic', label: 'Basic', min: 1500, max: 4999 },
  standard: { key: 'standard', label: 'Standard', min: 5000, max: 499999 },
  premium: { key: 'premium', label: 'Premium', min: 500000, max: null },
});

export const TIER_KEYS = Object.freeze(['basic', 'standard', 'premium']);

export function isTier(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PRICING_TIERS, v);
}

export function tierLabel(key) {
  return isTier(key) ? PRICING_TIERS[key].label : '';
}

/** Human-readable band, e.g. "Basic — from N1,500" or "Premium — N500,000 and above". */
export function tierRangeText(key) {
  if (!isTier(key)) return '';
  const t = PRICING_TIERS[key];
  if (t.max === null) return `${t.label} — N${t.min.toLocaleString('en-NG')} and above`;
  return `${t.label} — N${t.min.toLocaleString('en-NG')} to N${t.max.toLocaleString('en-NG')}`;
}

export function formatNgn(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 'N0';
  return `N${v.toLocaleString('en-NG')}`;
}

/**
 * Validate a per-day price against its tier.
 * Returns { ok: true, price } or { ok: false, error }.
 */
export function validateDayPrice(tier, raw) {
  if (!isTier(tier)) return { ok: false, error: 'Choose a price category' };
  const price = Math.round(Number(raw));
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'Enter a price per day' };
  const t = PRICING_TIERS[tier];
  if (price < t.min) {
    return { ok: false, error: `${t.label} starts at ${formatNgn(t.min)} per day` };
  }
  if (t.max !== null && price > t.max) {
    return { ok: false, error: `${t.label} goes up to ${formatNgn(t.max)} per day — try Premium` };
  }
  return { ok: true, price };
}

/**
 * Billable days = distinct UTC calendar dates that contain at least one session.
 * Two sessions on the same day cost one day's fee, because the quote is per day.
 */
export function billableDays(sessions) {
  const days = new Set();
  for (const s of sessions || []) {
    const d = s?.startsAtUtc ? new Date(s.startsAtUtc) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    days.add(d.toISOString().slice(0, 10));
  }
  return days.size;
}

/**
 * Per-day quote for a class.
 * Free classes always cost nothing. Paid classes cost pricePerDay x billable days.
 */
export function quote({ accessType, pricePerDayNgn, sessions }) {
  const days = billableDays(sessions);
  if (accessType !== 'paid') {
    return { accessType: 'free', days, pricePerDayNgn: null, totalNgn: 0 };
  }
  // Careful: Number(null), Number(undefined) and Number('') are all 0, which would make an
  // unpriced paid class look free. An unknown price must stay unknown, not collapse to zero.
  const blank =
    pricePerDayNgn === null ||
    pricePerDayNgn === undefined ||
    (typeof pricePerDayNgn === 'string' && pricePerDayNgn.trim() === '');
  const raw = blank ? NaN : Number(pricePerDayNgn);
  const perDay = Number.isFinite(raw) ? Math.round(raw) : null;
  return {
    accessType: 'paid',
    days,
    pricePerDayNgn: perDay,
    totalNgn: perDay === null ? 0 : perDay * days,
  };
}

/**
 * The headline rule, enforced everywhere: a certificate means paid attendance.
 * Free classes are learn-and-earn-points only.
 */
export function resolvesCertMode({ accessType, wantsCertificate }) {
  return accessType === 'paid' && wantsCertificate ? 'paid' : 'none';
}

export function isCertifiable(accessType) {
  return accessType === 'paid';
}
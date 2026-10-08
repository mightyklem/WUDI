/**
 * Billable-day planning for a training (FR-11).
 *
 * A day is the unit a learner buys. Days are derived from the session dates:
 * every distinct UTC calendar date becomes one day, so two sessions on the same
 * day cost one day's fee. A trainer can later open or reprice individual days.
 */

type Sessionish = { startsAtUtc: Date | string };

import { isTier, validateDayPrice } from '@learnovize/shared';

export type DayPlan = {
  dayIndex: number;
  dateUtc: string;
  topic: string;
  accessType: 'free' | 'paid';
  priceNgn: number;
};

/**
 * Build the default day plan for a new training. A free class gets free days;
 * a paid class starts paid at the quoted per-day price.
 */
export function planDays(sessions: Sessionish[], paid: boolean, pricePerDayNgn: number | null): DayPlan[] {
  const dates = Array.from(new Set(sessions.map((s) => new Date(s.startsAtUtc).toISOString().slice(0, 10))));
  dates.sort((a, b) => a.localeCompare(b));
  return dates.map((dateUtc, i) => ({
    dayIndex: i + 1,
    dateUtc,
    topic: `Day ${i + 1}`,
    accessType: paid ? 'paid' : 'free',
    priceNgn: paid ? Number(pricePerDayNgn) || 0 : 0,
  }));
}

/** The day that covers a given session start time. */
export function dayForDate(days: { id: string; dateUtc: string }[], startsAtUtc: Date | string) {
  const dateUtc = new Date(startsAtUtc).toISOString().slice(0, 10);
  return days.find((d) => d.dateUtc === dateUtc) ?? null;
}

/** Sum a learner's chosen days into a quote. */
export function quoteDays<T extends { priceNgn: number }>(days: T[]) {
  return {
    days: days.length,
    totalNgn: days.reduce((sum, d) => sum + d.priceNgn, 0),
  };
}

/**
 * Validate one day's pricing. A free day must cost nothing; a paid day must sit
 * inside the class's category band, so a trainer cannot quietly reprice a Basic
 * class to Premium money without moving the class into Premium.
 */
export function validateDayPricing({
  tier,
  accessType,
  priceNgn,
}: {
  tier?: string | null;
  accessType?: string | null;
  priceNgn?: number | null;
}) {
  if (accessType !== 'paid') {
    // Free is free: a free day never carries a price, whatever was sent.
    return { ok: true as const, accessType: 'free' as const, priceNgn: 0 };
  }
  if (!isTier(tier)) {
    return { ok: false as const, error: 'Set a category on the class before pricing its days' };
  }
  const priced = validateDayPrice(tier, priceNgn);
  if (!priced.ok) return { ok: false as const, error: priced.error };
  return { ok: true as const, accessType: 'paid' as const, priceNgn: Number(priced.price) };
}
/**
 * What points can be spent on, and at what cost.
 *
 * All of it lives here, in one file, because these numbers are the whole economics of the
 * programme and they belong where they can be read together and argued about together.
 * Scattering a discount rate into a checkout handler and a redemption cost into a page is
 * how a loyalty programme quietly becomes a liability.
 *
 * THE ONE RULE THAT MATTERS: points are earned for turning up. They are not purchased.
 * A discount funded out of revenue the top-ranked users paid for is a transfer from the
 * people who spend money to the people who spend time, and it compounds -- the most
 * engaged users get the most, and engagement is the thing being paid for.
 *
 * So the discounts below are percentages off, not naira off. That makes them self-funding:
 * nobody costs anything until a loyal learner was already going to buy.
 */

/** What each rank is worth as a percentage off a course. */
export const RANK_DISCOUNT = Object.freeze({
  stone: 0,
  bronze: 5,
  silver: 10,
  gold: 20,
});

/** Points each discount percentage costs, per course. Flat, not price-scaled. */
export const REDEMPTION_COST = Object.freeze({
  5: 150,
  10: 400,
  20: 1000,
});

/** Trainer-only: buy a featured slot on the feed for one week. */
export const FEATURED_COST = 800;

/** Learner-only: extra entries in a giveaway. */
export const GIVEAWAY_ENTRY_COST = 60;

/**
 * Discounts one person may buy in a rolling thirty days.
 *
 * Set to 3 on purpose rather than left open. Without it, a single learner who saved for
 * Gold could redeem until the margin on the courses they like was gone, and the cost to
 * Learnovize would be unbounded by anything Learnovize could see. Three is generous --
 * it is still a fifth off four courses in a month -- and it is a number to raise once
 * there is real redemption data to reason from rather than a guess.
 */
export const REDEMPTION_WINDOW_DAYS = 30;
export const REDEMPTION_CAP_PER_WINDOW = 3;

export const FEATURED_DAYS = 7;

/**
 * The largest discount a rank may buy, as a percentage.
 * The cap a redemption can never exceed, whatever was recorded.
 */
export function maxDiscountForRank(rankKey) {
  const v = RANK_DISCOUNT[rankKey];
  return Number.isFinite(v) ? v : 0;
}

export function discountCost(pct) {
  const v = REDEMPTION_COST[pct];
  return Number.isFinite(v) ? v : null;
}

/** How many days back the redemption window reaches. */
export function redemptionWindowMs() {
  return REDEMPTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** Total points a person at this rank has to part with for `pct` off. */
export function redemptionQuote({ rankKey, pct }) {
  const allowed = maxDiscountForRank(rankKey);
  if (pct > allowed) return null; // a rank cannot buy more than its rank is worth
  const cost = discountCost(pct);
  if (cost === null) return null;
  return { pct, cost };
}
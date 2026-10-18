import test from 'node:test';
import assert from 'node:assert/strict';
import { quote, normaliseDiscount } from '../src/rules.js';
import {
  RANK_DISCOUNT,
  REDEMPTION_COST,
  REDEMPTION_CAP_PER_WINDOW,
  redemptionQuote,
  maxDiscountForRank,
} from '../src/rewards.js';

const day = (d) => ({ startsAtUtc: new Date(`2026-01-0${d}T09:00:00Z`) });
const fiveDays = [day(1), day(2), day(3), day(4), day(5)];

/**
 * Discounts touch money, so these are deliberately paranoid. The bug they guard against is
 * not hypothetical: naming the reduced figure as the total prices every paid course at
 * zero whenever there is no discount, which is the most common case there is.
 */

test('an undiscounted paid class still costs what it costs', () => {
  const q = quote({ accessType: 'paid', pricePerDayNgn: 3000, sessions: fiveDays });
  assert.equal(q.totalNgn, 15000);
  assert.equal(q.grossNgn, 15000);
  assert.equal(q.discountNgn, 0);
  assert.equal(q.discountPct, 0);
});

test('a free class costs nothing with or without a discount', () => {
  const plain = quote({ accessType: 'free', pricePerDayNgn: 3000, sessions: fiveDays });
  const cut = quote({ accessType: 'free', pricePerDayNgn: 3000, sessions: fiveDays, discountPct: 20 });
  assert.equal(plain.totalNgn, 0);
  assert.equal(cut.totalNgn, 0);
});

test('the discount comes off the total, not off the day rate', () => {
  const q = quote({ accessType: 'paid', pricePerDayNgn: 3000, sessions: fiveDays, discountPct: 20 });
  assert.equal(q.grossNgn, 15000);
  assert.equal(q.discountNgn, 3000);
  assert.equal(q.totalNgn, 12000);
});

test('gross minus discount is always the total', () => {
  for (const pct of [0, 5, 10, 20]) {
    const q = quote({ accessType: 'paid', pricePerDayNgn: 3333, sessions: fiveDays, discountPct: pct });
    assert.equal(q.grossNgn - q.discountNgn, q.totalNgn, `pct ${pct}`);
  }
});

test('an absurd discount cannot make a class free or negative', () => {
  // A discount is money out. Anything the caller gets wrong must cost less than nothing
  // rather than more than nothing.
  for (const bad of [-50, 1e9, NaN, undefined, null, 'lots', {}]) {
    const q = quote({ accessType: 'paid', pricePerDayNgn: 3000, sessions: fiveDays, discountPct: bad });
    assert.ok(q.totalNgn >= 0, `discount ${String(bad)} produced ${q.totalNgn}`);
    assert.ok(q.discountNgn <= q.grossNgn, `discount ${String(bad)} exceeded the gross`);
  }
});

test('a hundred percent discount is exactly zero, not negative', () => {
  const q = quote({ accessType: 'paid', pricePerDayNgn: 3000, sessions: fiveDays, discountPct: 100 });
  assert.equal(q.totalNng, undefined);
  assert.equal(q.totalNgn, 0);
  assert.equal(q.discountNgn, 15000);
});

test('discount percentages are floored and bounded', () => {
  assert.equal(normaliseDiscount(10.9), 10);
  assert.equal(normaliseDiscount(-1), 0);
  assert.equal(normaliseDiscount(101), 100);
  assert.equal(normaliseDiscount('20'), 20);
  assert.equal(normaliseDiscount(NaN), 0);
});

test('an unpriced paid class stays unpriced under a discount', () => {
  // The blank-price case is why Number(null) is dangerous: 0 would look free.
  const q = quote({ accessType: 'paid', pricePerDayNgn: null, sessions: fiveDays, discountPct: 20 });
  assert.equal(q.pricePerDayNgn, null);
  assert.equal(q.totalNgn, 0);
});

test('a rank cannot buy more than its rank is worth', () => {
  assert.equal(maxDiscountForRank('stone'), 0);
  assert.ok(redemptionQuote({ rankKey: 'bronze', pct: 20 }) === null, 'bronze must not buy 20% off');
  assert.ok(redemptionQuote({ rankKey: 'gold', pct: 5 }), 'gold can always buy the cheapest tier');
  assert.equal(redemptionQuote({ rankKey: 'nonsense', pct: 5 }), null);
  assert.equal(maxDiscountForRank('nonsense'), 0);
});

test('every discount on offer has a price, and every price buys something', () => {
  for (const [rank, pct] of Object.entries(RANK_DISCOUNT)) {
    if (pct === 0) continue; // stone earns nothing and buys nothing
    const q = redemptionQuote({ rankKey: rank, pct });
    assert.ok(q, `${rank} offers ${pct}% but it cannot be quoted`);
    assert.ok(q.cost > 0, `${rank} ${pct}% costs nothing`);
  }
  for (const pct of Object.keys(REDEMPTION_COST)) {
    assert.ok(
      Object.values(RANK_DISCOUNT).includes(Number(pct)),
      `there is a price for ${pct}% but no rank is offered it`,
    );
  }
});

test('a bigger discount costs more, and never costs the same or less', () => {
  const costs = [5, 10, 20].map((pct) => REDEMPTION_COST[pct]);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test('the redemption cap is bounded', () => {
  // Without this, a single learner could save for Gold and redeem until the margin is
  // gone, and the cost would be invisible to us.
  assert.ok(Number.isInteger(REDEMPTION_CAP_PER_WINDOW));
  assert.ok(REDEMPTION_CAP_PER_WINDOW > 0);
  assert.ok(REDEMPTION_CAP_PER_WINDOW <= 10, 'ten discounts a month is not a cap');
});
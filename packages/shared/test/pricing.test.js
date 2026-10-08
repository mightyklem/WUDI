import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRICING_TIERS,
  TIER_KEYS,
  billableDays,
  formatNgn,
  isCertifiable,
  isTier,
  quote,
  resolvesCertMode,
  tierRangeText,
  validateDayPrice,
} from '../src/rules.js';

// A day is a UTC calendar date. Two sessions on one day bill once.
const day = (iso) => ({ startsAtUtc: iso, endsAtUtc: iso });

test('tier catalogue matches the product spec', () => {
  assert.deepEqual(TIER_KEYS, ['basic', 'standard', 'premium']);
  assert.equal(PRICING_TIERS.basic.min, 1500);
  assert.equal(PRICING_TIERS.standard.min, 5000);
  assert.equal(PRICING_TIERS.standard.max, 499999);
  assert.equal(PRICING_TIERS.premium.min, 500000);
  assert.equal(PRICING_TIERS.premium.max, null);
});

test('isTier rejects junk', () => {
  assert.equal(isTier('basic'), true);
  assert.equal(isTier('premium'), true);
  assert.equal(isTier('gold'), false);
  assert.equal(isTier(''), false);
  assert.equal(isTier(null), false);
  assert.equal(isTier('__proto__'), false);
});

test('Basic accepts its band and points at Premium above it', () => {
  assert.deepEqual(validateDayPrice('basic', 1500), { ok: true, price: 1500 });
  assert.deepEqual(validateDayPrice('basic', 4999), { ok: true, price: 4999 });
  const over = validateDayPrice('basic', 5000);
  assert.equal(over.ok, false);
  assert.match(over.error, /Premium/);
});

test('Standard is bounded on both sides', () => {
  assert.equal(validateDayPrice('standard', 5000).ok, true);
  assert.equal(validateDayPrice('standard', 499999).ok, true);
  assert.equal(validateDayPrice('standard', 4999).ok, false);
  assert.equal(validateDayPrice('standard', 500000).ok, false);
});

test('Premium has a floor and no ceiling', () => {
  assert.equal(validateDayPrice('premium', 500000).ok, true);
  assert.equal(validateDayPrice('premium', 25000000).ok, true);
  assert.equal(validateDayPrice('premium', 499999).ok, false);
});

test('validateDayPrice rejects missing, zero and negative prices', () => {
  assert.equal(validateDayPrice('basic', 0).ok, false);
  assert.equal(validateDayPrice('basic', -5).ok, false);
  assert.equal(validateDayPrice('basic', '').ok, false);
  assert.equal(validateDayPrice('basic', 'abc').ok, false);
  assert.equal(validateDayPrice('nope', 2000).ok, false);
});

test('validateDayPrice rounds to whole naira', () => {
  assert.deepEqual(validateDayPrice('basic', 1999.6), { ok: true, price: 2000 });
});

test('billableDays counts distinct UTC dates', () => {
  assert.equal(billableDays([]), 0);
  assert.equal(billableDays(null), 0);
  assert.equal(billableDays([day('2026-01-01T09:00:00Z')]), 1);
  assert.equal(
    billableDays([
      day('2026-01-01T09:00:00Z'),
      day('2026-01-01T15:00:00Z'),
      day('2026-01-02T09:00:00Z'),
    ]),
    2,
  );
});

test('billableDays skips unparseable sessions', () => {
  assert.equal(billableDays([day('not-a-date'), day('2026-01-01T09:00:00Z')]), 1);
});

test('free classes always cost nothing, whatever price is passed', () => {
  const q = quote({
    accessType: 'free',
    pricePerDayNgn: 500000,
    sessions: [day('2026-01-01T09:00:00Z'), day('2026-01-02T09:00:00Z')],
  });
  assert.equal(q.totalNgn, 0);
  assert.equal(q.pricePerDayNgn, null);
  assert.equal(q.days, 2);
});

test('paid classes multiply price per day by billable days', () => {
  const q = quote({
    accessType: 'paid',
    pricePerDayNgn: 5000,
    sessions: [
      day('2026-01-01T09:00:00Z'),
      day('2026-01-01T15:00:00Z'),
      day('2026-01-02T09:00:00Z'),
      day('2026-01-03T09:00:00Z'),
    ],
  });
  assert.equal(q.days, 3);
  assert.equal(q.totalNgn, 15000);
});

test('quote reports days even before a price is known', () => {
  for (const missing of [null, undefined, '', '   ']) {
    const q = quote({ accessType: 'paid', pricePerDayNgn: missing, sessions: [day('2026-01-01T09:00:00Z')] });
    assert.equal(q.days, 1);
    assert.equal(q.pricePerDayNgn, null, 'unknown price must stay unknown, not read as free');
    assert.equal(q.totalNgn, 0);
  }
});

test('a certificate requires a paid class', () => {
  assert.equal(resolvesCertMode({ accessType: 'free', wantsCertificate: true }), 'none');
  assert.equal(resolvesCertMode({ accessType: 'paid', wantsCertificate: false }), 'none');
  assert.equal(resolvesCertMode({ accessType: 'paid', wantsCertificate: true }), 'paid');
});

test('isCertifiable follows the same rule', () => {
  assert.equal(isCertifiable('paid'), true);
  assert.equal(isCertifiable('free'), false);
  assert.equal(isCertifiable(undefined), false);
});

test('display helpers', () => {
  assert.equal(formatNgn(1500), 'N1,500');
  assert.equal(formatNgn(499999), 'N499,999');
  assert.equal(formatNgn(undefined), 'N0');
  assert.match(tierRangeText('premium'), /and above/);
  assert.equal(tierRangeText('nope'), '');
});
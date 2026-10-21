import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payoutBalance } from '../src/payout-balance.js';
import { COMMISSION_RATE, PLAN_COMMISSION, commission, trainerNet } from '../src/rules.js';

const MIN = 5000;
const NOW = new Date('2026-10-21T12:00:00Z');
const past = (d) => new Date(new Date(NOW).getTime() - d * 24 * 3600 * 1000);
const future = (d) => new Date(new Date(NOW).getTime() + d * 24 * 3600 * 1000);

test('a balance below the minimum is not ready, and says how far off it is', () => {
  const b = payoutBalance([{ amountNet: 1125, holdUntil: past(2) }], { minNgn: MIN, now: NOW });
  assert.equal(b.dueNgn, 1125);
  assert.equal(b.ready, false);
  assert.equal(b.shortByNgn, 3875);
});

test('small payouts accumulate until they reach the minimum', () => {
  const b = payoutBalance(
    [
      { amountNet: 1125, holdUntil: past(30) },
      { amountNet: 2000, holdUntil: past(20) },
      { amountNet: 2500, holdUntil: past(10) },
    ],
    { minNgn: MIN, now: NOW },
  );
  assert.equal(b.dueNgn, 5625);
  assert.equal(b.dueCount, 3);
  assert.equal(b.ready, true);
  assert.equal(b.shortByNgn, 0);
});

test('money still in its hold period is not due, and does not block the rest', () => {
  const b = payoutBalance(
    [
      { amountNet: 6000, holdUntil: past(5) },
      { amountNet: 4000, holdUntil: future(10) },
    ],
    { minNgn: MIN, now: NOW },
  );
  assert.equal(b.dueNgn, 6000);
  assert.equal(b.dueCount, 1);
  assert.equal(b.waitingNgn, 4000);
  assert.equal(b.waitingCount, 1);
  // The class that has not finished does not hold up the one that has.
  assert.equal(b.ready, true);
  assert.equal(b.nextReleaseAt, future(10).toISOString());
});

test('a balance of exactly the minimum is ready', () => {
  const b = payoutBalance([{ amountNet: MIN, holdUntil: past(1) }], { minNgn: MIN, now: NOW });
  assert.equal(b.ready, true);
  assert.equal(b.shortByNgn, 0);
});

test('a payout with no hold period is due', () => {
  const b = payoutBalance([{ amountNet: 7000, holdUntil: null }], { minNgn: MIN, now: NOW });
  assert.equal(b.dueNgn, 7000);
  assert.equal(b.ready, true);
});

test('an empty balance is not ready and owes nothing', () => {
  const b = payoutBalance([], { minNgn: MIN, now: NOW });
  assert.equal(b.dueNgn, 0);
  assert.equal(b.ready, false);
  assert.equal(b.shortByNgn, MIN);
  assert.equal(b.nextReleaseAt, null);
});

// The split. The platform takes 25% and the trainer keeps 75%, and no plan changes it.

test('the platform takes 25% and the trainer keeps 75%', () => {
  assert.equal(COMMISSION_RATE, 0.25);
  assert.equal(commission('free', 10000), 2500);
  assert.equal(commission('pro', 10000), 2500);
  assert.equal(commission('business', 10000), 2500);
});

test('no plan takes a different rate', () => {
  for (const plan of ['free', 'pro', 'business']) {
    assert.equal(PLAN_COMMISSION[plan], 0.25, `${plan} should take the same 25%`);
  }
});

test('the trainer is paid three quarters of the price, less the provider fee', () => {
  const net = trainerNet({ amountNgn: 10000, providerFeeNgn: 0, plan: 'free' });
  assert.equal(net.commissionNgn, 2500);
  assert.equal(net.netNgn, 7500);
  // With a provider fee, it comes out of what the trainer is paid, not the price.
  const withFee = trainerNet({ amountNgn: 10000, providerFeeNgn: 123, plan: 'free' });
  assert.equal(withFee.commissionNgn, 2500);
  assert.equal(withFee.netNgn, 7377);
});

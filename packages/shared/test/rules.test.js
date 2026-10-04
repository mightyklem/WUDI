import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPresent, programPct, clampMinPct, isEligible,
  commission, trainerNet, tryClaimSeat, refundDecision, isCertNumber,
} from '../src/rules.js';

describe('attendance (FR-7)', () => {
  it('present at exactly 75%', () => assert.equal(isPresent(3600_000, 2_700_000), true));
  it('absent below 75%', () => assert.equal(isPresent(3600_000, 2_699_999), false));
  it('rejects bad durations', () => {
    assert.equal(isPresent(0, 100), false);
    assert.equal(isPresent(-5, 10), false);
    assert.equal(isPresent(100, -1), false);
  });
  it('program pct rounds, clamps, guards zero', () => {
    assert.equal(programPct(2, 3), 67);
    assert.equal(programPct(3, 3), 100);
    assert.equal(programPct(9, 3), 100);
    assert.equal(programPct(0, 0), 0);
  });
  it('min pct clamps 60–100, default 80', () => {
    assert.equal(clampMinPct(80), 80);
    assert.equal(clampMinPct(10), 60);
    assert.equal(clampMinPct(120), 100);
    assert.equal(clampMinPct('x'), 80);
  });
});

describe('certificates (FR-8)', () => {
  it('eligible on attendance + paid', () => {
    assert.equal(isEligible({ pct: 80, minPct: 80, certMode: 'paid', paid: true }), true);
    assert.equal(isEligible({ pct: 79, minPct: 80, certMode: 'paid', paid: true }), false);
    assert.equal(isEligible({ pct: 100, minPct: 80, certMode: 'paid', paid: false }), false);
    assert.equal(isEligible({ pct: 60, minPct: 60, certMode: 'free' }), true);
    assert.equal(isEligible({ pct: 100, minPct: 80, certMode: 'none' }), true);
  });
  it('cert number format', () => {
    assert.equal(isCertNumber('LEARNOVIZE-2026-4F8K2Q'), true);
    assert.equal(isCertNumber('LEARNOVIZE-26-ABC'), false);
    assert.equal(isCertNumber('learnovize-2026-4F8K2Q'), false);
  });
});

describe('money (FR-9)', () => {
  it('commission by plan', () => {
    assert.equal(commission('free', 10000), 500);
    assert.equal(commission('pro', 10000), 300);
    assert.equal(commission('business', 10000), 100);
  });
  it('trainer net split', () => {
    assert.deepEqual(trainerNet({ amountNgn: 10000, providerFeeNgn: 200, plan: 'pro' }),
      { providerFeeNgn: 200, commissionNgn: 300, netNgn: 9500 });
  });
  it('refunds', () => {
    assert.equal(refundDecision({ cancelledBy: 'trainer' }).refund, true);
    assert.equal(refundDecision({ cancelledBy: null, trainerHeld: false }).refund, true);
    assert.equal(refundDecision({ cancelledBy: 'participant', hoursBeforeStart: 24 }).refund, true);
    assert.equal(refundDecision({ cancelledBy: 'participant', hoursBeforeStart: 23 }).refund, false);
    assert.equal(refundDecision({ cancelledBy: null, trainerHeld: true }).refund, false);
  });
});

describe('seats (FR-3.3/5.4)', () => {
  it('claims until cap, then full', () => {
    assert.deepEqual(tryClaimSeat(49, 50), { ok: true, seatsTaken: 50 });
    assert.deepEqual(tryClaimSeat(50, 50), { ok: false, seatsTaken: 50 });
  });
});

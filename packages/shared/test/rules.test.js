import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPresent, programPct, clampMinPct, isEligible,
  commission, trainerNet, tryClaimSeat, refundDecision, isCertNumber,
  planCapCeiling, capOverPlanError, DEFAULT_MIN_PCT, mergeAttendanceWindow,
} from '../src/rules.js';

describe('attendance accumulates across a dropout', () => {
  const MIN = 60 * 60_000; // a one-hour session

  it('a dropout must not erase the time already attended', () => {
    // 40 minutes, drop, rejoin for the last 15. Attended 55 of 60.
    const first = mergeAttendanceWindow(0, 40 * 60_000, MIN);
    assert.equal(first.stayedMs, 40 * 60_000);

    const second = mergeAttendanceWindow(first.stayedMs, 15 * 60_000, MIN);
    assert.equal(second.stayedMs, 55 * 60_000);
    // 55/60 = 91.7%, over the 75% bar. The old behaviour replaced the total with 15
    // minutes -- 25%, read as absent -- and denied a certificate to someone who sat
    // through almost the whole class.
    assert.equal(second.present, true);
  });

  it('still marks genuinely short attendance absent', () => {
    const first = mergeAttendanceWindow(0, 10 * 60_000, MIN);
    const second = mergeAttendanceWindow(first.stayedMs, 5 * 60_000, MIN);
    assert.equal(second.present, false);
  });

  it('never reports more time than the session contains', () => {
    // A duplicated leave event, or a wrong session end, must not produce 130%.
    const once = mergeAttendanceWindow(0, 50 * 60_000, MIN);
    const twice = mergeAttendanceWindow(once.stayedMs, 50 * 60_000, MIN);
    assert.equal(twice.stayedMs, MIN);
    assert.equal(twice.present, true);
  });

  it('tolerates junk input rather than producing NaN', () => {
    const r = mergeAttendanceWindow(undefined, -500, MIN);
    assert.equal(r.stayedMs, 0);
    assert.equal(r.present, false);
  });
});

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
  it('min pct clamps 60–100, default 60', () => {
    assert.equal(clampMinPct(80), 80);
    assert.equal(clampMinPct(10), 60);
    assert.equal(clampMinPct(120), 100);
    // Junk falls back to the default, so this tracks DEFAULT_MIN_PCT rather than
    // asserting a literal that would silently disagree with it later.
    assert.equal(clampMinPct('x'), DEFAULT_MIN_PCT);
    assert.equal(DEFAULT_MIN_PCT, 60);
    // A brand new class with no explicit minimum is exactly at the floor.
    assert.equal(clampMinPct(undefined), 60);
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
    assert.equal(isCertNumber('WUDI-2026-4F8K2Q'), false);
  });
});

describe('money (FR-9)', () => {
  it('commission is a flat 25% whatever the plan', () => {
    // The free/pro/business split never shipped -- nothing ever sold an upgrade, so
    // every trainer sat on 'free' anyway. A per-plan rate now would advertise a
    // discount that cannot be bought.
    assert.equal(commission('free', 10000), 2500);
    assert.equal(commission('pro', 10000), 2500);
    assert.equal(commission('business', 10000), 2500);
  });
  it('an unknown plan is still rejected', () => {
    assert.throws(() => commission('enterprise', 10000), RangeError);
  });
  it('trainer net split', () => {
    assert.deepEqual(trainerNet({ amountNgn: 10000, providerFeeNgn: 200, plan: 'pro' }),
      { providerFeeNgn: 200, commissionNgn: 2500, netNgn: 7300 });
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

describe('class size is bounded by plan, not by whether the class is paid', () => {
  it('free plan tops out at 50 seats', () => {
    assert.equal(planCapCeiling('free'), 50);
    assert.equal(capOverPlanError(1, 'free'), null);
    assert.equal(capOverPlanError(50, 'free'), null);
    assert.ok(capOverPlanError(51, 'free'));
  });

  it('the boundary is exactly 50/51 on every plan', () => {
    for (const [plan, ceiling] of [['free', 50], ['pro', 200], ['business', 500]]) {
      assert.equal(planCapCeiling(plan), ceiling);
      assert.equal(capOverPlanError(ceiling, plan), null, `${plan} should allow ${ceiling}`);
      assert.ok(capOverPlanError(ceiling + 1, plan), `${plan} should reject ${ceiling + 1}`);
    }
  });

  it('a missing or unknown plan can never widen the ceiling', () => {
    for (const plan of [undefined, null, '', 'PRO', 'enterprise', 'admin', 0]) {
      assert.equal(planCapCeiling(plan), 50, `plan ${JSON.stringify(plan)} must not be trusted`);
      assert.ok(capOverPlanError(51, plan));
    }
  });

  it('the rejection names the plan and the ceiling so the trainer can act', () => {
    assert.equal(capOverPlanError(51, 'free'), 'Cap 51 exceeds your free plan (50). Upgrade to raise it.');
    assert.equal(capOverPlanError(500, null), 'Cap 500 exceeds your free plan (50). Upgrade to raise it.');
  });
});

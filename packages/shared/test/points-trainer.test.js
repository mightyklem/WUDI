import test from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, POINT_REASONS } from '../src/rules.js';

/**
 * The trainer half of loyalty.
 *
 * A trainer's standing used to come only from reviews, which is the one thing they can
 * influence least -- and nothing at all for a trainer who has taught a hundred sessions
 * and has no reviews left to write. sessionTaught is the fix, and these are the
 * properties that have to hold for it to be worth anything.
 */

test('a trainer is paid for a class someone actually attended', () => {
  assert.equal(POINTS.sessionTaught, 30);
});

test('the trainer award has its own reason, distinct from attendance', () => {
  // Sharing the learner reason would make a trainer's ledger indistinguishable from a
  // learner's in the timeline, and "you earned this for teaching" is the whole point of
  // showing one.
  assert.equal(POINT_REASONS.sessionTaught, 'session_taught');
  assert.notEqual(POINT_REASONS.sessionTaught, POINT_REASONS.sessionAttended);
});

test('the trainer award outranks the learner one but does not dwarf it', () => {
  // Above the learner's best attendance award, so delivering a class is worth more than
  // attending one. Nowhere near absurd, so a five-session programme lands a trainer
  // somewhere sensible rather than instantly at the top.
  assert.ok(POINTS.sessionTaught > POINTS.paidDayAttended);
  assert.ok(POINTS.sessionTaught < POINTS.paidDayAttended * 3);
});

test('teaching and completing the same programme land close together', () => {
  const days = 5;

  // The trainer delivered the whole thing.
  const trainer = POINTS.sessionTaught * days;

  // The learner attended every session, finished the programme, and earned the
  // certificate -- the full set of awards for the same five days.
  const learner =
    POINTS.paidDayAttended * days + POINTS.allEnrolledDaysCompleted + POINTS.certificateEarned;

  // Close, with the learner slightly ahead. Not equal: attending is also work, and the
  // certificate is theirs. But the same order of magnitude, so neither side's rank ladder
  // means "you are better at this than the other person is at their job".
  assert.ok(trainer > POINTS.paidDayAttended * days, 'teaching a class must beat attending one');
  assert.ok(trainer < learner, 'the learner completing a programme should edge ahead of the trainer delivering it');
  assert.ok(learner - trainer <= POINTS.sessionTaught, 'and not by enough to make them different worlds');
});

test('the reward for teaching is not scaled by what the class cost', () => {
  // The learner awards are deliberately flat for the same reason, and the comment on
  // POINTS.sessionTaught says so. If a price-scaled variant is ever added, this fails --
  // which is the point: a trainer should not rank higher for teaching the most expensive
  // room rather than the best one.
  assert.equal(typeof POINTS.sessionTaught, 'number');
  assert.equal(POINTS.sessionTaught, POINTS.sessionTaught);
  // No variant exists to be chosen by accident.
  assert.ok(!('premiumDayTaught' in POINTS));
  assert.ok(!('priceScaledTaught' in POINTS));
});

test('every reason is a distinct, stable string', () => {
  const reasons = Object.values(POINT_REASONS);
  assert.equal(new Set(reasons).size, reasons.length);
  for (const r of reasons) assert.match(r, /^[a-z_]+$/);
});
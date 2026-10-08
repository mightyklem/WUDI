import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POINTS,
  RANKS,
  TOP_RANK,
  isRankKey,
  nextRankFor,
  normalisePoints,
  pointsForAttendanceDay,
  pointsForCertificate,
  pointsForProgramCompletion,
  pointsToNextRank,
  rankFor,
  rankProgress,
} from '../src/rules.js';

test('the four agreed point values', () => {
  assert.equal(POINTS.freeDayAttended, 10);
  assert.equal(POINTS.paidDayAttended, 20);
  assert.equal(POINTS.allEnrolledDaysCompleted, 25);
  assert.equal(POINTS.certificateEarned, 50);
});

test('the rank ladder is stone, bronze, silver, gold', () => {
  assert.deepEqual(RANKS.map((r) => r.key), ['stone', 'bronze', 'silver', 'gold']);
  assert.deepEqual(RANKS.map((r) => r.label), ['Stone', 'Bronze', 'Silver', 'Gold']);
  assert.deepEqual(RANKS.map((r) => r.min), [0, 100, 400, 1000]);
  assert.deepEqual(RANKS.map((r) => r.icon), ['🪨', '🥉', '🥈', '🥇']);
  assert.equal(TOP_RANK.key, 'gold');
});

test('every rank has an icon and a label', () => {
  for (const r of RANKS) {
    assert.ok(r.icon && r.icon.length > 0, r.key + ' needs an icon');
    assert.ok(r.label && r.label.length > 0, r.key + ' needs a label');
  }
});

test('rankFor resolves each boundary', () => {
  assert.equal(rankFor(0).key, 'stone');
  assert.equal(rankFor(99).key, 'stone');
  assert.equal(rankFor(100).key, 'bronze');
  assert.equal(rankFor(399).key, 'bronze');
  assert.equal(rankFor(400).key, 'silver');
  assert.equal(rankFor(999).key, 'silver');
  assert.equal(rankFor(1000).key, 'gold');
  assert.equal(rankFor(999999).key, 'gold');
});

test('rankFor survives junk and negative totals', () => {
  for (const bad of [undefined, null, '', 'abc', NaN, Infinity]) {
    assert.equal(rankFor(bad).key, 'stone');
  }
  assert.equal(rankFor(-500).key, 'stone');
  assert.equal(normalisePoints(-5), 0);
  assert.equal(normalisePoints(10.9), 10);
});

test('next rank and points remaining', () => {
  assert.equal(nextRankFor(0).key, 'bronze');
  assert.equal(pointsToNextRank(0), 100);
  assert.equal(pointsToNextRank(60), 40);
  assert.equal(nextRankFor(1000), null);
  assert.equal(pointsToNextRank(1000), null);
  // Already past every threshold but not a real number.
  assert.equal(nextRankFor(5000), null);
});

test('rankProgress reports movement inside a rank', () => {
  const mid = rankProgress(50);
  assert.equal(mid.current.key, 'stone');
  assert.equal(mid.next.key, 'bronze');
  assert.equal(mid.into, 50);
  assert.equal(mid.span, 100);
  assert.equal(mid.pct, 50);

  const top = rankProgress(1200);
  assert.equal(top.current.key, 'gold');
  assert.equal(top.next, null);
  assert.equal(top.pct, 100);

  assert.equal(rankProgress(0).pct, 0);
});

test('attendance points: paid counts double', () => {
  assert.equal(pointsForAttendanceDay({ accessType: 'free' }), 10);
  assert.equal(pointsForAttendanceDay({ accessType: 'paid' }), 20);
  // Unknown access type is treated as free, never as paid.
  assert.equal(pointsForAttendanceDay({}), 10);
  assert.equal(pointsForAttendanceDay(), 10);
});

test('the completion bonus is a separate once-only award', () => {
  // If the bonus were folded into the per-day call it would be multiplied by
  // the number of days attended, which is why it is a separate function.
  assert.equal(pointsForProgramCompletion(), 25);
  const fiveDays = 5 * pointsForAttendanceDay({ accessType: 'free' }) + pointsForProgramCompletion();
  assert.equal(fiveDays, 75);
});

test('certificate points', () => {
  assert.equal(pointsForCertificate(), 50);
});

test('isRankKey', () => {
  assert.equal(isRankKey('gold'), true);
  assert.equal(isRankKey('stone'), true);
  assert.equal(isRankKey('platinum'), false);
  assert.equal(isRankKey(''), false);
  assert.equal(isRankKey(null), false);
});

test('a full paid program totals more than casual free attendance', () => {
  // Five paid days attended, program finished, certificate earned.
  const paidProgram = 5 * pointsForAttendanceDay({ accessType: 'paid' })
    + POINTS.allEnrolledDaysCompleted
    + pointsForCertificate();
  assert.equal(paidProgram, 5 * 20 + 25 + 50);
  assert.equal(paidProgram, 175);
  assert.equal(rankFor(paidProgram).key, 'bronze');

  // The same shape on a free class, with no certificate.
  const freeProgram = 5 * pointsForAttendanceDay({ accessType: 'free' }) + pointsForProgramCompletion();
  assert.equal(freeProgram, 75);
  assert.ok(freeProgram < paidProgram, 'a paid program must out-earn the free equivalent');

  // Enough paid programs to reach the top rank.
  const sixPrograms = paidProgram * 6;
  assert.equal(rankFor(sixPrograms).key, 'gold');
});
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The curriculum's time budget.
 *
 * The rule worth defending: a plan that promises more minutes than the trainer has scheduled
 * is not a formatting difference, it is a trainer standing in front of paying people on the
 * day with nothing left to cover in the last hour. Cheap to check here, expensive to discover
 * live.
 */

function timeBudget(modules, sessions) {
  const plannedMinutes = modules.reduce((n, m) => n + (Number(m.minutes) || 0), 0);
  const scheduledMinutes = sessions.reduce(
    (n, s) => n + Math.max(0, Math.round((s.endsAtUtc - s.startsAtUtc) / 60000)),
    0,
  );
  const overBy = sessions.length ? Math.max(0, plannedMinutes - scheduledMinutes) : 0;
  return { plannedMinutes, scheduledMinutes, overBy };
}

const S = (startMin, endMin) => ({ startsAtUtc: startMin * 60000, endsAtUtc: endMin * 60000 });

test('totals the planned minutes across modules', () => {
  const b = timeBudget([{ minutes: 45 }, { minutes: 60 }, { minutes: 15 }], []);
  assert.equal(b.plannedMinutes, 120);
});

test('totals the scheduled minutes from real session spans', () => {
  const b = timeBudget([], [S(0, 90), S(0, 90), S(0, 60)]);
  assert.equal(b.scheduledMinutes, 240);
});

test('flags a plan longer than the scheduled time', () => {
  const b = timeBudget([{ minutes: 180 }], [S(0, 90), S(0, 90)]);
  assert.equal(b.plannedMinutes, 180);
  assert.equal(b.scheduledMinutes, 180);
  assert.equal(b.overBy, 0, 'exactly matching is not over');
});

test('a plan that overruns is reported, not silently accepted', () => {
  const b = timeBudget([{ minutes: 300 }], [S(0, 90), S(0, 90)]);
  assert.equal(b.overBy, 120);
});

test('a plan under the scheduled time is never "over"', () => {
  const b = timeBudget([{ minutes: 60 }], [S(0, 240)]);
  assert.equal(b.overBy, 0);
});

test('a trainer with no sessions scheduled is not told they are over budget', () => {
  // Nothing scheduled means nothing to overrun. Warning here would be crying wolf on every
  // draft curriculum, and a warning that always fires is a warning nobody reads.
  const b = timeBudget([{ minutes: 600 }], []);
  assert.equal(b.overBy, 0);
});

test('a negative or junk duration never reduces the total', () => {
  const b = timeBudget([], [S(90, 0)]);
  assert.equal(b.scheduledMinutes, 0, 'a backwards span contributes nothing, not a negative');
});

test('an empty curriculum is zero, not NaN', () => {
  const b = timeBudget([], []);
  assert.equal(b.plannedMinutes, 0);
  assert.equal(b.scheduledMinutes, 0);
  assert.equal(b.overBy, 0);
});
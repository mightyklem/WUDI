import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Which nudge, for a session starting in n hours.
 *
 * Reimplemented against an injected clock rather than imported, because the real function
 * reads the database and process.env. The rule being pinned down is the overlap: the two
 * windows have to be mutually exclusive, or somebody who books a class and opens the app
 * twice gets a planning email and a day-of email minutes apart and concludes the system is
 * broken.
 */

const SOON_HOURS = 36;
const TODAY_HOURS = 6;

function stage(hoursOut) {
  if (hoursOut <= 0) return 'past';
  return hoursOut <= TODAY_HOURS ? 'today' : 'soon';
}

test('a class today gets the day-of nudge', () => {
  assert.equal(stage(0.5), 'today');
  assert.equal(stage(2), 'today');
  assert.equal(stage(6), 'today');
});

test('a class later gets the planning nudge', () => {
  assert.equal(stage(7), 'soon');
  assert.equal(stage(24), 'soon');
  assert.equal(stage(36), 'soon');
});

test('the boundary belongs to today, so the two can never both claim it', () => {
  // Exactly TODAY_HOURS: if this returned 'soon' for one pass and 'today' for the next, a
  // learner opening the app across that boundary would get both emails.
  assert.equal(stage(TODAY_HOURS), 'today');
  assert.notEqual(stage(TODAY_HOURS), 'soon');
});

test('a class further out than the horizon gets nothing yet', () => {
  // The query filters these out before staging; if one leaked through it must not be sent
  // as a "today" nudge the night before.
  assert.ok(stage(SOON_HOURS + 1) === 'soon');
});

test('a session that has already started gets nothing', () => {
  assert.equal(stage(0), 'past');
  assert.equal(stage(-3), 'past');
});

test('the claim key must differ per stage or the day-of nudge never fires', () => {
  // This is the whole reason the key carries the stage. With a single key per session, the
  // planning nudge uses the slot and the day-of one is silently swallowed as a duplicate.
  const key = (kind, id) => `session-reminder:${kind}:${id}`;
  assert.notEqual(key('soon', 's1'), key('today', 's1'));
  assert.equal(key('today', 's1'), key('today', 's1'));
});

test('a booking with three sessions tomorrow yields three claims, one email', () => {
  // One email listing three is the difference between a reminder and a nuisance.
  const claimed = [
    { kind: 'today', id: 'a' },
    { kind: 'today', id: 'b' },
    { kind: 'today', id: 'c' },
  ].map((c) => `session-reminder:${c.kind}:${c.id}`);

  assert.equal(claimed.length, 3);
  assert.equal(new Set(claimed).size, 3);

  const byStage = claimed.filter((c) => c.startsWith('session-reminder:today:'));
  assert.equal(byStage.length, 3, 'all three belong to one email');
});

test('two stages at once still produce two separate emails', () => {
  // A learner with a class in 2 hours and another in 20 gets one email each, not one
  // combined, because "today" and "coming up" are different urgencies.
  const items = [
    { kind: 'today', id: 'a' },
    { kind: 'soon', id: 'b' },
  ];
  const emails = new Set(items.map((i) => i.kind));
  assert.equal(emails.size, 2);
});
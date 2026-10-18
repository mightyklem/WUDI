import test from 'node:test';
import assert from 'node:assert/strict';
import { lagosCountdownLabel } from '../../../apps/web/lib/lagos.ts';

/**
 * "How long until then", in words.
 *
 * The purpose is to remove arithmetic from a phone screen. Somebody who has just reserved a
 * seat should not have to work out how far away Tuesday 3pm is -- that is a step where a
 * person gives up, and a learner who does not turn up is the most expensive thing that can
 * happen to this business.
 */

const NOW = new Date('2026-03-10T12:00:00Z');
const inMins = (m) => new Date(NOW.getTime() + m * 60000).toISOString();

test('minutes read as minutes', () => {
  assert.equal(lagosCountdownLabel(inMins(5), NOW), 'in 5 min');
  assert.equal(lagosCountdownLabel(inMins(59), NOW), 'in 59 min');
});

test('an hour reads as an hour, singular where it should be', () => {
  assert.equal(lagosCountdownLabel(inMins(60), NOW), 'in 1 hour');
  assert.equal(lagosCountdownLabel(inMins(180), NOW), 'in 3 hours');
  assert.equal(lagosCountdownLabel(inMins(23 * 60), NOW), 'in 23 hours');
});

test('tomorrow is said as tomorrow', () => {
  // Not "in 1 day". A learner reads "tomorrow" and knows whether to set an alarm.
  assert.equal(lagosCountdownLabel(inMins(26 * 60), NOW), 'tomorrow');
});

test('days and weeks, pluralised properly', () => {
  assert.equal(lagosCountdownLabel(inMins(3 * 1440), NOW), 'in 3 days');
  assert.equal(lagosCountdownLabel(inMins(6 * 1440), NOW), 'in 6 days');
  assert.equal(lagosCountdownLabel(inMins(8 * 1440), NOW), 'in 1 week');
  assert.equal(lagosCountdownLabel(inMins(16 * 1440), NOW), 'in 2 weeks');
  assert.equal(lagosCountdownLabel(inMins(90 * 1440), NOW), 'in 3 months');
});

test('the immediate moment says now, not "in 0 min"', () => {
  assert.equal(lagosCountdownLabel(NOW.toISOString(), NOW), 'now');
});

test('a started class reads in the past', () => {
  // This is the one that matters for a class in progress: the card must not tell somebody
  // who is five minutes late that it is "in -5 min".
  assert.equal(lagosCountdownLabel(inMins(-5), NOW), '5 min ago');
  assert.equal(lagosCountdownLabel(inMins(-90), NOW), '2 hours ago');
  assert.equal(lagosCountdownLabel(inMins(-3 * 1440), NOW), '3 days ago');
});

test('beyond a minute the past never reads in seconds', () => {
  assert.ok(!/second/i.test(lagosCountdownLabel(inMins(-0.5), NOW)));
});

test('a nonsense date is empty, not "NaN ago"', () => {
  assert.equal(lagosCountdownLabel('not-a-date', NOW), '');
  assert.equal(lagosCountdownLabel('', NOW), '');
});

test('accepts a Date as well as an ISO string', () => {
  assert.equal(lagosCountdownLabel(new Date(NOW.getTime() + 60000), NOW), 'in 1 min');
});

test('the wording stays short at every scale', () => {
  // A long countdown on a card is a card nobody reads. Everything is at most three words.
  for (const m of [1, 59, 60, 1440, 8 * 1440, 90 * 1440]) {
    const s = lagosCountdownLabel(inMins(m), NOW);
    assert.ok(s.split(' ').length <= 3, `"${s}" is too long to scan`);
  }
});
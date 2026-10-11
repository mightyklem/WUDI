import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsForReview, POINTS, normalisePoints, rankFor } from '../../../packages/shared/src/points.js';

test('a five star review is worth the most', () => {
  assert.equal(pointsForReview(5), POINTS.reviewReceivedMax);
});

test('points scale down with the stars', () => {
  assert.ok(pointsForReview(5) > pointsForReview(4));
  assert.ok(pointsForReview(4) > pointsForReview(3));
});

test('three stars is the neutral floor and still counts a little', () => {
  assert.equal(pointsForReview(3), 5);
});

test('one and two stars award nothing', () => {
  // The whole point: a trainer cannot raise their standing by collecting complaints.
  assert.equal(pointsForReview(1), 0);
  assert.equal(pointsForReview(2), 0);
});

test('a bad or missing rating never mints points', () => {
  for (const bad of [0, -1, NaN, undefined, null, 'abc', {}]) {
    assert.equal(pointsForReview(bad), 0, String(bad));
  }
});

test('a review is never worth more than the stated ceiling', () => {
  for (let r = 1; r <= 5; r++) {
    assert.ok(pointsForReview(r) <= POINTS.reviewReceivedMax);
    assert.ok(pointsForReview(r) >= 0);
  }
});

test('points stay whole numbers', () => {
  // Points feed a rank ladder, so a fractional award would be invisible and untestable.
  for (let r = 1; r <= 5; r++) {
    assert.equal(Number.isInteger(pointsForReview(r)), true, `rating ${r}`);
  }
});

test('a rated review still reads as progress on the ladder', () => {
  assert.equal(rankFor(0).key, 'stone');
  assert.ok(rankFor(400).min >= 400);
  assert.ok(normalisePoints(pointsForReview(5)) > 0);
});
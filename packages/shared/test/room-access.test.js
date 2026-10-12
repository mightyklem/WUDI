import test from 'node:test';
import assert from 'node:assert/strict';
import { canPublishInRoom } from '../src/room-access.js';

// Regression tests. Each one corresponds to a real way this went wrong.

test('a trainer can always publish', () => {
  // The bug: trainers were minted canPublish:false and so could never turn on a
  // camera or mic. A trainer who cannot publish cannot teach.
  assert.equal(canPublishInRoom('trainer', false), true);
  assert.equal(canPublishInRoom('trainer', true), true);
});

test('staff can publish so they can act, not just watch', () => {
  assert.equal(canPublishInRoom('admin', false), true);
  assert.equal(canPublishInRoom('moderator', false), true);
});

test('a learner publishes only with a live grant', () => {
  assert.equal(canPublishInRoom('participant', false), false);
  assert.equal(canPublishInRoom('participant', true), true);
});

test('an unknown role publishes nothing', () => {
  // Fails closed: an unrecognised role must not be handed publishing rights.
  assert.equal(canPublishInRoom('ghost', false), false);
  assert.equal(canPublishInRoom(undefined, true), false);
  assert.equal(canPublishInRoom(null, true), false);
});

test('a missing grant is treated as no grant', () => {
  // hasSpeechGrant arrives from a database row that may be absent entirely.
  assert.equal(canPublishInRoom('participant', undefined), false);
  assert.equal(canPublishInRoom('participant', null), false);
});

test('the boolean is never a string or a number', () => {
  for (const role of ['trainer', 'moderator', 'admin', 'participant']) {
    for (const grant of [true, false]) {
      assert.equal(typeof canPublishInRoom(role, grant), 'boolean');
    }
  }
});
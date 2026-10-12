import test from 'node:test';
import assert from 'node:assert/strict';
import { uniformIndex, drawWinners, describeDraw } from '../src/giveaway.js';

// A deterministic generator so a failing test can be reproduced exactly.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

test('uniformIndex stays inside the range', () => {
  const r = seeded(42);
  for (const n of [1, 2, 3, 7, 50, 1000]) {
    for (let i = 0; i < 300; i++) {
      const v = uniformIndex(n, r);
      assert.ok(Number.isInteger(v), `${v} should be an integer`);
      assert.ok(v >= 0 && v < n, `${v} out of range for n=${n}`);
    }
  }
});

test('uniformIndex rejects a nonsensical range', () => {
  assert.throws(() => uniformIndex(0, seeded(1)));
  assert.throws(() => uniformIndex(-3, seeded(1)));
  assert.throws(() => uniformIndex(2.5, seeded(1)));
});

test('every bucket is reachable', () => {
  const r = seeded(7);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(uniformIndex(5, r));
  assert.equal(seen.size, 5, 'no index should be unreachable');
});

test('a single-entry draw always returns that entry', () => {
  const r = seeded(3);
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(drawWinners(['only'], 3, r).winners, ['only']);
  }
});

test('winners are distinct', () => {
  const r = seeded(99);
  const entries = Array.from({ length: 50 }, (_, i) => `u${i}`);
  const { winners } = drawWinners(entries, 10, r);
  assert.equal(winners.length, 10);
  assert.equal(new Set(winners).size, 10, 'a person was drawn twice');
});

test('winners all come from the entrants', () => {
  const r = seeded(1234);
  const entries = Array.from({ length: 12 }, (_, i) => `u${i}`);
  const { winners } = drawWinners(entries, 4, r);
  for (const w of winners) assert.ok(entries.includes(w), `${w} was not an entrant`);
});

test('duplicate entry ids cannot produce duplicate winners', () => {
  const r = seeded(5);
  // A caller that hands over a list with repeats must still get one person once.
  const { winners } = drawWinners(['a', 'a', 'b', 'b', 'c'], 3, r);
  assert.equal(new Set(winners).size, winners.length);
});

test('fewer entrants than prizes gives everyone, and reports the overflow', () => {
  const r = seeded(8);
  const { winners, overflow } = drawWinners(['a', 'b'], 5, r);
  assert.deepEqual(winners.sort(), ['a', 'b']);
  assert.equal(overflow, 3, 'the shortfall must be reported, not swallowed');
});

test('a draw with no entrants returns nobody rather than throwing', () => {
  const r = seeded(1);
  assert.deepEqual(drawWinners([], 3, r).winners, []);
  assert.equal(drawWinners(['a'], 0, r).winners.length, 0);
});

test('the distribution is not obviously skewed', () => {
  // Not a proof of uniformity -- that is what uniformIndex guarantees -- but it
  // would catch a plain modulo shortcut, which skews badly at small n.
  const n = 3;
  const buckets = [0, 0, 0];
  const r = seeded(2024);
  const runs = 30000;
  for (let i = 0; i < runs; i++) buckets[uniformIndex(n, r)]++;
  const expected = runs / n;
  for (const b of buckets) {
    assert.ok(Math.abs(b - expected) / expected < 0.05, `bucket ${b} far from ${expected}`);
  }
});

test('describeDraw reads like a sentence', () => {
  assert.match(describeDraw(0, 0), /No entries/);
  assert.match(describeDraw(12, 1), /1 winner drawn/);
  assert.match(describeDraw(12, 3), /12 entries.*3 winners drawn/);
});
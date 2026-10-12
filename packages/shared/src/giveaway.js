/**
 * Giveaway draws.
 *
 * Two properties matter, and both are enforced here rather than in the route:
 *
 * 1. Uniformity. `Math.random` is explicitly not uniform over large ranges and is
 *    not required to be. A prize draw has to be defensible, so entries are chosen
 *    with rejection sampling, which is provably uniform whatever the source.
 *
 * 2. No self-selection. Choosing an index from the caller means the caller could
 *    pass a filtered list. The raw entry ids come in and are used exactly once.
 */

/** Rejection sampling gives a uniform index in [0, n) for any n. */
export function uniformIndex(n, rand) {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('n must be a positive integer');
  if (n === 1) return 0;
  // Largest multiple of n representable below 1. Anything at or above it would wrap
  // and make the low indices more likely than the high ones.
  const limit = Math.floor(0xFFFFFFFF / n) * n;
  for (;;) {
    const x = Math.floor(rand() * 0x100000000);
    if (x < limit) return x % n;
  }
}

/**
 * Draw `count` distinct winners from `entryIds`.
 *
 * Winners are picked without replacement, so two winners can never be the same
 * person. When there are fewer entries than prizes, every entrant wins -- silently
 * dropping a prize would be worse than over-delivering, and the caller is told.
 */
export function drawWinners(entryIds, count, rand) {
  const unique = [...new Set(entryIds)];
  const want = Math.max(0, Math.floor(count));
  if (!unique.length || want === 0) return { winners: [], overflow: 0 };

  const n = Math.min(want, unique.length);
  // Partial Fisher-Yates: only the first n slots need to be decided.
  const pool = unique.slice();
  for (let i = 0; i < n; i++) {
    const j = i + uniformIndex(pool.length - i, rand);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return { winners: pool.slice(0, n), overflow: want - n };
}

/** Human phrasing for the draw, so the room is not told "0 winners". */
export function describeDraw(entrants, winners) {
  if (!entrants) return 'No entries, so nobody was drawn.';
  if (!winners) return 'No winner was drawn.';
  const plural = winners === 1 ? 'winner' : 'winners';
  return `${entrants} ${entrants === 1 ? 'entry' : 'entries'} · ${winners} ${plural} drawn.`;
}
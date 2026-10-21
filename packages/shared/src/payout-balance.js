/**
 * A trainer's balance.
 *
 * A trainer's earnings add up. Everything they have earned that has cleared its hold
 * period is one number, and when that number is worth releasing the whole of it goes in
 * one transfer.
 *
 * The hold period is per class and not per balance. Money from a class that finished
 * last month is not held up by a class that finished yesterday -- each waits for its
 * own clock -- but the two are added up together, so a trainer who ran three small
 * classes is paid for all three at once rather than never.
 *
 * This is the rule, and it is here rather than in the route handler so that it can be
 * tested on its own. Money rules that only live in a request handler are money rules
 * nobody checks.
 */

/**
 * @param rows  the payouts, each { amountNet, holdUntil }
 * @param minNgn  the release minimum
 * @param now  the moment to judge the hold periods against
 */
export function payoutBalance(rows, { minNgn, now = new Date() }) {
  const at = now.getTime();
  const held = (r) => r.holdUntil && new Date(r.holdUntil).getTime() > at;

  const due = (rows || []).filter((r) => !held(r));
  const waiting = (rows || []).filter((r) => held(r));

  const dueNgn = due.reduce((n, r) => n + r.amountNet, 0);
  const waitingNgn = waiting.reduce((n, r) => n + r.amountNet, 0);

  return {
    dueNgn,
    dueCount: due.length,
    waitingNgn,
    waitingCount: waiting.length,
    /** How much more has to arrive before the balance can be released. */
    shortByNgn: Math.max(0, minNgn - dueNgn),
    /** Whether there is enough to release. */
    ready: dueNgn >= minNgn,
    /** The soonest the waiting money becomes releasable, if any of it is waiting. */
    nextReleaseAt: waiting.length
      ? waiting
          .map((r) => new Date(r.holdUntil).toISOString())
          .sort()[0]
      : null,
  };
}

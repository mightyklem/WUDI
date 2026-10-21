/**
 * Does the bank account belong to the trainer?
 *
 * A payout account that resolves is an account that exists. It says nothing about
 * whose it is: anyone who can type a Nigerian account number -- including one that
 * belongs to somebody else -- can be paid into it. The identity document closes that
 * at approval, but the account can be changed afterwards and nothing has ever
 * compared the name on the account with the name on the trainer.
 *
 * So this compares the name the bank gave us against the name the trainer gave us,
 * and it is deliberately tolerant, because a hard block on a mismatch refuses
 * legitimate payouts. Nigerian names are formatted every way imaginable by every
 * bank in the country, and a name that reads as a mismatch is often just a name
 * written differently.
 *
 * The four answers:
 *   match     the same name, however it is written
 *   partial   the same person, near enough -- a missing surname, an extra middle
 *             name, an initial in place of a name
 *   mismatch  a different name. Look at this one.
 *   unknown   there is not enough to compare
 */

/** Titles that appear on bank records and mean nothing. */
const HONORIFICS = new Set([
  'MR', 'MRS', 'MISS', 'MS', 'DR', 'PROF', 'ENGR', 'ENG', 'ARC', 'PHD',
  'CHIEF', 'ALH', 'ALHAJI', 'BARR', 'BABAN', 'MA', 'WELFARE',
]);

/**
 * A name, taken apart.
 *
 * Single letters are kept apart from the rest, because an initial is a piece of the
 * name rather than the name itself: "AUGUSTINE M OAKAFOR" and "AUGUSTINE OAKAFOR"
 * are the same person, and the M is the only difference.
 */
function normaliseName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const tokens = raw
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !HONORIFICS.has(t));
  if (!tokens.length) return null;
  return {
    all: tokens,
    full: tokens.filter((t) => t.length > 1),
    initials: tokens.filter((t) => t.length === 1),
  };
}

/** How bad a result is, so the best of several names can be the one that is reported. */
const SEVERITY = { match: 0, partial: 1, mismatch: 2, unknown: 3 };

/**
 * Can two name parts stand for each other?
 *
 * An initial stands for a name that begins with it, which is the whole reason a
 * name can be matched at all: "A. Okafor" is "Augustine Okafor".
 */
function tokenMatches(a, b) {
  if (a === b) return true;
  if (a.length === 1 && b[0] === a) return true;
  if (b.length === 1 && a[0] === b) return true;
  return false;
}

/**
 * The largest number of parts on one side that can be paired with the other.
 *
 * Names are short, so every pairing is tried rather than anything clever.
 */
function maxPairing(A, B) {
  const used = new Array(B.length).fill(false);
  let best = 0;
  const walk = (i, count) => {
    if (count > best) best = count;
    if (i === A.length) return;
    if (count + (A.length - i) <= best) return;
    walk(i + 1, count);
    for (let j = 0; j < B.length; j++) {
      if (used[j] || !tokenMatches(A[i], B[j])) continue;
      used[j] = true;
      walk(i + 1, count + 1);
      used[j] = false;
    }
  };
  walk(0, 0);
  return best;
}

/** Are all of these single letters? */
function allInitials(tokens) {
  return tokens.length > 0 && tokens.every((t) => t.length === 1);
}

/** The last part of a name that is a whole word rather than an initial. */
function surnameOf(n) {
  return n.full.length ? n.full[n.full.length - 1] : null;
}

/**
 * Compare one account name against one name.
 *
 * The order of the names does not matter, because banks write them either way round.
 */
function comparePair(account, candidate) {
  const A = account.all;
  const B = candidate.all;
  const pairs = maxPairing(A, B);
  const smaller = Math.min(A.length, B.length);

  if (pairs === smaller && A.length === B.length) {
    // Every part on both sides found a partner. The same name, written the way a
    // bank writes it.
    const onlyInitials = A.every(
      (t, i) => t === B[i] || t.length === 1 || B[i].length === 1,
    );
    return {
      result: 'match',
      detail: onlyInitials
        ? 'The same name, written with initials.'
        : 'The same name.',
    };
  }

  if (pairs === smaller) {
    // One side is entirely covered by the other, and the leftovers are only
    // initials: "AUGUSTINE M OAKAFOR" against "AUGUSTINE OAKAFOR".
    const extra = A.length > B.length ? A : B;
    const covered = A.length > B.length ? B : A;
    const leftover = extra.filter(
      (t) => !covered.some((c) => tokenMatches(t, c)),
    );
    if (allInitials(leftover)) {
      return { result: 'match', detail: 'The same name, with an extra initial.' };
    }
    return {
      result: 'partial',
      detail: `The account carries ${leftover.join(', ')} and the name on file does not.`,
    };
  }

  if (pairs === 0) {
    return { result: 'mismatch', detail: 'A different name.' };
  }

  // They share something, but not everything. The case worth calling a mismatch is
  // the same surname with a different given name: "CHINEDU OAKAFOR" against
  // "AUGUSTINE OAKAFOR" is two people, and the shared surname hides it.
  const sameSurname = surnameOf(account) && surnameOf(account) === surnameOf(candidate);
  const fullA = account.full;
  const fullB = candidate.full;
  const differing = fullA.filter(
    (t) => !fullB.some((c) => tokenMatches(t, c)),
  );
  if (sameSurname && differing.length && fullA.length === fullB.length) {
    return {
      result: 'mismatch',
      detail: `A different name: ${fullA.join(' ')} against ${fullB.join(' ')}.`,
    };
  }

  return {
    result: 'partial',
    detail: 'The names overlap but are not the same name.',
  };
}

/**
 * Compare the name on a bank account with the names we hold for a trainer.
 *
 * More than one name can be given -- the name on the account, the name they signed
 * up with, the name they teach under -- and any of them being close is worth
 * reporting, so the best of them is the one that is returned.
 */
export function compareAccountName(accountName, ...candidateNames) {
  const account = normaliseName(accountName);
  if (!account) {
    return {
      result: 'unknown',
      detail: 'The bank did not give a name for this account.',
    };
  }
  const candidates = candidateNames.map(normaliseName).filter(Boolean);
  if (!candidates.length) {
    return {
      result: 'unknown',
      detail: 'No name on file for this trainer, so there is nothing to compare against.',
    };
  }
  let best = { result: 'unknown', detail: 'Nothing to compare.' };
  for (const c of candidates) {
    const r = comparePair(account, c);
    if (SEVERITY[r.result] < SEVERITY[best.result]) best = r;
  }
  return best;
}

/**
 * Has the account been changed since the identity was approved?
 *
 * The bank statement that proves the account belonged to the trainer was collected
 * at approval. An account swapped afterwards is a different account from the one
 * that was checked, and it has to be looked at again.
 */
export function accountChangedSinceApproval(approvedAt, accountChangedAt) {
  if (!approvedAt || !accountChangedAt) return false;
  return new Date(accountChangedAt).getTime() > new Date(approvedAt).getTime();
}

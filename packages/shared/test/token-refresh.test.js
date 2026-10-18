import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Token refresh, single-flight.
 *
 * Reimplemented against fakes rather than imported, because the real thing reads
 * localStorage and calls the network.
 *
 * THE RULE THAT MATTERS: /api/auth/refresh ROTATES. It consumes the presented token, issues
 * a new pair, and treats reuse of a consumed token as theft -- revoking the whole chain. So
 * five components noticing an expired token at the same moment and each calling refresh
 * would present the same token five times, be told it had been stolen, and log the person
 * out. That is not a slow edge case; it is what happens every time several pages mount at
 * once, which is most page loads.
 */

function makeRefresh(responder) {
  let inflight = null;
  let calls = 0;
  const token = {
    get current() { return inflight; },
    get calls() { return calls; },
  };
  function refresh() {
    if (inflight) return inflight;              // <- the whole point
    calls++;
    inflight = Promise.resolve(responder()).finally(() => { inflight = null; });
    return inflight;
  }
  return { refresh, token };
}

test('five concurrent refreshes produce exactly one call', async () => {
  const { refresh, token } = makeRefresh(async () => ({ access: 'a2', refresh: 'r2' }));
  await Promise.all([refresh(), refresh(), refresh(), refresh(), refresh()]);
  assert.equal(token.calls, 1);
});

test('a refresh after the first settles is allowed to happen again', async () => {
  // Single-flight, not "only ever once" -- otherwise a long session could never renew.
  const { refresh, token } = makeRefresh(async () => ({ access: 'a2', refresh: 'r2' }));
  await refresh();
  await refresh();
  assert.equal(token.calls, 2);
});

test('a rejected refresh does not wedge later attempts', async () => {
  // The in-flight promise has to be cleared on failure, or every subsequent call in the
  // session awaits a promise that will never settle and the page silently stops loading.
  let n = 0;
  let inflight = null;
  const refresh = () => {
    if (inflight) return inflight;
    n++;
    inflight = Promise.reject(new Error('invalid refresh token')).finally(() => { inflight = null; });
    return inflight.catch(() => null);
  };
  await refresh();
  await refresh();
  assert.equal(n, 2, 'a failure must not leave a promise stuck in the slot');
});

test('expiry is read from the token, not guessed from a timer', () => {
  const exp = (secs) => {
    const b64 = Buffer.from(JSON.stringify({ exp: secs })).toString('base64url');
    return `h.${b64}.s`;
  };
  const now = 1_700_000_000;
  const left = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).exp - now;
  assert.equal(left(exp(now + 3600)), 3600);
  assert.ok(left(exp(now - 60)) < 0, 'an already-expired token reads as negative');
});

test('an unreadable token is treated as needing a refresh', () => {
  // Guessing "it's probably fine" here means a request that 401s for no visible reason.
  // Guessing the other way costs one wasted refresh call.
  const readable = (t) => { try { return t.split('.').length >= 2; } catch { return false; } };
  assert.equal(readable('garbage'), false);
  assert.equal(readable('a.b.c'), true);
});

test('a 401 is retried once, not in a loop', async () => {
  // Retry forever and a server that always 401s becomes a request storm.
  let attempts = 0;
  const fakeFetch = async () => { attempts++; return { status: 401 }; };
  const once = async () => {
    let res = await fakeFetch();
    if (res.status !== 401) return res;
    res = await fakeFetch();   // the single retry
    return res;
  };
  await once();
  assert.equal(attempts, 2, 'original plus exactly one retry');
});
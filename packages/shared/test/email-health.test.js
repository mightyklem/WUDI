import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Whether this deployment can actually deliver mail.
 *
 * Reimplemented here as a pure function against an injected environment, because the real
 * one reads process.env at module load and is therefore untestable without running the whole
 * app. The rule being pinned down is the expensive one: Resend's onboarding@resend.dev
 * sender is a TEST sender that only delivers to the account owner's own address, so
 * falling back to it in production does not degrade delivery, it stops it.
 */

function health(env) {
  const apiKeySet = Boolean(env.RESEND_API_KEY);
  const configured = (env.EMAIL_FROM || '').trim();
  const from = configured || (env.NODE_ENV !== 'production' ? 'Learnovize <onboarding@resend.dev>' : null);
  const sandbox = Boolean(from && from.includes('resend.dev'));
  const canDeliver = apiKeySet && from !== null && !(sandbox && env.NODE_ENV === 'production');
  let problem = null;
  if (!apiKeySet) problem = 'RESEND_API_KEY is not set.';
  else if (!from) problem = 'EMAIL_FROM is not set.';
  else if (sandbox && env.NODE_ENV === 'production') problem = 'EMAIL_FROM is not set in production; the resend.dev test sender cannot deliver to real users.';
  return { apiKeySet, fromConfigured: from !== null, fromIsResendSandbox: sandbox, canDeliver, problem };
}

const PROD = { NODE_ENV: 'production' };
const DEV = { NODE_ENV: 'development' };

test('production with no EMAIL_FROM cannot deliver -- this is the outage that shipped', () => {
  // The exact shape that made new signups never receive a code: a key present, no from
  // address, so every send went to Resend's test sender and was rejected.
  const h = health({ ...PROD, RESEND_API_KEY: 're_xxx' });
  assert.equal(h.canDeliver, false);
  assert.match(h.problem, /EMAIL_FROM/);
  assert.equal(h.fromIsResendSandbox, false);
});

test('production with no API key cannot deliver either', () => {
  const h = health({ ...PROD, EMAIL_FROM: 'Learnovize <hello@learnovize.com>' });
  assert.equal(h.canDeliver, false);
  assert.match(h.problem, /RESEND_API_KEY/);
});

test('production with both set can deliver', () => {
  const h = health({ ...PROD, RESEND_API_KEY: 're_xxx', EMAIL_FROM: 'Learnovize <hello@learnovize.com>' });
  assert.equal(h.canDeliver, true);
  assert.equal(h.problem, null);
});

test('a resend.dev sender in production is still refused, even when explicitly set', () => {
  // Someone "fixing" the outage by setting EMAIL_FROM to the resend.dev onboarding address
  // must not be able to make it look healthy.
  const h = health({ ...PROD, RESEND_API_KEY: 're_xxx', EMAIL_FROM: 'Learnovize <onboarding@resend.dev>' });
  assert.equal(h.canDeliver, false);
  assert.match(h.problem, /resend\.dev/);
});

test('development may use the test sender', () => {
  const h = health({ ...DEV, RESEND_API_KEY: 're_xxx' });
  assert.equal(h.canDeliver, true);
  assert.equal(h.fromIsResendSandbox, true);
});

test('a configured sender wins over the development fallback', () => {
  const h = health({ ...DEV, RESEND_API_KEY: 're_xxx', EMAIL_FROM: 'Learnovize <hi@learnovize.com>' });
  assert.equal(h.fromIsResendSandbox, false);
  assert.equal(h.canDeliver, true);
});

test('a whitespace-only EMAIL_FROM counts as unset', () => {
  // A stray space in a dashboard value is exactly the kind of thing that leaves the field
  // looking filled in while mail quietly goes nowhere.
  const h = health({ ...PROD, RESEND_API_KEY: 're_xxx', EMAIL_FROM: '   ' });
  assert.equal(h.canDeliver, false);
  assert.equal(h.fromConfigured, false);
});

test('the health report never contains the key itself', () => {
  const h = health({ ...PROD, RESEND_API_KEY: 're_supersecretvalue', EMAIL_FROM: 'a@b.com' });
  assert.ok(!JSON.stringify(h).includes('supersecret'));
});
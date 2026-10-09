import test from 'node:test';
import assert from 'node:assert/strict';
import { provider } from '../../../apps/web/lib/payments.ts';

function withEnv(values, fn) {
  const saved = { ...process.env };
  for (const k of ['PAYMENTS_PROVIDER', 'NODE_ENV']) delete process.env[k];
  Object.assign(process.env, values);
  try {
    return fn();
  } finally {
    for (const k of ['PAYMENTS_PROVIDER', 'NODE_ENV']) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

test('paystack resolves to paystack', () => {
  withEnv({ PAYMENTS_PROVIDER: 'paystack' }, () => {
    assert.equal(provider(), 'paystack');
  });
});

test('mock is allowed outside production, for local work', () => {
  withEnv({ PAYMENTS_PROVIDER: 'mock', NODE_ENV: 'development' }, () => {
    assert.equal(provider(), 'mock');
  });
});

test('unset in production THROWS rather than falling back to mock', () => {
  // The whole point. An unset variable in production must never mean "give classes away".
  withEnv({ NODE_ENV: 'production' }, () => {
    assert.throws(() => provider(), /must be "paystack" in production/);
  });
});

test('explicit mock in production THROWS', () => {
  withEnv({ PAYMENTS_PROVIDER: 'mock', NODE_ENV: 'production' }, () => {
    assert.throws(() => provider(), /without charging anyone/);
  });
});

test('a typo is reported, not silently treated as mock', () => {
  // Casing is NOT a typo -- 'PAYSTACK' is accepted, covered by the test below. These
  // are the near-misses that used to slip through and quietly mean "free classes".
  for (const bad of ['paystackk', 'Pay stack', 'true', '1', 'yes', 'sandbox']) {
    withEnv({ PAYMENTS_PROVIDER: bad, NODE_ENV: 'development' }, () => {
      assert.throws(() => provider(), /Unknown PAYMENTS_PROVIDER/, `should reject ${bad}`);
    });
  }
});

test('casing and stray whitespace are tolerated', () => {
  // An operator writing " PayStack " meant paystack; do not fail them over a space.
  withEnv({ PAYMENTS_PROVIDER: ' PayStack ', NODE_ENV: 'production' }, () => {
    assert.equal(provider(), 'paystack');
  });
});
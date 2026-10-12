import test from 'node:test';
import assert from 'node:assert/strict';
import { cspConnectSources } from '../../../apps/web/lib/csp.ts';

function withLiveKit(url) {
  const prev = process.env.LIVEKIT_URL;
  process.env.LIVEKIT_URL = url;
  try {
    // cspConnectSources() returns a joined string; compare whole tokens so
    // 'https://*.livekit.cloud' cannot be satisfied by a substring of something else.
    return cspConnectSources().split(' ').filter(Boolean);
  } finally {
    if (prev === undefined) delete process.env.LIVEKIT_URL;
    else process.env.LIVEKIT_URL = prev;
  }
}

test('the exact LiveKit host is allowed', () => {
  const s = withLiveKit('wss://learnovize-staging-oh849r2o.livekit.cloud');
  assert.ok(s.includes('wss://learnovize-staging-oh849r2o.livekit.cloud'));
});

test('LiveKit Cloud regional redirects are allowed', () => {
  // The bug: LiveKit Cloud moves signalling to a regional host and the browser was
  // blocked before the redirect resolved. Exact-host-only connect-src broke the
  // classroom while the token and the server API both worked fine.
  const s = withLiveKit('wss://learnovize-staging-oh849r2o.livekit.cloud');
  assert.ok(s.includes('wss://*.livekit.cloud'), 'needs the websocket wildcard');
  assert.ok(
    s.includes('https://*.livekit.cloud'),
    'the SDK also fetches region settings over https -- Set.add() silently dropped this',
  );
});

test('a self-hosted LiveKit gets no wildcard', () => {
  // Nothing about wss://livekit.example.com implies its siblings are trusted.
  const s = withLiveKit('wss://livekit.example.com');
  assert.ok(s.includes('wss://livekit.example.com'));
  assert.ok(
    !s.some((v) => v.includes('*.livekit.cloud')),
    'must not widen the policy to LiveKit Cloud for a self-hosted server',
  );
});

test('a missing LIVEKIT_URL still permits the classroom', () => {
  const prev = process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_URL;
  try {
    const s = cspConnectSources().split(' ').filter(Boolean);
    assert.ok(s.includes('wss://*.livekit.cloud'));
    assert.ok(s.includes('https://*.livekit.cloud'));
  } finally {
    if (prev !== undefined) process.env.LIVEKIT_URL = prev;
  }
});
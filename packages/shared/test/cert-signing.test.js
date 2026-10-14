import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import {
  buildSnapshot, signSnapshot, verifySnapshot, parseSnapshot, keyIdFor, SNAPSHOT_VERSION,
} from '../src/cert-signing.js';

// A throwaway keypair per run. The production key lives in an environment variable and
// must never appear in this repo, so these are generated and thrown away.
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const OTHER = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();

const claims = {
  number: 'LEARNOVIZE-2026-89QL8G',
  learnerName: 'A Learner',
  trainingTitle: 'Video Production - Beginner basics',
  trainerName: 'Wudi',
  scope: 'Full program',
  days: ['day-1'],
  pct: 80,
  issuedAt: '2026-10-14T10:00:00.000Z',
};

describe('snapshot canonicalisation', () => {
  it('is stable regardless of key order', () => {
    const a = buildSnapshot({ b: 2, a: 1, c: 3 });
    const b = buildSnapshot({ c: 3, a: 1, b: 2 });
    assert.equal(a, b);
  });

  it('carries a version', () => {
    assert.ok(buildSnapshot(claims).startsWith(`version:${SNAPSHOT_VERSION}`));
  });

  it('round-trips through parse', () => {
    const parsed = parseSnapshot(buildSnapshot(claims));
    assert.equal(parsed.number, claims.number);
    assert.equal(parsed.trainingTitle, claims.trainingTitle);
    assert.equal(parsed.pct, '80');
    assert.equal(parsed.days, 'day-1');
  });

  it('a newline in a value cannot forge an extra field', () => {
    // A course titled "X\npct:100" must not be able to sign as if attendance were 100.
    const evil = { ...claims, trainingTitle: 'X\npct:100' };
    const parsed = parseSnapshot(buildSnapshot(evil));
    assert.equal(parsed.trainingTitle, 'X\npct:100');
    assert.equal(parsed.pct, '80', 'the injected line must not become the pct field');
  });

  it('a backslash in a value cannot un-escape a later one', () => {
    const parsed = parseSnapshot(buildSnapshot({ a: 'x\\', b: 'y' }));
    assert.equal(parsed.a, 'x\\');
    assert.equal(parsed.b, 'y');
  });

  it('drops null and undefined rather than signing "null"', () => {
    const s = buildSnapshot({ a: '1', b: null, c: undefined });
    assert.ok(!s.includes('b:'));
    assert.ok(!s.includes('c:'));
  });

  it('different claims produce different bytes', () => {
    assert.notEqual(buildSnapshot(claims), buildSnapshot({ ...claims, pct: 81 }));
  });
});

describe('signature', () => {
  it('verifies against its own public key', () => {
    const signed = signSnapshot(buildSnapshot(claims), { privateKeyPem: PRIV, publicKeyPem: PUB });
    assert.equal(verifySnapshot(signed.snapshot, signed.signature, signed.publicKeyPem), true);
  });

  it('fails when the document is edited', () => {
    const signed = signSnapshot(buildSnapshot(claims), { privateKeyPem: PRIV, publicKeyPem: PUB });
    const tampered = signed.snapshot.replace('pct:80', 'pct:100');
    assert.equal(verifySnapshot(tampered, signed.signature, signed.publicKeyPem), false);
  });

  it('fails against a different key', () => {
    const signed = signSnapshot(buildSnapshot(claims), { privateKeyPem: PRIV, publicKeyPem: PUB });
    assert.equal(verifySnapshot(signed.snapshot, signed.signature, OTHER), false);
  });

  it('fails on malformed input rather than throwing', () => {
    // A verifier that throws on a forger's signature is a verifier that gets abandoned.
    assert.equal(verifySnapshot('anything', 'not-base64!!!', PUB), false);
    assert.equal(verifySnapshot('', 'x', PUB), false);
    assert.equal(verifySnapshot('x', '', PUB), false);
    assert.equal(verifySnapshot('x', 'AAAA', ''), false);
    assert.equal(verifySnapshot(undefined, undefined, undefined), false);
    // Right base64, wrong length: an Ed25519 signature is always 64 bytes.
    assert.equal(verifySnapshot('x', Buffer.alloc(10).toString('base64'), PUB), false);
  });

  it('keyId is derived from the public key, so it is publishable', () => {
    const signed = signSnapshot(buildSnapshot(claims), { privateKeyPem: PRIV, publicKeyPem: PUB });
    assert.equal(signed.keyId, keyIdFor(PUB));
    assert.equal(signed.keyId.length, 16);
  });

  it('two different documents do not share a signature', () => {
    const a = signSnapshot(buildSnapshot(claims), { privateKeyPem: PRIV, publicKeyPem: PUB });
    const b = signSnapshot(buildSnapshot({ ...claims, pct: 81 }), { privateKeyPem: PRIV, publicKeyPem: PUB });
    assert.notEqual(a.signature, b.signature);
  });
});
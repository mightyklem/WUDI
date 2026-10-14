import {
  buildSnapshot,
  signSnapshot,
  verifySnapshot,
  keyIdFor,
  SNAPSHOT_VERSION,
} from '@learnovize/shared/cert-signing';
import { createPrivateKey, createPublicKey } from 'crypto';

/**
 * Certificate signing keys.
 *
 * The private key lives in an environment variable and nowhere else. Not in the
 * database, not in the repo, not in a Netlify build setting that ships to a browser.
 *
 * That is the whole reason for Ed25519 rather than an HMAC: an HMAC needs the same
 * secret to verify as to sign, so checking it proves nothing to anyone who does not
 * already trust us. Ed25519 needs only the public half, which we publish openly so an
 * employer or a learner can check a certificate without asking us anything.
 *
 * Rotation: each signature records the keyId it was made with, so a key can be
 * replaced without invalidating anything already issued. Old keys are retained until
 * every certificate signed with them has aged out.
 */

export type CertClaims = {
  number: string;
  learnerName: string;
  trainingTitle: string;
  trainerName: string;
  scope: string;
  days: string[];
  pct: number;
  issuedAt: string;
};

function env(name: string): string {
  return (process.env[name] || '').trim();
}

/**
 * Turn a stored PEM back into a real one.
 *
 * Environment variables hold one value, so a multi-line PEM is stored with literal
 * "\n" where the line breaks should be -- which is how it has to be, or the variable
 * editor mangles it. Node, however, needs actual newlines, and hands you a bare
 *
 *   error:1E08010C:DECODER routines::unsupported
 *
 * with no mention of line endings. That is an OpenSSL complaint about an unreadable
 * key, so it looks like a corrupt key rather than an encoding detail, and it costs a
 * diagnosis every time.
 *
 * Values that already contain real newlines are left alone, so this is safe whichever
 * way the variable was pasted.
 */
function pemFromEnv(raw: string): string {
  if (!raw) return '';
  const unescaped = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  // Strip surrounding quotes if someone pasted the whole line including them.
  return unescaped.replace(/^["']|["']$/g, '').trim() + '\n';
}

/**
 * The public key, which is safe to hand to anyone.
 *
 * Returns null rather than throwing: something must be able to ask for the public key
 * before any certificate exists, and an unauthenticated endpoint asking for it should
 * not be able to take issuance down.
 */
export function certPublicKeyPem(): string | null {
  const v = env('CERT_SIGNING_PUBLIC_KEY');
  return v ? pemFromEnv(v) : null;
}

export function certKeyId(): string | null {
  const pub = certPublicKeyPem();
  return pub ? keyIdFor(pub) : null;
}

/**
 * Whether signing is configured at all.
 *
 * Checked explicitly at issuance rather than inferred from a thrown error, so the
 * failure says what is actually wrong instead of surfacing as an opaque signing error.
 */
export function signingConfigured(): boolean {
  return Boolean(env('CERT_SIGNING_PRIVATE_KEY') && env('CERT_SIGNING_PUBLIC_KEY'));
}

/**
 * Sign a certificate's claims.
 *
 * Throws if signing is not configured. Issuance FAILS rather than continuing unsigned:
 * a certificate that claims to be verifiable and is not is worse than no certificate,
 * because the learner will find out at the worst possible moment -- when an employer
 * asks them to prove it.
 */
export function signCertificate(claims: CertClaims): {
  snapshot: string;
  signature: string;
  keyId: string;
  templateVersion: string;
} {
  const rawPriv = env('CERT_SIGNING_PRIVATE_KEY');
  const rawPub = env('CERT_SIGNING_PUBLIC_KEY');
  if (!rawPriv || !rawPub) {
    throw Object.assign(
      new Error(
        'Certificate signing is not configured. Set CERT_SIGNING_PRIVATE_KEY and ' +
          'CERT_SIGNING_PUBLIC_KEY (see scripts/generate-cert-key.mjs) before issuing.',
      ),
      { code: 'NO_SIGNING_KEY' },
    );
  }
  const privateKeyPem = pemFromEnv(rawPriv);
  const publicKeyPem = pemFromEnv(rawPub);

  // Parse both up front. Node's error for a malformed key is an OpenSSL complaint with
  // no mention of which key or why -- and this runs on every issuance, so failing here
  // names the actual problem instead of surfacing it later as "unsupported".
  try {
    createPrivateKey(privateKeyPem);
  } catch (e) {
    throw Object.assign(
      new Error(
        `CERT_SIGNING_PRIVATE_KEY could not be read: ${e instanceof Error ? e.message : 'unknown'}. ` +
          'It must be the PEM from generate-cert-key.mjs, with \\n where the line breaks are.',
      ),
      { code: 'BAD_SIGNING_KEY' },
    );
  }
  try {
    createPublicKey(publicKeyPem);
  } catch (e) {
    throw Object.assign(
      new Error(
        `CERT_SIGNING_PUBLIC_KEY could not be read: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
      { code: 'BAD_SIGNING_KEY' },
    );
  }

  // The private half is never logged, never returned, and never leaves this function.
  const snapshot = buildSnapshot({ ...claims, learnerName: claims.learnerName });
  const signed = signSnapshot(snapshot, { privateKeyPem, publicKeyPem });
  return {
    snapshot: signed.snapshot,
    signature: signed.signature,
    keyId: signed.keyId,
    templateVersion: SNAPSHOT_VERSION,
  };
}

/**
 * Check a signature against the published public key.
 *
 * Used on download, so a PDF that has been altered in the bucket -- or a row whose
 * signature no longer matches its snapshot -- is refused rather than served.
 */
export function verifyCertificateSignature(
  snapshot: string,
  signature: string,
): boolean {
  const publicKeyPem = certPublicKeyPem();
  if (!publicKeyPem) return false;
  return verifySnapshot(snapshot, signature, publicKeyPem);
}
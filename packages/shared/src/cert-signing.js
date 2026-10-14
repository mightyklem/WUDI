/**
 * Certificate signing.
 *
 * A certificate PDF is a file. Anyone can edit one, and until now nothing about it made
 * an edit detectable -- the SHA-256 stored against the row was written and never read,
 * and it only proved the file matched what WE put in the bucket, not that what we put
 * in the bucket was ever issued. So the entire trust story rested on the number looking
 * plausible.
 *
 * This closes it with a signature anyone can check without us.
 *
 * The design constraint that shapes everything: a certificate is verifiable OFFLINE. The
 * holder gets a PDF, not a session with our API. So the signed payload has to be carried
 * inside the document itself, and it has to be reconstructible from what the document
 * visibly claims. That is what buildSnapshot() is for: it takes the fields a reader can
 * see and produces one canonical byte string, which is then signed.
 *
 * Nothing here does I/O, touches the environment, or knows about certificates in the
 * database. Keys are passed in. That keeps it testable, and it means the key handling --
 * which must live outside the database -- is somebody else's decision.
 *
 * Ed25519 rather than HMAC because the point is for a third party to verify without
 * trusting us. An HMAC needs our secret to check, which proves nothing to anyone who does
 * not already believe us. Ed25519 needs only a public key, which we publish.
 */
import * as nodeCrypto from 'node:crypto';

/** Bumped when the snapshot layout changes, so an old signature cannot be misread. */
export const SNAPSHOT_VERSION = 'v1';

/**
 * Canonicalise a certificate's claims into a single string to be signed.
 *
 * Order is fixed by sorting keys, and values are escaped, so the same claims always
 * produce the same bytes. That matters: a signature is only meaningful if there is
 * exactly one byte string it could have been made over. Anything ambiguous -- key order
 * taken from an object, a separator that can appear inside a value -- makes the whole
 * scheme forgeable by rearranging a document.
 *
 * Deliberately NOT included: the PDF's own bytes, and anything that could change after
 * issuance. A signature over mutable state expires with the state, which defeats it.
 */
export function buildSnapshot(fields) {
  const parts = [`version:${SNAPSHOT_VERSION}`];
  const keys = Object.keys(fields).filter((k) => fields[k] !== null && fields[k] !== undefined).sort();
  for (const k of keys) {
    let v = fields[k];
    if (Array.isArray(v)) v = v.join(',');
    // Backslash first, so escaping cannot be undone by escaping the escape character
    // second. A newline in a course title must not be able to forge a new field.
    const s = String(v)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
    parts.push(`${k}:${s}`);
  }
  return parts.join('\n');
}

/**
 * A short, public identifier for a signing key, so a signature can be attributed to the
 * key that made it and a rotated-out key does not make old documents unverifiable.
 * Derived from the public key, because that is what a verifier holds.
 */
export function keyIdFor(publicKeyPem) {
  return nodeCrypto.createHash('sha256').update(publicKeyPem).digest('hex').slice(0, 16);
}

/**
 * Sign a snapshot.
 *
 * `publicKeyPem` is returned alongside so a verifier only ever needs the signature block
 * and this file to check a document, without a separate lookup.
 */
export function signSnapshot(snapshot, { privateKeyPem, publicKeyPem }) {
  const signature = nodeCrypto.sign(null, Buffer.from(snapshot, 'utf8'), privateKeyPem);
  return {
    snapshot,
    signature: signature.toString('base64'),
    keyId: keyIdFor(publicKeyPem),
    publicKeyPem,
  };
}

/**
 * Check a signature.
 *
 * Returns false rather than throwing for every failure a verifier could hand it --
 * wrong key, truncated signature, edited document. A verifier that throws on a malformed
 * signature is a verifier that gets abandoned the first time it meets a forger.
 */
export function verifySnapshot(snapshot, signatureBase64, publicKeyPem) {
  try {
    if (!snapshot || !signatureBase64 || !publicKeyPem) return false;
    const sig = Buffer.from(signatureBase64, 'base64');
    if (sig.length !== 64) return false; // Ed25519 signatures are always 64 bytes
    return nodeCrypto.verify(null, Buffer.from(snapshot, 'utf8'), publicKeyPem, sig);
  } catch {
    return false;
  }
}

/**
 * Parse a signed block back into its parts.
 *
 * Needed to verify offline: a holder receives a PDF with the snapshot and signature
 * embedded, and to check it they must be able to rebuild the snapshot from the document
 * and compare -- not merely read back the string we already handed them. Returning the
 * parsed fields makes that check possible with a diff instead of a re-sign.
 */
export function parseSnapshot(snapshot) {
  const out = {};
  const lines = String(snapshot || '').split('\n');
  const version = /^version:(.+)$/.exec(lines[0] || '');
  if (version) out.version = version[1];
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i);
    let v = line.slice(i + 1);
    v = v.replace(/\\r/g, '\r').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
    out[k] = v;
  }
  return out;
}
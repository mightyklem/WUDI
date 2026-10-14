import { NextResponse } from 'next/server';
import { certPublicKeyPem, certKeyId } from '@/lib/cert-signing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/certificates/signing-key — the public half of the certificate signing key.
 *
 * Published openly, because publishing it is the entire point. A learner who holds a PDF
 * can check it without asking us anything: rebuild the snapshot from the fields printed
 * on the document, verify the signature against this key, and know the claims were
 * issued by Learnovize. If checking required our API, the signature would only prove we
 * agree with ourselves.
 *
 * Nothing secret is in here, and nothing is gated -- a public key is not a capability.
 * Cached for an hour: it changes only when the key is rotated, and every signature
 * carries the keyId it was made with, so an old key stays published until nothing signed
 * with it remains in circulation.
 */
export async function GET() {
  const pem = certPublicKeyPem();
  if (!pem) {
    // Not configured yet. Said plainly rather than returning something that looks like a
    // valid empty key, which a verifier would reject in a confusing way.
    return NextResponse.json(
      { error: 'Certificate signing is not configured', keyId: null, publicKeyPem: null },
      { status: 503 },
    );
  }
  return NextResponse.json(
    {
      algorithm: 'Ed25519',
      keyId: certKeyId(),
      publicKeyPem: pem,
      // How to use it, so this endpoint is self-explanatory to whoever finds it first.
      verify:
        'Rebuild the snapshot from the fields printed on the certificate, sign-verify it ' +
        'with this public key using Ed25519 (no pre-hash), and confirm the signature matches ' +
        'the one on the document.',
    },
    { headers: { 'cache-control': 'public, max-age=3600' } },
  );
}
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getPrivate } from '@/lib/storage';
import { certKeyFor } from '@/lib/certs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/certificates/[number]/download — hand over the PDF, if allowed.
 *
 * The PDF used to be written to the public bucket at certs/<number>.pdf and its URL
 * stored on the row. Three separate problems sat on that one key:
 *
 *   1. The key was derivable from the certificate number, so anyone who guessed or was
 *      given a number could fetch the file straight from storage, bypassing this app, its
 *      rate limiter and its access checks entirely.
 *   2. The PDF embeds the learner's email. A learner who declined to appear by name on
 *      the public verification page still had their address sitting on a world-readable
 *      URL. The consent toggle governed the verify page and nothing else, which made it
 *      cosmetic.
 *   3. Revoking a certificate only hid the link on the verification page. The file stayed
 *      put and stayed fetchable, so a revoked holder kept something that looked entirely
 *      valid to anyone who already had it.
 *
 * The PDF is private now and every read comes through here, which is the only place that
 * can check revocation, consent and integrity together.
 *
 * Access:
 *   - the learner who holds it, always
 *   - the trainer who issued it
 *   - staff, for disputes
 *   - anyone, but ONLY if the holder chose public display, and never once revoked
 *
 * Every one of those reads verifies SHA-256 against the value recorded at issuance before
 * a single byte is returned. A hash that is written and never read detects nothing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const upper = String(number || '').toUpperCase();

  const cert = await prisma.certificate.findUnique({
    where: { number: upper },
    include: {
      user: { select: { id: true, email: true } },
      training: { select: { trainerId: true } },
    },
  });
  if (!cert) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Revocation beats every other permission, staff included. The point of revoking is
  // that the document stops being obtainable, and an admin path that could still fetch
  // it would defeat that for the only audience likely to act on it.
  if (cert.status === 'revoked') {
    return NextResponse.json(
      { error: 'This certificate was revoked and can no longer be downloaded' },
      { status: 410 },
    );
  }

  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId: cert.trainingId, userId: cert.userId } },
    select: { certConsentPublic: true },
  });
  const isPublic = reg?.certConsentPublic === true;

  if (!isPublic) {
    const token = getBearer(req);
    const userId = token ? await verifyAccessToken(token) : null;
    const holder = userId === cert.userId;
    const issuer = userId === cert.training.trainerId;
    const staff = userId ? await isAdmin(userId) : false;
    if (!holder && !issuer && !staff) {
      // 404 rather than 403, so a stranger cannot probe which numbers exist.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const bytes = await getPrivate(certKeyFor(cert.number));
  if (!bytes) {
    // The row says the certificate exists but the document does not. That is a real fault
    // rather than a missing file, so it is logged and reported honestly instead of being
    // dressed up as a 404.
    console.error(`[cert] PDF missing for ${cert.number}`);
    return NextResponse.json(
      { error: 'The certificate document is unavailable' },
      { status: 503 },
    );
  }

  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== cert.sha256) {
    // Refuse rather than serve. This is the case the stored hash exists for.
    console.error(
      `[cert] SHA-256 mismatch for ${cert.number}: stored ${cert.sha256}, got ${digest}`,
    );
    await prisma.auditLog.create({
      data: {
        actorId: cert.userId,
        action: 'certificate.tamper-detected',
        target: `certificate:${cert.number}`,
        reason: `hash mismatch on download (expected ${cert.sha256.slice(0, 12)}, got ${digest.slice(0, 12)})`,
      },
    });
    return NextResponse.json(
      { error: 'This certificate failed its integrity check and will not be served' },
      { status: 409 },
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(bytes.byteLength),
      // Never cached at a shared proxy: whether this returns anything at all depends on
      // who is asking.
      'cache-control': 'private, no-store',
      'content-disposition': `inline; filename="${cert.number}.pdf"`,
      'x-content-type-options': 'nosniff',
    },
  });
}
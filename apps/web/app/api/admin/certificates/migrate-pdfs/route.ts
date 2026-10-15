import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getPublicForMigration, removePublic, putPrivate } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/certificates/migrate-pdfs — ONE-OFF. Delete after it has run.
 *
 * Moves already-issued certificate PDFs from the public bucket to the private one.
 *
 * Why this exists as a route rather than a script: the credentials that can reach the
 * real bucket live in the deployment environment, not in a local .env file. A local one
 * points at MinIO on a laptop, so running the migration from one silently reported "no
 * object to move" for a PDF whose public URL was demonstrably fetchable -- absence and
 * "I could not ask" being indistinguishable. Doing it here means it runs where the
 * credentials actually are.
 *
 * Order matters and is deliberate:
 *   1. read the public object
 *   2. verify it against the SHA-256 recorded at issuance
 *   3. write it to the private bucket
 *   4. only then delete the public copy
 *   5. repoint the stored path
 *
 * Step 2 refuses anything that does not match, which is the difference between moving a
 * file and copying something that was already replaced. Step 4 is last because a copy
 * left behind is worse than one that never moved -- the whole point is that the
 * derivable URL stops resolving.
 *
 * Idempotent: a certificate already in the private bucket reports as such and is left
 * alone, so running it twice is harmless.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const actorId = token ? await verifyAccessToken(token) : null;
  if (!actorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin(actorId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const certs = await prisma.certificate.findMany({ orderBy: { createdAt: 'asc' } });
  const results: Record<string, unknown>[] = [];

  for (const c of certs) {
    const entry: Record<string, unknown> = { number: c.number };
    try {
      const existing = await getPublicForMigration(`certs/${c.number}.pdf`);
      if (!existing) {
        // Already private, or never public. Either way there is nothing to move, and the
        // stored path still needs to point at the gate.
        const repointed = c.pdfUrl !== `/api/certificates/${c.id}/download`;
        if (repointed) {
          await prisma.certificate.update({
            where: { id: c.id },
            data: { pdfUrl: `/api/certificates/${c.id}/download` },
          });
        }
        entry.status = 'already-private';
        entry.repointed = repointed;
        results.push(entry);
        continue;
      }

      const digest = createHash('sha256').update(existing).digest('hex');
      if (digest !== c.sha256) {
        entry.status = 'hash-mismatch';
        entry.expected = c.sha256.slice(0, 16);
        entry.actual = digest.slice(0, 16);
        entry.bytes = existing.length;
        results.push(entry);
        continue;
      }

      await putPrivate(`certs/${c.number}.pdf`, existing, 'application/pdf');
      const removed = await removePublic(`certs/${c.number}.pdf`);
      await prisma.certificate.update({
        where: { id: c.id },
        data: { pdfUrl: `/api/certificates/${c.id}/download` },
      });
      entry.status = 'moved';
      entry.bytes = existing.length;
      entry.publicRemoved = removed;
      results.push(entry);
    } catch (e) {
      entry.status = 'error';
      entry.error = String((e as Error)?.message ?? e).slice(0, 300);
      results.push(entry);
    }
  }

  const summary = results.map((r) => `${(r as any).number}: ${(r as any).status}`).join(', ');
  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'certificate.migrate-pdfs',
      target: `certs:${certs.length}`,
      reason: summary.slice(0, 900),
    },
  });

  return NextResponse.json({ ok: true, results });
}
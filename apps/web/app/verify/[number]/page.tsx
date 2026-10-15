import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import SiteNav from '../../components/SiteNav';

export const dynamic = 'force-dynamic';

async function lookup(number: string) {
  const cert = await prisma.certificate.findUnique({
    where: { number },
    include: {
      training: { select: { title: true, trainer: { select: { displayName: true } } } },
      user: { select: { email: true } },
    },
  });
  if (!cert) return { status: 'not-found' as const };
  if (cert.status === 'revoked') return { status: 'revoked' as const, number: cert.number };
  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId: cert.trainingId, userId: cert.userId } },
  });
  const showName = reg?.certConsentPublic === true;
  return {
    status: 'valid' as const,
    number: cert.number,
    participant: showName ? cert.user.email : null,
    training: cert.training.title,
    trainer: cert.training.trainer.displayName,
    // Served by the download route, which re-checks consent, revocation and the stored
    // hash before returning it. Only offered when the holder opted into public display --
    // the point of the consent flag was to let someone share this page with an employer,
    // and the point of the private bucket is that it should not be readable by anyone
    // else.
    pdfUrl: showName ? `/api/certificates/${cert.number}/download` : null,
    scope: cert.scopeLabel,
    pctAttended: cert.pctAttended,
    issuedAt: cert.createdAt.toISOString(),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }): Promise<Metadata> {
  const { number } = await params;
  return {
    title: `Verify ${number.toUpperCase()} — Learnovize`,
    description: 'Check whether a Learnovize certificate is genuine.',
  };
}

export default async function VerifyPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const v = await lookup(number.toUpperCase());
  return (
    <div className="wrap">
      <SiteNav />
      <h1>Verify.</h1>
      <p className="sub">Enter any certificate number — no account needed.</p>
      <div className="card" style={{ marginTop: 18 }}>
        {v.status === 'valid' && (
          <div>
            <p><span className="badge ok">✓ VALID</span></p>
            {v.participant ? (
              <p><b>{v.participant}</b></p>
            ) : (
              <p className="muted">
                The holder chose not to publish their name. The certificate is genuine; the
                identity behind it is private.
              </p>
            )}
            <p>{v.training} · Trainer: {v.trainer}</p>
            <p className="muted">{v.number}</p>
            {/* What was actually earned. A bare title and a trainer name read as a
                qualification; the claim here is attendance and completion, and saying so
                is what makes the rest of the page credible. */}
            <p className="muted" style={{ fontSize: 13 }}>
              {v.scope} · {v.pctAttended}% attendance · issued{' '}
              {new Date(v.issuedAt).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
            </p>
            {v.pdfUrl && <div className="btnrow"><a className="btn primary" href={v.pdfUrl}>Download PDF</a></div>}
          </div>
        )}
        {v.status === 'revoked' && (
          <div><p><span className="badge rev">REVOKED</span></p><p className="muted">{v.number} was revoked and is no longer valid.</p></div>
        )}
        {v.status === 'not-found' && (
          <div><p><span className="badge">NOT FOUND</span></p><p className="muted">No certificate with this number.</p></div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Learnovize certificates confirm attendance and completion only — not government accreditation.</p>
    </div>
  );
}

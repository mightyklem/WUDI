import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, safeDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

type VerifyResult =
  | { status: 'valid'; number: string; participant: string | null; training: string; trainer: string; pdfUrl: string }
  | { status: 'revoked'; number: string }
  | { status: 'not-found' }
  | { status: 'unavailable' };

async function lookup(number: string): Promise<VerifyResult> {
  return safeDb<VerifyResult>(async () => {
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
    return {
      status: 'valid' as const,
      number: cert.number,
      participant: reg?.certConsentPublic === true ? cert.user.email : null,
      training: cert.training.title,
      trainer: cert.training.trainer.displayName,
      pdfUrl: cert.pdfUrl,
    };
  }, { status: 'unavailable' as const });}

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
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link></nav>
      </div>
      <h1>Verify.</h1>
      <p className="sub">Enter any certificate number — no account needed.</p>
      <div className="card" style={{ marginTop: 18 }}>
        {v.status === 'valid' && (
          <div>
            <p><span className="badge ok">✓ VALID</span></p>
            {v.participant && <p><b>{v.participant}</b></p>}
            <p>{v.training} · Trainer: {v.trainer}</p>
            <p className="muted">{v.number}</p>
            {v.pdfUrl && <div className="btnrow"><a className="btn primary" href={v.pdfUrl}>Download PDF</a></div>}
          </div>
        )}
        {v.status === 'revoked' && (
          <div><p><span className="badge rev">REVOKED</span></p><p className="muted">{v.number} was revoked and is no longer valid.</p></div>
        )}
        {v.status === 'not-found' && (
          <div><p><span className="badge">NOT FOUND</span></p><p className="muted">No certificate with this number.</p></div>
        )}
        {v.status === 'unavailable' && (
          <div><p><span className="badge">UNAVAILABLE</span></p><p className="muted">Certificate verification is temporarily unavailable. Try again shortly.</p></div>
        )}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Learnovize certificates confirm attendance and completion only — not government accreditation.</p>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import { SkeletonCard } from '../../components/Skeleton';
import SiteNav from '../../components/SiteNav';

type Cert = {
  id: string; number: string; pdfUrl: string; createdAt: string;
  status: string; revokedReason: string | null;
  scopeLabel?: string; pctAttended?: number;
  training: { title: string; trainer: { displayName: string } };
};

export default function MyCertificates() {
  const [certs, setCerts] = useState<Cert[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);

  // The download route is gated: it only hands the PDF to the holder, the issuing trainer
  // or staff, because the file holds the learner's email. A plain <a href> cannot satisfy
  // that. A browser navigation sends no Authorization header, so getBearer() came back
  // empty, the caller was nobody in particular, and the holder's own button returned
  // "Not found" -- the same answer it gives a stranger, which is why it looked like a
  // missing file rather than a missing identity. Fetch with the token, then hand the
  // browser a blob it can open.
  async function download(c: Cert) {
    setBusy(c.id);
    setDlError(null);
    try {
      const access = getAccess();
      if (!access) throw new Error('Your session has expired. Log in again to download.');
      // pdfUrl is our own /api/certificates/<id>/download, which is gated on the holder -- so it
      // needs the token, and needs it to be a current one, or a download that used to work
      // starts returning 401 the moment a token ages.
      const r = await authFetch(c.pdfUrl);
      if (!r.ok) {
        const body = await r.json().catch(() => ({ error: 'Download failed' }));
        // 404 from this route means "not yours to have", not "no such file".
        throw new Error(
          r.status === 404
            ? 'We could not confirm you are the holder of this certificate. Log in with the account it was issued to.'
            : body.error || 'Download failed',
        );
      }
      const href = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = href;
      a.download = `${c.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked after opening is a leak; revoked long after is not, and immediate
      // revocation breaks the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(href), 20000);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const access = getAccess();
    if (!access) return;
    const headers = { authorization: `Bearer ${access}` };
    // This page is where Paystack returns the participant after paying. If the webhook
    // never reached us, settle them here before rendering, otherwise they see nothing.
    authFetch('/api/payments/reconcile', { method: 'POST', headers })
      .catch(() => undefined)
      .finally(() => {
        authFetch('/api/certificates/mine', { headers })
          .then((r) => r.json())
          .then((j) => setCerts(j.certificates || []));
      });
  }, []);

  return (
    <div className="wrap">
      <SiteNav />
      <h1>My certificates.</h1>
      <p className="sub">Download and share anywhere — each number verifies online.</p>
      <div style={{ marginTop: 18, display: 'grid', gap: 0 }}>
        {/* Same defect as the seats page: null means loading, and it was rendering "Log in". */}
        {certs === null && (
          <div style={{ display: 'grid', gap: 12 }}>
            <SkeletonCard height={104} />
            <SkeletonCard height={104} />
          </div>
        )}
        {certs !== null && certs.length === 0 && <p className="muted">None yet — finish a training past its minimum attendance.</p>}
        {dlError && (
          <p className="muted" role="alert" style={{ color: 'var(--bad)', margin: '10px 0 0' }}>
            {dlError}
          </p>
        )}
        {certs?.map((c) => {
          const revoked = c.status === 'revoked';
          const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${c.number}`;
          const text = encodeURIComponent(`I completed ${c.training.title} on Learnovize! Verify: ${c.number}`);
          const url = encodeURIComponent(verifyUrl);
          return (
            <div
              className="rowitem"
              key={c.id}
              style={{ borderRadius: 16, marginBottom: 12, opacity: revoked ? 0.72 : 1 }}
            >
              <div style={{ fontSize: 'var(--t-xl)' }}>{revoked ? '🚫' : '🏅'}</div>
              <div>
                <p className="rtitle" style={{ fontSize: 'var(--t-md)', fontWeight: 700, margin: 0 }}>{c.training.title}</p>
                <p className="muted" style={{ margin: '2px 0 0' }}>
                  {c.number} · {c.training.trainer.displayName}
                  {c.pctAttended !== undefined && ` · ${c.pctAttended}% attendance`}
                </p>

                {/* Status, stated rather than implied. A revoked certificate used to be
                    filtered out of this list entirely, so the holder's page simply got
                    shorter with no explanation. Disappearing is not the same as being
                    told, and the holder is the one who can contest it. */}
                <p style={{ margin: '6px 0 0' }}>
                  <span className={revoked ? 'badge rev' : 'badge ok'}>
                    {revoked ? 'REVOKED' : 'VALID'}
                  </span>
                </p>
                {revoked && (
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>
                    {c.revokedReason
                      ? `Reason given: ${c.revokedReason}`
                      : 'No reason was recorded. Contact support if you think this is wrong.'}
                  </p>
                )}

                <p style={{ margin: '8px 0 0', fontSize: 'var(--t-sm)' }}>
                  {/* No download on a revoked one: the file is withheld, so offering a
                      link that cannot work is worse than not offering it. The verify link
                      stays, because a revoked certificate is still resolvable and should
                      say so honestly. */}
                  {!revoked && (
                    <button
                      className="btn link"
                      style={{ minHeight: 0, padding: '0 8px 0 0' }}
                      disabled={busy === c.id}
                      onClick={() => download(c)}
                    >
                      {busy === c.id ? 'Preparing…' : 'Download'}
                    </button>
                  )}
                  <a className="btn link" style={{ minHeight: 0, padding: '0 8px' }} href={`https://www.linkedin.com/sharing/share-offsite/?url=${url}`}>LinkedIn</a>
                  <a className="btn link" style={{ minHeight: 0, padding: '0 8px' }} href={`https://twitter.com/intent/tweet?text=${text}&url=${url}`}>X</a>
                  <a className="btn link" style={{ minHeight: 0, padding: '0 8px' }} href={`https://wa.me/?text=${text}%20${url}`}>WhatsApp</a>
                  <Link className="btn link" style={{ minHeight: 0, padding: '0 8px' }} href={`/verify/${c.number}`}>Verify →</Link>
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <nav className="bottomnav"><div className="in">
        <Link href="/">🏠<br />Home</Link>
        <Link href="/me/registrations">📚<br />Seats</Link>
        <Link href="/me/certificates" className="on">🏅<br />Certificates</Link>
      </div></nav>
    </div>
  );
}

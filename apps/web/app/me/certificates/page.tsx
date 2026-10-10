'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

type Cert = {
  id: string; number: string; pdfUrl: string; createdAt: string;
  training: { title: string; trainer: { displayName: string } };
};

export default function MyCertificates() {
  const [certs, setCerts] = useState<Cert[] | null>(null);

  useEffect(() => {
    const access = getAccess();
    if (!access) return;
    const headers = { authorization: `Bearer ${access}` };
    // This page is where Paystack returns the participant after paying. If the webhook
    // never reached us, settle them here before rendering, otherwise they see nothing.
    fetch('/api/payments/reconcile', { method: 'POST', headers })
      .catch(() => undefined)
      .finally(() => {
        fetch('/api/certificates/mine', { headers })
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
        {certs === null && <p className="muted">Log in to see your certificates.</p>}
        {certs !== null && certs.length === 0 && <p className="muted">None yet — finish a training past its minimum attendance.</p>}
        {certs?.map((c) => {
          const verifyUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/verify/${c.number}`;
          const text = encodeURIComponent(`I completed ${c.training.title} on Learnovize! Verify: ${c.number}`);
          const url = encodeURIComponent(verifyUrl);
          return (
            <div className="rowitem" key={c.id} style={{ borderRadius: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 26 }}>🏅</div>
              <div>
                <p className="rtitle" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{c.training.title}</p>
                <p className="muted" style={{ margin: '2px 0 0' }}>{c.number} · {c.training.trainer.displayName}</p>
                <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                  <a className="btn link" style={{ minHeight: 0, padding: '0 8px 0 0' }} href={c.pdfUrl}>Download</a>
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

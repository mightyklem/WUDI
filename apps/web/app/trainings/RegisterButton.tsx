'use client';
import { useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import CertConsent from './CertConsent';

export default function RegisterButton({ trainingId, full, label, hasEnded }: { trainingId: string; full: boolean; label?: string; hasEnded?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinSessionId, setJoinSessionId] = useState<string | null>(null);
  // Default false on purpose. Registration works either way; publishing does not
  // happen by accident.
  const [certConsentPublic, setCertConsentPublic] = useState(false);

  async function go() {
    const access = getAccess();
    if (!access) return setMsg('Log in first, then register.');
    setBusy(true);
    setMsg(null);
    try {
      const r = await authFetch(`/api/trainings/${trainingId}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ certConsentPublic }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error || 'Registration failed');
        return;
      }

      if (typeof j.sessionId === 'string' && j.sessionId) {
        setJoinSessionId(j.sessionId);
      }

      // Paid class: the seat is held, now send them straight to payment.
      if (j.requiresPayment) {
        const pay = await authFetch(`/api/registrations/${j.registration.id}/checkout`, {
          method: 'POST',
          headers: { authorization: `Bearer ${access}` },
        });
        const pj = await pay.json();
        if (pj.paid) {
          setMsg('Seat reserved and payment already settled.');
        } else if (pj.payUrl) {
          window.location.href = pj.payUrl;
          return;
        } else if (!pay.ok) {
          setMsg(`Seat reserved. ${pj.error || 'Complete payment from your seats page.'}`);
          return;
        } else {
          setMsg('Seat reserved.');
          return;
        }
      } else {
        setMsg('Registered! Confirmation in your inbox.');
      }
    } finally {
      setBusy(false);
    }
  }

  // If the class has ended or is full, show a message instead of the register button
  if (full || hasEnded) {
    return (
      <span>
        <p className="muted" style={{ marginTop: 10 }}>
          {label ? `${label} — ` : ''}This class has ended. Registration is closed.
        </p>
      </span>
    );
  }

  return (
    <span>
      <CertConsent checked={certConsentPublic} onChange={setCertConsentPublic} id={`cert-${trainingId}`} />
      <button className="btn primary" disabled={full || busy || !!joinSessionId} onClick={go} style={{ marginTop: 10 }}>
        {full ? 'Full' : busy ? 'Working…' : joinSessionId ? 'Seat reserved' : label || 'Reserve seat'}
      </button>
      {joinSessionId && (
        <Link className="btn primary" href={`/classroom/${joinSessionId}`} style={{ marginTop: 10, marginLeft: 8 }}>
          Join class
        </Link>
      )}
      {msg && <p className="muted">{msg}</p>}
    </span>
  );
}
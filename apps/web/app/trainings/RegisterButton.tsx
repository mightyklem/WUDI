'use client';
import { useState } from 'react';
import { getAccess } from '@/lib/client-auth';

export default function RegisterButton({ trainingId, full, label }: { trainingId: string; full: boolean; label?: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    const access = getAccess();
    if (!access) return setMsg('Log in first, then register.');
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/trainings/${trainingId}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ certConsentPublic: true }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error || 'Registration failed');
        return;
      }

      // Paid class: the seat is held, now send them straight to payment.
      if (j.requiresPayment) {
        const pay = await fetch(`/api/registrations/${j.registration.id}/checkout`, {
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

  return (
    <span>
      <button className="btn primary" disabled={full || busy} onClick={go}>
        {full ? 'Full' : busy ? 'Working…' : label || 'Reserve seat'}
      </button>
      {msg && <p className="muted">{msg}</p>}
    </span>
  );
}
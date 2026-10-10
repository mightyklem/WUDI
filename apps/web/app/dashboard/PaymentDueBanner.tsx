'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

type Due = {
  registrationId: string; title: string; slug: string; amountNgn: number;
  paymentId: string; reference: string | null; expiresInHours: number | null;
};

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

/**
 * Unpaid seats, on the dashboard, where the learner will actually see them.
 *
 * The "I have paid" button only re-checks with Paystack. It cannot settle anything
 * itself, and must never be able to: an endpoint that trusted a click to mark a payment
 * settled would hand every learner a free seat. Entitlement comes from Paystack's
 * webhook, or from the same reconciliation check this button triggers.
 */
export default function PaymentDueBanner() {
  const [due, setDue] = useState<Due[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const r = await fetch('/api/me/due', { headers: { authorization: `Bearer ${access}` } });
    if (r.ok) {
      const j = await r.json();
      setDue(j.due || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function check() {
    setBusy(true);
    setMsg(null);
    const access = getAccess();
    try {
      const r = await fetch('/api/payments/reconcile', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error || 'Could not check right now. Try again shortly.');
        return;
      }
      if (j.settled > 0) {
        setMsg('Payment received — your seat is confirmed. Certificates are unlocked.');
        await load();
        // Certificates and points both move on settlement; refresh so the numbers below
        // are not stale for the rest of the session.
        window.location.reload();
        return;
      }
      setMsg(
        j.checked > 0
          ? 'Still not showing as paid. Bank transfers can take a few minutes — try again shortly.'
          : 'Nothing is outstanding right now.',
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!due || due.length === 0) return null;

  const total = due.reduce((a, d) => a + d.amountNgn, 0);

  return (
    <div
      className="rise"
      style={{
        marginTop: 14, padding: '14px 16px', borderRadius: 'var(--r-md)',
        background: '#FFF8EC', border: '1px solid #EAD3A4',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span aria-hidden style={{ fontSize: 24 }}>💳</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <b style={{ fontSize: 15 }}>
            {due.length === 1
              ? `You have a seat waiting for payment`
              : `${due.length} seats are waiting for payment`}
          </b>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {due.map((d) => d.title).join(', ')} — {naira(total)} outstanding
          </div>
        </div>
        <Link className="btn primary" href="/me/registrations">
          Pay now
        </Link>
        <button className="btn" onClick={check} disabled={busy}>
          {busy ? 'Checking…' : 'I have paid'}
        </button>
      </div>

      {due.some((d) => d.reference) && (
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          Payment reference{due.length > 1 ? 's' : ''}:{' '}
          {due.map((d) => d.reference).filter(Boolean).join(', ')} — quote this if you paid
          by bank transfer.
        </p>
      )}

      {msg && (
        <p className="okmsg" style={{ marginTop: 10, marginBottom: 0 }}>{msg}</p>
      )}
    </div>
  );
}
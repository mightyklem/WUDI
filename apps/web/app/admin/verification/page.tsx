'use client';
import { useEffect, useState } from 'react';
import { getAccess } from '@/lib/client-auth';
import AdminNav from '../../components/AdminNav';

type Item = {
  id: string; name: string; email: string; status: string;
  formSubtotal: number; proofGrade: string | null; finalRating: string | null;
  band: string | null; paidAt: string | null; amountPaidNgn: number | null;
  refundPending: boolean; createdAt: string;
  badge: { verified: boolean; label: string | null };
};
type Detail = {
  application: {
    answers: Record<string, unknown>; reviewNotes: string | null;
  };
};

export default function AdminVerification() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [proof, setProof] = useState('none');
  const [rating, setRating] = useState('B');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/admin/verification?status=submitted', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setItems(j.queue));
  }
  useEffect(load, []);

  async function expand(id: string) {
    if (open === id) { setOpen(null); setDetail(null); return; }
    const access = getAccess();
    if (!access) return;
    setOpen(id);
    setDetail(null);
    const r = await fetch(`/api/admin/verification/${id}`, { headers: { authorization: `Bearer ${access}` } });
    if (r.ok) setDetail(await r.json());
  }

  async function decide(id: string, approve: boolean) {
    if (!approve && !notes.trim()) {
      setMsg('A reason is required to reject.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const access = getAccess();
    if (!access) return;
    const r = await fetch(`/api/admin/verification/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ approve, proofGrade: proof, finalRating: approve ? rating : undefined, notes }),
    });
    setBusy(false);
    if (r.ok) {
      setMsg(approve ? 'Verified. Badge issued.' : 'Rejected and refunded.');
      setNotes('');
      setOpen(null);
      setDetail(null);
      load();
    } else {
      const j = await r.json().catch(() => ({ error: 'failed' }));
      setMsg(j.error === 'REFUND_FAILED'
        ? 'Paystack refund failed. Nothing was recorded — the fee is owed and must be refunded by hand.'
        : `Failed: ${j.error || 'unknown'}`);
    }
  }

  // Nav stays mounted while the queue loads. Hiding it until the fetch resolves leaves a
// staff member with no way onward if the request fails.
if (items === null) return <div className="wrap"><AdminNav /><p className="muted">Staff only.</p></div>;

  const owed = items.filter((i) => i.refundPending).length;

  return (
    <div className="wrap">
      <AdminNav />
      <h1>Verification reviews.</h1>
      <p className="sub">
        {items.length} awaiting · oldest first. A rejection refunds the fee automatically.
      </p>

      {owed > 0 && (
        <div className="err" style={{ marginTop: 12 }}>
          {owed} refund(s) failed and are owed to the trainer. Resolve these by hand.
        </div>
      )}
      {msg && <div className="okmsg" style={{ marginTop: 12 }}>{msg}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        {items.length === 0 && <p className="muted">Queue empty.</p>}
        {items.map((q) => (
          <div key={q.id} style={{ padding: '12px 0', borderTop: '1px solid var(--pill)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <b>{q.name}</b>
                <div className="muted" style={{ fontSize: 13 }}>{q.email}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13 }}>
                <div>Form score: <b>{q.formSubtotal}/70</b></div>
                <div className="muted">
                  {q.amountPaidNgn ? `paid ₦${q.amountPaidNgn.toLocaleString()}` : 'not paid'}
                  {q.badge.verified ? ` · ${q.badge.label}` : ''}
                </div>
              </div>
            </div>

            <div className="btnrow">
              <button className="btn" onClick={() => expand(q.id)}>
                {open === q.id ? 'Hide answers' : 'Read answers'}
              </button>
            </div>

            {open === q.id && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--pill)', borderRadius: 8 }}>
                {!detail ? <p className="muted">Loading…</p> : (
                  <>
                    <dl style={{ fontSize: 13, display: 'grid', gridTemplateColumns: 'minmax(120px,auto) 1fr', gap: '4px 12px', margin: 0 }}>
                      {Object.entries(detail.application.answers || {}).map(([k, v]) => (
                        <div key={k} style={{ display: 'contents' }}>
                          <dt className="muted">{k}</dt>
                          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                            {Array.isArray(v) ? v.join(', ') : String(v ?? '—')}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div style={{ marginTop: 14 }}>
                      <label style={{ fontSize: 13 }}>
                        Proof of work:{' '}
                        <select value={proof} onChange={(e) => setProof(e.target.value)}>
                          <option value="none">None</option>
                          <option value="weak">Weak</option>
                          <option value="clear">Clear</option>
                        </select>
                      </label>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Proof carries 30 of the 100 points and is never auto-scored. Until it is
                        graded, the form alone cannot reach the strong band.
                      </div>
                    </div>

                    <label style={{ display: 'block', marginTop: 12, fontSize: 13 }}>
                      Notes (shown to the trainer; required to reject)
                      <textarea
                        value={notes} onChange={(e) => setNotes(e.target.value)}
                        rows={3} style={{ width: '100%', marginTop: 4 }}
                      />
                    </label>

                    <div className="btnrow">
                      <select value={rating} onChange={(e) => setRating(e.target.value)}>
                        <option value="A">A — expert</option>
                        <option value="B">B — skilled</option>
                        <option value="C">C — developing</option>
                      </select>
                      <button className="btn primary" disabled={busy} onClick={() => decide(q.id, true)}>
                        Verify and issue badge
                      </button>
                      <button className="btn" disabled={busy} onClick={() => decide(q.id, false)}>
                        Reject and refund
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
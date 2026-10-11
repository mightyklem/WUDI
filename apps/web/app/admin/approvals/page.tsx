'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import AdminNav from '../../components/AdminNav';

type Item = {
  id: string; trainerId: string; idDocUrls: string[]; expertiseEvidence: string | null;
  status: string; createdAt: string;
};

export default function AdminApprovals() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/admin/approvals?status=pending', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setItems(j.queue));
  }
  useEffect(load, []);
  if (items === null) return <div className="wrap"><AdminNav /><p className="muted">Staff only.</p></div>;

  async function decide(id: string, decision: string) {
    const reason = decision === 'approve' ? '' : (prompt('Reason (required, shown to trainer):') || '');
    if (decision !== 'approve' && !reason) return;
    const access = getAccess();
    if (!access) return;
    const r = await fetch(`/api/admin/approvals/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ decision, reason }),
    });
    setMsg(r.ok ? `${decision}d.` : 'Action failed.');
    load();
  }

  async function openDocument(approvalId: string, index: number) {
    const access = getAccess();
    if (!access) return;
    // Goes through the audited route rather than reading storage directly. That route
    // writes the access record on the way to the bytes, so it is the only way staff
    // should ever be able to open a document.
    const r = await fetch(`/api/admin/approvals/${approvalId}/document/${index}`, {
      headers: { authorization: `Bearer ${access}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error || 'Could not open that document.');
    // Local storage returns the bytes inline; cloud storage returns a signed URL.
    if (j.url) window.open(j.url, '_blank', 'noopener');
  }

  return (
    <div className="wrap">
      <AdminNav />
      <h1>Approval queue.</h1>
      <p className="sub">{items.length} pending · oldest first.</p>
      <p className="muted" style={{ fontSize: 13 }}>
        Opening an identity document is recorded against your account, and the trainer can
        see who has looked at theirs.
      </p>
      {msg && <div className="okmsg">{msg}</div>}
      <div className="card" style={{ marginTop: 12 }}>
        {items.length === 0 && <p className="muted">Queue empty.</p>}
        {items.map((q) => (
          <div key={q.id} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)', fontSize: 14 }}>
            <b>{q.trainerId}</b> · docs: {q.idDocUrls.length} file(s) · evidence: {q.expertiseEvidence || '—'}
            <div className="btnrow">
              {q.idDocUrls.map((_, i) => (
                <button
                  key={i}
                  className="btn"
                  onClick={() => openDocument(q.id, i)}
                >
                  Open ID {i + 1}
                </button>
              ))}
              <button className="btn primary" onClick={() => decide(q.id, 'approve')}>Approve</button>
              <button className="btn" onClick={() => decide(q.id, 'reject')}>Reject with reason</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

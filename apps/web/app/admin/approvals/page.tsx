'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

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
  if (items === null) return <div className="wrap"><p className="muted">Staff only.</p></div>;

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

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Approval queue.</h1>
      <p className="sub">{items.length} pending · oldest first.</p>
      {msg && <div className="okmsg">{msg}</div>}
      <div className="card" style={{ marginTop: 12 }}>
        {items.length === 0 && <p className="muted">Queue empty.</p>}
        {items.map((q) => (
          <div key={q.id} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)', fontSize: 14 }}>
            <b>{q.trainerId}</b> · docs: {q.idDocUrls.length} file(s) · evidence: {q.expertiseEvidence || '—'}
            <div className="btnrow">
              <button className="btn primary" onClick={() => decide(q.id, 'approve')}>Approve</button>
              <button className="btn" onClick={() => decide(q.id, 'reject')}>Reject with reason</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

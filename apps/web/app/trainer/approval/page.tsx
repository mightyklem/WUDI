'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

export default function Approval() {
  const [state, setState] = useState<{ approvalState: string; paidCertApproved: boolean; rejectionReason: string | null } | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [evidence, setEvidence] = useState('LinkedIn + past workshops');
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/trainer/approval', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setState(j));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const access = getAccess();
    if (!access) return setMsg('Log in first.');
    if (!idFile) return setMsg('Attach an ID document (JPG/PNG/PDF, ≤5MB).');
    const form = new FormData();
    form.append('file', idFile);
    form.append('kind', 'id');
    const up = await fetch('/api/uploads', { method: 'POST', headers: { authorization: `Bearer ${access}` }, body: form });
    const uj = await up.json();
    if (!up.ok) return setMsg(uj.error || 'Upload failed');
    const r = await fetch('/api/trainer/approval', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ idDocKeys: [uj.key], evidence }),
    });
    const j = await r.json();
    setMsg(r.ok ? 'Request submitted — a reviewer approves or declines with a reason.' : (j.error || 'Submit failed'));
    load();
  }

  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link><Link className="btn link" href="/trainer/earnings">Earnings</Link></nav>
      </div>
      <h1>Paid approval.</h1>
      <p className="sub">Free trainings need no approval. Paid certification does — ID + proof of expertise, reviewed by staff.</p>
      {state && (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: 0 }}>Status: <b>{state.approvalState}</b> · paid certs: {state.paidCertApproved ? 'allowed' : 'blocked'}
          {state.rejectionReason && <> · reason: {state.rejectionReason}</>}</p>
        </div>
      )}
      <form onSubmit={submit} className="card" style={{ marginTop: 12 }}>
        <label className="fl">ID document (private — approval use only)</label>
        <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setIdFile(e.target.files?.[0] || null)} />
        <label className="fl">Proof of expertise</label>
        <textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        <div className="btnrow"><button className="btn primary" type="submit">Submit for review</button></div>
        {msg && <div className="okmsg">{msg}</div>}
      </form>
    </div>
  );
}

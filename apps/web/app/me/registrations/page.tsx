'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

type Reg = {
  id: string;
  training: { id: string; title: string; slug: string; sessions: { startsAtUtc: string }[] };
};

export default function MyRegistrations() {
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/me/registrations', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => r.json())
      .then((j) => setRegs(j.registrations || []));
  }
  useEffect(load, []);

  async function cancel(id: string) {
    const access = getAccess();
    if (!access) return;
    const r = await fetch(`/api/registrations/${id}/cancel`, {
      method: 'POST', headers: { authorization: `Bearer ${access}` },
    });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error || 'Cancel failed');
    setMsg('Registration cancelled — seat freed.');
    load();
  }

  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Wudi 無敵</span>
        <nav><Link className="btn link" href="/">Home</Link></nav>
      </div>
      <h1>My seats.</h1>
      <p className="sub">Free cancel until the first session starts.</p>
      {msg && <div className="okmsg">{msg}</div>}
      <div style={{ marginTop: 18, display: 'grid', gap: 0 }}>
        {regs === null && <p className="muted">Log in to see your registrations.</p>}
        {regs !== null && regs.length === 0 && <p className="muted">No seats yet — go find a training.</p>}
        {regs?.map((r) => (
          <div className="rowitem" key={r.id} style={{ borderRadius: 16, marginBottom: 12 }}>
            <div>
              <p className="rtitle" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{r.training.title}</p>
              <p className="muted" style={{ margin: '2px 0 0' }}>{r.training.sessions[0] ? new Date(r.training.sessions[0].startsAtUtc).toUTCString() : ''}</p>
            </div>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Link className="btn" href={`/trainings/${r.training.id}`}>View</Link>
              <button className="btn" onClick={() => cancel(r.id)}>Cancel</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

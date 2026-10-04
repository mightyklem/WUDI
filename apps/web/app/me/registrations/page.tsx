'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

type Reg = {
  id: string;
  training: { id: string; title: string; slug: string; sessions: { startsAtUtc: string }[] };
};

type Progress = {
  presentCount: number; pct: number; remaining: number; atRisk: boolean; failed: boolean; minMet: boolean;
  training: { minPct: number; total: number };
  flags: { sessionId: string; present: boolean | null; upcoming: boolean }[];
};

export default function MyRegistrations() {
  const [regs, setRegs] = useState<Reg[] | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/me/registrations', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => r.json())
      .then((j) => {
        const list: Reg[] = j.registrations || [];
        setRegs(list);
        for (const r of list) {
          fetch(`/api/me/attendance?trainingId=${r.training.id}`, { headers: { authorization: `Bearer ${access}` } })
            .then((x) => x.json())
            .then((p) => setProgress((prev) => ({ ...prev, [r.training.id]: p })))
            .catch(() => {});
        }
      });
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

  async function requestCorrection(trainingId: string) {
    const p = progress[trainingId];
    if (!p) return;
    const target = p.flags.find((f) => f.present === false && !f.upcoming) || p.flags.find((f) => f.present === null && !f.upcoming);
    if (!target) return setMsg('Nothing to correct — all past sessions are marked present.');
    const note = prompt('What happened? (e.g. network dropped at 10:24, rejoined 10:31)') || '';
    const access = getAccess();
    if (!access) return;
    const r = await fetch('/api/attendance/correction-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ sessionId: target.sessionId, note }),
    });
    setMsg(r.ok ? 'Correction request sent to your trainer.' : 'Request failed.');
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
        {regs?.map((r) => {
          const p = progress[r.training.id];
          return (
          <div className="rowitem" key={r.id} style={{ borderRadius: 16, marginBottom: 12 }}>
            <div>
              <p className="rtitle" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{r.training.title}</p>
              <p className="muted" style={{ margin: '2px 0 0' }}>{r.training.sessions[0] ? new Date(r.training.sessions[0].startsAtUtc).toUTCString() : ''}</p>
              {p && (
                <p style={{ margin: '6px 0 0', fontSize: 14 }}>
                  {p.presentCount} of {p.training.total} sessions · {p.pct}% — need {p.training.minPct}%
                  {p.minMet ? ' ✓' : p.atRisk ? ' ⚠ at risk — join the next session!' : p.failed ? ' ✗ minimum missed' : ''}
                  {' '}<button className="btn link" style={{ minHeight: 0, padding: 0 }} onClick={() => requestCorrection(r.training.id)}>Request correction</button>
                </p>
              )}
            </div>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Link className="btn" href={`/trainings/${r.training.id}`}>View</Link>
              <button className="btn" onClick={() => cancel(r.id)}>Cancel</button>
            </span>
          </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { getAccess } from '@/lib/client-auth';

type Row = {
  userId: string; email: string;
  flags: { sessionId: string; present: boolean | null }[];
  presentCount: number; total: number; pct: number; minMet: boolean;
};
type Correction = { id: string; sessionId?: string; fromUserId?: string; note?: string; createdAt: string };

export default function AttendanceSection({ trainingId, sessionIds }: { trainingId: string; sessionIds: string[] }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [minPct, setMinPct] = useState(80);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch(`/api/trainings/${trainingId}/attendance`, { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return setRows(null);
        setRows(j.rows); setCorrections(j.correctionsPending || []); setMinPct(j.training.minPct);
      });
  }
  useEffect(load, [trainingId]);
  if (rows === null) return null; // not staff: section hidden

  async function override(sessionId: string, userId: string, present: boolean) {
    const reason = prompt(`Reason for marking ${present ? 'present' : 'absent'} (e.g. reconnect issue):`) || '';
    const access = getAccess();
    if (!access) return;
    const r = await fetch(`/api/sessions/${sessionId}/attendance`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ userId, present, reason }),
    });
    setMsg(r.ok ? 'Attendance corrected + logged.' : 'Correction failed (trainer/moderator only).');
    load();
  }

  return (
    <div>
      <h2 className="sec">Attendance</h2>
      <div className="card">
        <p className="eyebrow">Minimum {minPct}% · present = stayed 75%+ of a session</p>
        {rows.length === 0 && <p className="muted">No active registrations yet.</p>}
        {rows.map((r) => (
          <div key={r.userId} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)' }}>
            <b>{r.email}</b> — {r.presentCount}/{r.total} · {r.pct}% {r.minMet ? '✓ meets minimum' : '⚠ below minimum'}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {r.flags.map((f, i) => (
                <span key={f.sessionId} className="muted" style={{ fontSize: 13 }}>
                  S{i + 1}: {f.present === null ? '–' : f.present ? '✓' : '✗'}
                  {' '}<button className="btn link" style={{ minHeight: 0, padding: '0 2px' }} onClick={() => override(f.sessionId, r.userId, true)}>+present</button>
                  <button className="btn link" style={{ minHeight: 0, padding: '0 2px' }} onClick={() => override(f.sessionId, r.userId, false)}>absent</button>
                </span>
              ))}
            </div>
          </div>
        ))}
        {msg && <p className="muted">{msg}</p>}
      </div>
      {corrections.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="eyebrow">Correction requests ({corrections.length})</p>
          {corrections.map((c) => (
            <p key={c.id} style={{ fontSize: 14 }}>
              Session {sessionIds.indexOf(c.sessionId || '') + 1 || '?'} · from {c.fromUserId} · “{c.note}”
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

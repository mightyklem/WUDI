'use client';
import { useEffect, useState } from 'react';
import { getAccess } from '@/lib/client-auth';

type Row = {
  userId: string; email: string; pct: number; presentCount: number; total: number;
  minMet: boolean; paidOk: boolean; eligible: boolean;
  certificateNumber: string | null; certificateId: string | null;
};

export default function IssueCertificates({ trainingId }: { trainingId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch(`/api/trainings/${trainingId}/eligible`, { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setRows(j.rows));
  }
  useEffect(load, [trainingId]);
  if (rows === null) return null; // not staff

  async function issue(userIds: string[]) {
    const access = getAccess();
    if (!access) return;
    const r = await fetch(`/api/trainings/${trainingId}/certificates/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ userIds }),
    });
    const j = await r.json();
    setMsg(r.ok ? `Issued ${j.issued.length}, rejected ${j.rejected.length}.` : (j.error || 'Issue failed'));
    load();
  }

  async function revoke(row: Row) {
    if (!row.certificateId) return;
    if (!confirm(`Revoke certificate for ${row.email}? It will show as revoked online.`)) return;
    const reason = prompt('Revocation reason (recorded in audit log):') || '';
    const access = getAccess();
    if (!access) return;
    const r = await fetch(`/api/certificates/${row.certificateId}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ reason }),
    });
    setMsg(r.ok ? 'Certificate revoked.' : 'Revoke failed.');
    load();
  }

  const eligible = rows.filter((r) => r.eligible && !r.certificateNumber);
  return (
    <div>
      <h2 className="sec">Certificates</h2>
      <div className="card">
        <p className="eyebrow">Only eligible participants can be certified — ineligible are rejected per-user.</p>
        {rows.length === 0 && <p className="muted">No active registrations yet.</p>}
        {rows.map((r) => (
          <div key={r.userId} style={{ padding: '8px 0', borderTop: '1px solid var(--pill)', fontSize: 14 }}>
            <b>{r.email}</b> — {r.presentCount}/{r.total} · {r.pct}% {r.minMet ? '✓' : '✗'}
            {!r.paidOk && ' · unpaid'} {r.certificateNumber ? (
              <>· 🏅 {r.certificateNumber} <button className="btn link" style={{ minHeight: 0, padding: 0 }} onClick={() => revoke(r)}>Revoke</button></>
            ) : r.eligible ? (
              <> · <button className="btn link" style={{ minHeight: 0, padding: 0 }} onClick={() => issue([r.userId])}>Issue</button></>
            ) : ' · ineligible'}
          </div>
        ))}
        {eligible.length > 1 && (
          <div className="btnrow"><button className="btn primary" onClick={() => issue(eligible.map((r) => r.userId))}>Issue all eligible ({eligible.length})</button></div>
        )}
        {msg && <p className="muted">{msg}</p>}
      </div>
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

type Blocker = { code: string; message: string };
type Row = {
  id: string; amountNet: number; trainerName: string; trainingTitle: string;
  ready: boolean; blockers: Blocker[];
  account: { bankName: string; accountLast4: string; accountName: string } | null;
};
type Queue = { queue: Row[]; balanceNgn: number | null; balanceKnown: boolean; minPayoutNgn: number };

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export default function AdminPayouts() {
  const [data, setData] = useState<Queue | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const access = getAccess();
    if (!access) return;
    const r = await fetch('/api/admin/payouts', { headers: { authorization: `Bearer ${access}` } });
    if (r.ok) setData(await r.json());
    else setErr('Could not load payouts.');
  }, []);

  useEffect(() => { load(); }, [load]);

  async function release(id: string) {
    setBusy(id);
    setMsg(null);
    setErr(null);
    const access = getAccess();
    try {
      const r = await fetch('/api/admin/payouts/release', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ payoutId: id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(`${j.error || 'Release failed.'}${j.code ? ` (${j.code})` : ''}`);
        // Reload regardless: a failed release still changed the row to 'failed'.
        await load();
        return;
      }
      setMsg(`Released. Transfer reference ${j.transferRef}.`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <span className="logo">Learnovize</span>
        <nav>
          <Link className="btn link" href="/">Home</Link>
          <Link className="btn link" href="/admin">Admin</Link>
        </nav>
      </div>

      <h1>Payouts.</h1>
      <p className="sub">
        Money leaves only when you release it. Each transfer is confirmed by Paystack
        before a trainer is told they have been paid.
      </p>

      {data && (
        <p className="muted" style={{ fontSize: 14 }}>
          Available balance:{' '}
          {data.balanceKnown && data.balanceNgn !== null ? naira(data.balanceNgn) : 'could not be read'}
          {' · '}minimum release {naira(data.minPayoutNgn)}
        </p>
      )}

      {msg && <p className="okmsg">{msg}</p>}
      {err && <p className="err">{err}</p>}

      <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        {!data && <p className="muted">Loading…</p>}
        {data?.queue.length === 0 && (
          <p className="muted">Nothing waiting. Payouts appear once their hold period passes.</p>
        )}
        {data?.queue.map((row) => (
          <div key={row.id} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{naira(row.amountNet)}</div>
              <div style={{ fontSize: 14 }}>{row.trainerName}</div>
              <div className="muted" style={{ fontSize: 13 }}>{row.trainingTitle}</div>
              {row.account ? (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {row.account.accountName} · {row.account.bankName} · ending {row.account.accountLast4}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>No payout account on file</div>
              )}
              {row.blockers.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                  {row.blockers.map((b) => (
                    <li key={b.code} style={{ color: '#8C5A2F' }}>{b.message}</li>
                  ))}
                </ul>
              )}
            </div>
            <button
              className="btn primary"
              disabled={!row.ready || busy === row.id}
              onClick={() => release(row.id)}
              title={row.ready ? 'Send this money' : 'Resolve the blockers first'}
            >
              {busy === row.id ? 'Sending…' : 'Release'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
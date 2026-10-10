'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

type Row = {
  trainingId: string; title: string; plan: string; sales: number;
  gross: number; providerFees: number; commission: number; net: number;
  payouts: { id: string; amountNet: number; status: string; holdUntil: string | null }[];
};

export default function Earnings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState({ gross: 0, fees: 0, commission: 0, net: 0 });
  const [plan, setPlan] = useState('free');
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    const access = getAccess();
    if (!access) return;
    fetch('/api/trainer/earnings', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) { setRows(j.rows); setTotals(j.totals); setPlan(j.plan); } });
  }
  useEffect(load, []);
  if (rows === null) return <div className="wrap"><p className="muted">Log in as a trainer to see earnings.</p></div>;

  async function upgrade(p: string) {
    const access = getAccess();
    if (!access) return;
    const r = await fetch('/api/trainer/plan', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
      body: JSON.stringify({ plan: p }),
    });
    setMsg(r.ok ? `Plan is now ${p} (dev upgrade — recurring billing lands before launch).` : 'Upgrade failed.');
    load();
  }

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Earnings.</h1>
      <p className="sub">Plan: <b>{plan}</b> (Free 5% · Pro 3% · Business 1%) — provider fees shown separately.</p>
      <div className="btnrow">
        {plan !== 'pro' && <button className="btn" onClick={() => upgrade('pro')}>Upgrade to Pro</button>}
        {plan !== 'business' && <button className="btn" onClick={() => upgrade('business')}>Upgrade to Business</button>}
      </div>
      {msg && <div className="okmsg">{msg}</div>}
      <div className="card" style={{ marginTop: 18 }}>
        <p className="eyebrow">Totals — gross ₦{totals.gross} · fees ₦{totals.fees} · commission ₦{totals.commission} · net ₦{totals.net}</p>
        {rows.length === 0 && <p className="muted">No paid sales yet.</p>}
        {rows.map((r) => (
          <div key={r.trainingId} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)', fontSize: 14 }}>
            <b>{r.title}</b> [{r.plan}] — {r.sales} sale(s): gross ₦{r.gross}, fees ₦{r.providerFees}, commission ₦{r.commission}, <b>net ₦{r.net}</b>
            {r.payouts.map((p) => (
              <span key={p.id} className="muted"> · payout ₦{p.amountNet} ({p.status}{p.holdUntil ? ` until ${new Date(p.holdUntil).toUTCString().slice(0, 16)}` : ''})</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';
import StandingPanel from '../../components/StandingPanel';

type Row = {
  trainingId: string; title: string; plan: string; sales: number;
  gross: number; providerFees: number; commission: number; net: number;
  payouts: { id: string; amountNet: number; status: string; holdUntil: string | null }[];
};
type Balance = {
  dueNgn: number; dueCount: number; waitingNgn: number; waitingCount: number;
  shortByNgn: number; ready: boolean; nextReleaseAt: string | null;
};

export default function Earnings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState({ gross: 0, fees: 0, commission: 0, net: 0 });
  const [plan, setPlan] = useState('free');
  const [balance, setBalance] = useState<Balance | null>(null);
  // Whether there is somewhere to send the money. Worth saying, because a balance
  // with no account on file is money that is being kept and not paid.
  const [accountOnFile, setAccountOnFile] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  // Why nothing is on screen yet: 'login' (signed out), 'loading', or the
  // API's own answer ('not-a-trainer', 'expired', ...). The old code showed
  // "Log in as a trainer" for all three, so a signed-in trainer whose fetch
  // failed was told to log in — which fixed nothing and explained nothing.
  const [gate, setGate] = useState<'loading' | 'login' | { error: string } | null>(null);

  function load() {
    const access = getAccess();
    if (!access) {
      setGate('login');
      return;
    }
    setGate('loading');
    authFetch('/api/trainer/earnings', { headers: { authorization: `Bearer ${access}` } })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setGate({ error: j.error || 'Could not load earnings.' });
          return null;
        }
        return r.json();
      })
      .then((j) => {
        if (!j) return;
        setGate(null);
        setRows(j.rows);
        setTotals(j.totals);
        setPlan(j.plan);
        if (j.balance) setBalance(j.balance);
      })
      .catch(() => setGate({ error: 'Could not load earnings. Check your connection.' }));
    authFetch('/api/trainer/payout-account', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setAccountOnFile(!!j.account); });
  }
  useEffect(load, []);
  if (gate === 'login') {
    return (
      <div className="wrap">
        <SiteNav />
        <h1>Earnings.</h1>
        <p className="sub">Your class sales, fees and payouts live here.</p>
        <div className="btnrow">
          <Link className="btn primary" href="/login">Log in</Link>
          <Link className="btn" href="/onboarding">Become a trainer</Link>
        </div>
      </div>
    );
  }
  if (gate !== null) {
    return (
      <div className="wrap">
        <SiteNav />
        <h1>Earnings.</h1>
        <p className="muted">{gate === 'loading' ? 'Loading your earnings…' : gate.error}</p>
        {gate !== 'loading' && (
          <div className="btnrow">
            <button className="btn" onClick={load}>Try again</button>
          </div>
        )}
      </div>
    );
  }
  if (rows === null) return <div className="wrap"><SiteNav /><p className="muted">Loading your earnings…</p></div>;

  async function upgrade(p: string) {
    const access = getAccess();
    if (!access) return;
    const r = await authFetch('/api/trainer/plan', {
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
      <p className="sub">
        Plan: <b>{plan}</b> &mdash; Learnovize takes 25% and you keep 75%, with provider
        fees shown separately. Everything you earn adds up, and the whole balance is
        released once it reaches the release minimum.
      </p>
      <div className="btnrow">
        {plan !== 'pro' && <button className="btn" onClick={() => upgrade('pro')}>Upgrade to Pro</button>}
        {plan !== 'business' && <button className="btn" onClick={() => upgrade('business')}>Upgrade to Business</button>}
      </div>
      {msg && <div className="okmsg">{msg}</div>}

      {/* Standing sits above the money because it is the other half of the same question.
          A trainer's rank was already being computed and awarded -- from reviews, and now
          from classes they actually taught -- and had never been rendered anywhere on the
          trainer's side. */}
      <StandingPanel title="Check your points" />

      {/* The balance. Everything earned across every class, added up, and how far it
          is from being released. A trainer earning a little at a time should be able
          to see that the little is being kept rather than lost. */}
      {balance && balance.dueNgn > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="eyebrow">Waiting to be paid</p>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--t-2xl)', fontWeight: 800 }}>
            ₦{balance.dueNgn.toLocaleString('en-NG')}
          </p>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>
            {balance.ready
              ? 'This is enough to be released. An admin sends it to your payout account.'
              : `₦${balance.shortByNgn.toLocaleString('en-NG')} more and it is released. ` +
                'Everything you earn adds up, so it does not have to be one big class.'}
          </p>
          {balance.waitingNgn > 0 && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>
              ₦{balance.waitingNgn.toLocaleString('en-NG')} is still inside its hold period
              {balance.nextReleaseAt ? ` until ${balance.nextReleaseAt.slice(0, 10)}` : ''}.
            </p>
          )}
          {!accountOnFile && (
            <p style={{ margin: '10px 0 0', fontSize: 'var(--t-sm)', color: 'var(--clay-ink)' }}>
              There is no payout account on file yet, so there is nowhere to send it.
            </p>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <p className="eyebrow">Totals — gross ₦{totals.gross} · fees ₦{totals.fees} · commission ₦{totals.commission} · net ₦{totals.net}</p>
        {rows.length === 0 && <p className="muted">No paid sales yet.</p>}
        {rows.map((r) => (
          <div key={r.trainingId} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)', fontSize: 'var(--t-sm)' }}>
            <b>{r.title}</b> [{r.plan}] — {r.sales} sale(s): gross ₦{r.gross}, fees ₦{r.providerFees}, commission ₦{r.commission}, <b>net ₦{r.net}</b>
            {r.payouts.map((p) => (
              <span key={p.id} className="muted"> · payout ₦{p.amountNet} ({p.status}{p.holdUntil ? ` until ${new Date(p.holdUntil).toUTCString().slice(0, 16)}` : ''})</span>
            ))}
          </div>
        ))}
      </div>

      {/* Where the money is sent. This is the one link a trainer who is owed money
          needs, and it was not on this page or anywhere else. */}
      <div className="card" style={{ marginTop: 18 }}>
        <p className="u-h-md">Where you get paid</p>
        <p className="muted" style={{ fontSize: 'var(--t-sm)', margin: '4px 0 0' }}>
          Your bank account has to be on file before anything can be released. We check
          the number against your bank and show you the name it belongs to.
        </p>
        <div className="btnrow">
          <Link href="/trainer/payout-settings" className="btn primary">Your payout account</Link>
        </div>
      </div>
    </div>
  );
}

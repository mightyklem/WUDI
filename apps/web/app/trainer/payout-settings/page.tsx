'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess } from '@/lib/client-auth';

type Bank = { code: string; name: string };
type Account = {
  bankCode: string; bankName: string; accountName: string;
  accountLast4: string; verified: boolean; hasRecipient: boolean;
} | null;

export default function PayoutSettings() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [account, setAccount] = useState<Account>(null);
  const [bankCode, setBankCode] = useState('');
  const [number, setNumber] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const access = typeof window !== 'undefined' ? getAccess() : null;

  useEffect(() => {
    if (!access) return;
    fetch('/api/trainer/payout-account', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setAccount(j.account);
        if (j.account) setBankCode(j.account.bankCode);
      });
    fetch('/api/trainer/payout-account/banks', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.banks) setBanks(j.banks);
        else if (j?.error) setErr(j.error);
      });
  }, [access]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await fetch('/api/trainer/payout-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({
          bankCode,
          bankName: banks.find((b) => b.code === bankCode)?.name,
          accountNumber: number,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || 'Could not save that account.');
        return;
      }
      setAccount(j.account);
      setNumber('');
      setMsg('Saved. An admin reviews payouts, and yours is now on file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <span className="logo">Learnovize</span>
        <nav>
          <Link className="btn link" href="/">Home</Link>
          <Link className="btn link" href="/trainer/earnings">Earnings</Link>
        </nav>
      </div>

      <h1>Where to get paid.</h1>
      <p className="sub">
        We hold your earnings until the class has finished, then an admin releases them to
        the account below.
      </p>

      {account && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--line-2, #E7E0D5)' }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>On file</p>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{account.accountName}</p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>
            {account.bankName} · ending {account.accountLast4}
          </p>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
            {account.verified
              ? '✓ Verified with your bank'
              : 'Not yet verified — payouts are held until this is confirmed.'}
          </p>
        </div>
      )}

      <form onSubmit={save} className="card" style={{ marginTop: 14, maxWidth: 520 }}>
        <p className="eyebrow">{account ? 'Change account' : 'Add your account'}</p>

        <label className="fl">Bank</label>
        <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} required>
          <option value="">Choose your bank…</option>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>{b.name}</option>
          ))}
        </select>
        {banks.length === 0 && (
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Loading banks…
          </p>
        )}

        <label className="fl">Account number</label>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0123456789"
          required
          maxLength={13}
        />
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          We check this against your bank and show you the name it belongs to before
          saving. Your number is stored encrypted.
        </p>

        <div className="btnrow" style={{ marginTop: 14 }}>
          <button className="btn primary" type="submit" disabled={busy || !bankCode || !number}>
            {busy ? 'Checking…' : 'Verify and save'}
          </button>
        </div>

        {msg && <p className="okmsg" style={{ marginTop: 12 }}>{msg}</p>}
        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
      </form>
    </div>
  );
}
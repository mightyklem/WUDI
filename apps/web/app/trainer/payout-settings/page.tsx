'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

type Bank = { code: string; name: string };
type NameCheck = { result: 'match' | 'partial' | 'mismatch' | 'unknown'; detail: string };
type Account = {
  bankCode: string; bankName: string; accountName: string;
  accountLast4: string; verified: boolean; hasRecipient: boolean;
  holderType: string; nameOnFile: string | null; nameCheck: NameCheck;
} | null;

export default function PayoutSettings() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [account, setAccount] = useState<Account>(null);
  const [bankCode, setBankCode] = useState('');
  const [number, setNumber] = useState('');
  // Whose account this is. A business account is registered in the name of the
  // business, which is not the trainer's name, and saying which it is keeps that from
  // looking like something is wrong.
  const [holderType, setHolderType] = useState<'personal' | 'business'>('personal');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const access = typeof window !== 'undefined' ? getAccess() : null;

  useEffect(() => {
    if (!access) return;
    authFetch('/api/trainer/payout-account', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setAccount(j.account);
        if (j.account) setBankCode(j.account.bankCode);
      });
    authFetch('/api/trainer/payout-account/banks', { headers: { authorization: `Bearer ${access}` } })
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
      const r = await authFetch('/api/trainer/payout-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({
          bankCode,
          bankName: banks.find((b) => b.code === bankCode)?.name,
          accountNumber: number,
          holderType,
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
      <SiteNav />

      <h1>Where to get paid.</h1>
      <p className="sub">
        We hold your earnings until the class has finished, then an admin releases them to
        the account below. Everything you earn adds up, and the whole balance is sent
        once it is worth sending.
      </p>

      {account && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--line-2)' }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>On file</p>
          <p style={{ margin: 0, fontSize: 'var(--t-md)', fontWeight: 700 }}>{account.accountName}</p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 'var(--t-sm)' }}>
            {account.bankName} · ending {account.accountLast4}
            {account.holderType === 'business' ? ' · business account' : ''}
          </p>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 'var(--t-sm)' }}>
            {account.verified
              ? '✓ Verified with your bank'
              : 'Not yet verified — payouts are held until this is confirmed.'}
          </p>

          {/* The name the bank gave for this account, and the name we have for you.
              If the two are not the same, an admin has to look at it before the money
              moves -- so it is far better that it is said here, where it can be
              fixed in a minute, than there, where it is a delay. A business account
              is in the name of the business, so it is expected to be different. */}
          {account.nameCheck && account.nameCheck.result !== 'match' && (
            <div
              style={{
                marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-sm)',
                background: account.nameCheck.result === 'mismatch' ? 'var(--clay-soft)' : 'var(--gold-soft)',
                border: `1px solid ${account.nameCheck.result === 'mismatch' ? 'var(--bad-line)' : 'var(--warn-line)'}`,
              }}
            >
              <p style={{ margin: 0, fontSize: 'var(--t-sm)', fontWeight: 800, color: account.nameCheck.result === 'mismatch' ? 'var(--clay-ink)' : 'var(--gold-ink)' }}>
                {account.holderType === 'business'
                  ? 'This is a business account.'
                  : account.nameCheck.result === 'mismatch'
                    ? 'This account is in a different name.'
                    : 'This account is in a slightly different name.'}
              </p>
              {account.holderType === 'business' ? (
                <p style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
                  Your bank has it as <b>{account.accountName}</b>. That is the business,
                  not you, so it does not have to match the name on your account.
                </p>
              ) : (
                <>
                  <p style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
                    Your bank says <b>{account.accountName}</b>. Your name on Learnovize is{' '}
                    <b>{account.nameOnFile || 'not set'}</b>.
                  </p>
                  <p className="muted" style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)' }}>
                    {account.nameCheck.detail} Payouts are held while a personal account
                    is in a different name, so it is worth fixing now — add the name your
                    bank uses to your account details, or use an account in your own name.
                  </p>
                  <Link href="/me/account" className="btn" style={{ marginTop: 10 }}>
                    Update the name on your account
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={save} className="card" style={{ marginTop: 14, maxWidth: 520 }}>
        <p className="eyebrow">{account ? 'Change account' : 'Add your account'}</p>

        {/* Whose account it is. A business account is registered in the name of the
            business, which is not the trainer's own name, and saying so keeps that
            from looking like a mistake later. */}
        <label className="fl">Whose account is it?</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {([
            { value: 'personal' as const, label: 'My own name', note: 'The account is in your name.' },
            { value: 'business' as const, label: 'A business', note: 'The account is in the name of your business or company.' },
          ]).map((o) => (
            <label
              key={o.value}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                padding: '12px 14px', borderRadius: 'var(--r-sm)',
                border: `1px solid ${holderType === o.value ? 'var(--accent-mark)' : 'var(--line)'}`,
                background: holderType === o.value ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="holderType"
                value={o.value}
                checked={holderType === o.value}
                onChange={() => setHolderType(o.value)}
                style={{ marginTop: 3, accentColor: 'var(--accent)' }}
              />
              <span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--t-sm)' }}>{o.label}</span>
                <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{o.note}</span>
              </span>
            </label>
          ))}
        </div>

        <label className="fl" style={{ marginTop: 14 }}>Bank</label>

        <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} required>
          <option value="">Choose your bank…</option>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>{b.name}</option>
          ))}
        </select>
        {banks.length === 0 && (
          <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>
            Loading banks…
          </p>
        )}

        <label className="fl">Account number</label>
        <input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="0123456789"
          required
          maxLength={13}
        />
        <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>
          We check this against your bank and show you the name it belongs to before
          saving. Your number is stored encrypted.
          {holderType === 'business' && ' We will ask for a bank statement in the business name, so an admin can confirm the account is yours.'}
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
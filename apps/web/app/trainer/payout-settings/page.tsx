'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch, getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

type Bank = { code: string; name: string };
type NameCheck = { result: 'match' | 'partial' | 'mismatch' | 'unknown'; detail: string };
type Account = {
  bankCode: string; bankName: string; accountName: string;
  declaredName: string | null; accountLast4: string;
  verified: boolean; hasRecipient: boolean; hasStatement: boolean;
  holderType: string; nameOnFile: string | null; nameCheck: NameCheck;
} | null;

export default function PayoutSettings() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [account, setAccount] = useState<Account>(null);
  const [bankCode, setBankCode] = useState('');
  const [number, setNumber] = useState('');
  // The name the trainer gives the account. They are the one who knows it: a business
  // account is in the name of the business, and a bank writes a name its own way.
  const [declaredName, setDeclaredName] = useState('');
  // A statement in the name of the account, for a business account.
  const [statementFile, setStatementFile] = useState<File | null>(null);
  // Whether this deployment can seal an account number at all.
  const [configured, setConfigured] = useState(true);
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
        setConfigured(j.configured !== false);
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
      // The statement is uploaded first, and the account is saved with it. A business
      // account is in the name of the business, so the statement that shows the account
      // is the trainer's has to be in that name too, and an admin can only confirm it
      // if it is there.
      let statementKey: string | undefined;
      if (statementFile) {
        const form = new FormData();
        form.append('file', statementFile);
        form.append('kind', 'accountstatement');
        const up = await authFetch('/api/uploads', {
          method: 'POST',
          headers: { authorization: `Bearer ${access}` },
          body: form,
        });
        const uj = await up.json().catch(() => ({}));
        if (!up.ok) {
          setErr(uj.error || 'That statement could not be uploaded.');
          return;
        }
        statementKey = uj.key;
      }

      const r = await authFetch('/api/trainer/payout-account', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({
          bankCode,
          bankName: banks.find((b) => b.code === bankCode)?.name,
          accountNumber: number,
          holderType,
          declaredName,
          statementKey,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || 'Could not save that account.');
        return;
      }
      setAccount(j.account);
      setNumber('');
      setStatementFile(null);
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

      {!configured && (
        <div className="board board-bad" style={{ marginTop: 14 }}>
          <p className="board-tag">Not available right now</p>
          <p style={{ margin: 0, fontSize: 'var(--t-sm)' }}>
            Payouts are not configured on this deployment, so an account cannot be saved yet.
            Nothing you have entered has been lost — try again shortly, and let us know
            if it keeps happening.
          </p>
        </div>
      )}

      {account && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--line-2)' }}>
          <p className="eyebrow" style={{ marginBottom: 6 }}>On file</p>
          <p style={{ margin: 0, fontSize: 'var(--t-md)', fontWeight: 700 }}>
            {account.declaredName || account.accountName}
          </p>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 'var(--t-sm)' }}>
            {account.bankName} · ending {account.accountLast4}
            {account.holderType === 'business' ? ' · business account' : ''}
          </p>
          {account.declaredName && account.declaredName !== account.accountName && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>
              Your bank has this account as <b>{account.accountName}</b>.
            </p>
          )}
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 'var(--t-sm)' }}>
            {account.verified
              ? '✓ Verified with your bank'
              : 'Not yet verified — payouts are held until this is confirmed.'}
          </p>
          {account.holderType === 'business' && (
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}>
              {account.hasStatement
                ? '✓ A statement in the business name is on file.'
                : 'No statement in the business name yet. An admin reads one to confirm the account is yours, so it is worth adding it below.'}
            </p>
          )}

          {/* The name they gave, against the name the bank has. This is a check of
              their own claim and not a demand that the account be in the name they
              signed up with -- a business account is in the name of the business,
              and a bank writes a name its own way. */}
          {account.nameCheck && account.nameCheck.result === 'mismatch' && (
            <div
              style={{
                marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-sm)',
                background: 'var(--clay-soft)', border: '1px solid var(--bad-line)',
              }}
            >
              <p style={{ margin: 0, fontSize: 'var(--t-sm)', fontWeight: 800, color: 'var(--clay-ink)' }}>
                Your bank has this account under a different name.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>
                You said <b>{account.declaredName}</b>. Your bank says <b>{account.accountName}</b>.
              </p>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 'var(--t-sm)' }}>
                {account.nameCheck.detail} Payouts wait while the name given is not the
                name the account is in, so it is worth changing below. If the account
                really is in another name, give that name instead.
              </p>
            </div>
          )}
          {account.nameCheck && account.nameCheck.result === 'partial' && (
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 'var(--t-sm)' }}>
              {account.nameCheck.detail}
            </p>
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
          We check the number against your bank and show you the name it belongs to before
          saving. Your number is stored encrypted.
        </p>

        {/* The name the account is in. The trainer is the one who knows it: a business
            account is in the name of the business, and a bank writes a name its own
            way. So they state it, and it is checked against what the bank says. */}
        <label className="fl">The name on this account</label>
        <input
          type="text"
          value={declaredName}
          onChange={(e) => setDeclaredName(e.target.value)}
          placeholder={holderType === 'business' ? 'MKO Solar Ltd' : 'Augustine Okafor'}
          maxLength={120}
          required
          autoComplete="off"
        />
        <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>
          The name your bank has this account under. It does not have to be the name you
          signed up with — a business account is in the name of the business. We check it
          against your bank, so if the two do not agree we will tell you before anything
          is sent.
        </p>

        {/* A business account is in the name of the business, so the statement that
            shows the account is the trainer's has to be in that name. It is asked for
            here, where the account is, because the account may not exist yet at the
            point they are approved. */}
        {holderType === 'business' && (
          <>
            <label className="fl">A bank statement in the business name</label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              onChange={(e) => setStatementFile(e.target.files?.[0] || null)}
            />
            <p className="muted" style={{ fontSize: 'var(--t-sm)', marginTop: 6 }}>
              {account?.hasStatement
                ? 'You have already supplied one. A new one will replace it.'
                : 'A statement from the account you want to be paid into, in the name of the business. An admin reads it to confirm the account is yours. It is stored privately, and every staff view of it is recorded.'}
            </p>
          </>
        )}

        <div className="btnrow" style={{ marginTop: 14 }}>
          <button className="btn primary" type="submit" disabled={busy || !bankCode || !number || !declaredName.trim()}>
            {busy ? 'Checking…' : 'Verify and save'}
          </button>
        </div>


        {msg && <p className="okmsg" style={{ marginTop: 12 }}>{msg}</p>}
        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
      </form>
    </div>
  );
}
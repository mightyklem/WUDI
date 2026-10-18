'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccess, clearSession } from '@/lib/client-auth';

export default function DeleteAccount() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The name on your certificates, editable without touching anything else.
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);

  useEffect(() => {
    const access = getAccess();
    if (!access) return;
    fetch('/api/me', { headers: { authorization: `Bearer ${access}` }, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.user?.fullName !== undefined) setName(j.user.fullName ?? '');
      })
      .catch(() => undefined);
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    setNameMsg(null);
    setNameErr(null);
    try {
      const r = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${getAccess() ?? ''}` },
        body: JSON.stringify({ fullName: name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNameErr(j.error || 'Could not save your name.'); return; }
      setName(j.user?.fullName ?? '');
      setNameMsg('Saved. Certificates you earn from now on will use this.');
    } catch {
      setNameErr('Could not reach the server.');
    } finally {
      setSavingName(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    const access = getAccess();
    try {
      const r = await fetch('/api/me', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j.error || 'Could not delete the account.');
        return;
      }
      clearSession();
      setMsg(
        'Your account has been erased. This cannot be undone. ' +
          (j.undeletedDocuments?.length
            ? 'Some stored documents could not be deleted and have been logged for manual removal.'
            : ''),
      );
      setPw('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card" style={{ marginTop: 12 }}>
        <h2 className="sec">Your details</h2>
        <p className="muted" style={{ fontSize: 14 }}>
          This is the name printed on every certificate you earn. Get it right — it goes
          straight onto a document you may show an employer.
        </p>
        <form onSubmit={saveName} style={{ maxWidth: 420 }}>
          <label className="fl">Full name</label>
<input
                type="text"
                value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As it should appear on your certificate"
            autoComplete="name"
          />
          <div className="btnrow">
            <button className="btn primary" type="submit" disabled={savingName}>
              {savingName ? 'Saving…' : 'Save name'}
            </button>
          </div>
          {nameMsg && <div className="okmsg">{nameMsg}</div>}
          {nameErr && <div className="err">{nameErr}</div>}
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            A certificate already issued keeps the name it was issued with. If yours is
            wrong, ask the trainer to reissue it — the record keeps what happened.
          </p>
        </form>
      </div>

    <div className="card" style={{ marginTop: 12, borderColor: 'var(--bad-line)' }}>
      <h2 className="sec" style={{ color: 'var(--bad)' }}>Delete my account</h2>
      <p className="muted" style={{ fontSize: 14 }}>
        Under the NDPA you can ask us to erase your account. Your email, phone, password,
        identity documents and published posts are destroyed, and you are signed out
        everywhere. Payment records are kept in anonymised form because we are required
        to retain them — they can no longer be linked to you.
      </p>
      <p className="muted" style={{ fontSize: 14 }}>
        This cannot be undone. Certificates you already earned are revoked with the
        account.
      </p>

      {msg ? (
        <div className="okmsg">{msg}</div>
      ) : (
        <form onSubmit={submit} style={{ maxWidth: 420 }}>
          <label className="fl">Confirm your password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button className="btn" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}
              type="submit" disabled={busy}>
              {busy ? 'Erasing…' : 'Permanently delete my account'}
            </button>
          </div>
          {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
        </form>
      )}
<p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
          Changed your mind? <Link href="/">Back to Learnovize</Link>
        </p>
      </div>
    </>
    );
  }
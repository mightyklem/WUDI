'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getAccess, clearSession } from '@/lib/client-auth';

export default function DeleteAccount() {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="card" style={{ marginTop: 12, borderColor: '#E4C7C7' }}>
      <h2 className="sec" style={{ color: '#8C2F2F' }}>Delete my account</h2>
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
            <button className="btn" style={{ borderColor: '#8C2F2F', color: '#8C2F2F' }}
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
  );
}
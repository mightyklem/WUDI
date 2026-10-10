'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// useSearchParams needs a Suspense boundary during prerender.
function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== confirm) return setMsg('Those passwords do not match.');
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error || 'Could not reset the password.');
        return;
      }
      setMsg('Password changed. You have been signed out everywhere — log in with the new one.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="card" style={{ marginTop: 14, maxWidth: 460 }}>
        <p className="muted" style={{ margin: 0 }}>
          This page needs a reset link.{' '}
          <Link href="/forgot-password" className="btn link">Request a new one</Link>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card" style={{ marginTop: 14, maxWidth: 460 }}>
      <label className="fl">New password</label>
      <input
        type="password"
        required
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
      />
      <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
        At least 8 characters, mixing letters and numbers.
      </p>
      <label className="fl">Type it again</label>
      <input
        type="password"
        required
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Set new password'}
        </button>
      </div>
      {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
    </form>
  );
}

export default function ResetPassword() {
  return (
    <div className="wrap">
      <div className="topbar">
        <span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/login">Back to login</Link></nav>
      </div>
      <h1>Choose a new password.</h1>
      <p className="sub">This signs you out on every device, in case someone else had access.</p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
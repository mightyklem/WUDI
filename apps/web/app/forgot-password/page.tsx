'use client';
import { useState } from 'react';
import Link from 'next/link';
import SiteNav from '../components/SiteNav';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) {
        setMsg('Too many attempts. Wait an hour and try again.');
        return;
      }
      // Deliberately the same sentence whether or not the account exists. Saying
      // "no account with that email" would confirm who is registered here.
      setMsg(j.error || 'If that email has an account, a reset link is on its way. It expires in 30 minutes.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <SiteNav />
      <h1>Forgot your password?</h1>
      <p className="sub">We will email you a link to set a new one.</p>

      <form onSubmit={submit} className="card" style={{ marginTop: 14, maxWidth: 460 }}>
        <label className="fl">Email address</label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="btnrow" style={{ marginTop: 12 }}>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </div>
        {msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}
      </form>
    </div>
  );
}
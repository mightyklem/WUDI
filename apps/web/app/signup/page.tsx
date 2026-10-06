'use client';
import { useState } from 'react';
import Link from 'next/link';
import { saveSession } from '@/lib/client-auth';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const r = await fetch('/api/auth/signup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error || 'Signup failed' });
    setStage('verify');
    setMsg({ ok: true, text: `We sent a 6-digit code to ${j.user.email}. It expires in 15 minutes.` });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const r = await fetch('/api/auth/verify-email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      return setMsg({
        ok: false,
        text: j.attemptsLeft ? `${j.error} — ${j.attemptsLeft} attempts left` : j.error,
      });
    }
    saveSession(j.access, j.refresh);
    setMsg({ ok: true, text: 'Email confirmed. You are logged in.' });
  }

  async function resend() {
    setMsg(null);
    await fetch('/api/auth/resend-verification', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setMsg({ ok: true, text: 'If that address needs confirming, a new code is on its way.' });
  }

  if (stage === 'verify') {
    return (
      <div className="wrap">
        <h1>Confirm your email.</h1>
        <p className="sub">One code, then you are in. Check spam if it has not arrived in a minute.</p>
        <form onSubmit={verify} className="card" style={{ marginTop: 18 }}>
          <label className="fl">6-digit code</label>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            style={{ letterSpacing: 6, fontSize: 20 }}
          />
          <div className="btnrow">
            <button className="btn primary" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Confirm email'}
            </button>
            <button className="btn link" type="button" onClick={resend}>Resend code</button>
          </div>
          {msg && (
            <div className={msg.ok ? 'okmsg' : 'err'}>
              {msg.text}
              {msg.ok && msg.text.startsWith('Email confirmed') && (
                <> <Link href="/onboarding">Continue: become a trainer →</Link></>
              )}
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Sign up.</h1>
      <p className="sub">Every account can attend. Complete a trainer profile to host.</p>
      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <label className="fl">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label className="fl">Password (8+ chars)</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="btnrow">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          <Link className="btn link" href="/login">Have an account? Log in</Link>
        </div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
      </form>
    </div>
  );
}
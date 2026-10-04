'use client';
import { useState } from 'react';
import Link from 'next/link';
import { saveSession } from '@/lib/client-auth';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const r = await fetch('/api/auth/signup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) return setMsg({ ok: false, text: j.error || 'Signup failed' });
    saveSession(j.access, j.refresh);
    setMsg({ ok: true, text: 'Account created. You are logged in.' });
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
        <div className="btnrow"><button className="btn primary" type="submit">Create account</button>
        <Link className="btn link" href="/login">Have an account? Log in</Link></div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}{msg.ok && <> <Link href="/onboarding">Continue: become a trainer →</Link></>}</div>}
      </form>
    </div>
  );
}

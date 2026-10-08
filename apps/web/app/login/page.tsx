'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/client-auth';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setNeedsVerify(false);
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) {
      if (j.verificationRequired) setNeedsVerify(true);
      return setMsg({ ok: false, text: j.error || 'Login failed' });
    }
    saveSession(j.access, j.refresh);
    setMsg({ ok: true, text: 'Logged in.' });
    // Straight into the app, on the right home for their role.
    router.push('/dashboard');
  }
  async function resend() {
    await fetch('/api/auth/resend-verification', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setMsg({ ok: true, text: 'If that address needs confirming, a new code is on its way.' });
  }
  return (
    <div className="wrap">
      <h1>Log in.</h1>
      <p className="sub">Welcome back to Learnovize.</p>
      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <label className="fl">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="fl">Password</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="btnrow"><button className="btn primary" type="submit">Log in</button>
        <Link className="btn link" href="/signup">New here? Sign up</Link></div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}{msg.ok && msg.text === 'Logged in.' && <> <Link href="/">Go home →</Link></>}</div>}
        {needsVerify && (
          <p style={{ marginTop: 10, fontSize: 14 }}>
            <button className="btn link" type="button" onClick={resend}>Resend the code</button>{' '}
            <Link className="btn link" href="/signup">Enter it here</Link>
          </p>
        )}
      </form>
    </div>
  );
}

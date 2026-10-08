'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/client-auth';

const STEPS = [
  {
    title: 'Attend live, not someday',
    body: 'Real trainers, real time. Join a session while it is happening — no replay treadmill.',
    points: ['Scheduled sessions you can see upfront', 'Reminders before each one starts'],
  },
  {
    title: 'Proof, not a promise',
    body: 'Attendance is measured from the classroom itself, so the certificate you earn means something.',
    points: ['Verified automatically when you attend', 'Anyone can check a certificate number'],
  },
  {
    title: 'Learn for a purpose',
    body: 'Trainers here teach towards an outcome. Hosts build a following as they teach.',
    points: ['Follow trainers and get their new sessions', 'Host your own once you are ready'],
  },
];

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(0);
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
    setMsg({ ok: true, text: 'Email confirmed. Opening your dashboard…' });
    // A brand-new account has no trainer profile, so this lands them as a participant.
    router.push('/dashboard');
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

  if (step < STEPS.length) {
    const s = STEPS[step];
    const last = step === STEPS.length - 1;
    return (
      <div className="wrap">
        <div className="card" style={{ marginTop: 18, padding: 28 }}>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)' }}>
            Step {step + 1} of {STEPS.length}
          </p>
          <h2 style={{ margin: '10px 0 8px', fontSize: 26, fontWeight: 800, lineHeight: 1.25 }}>{s.title}</h2>
          <p className="muted" style={{ margin: '0 0 18px', fontSize: 16 }}>{s.body}</p>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ink)', fontSize: 15, lineHeight: 1.7 }}>
            {s.points.map((pt) => <li key={pt}>{pt}</li>)}
          </ul>
          <div className="btnrow">
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              {last ? 'Create an account' : 'Next'}
            </button>
            <button className="btn link" onClick={() => setStep(STEPS.length)}>Skip</button>
          </div>
        </div>
        <nav className="bottomnav"><div className="in">
          <Link href="/" className="on">🏠<br />Home</Link>
          <Link href="/feed">◎<br />Explore</Link>
          <Link href="/login">→<br />Log in</Link>
        </div></nav>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1>Create your account.</h1>
      <p className="sub">Every account can attend. Complete a trainer profile to host.</p>
      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <label className="fl">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label className="fl">Password (8+ chars)</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="btnrow">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          <button className="btn link" type="button" onClick={() => setStep(0)}>Back</button>
          <Link className="btn link" href="/login">Have an account? Log in</Link>
        </div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
      </form>
    </div>
  );
}
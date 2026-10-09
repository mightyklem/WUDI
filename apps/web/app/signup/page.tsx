'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/client-auth';

// Three arguments, each carrying its own icon and colour. The point is that a
// learner decides in about five seconds, so this is a walk-through rather than a
// wall of copy they have to agree to before typing an email.
const STEPS = [
  {
    icon: '🎥',
    tint: 'tint-accent',
    title: 'Attend live, not someday',
    body: 'Real trainers, real time.',
    points: ['Sessions you can see upfront', 'A reminder before each one'],
  },
  {
    icon: '🪨',
    tint: 'tint-clay',
    title: 'Climb as you learn',
    body: 'Every day you attend moves you up.',
    points: ['Stone → Bronze → Silver → Gold', 'Points for free and paid days alike'],
  },
  {
    icon: '🏅',
    tint: 'tint-gold',
    title: 'Proof, not a promise',
    body: 'A certificate anyone can check.',
    points: ['Verified from the classroom itself', 'Verifiable forever by number'],
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
        <div className="surface surface-hero pat-dots fade" style={{ marginTop: 18 }}>
          <span className="tile-icon tint-accent" aria-hidden>✉️</span>
          <h1 style={{ marginTop: 14 }}>Check your inbox.</h1>
          <p className="sub">We sent a 6-digit code to <b>{email}</b>. It expires in 15 minutes.</p>
        </div>
        <form onSubmit={verify} className="card" style={{ marginTop: 14 }}>
          <label className="fl">6-digit code</label>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            style={{ letterSpacing: 10, fontSize: 24, fontWeight: 700, maxWidth: 260 }}
          />
          <div className="btnrow">
            <button className="btn primary lg" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Confirm and continue'}
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
        <div className="surface surface-hero pat-weave rise" style={{ marginTop: 18, padding: 'var(--s-6) var(--s-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`tile-icon ${s.tint}`} aria-hidden>{s.icon}</span>
            <span style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--mut)', fontWeight: 700 }}>
              Step {step + 1} of {STEPS.length}
            </span>
          </div>

          <h1 key={s.title} className="rise" style={{ marginTop: 16, fontSize: 30, lineHeight: 1.15, maxWidth: 480 }}>{s.title}</h1>
          <p className="sub" style={{ fontSize: 17, maxWidth: 460 }}>{s.body}</p>

          <div style={{ display: 'grid', gap: 9, marginTop: 20 }}>
            {s.points.map((pt, i) => (
              <div key={pt} className={`rise rise-${i + 1}`} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                <span className="tile-icon tint-neutral" aria-hidden
                  style={{ width: 28, height: 28, borderRadius: 'var(--r-xs)', fontSize: 14 }}>✓</span>
                <span style={{ fontSize: 15 }}>{pt}</span>
              </div>
            ))}
          </div>

          {/* Progress as dots rather than a bar: three short steps, no numbers needed. */}
          <div style={{ display: 'flex', gap: 6, marginTop: 22 }} aria-hidden>
            {STEPS.map((_, i) => (
              <span key={i} style={{
                width: i === step ? 26 : 8, height: 8, borderRadius: 999,
                background: i <= step ? 'var(--accent)' : 'var(--line)',
                transition: 'width var(--dur-2) var(--ease), background-color var(--dur-2) var(--ease)',
              }} />
            ))}
          </div>

          <div className="btnrow">
            <button className="btn primary lg" onClick={() => setStep(step + 1)}>
              {last ? 'Create my account' : 'Next'}
            </button>
            <button className="btn" onClick={() => setStep(STEPS.length)}>Skip</button>
          </div>
        </div>
        <nav className="bottomnav"><div className="in">
          <Link href="/" className="on">🏠<br />Home</Link>
          <Link href="/classes">📚<br />Classes</Link>
          <Link href="/login">→<br />Log in</Link>
        </div></nav>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="surface surface-hero pat-arcs fade" style={{ marginTop: 18 }}>
        <span className="tile-icon tint-leaf" aria-hidden>🙂</span>
        <h1 style={{ marginTop: 14 }}>Create your account.</h1>
        <p className="sub">Email and a password. That is all.</p>
      </div>

      <form onSubmit={submit} className="card rise" style={{ marginTop: 14 }}>
        <label className="fl">Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label className="fl">Password (8+ characters)</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="btnrow">
          <button className="btn primary lg" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <button className="btn link" type="button" onClick={() => setStep(0)}>Back</button>
        </div>
        {msg && <div className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</div>}
        <p className="muted" style={{ fontSize: 13, marginTop: 14, marginBottom: 0 }}>
          Any account can attend. Complete a trainer profile later to host.
        </p>
        <div className="btnrow" style={{ marginTop: 8 }}>
          <Link className="btn link" href="/login">Already have an account? Log in</Link>
        </div>
      </form>
    </div>
  );
}
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const KEY = 'learnovize_auth_seen_v1';

/**
 * A first-visit welcome card.
 *
 * Signing up is the one action the whole product depends on, so it needs to be
 * visible rather than buried in a nav link. It is deliberately not a blocking
 * modal: someone who arrived from a shared class link wants to see the class, and
 * trapping them on a form is how you lose them. It appears once, floats above the
 * page, and can be dismissed for good.
 */
export default function FirstVisitAuth() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    // Already signed in, or has seen it: never show it.
    let token: string | null = null;
    let seen: string | null = null;
    try {
      token = window.localStorage.getItem('learnovize_access');
      seen = window.localStorage.getItem(KEY);
    } catch {
      token = null;
      seen = null;
    }
    if (!token && !seen) setOpen(true);
    setAuthed(!!token);
    setReady(true);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      /* nowhere to record it; it will simply ask again next visit */
    }
  };

  const signOut = () => {
    try {
      window.localStorage.removeItem('learnovize_access');
      window.localStorage.removeItem('learnovize_refresh');
    } catch { /* nothing to clear */ }
    setAuthed(false);
    router.push('/');
  };

  if (!ready) return null;

  // Signed in: a small persistent account chip instead of the card.
  if (authed) {
    return (
      <Link
        href="/dashboard"
        className="glass rise"
        style={{
          position: 'fixed', right: 18, bottom: 86, zIndex: 41, padding: '10px 16px',
          display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
          color: 'var(--ink)', fontWeight: 700, fontSize: 14, borderRadius: 'var(--r-full)',
        }}
      >
        <span className="tile-icon tint-accent" aria-hidden style={{ width: 32, height: 32, borderRadius: 'var(--r-xs)', fontSize: 15 }}>🙂</span>
        Your dashboard
      </Link>
    );
  }

  if (!open) {
    // Dismissed, but not gone: one pill that brings the whole card back, so the
    // "how it works" it carried is still reachable after the first visit.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Join Learnovize and see how it works"
        className="rise"
        style={{
          position: 'fixed', right: 18, bottom: 86, zIndex: 40, cursor: 'pointer',
          padding: '12px 20px', borderRadius: 'var(--r-full)', border: 'none',
          background: 'linear-gradient(135deg,var(--accent),var(--accent-deep))', color: '#fff',
          fontWeight: 800, fontSize: 15, display: 'inline-flex', alignItems: 'center', gap: 8,
          boxShadow: 'var(--sh-tint)', fontFamily: 'inherit',
        }}
      >
        <span aria-hidden>✨</span> Join Learnovize
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Join Learnovize"
      className="glass rise"
      style={{
        position: 'fixed', right: 18, bottom: 86, zIndex: 42,
        width: 'min(352px, calc(100vw - 32px))', padding: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span className="tile-icon tint-accent" aria-hidden>✨</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 18, display: 'block', lineHeight: 1.2 }}>Learn live. Earn while you do.</b>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            Free account. Takes a minute with your email.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20,
            color: 'var(--mut)', lineHeight: 1, padding: '0 2px' }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {[
          { icon: '🎥', tint: 'tint-accent', title: 'Join a live class', body: 'Real trainers, real time' },
          { icon: '🪨', tint: 'tint-clay', title: 'Earn points every day', body: 'Climb Stone to Gold' },
          { icon: '🏅', tint: 'tint-gold', title: 'Get certified', body: 'Verifiable, forever' },
        ].map((r, i) => (
          <div key={r.title} className={`rise rise-${i + 1}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className={`tile-icon ${r.tint}`} aria-hidden
              style={{ width: 38, height: 38, borderRadius: 'var(--r-xs)', fontSize: 18 }}>{r.icon}</span>
            <span>
              <b style={{ display: 'block', fontSize: 14 }}>{r.title}</b>
              <span className="muted" style={{ fontSize: 13 }}>{r.body}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 9, marginTop: 18 }}>
        <Link className="btn primary lg" href="/signup" onClick={dismiss} style={{ width: '100%' }}>
          Create a free account
        </Link>
        <Link className="btn" href="/login" onClick={dismiss} style={{ width: '100%' }}>
          I already have one
        </Link>
      </div>
      <button className="btn link" onClick={dismiss} style={{ width: '100%', marginTop: 4, fontSize: 14 }}>
        Maybe later
      </button>
    </div>
  );
}
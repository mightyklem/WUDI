'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const KEY = 'learnovize_guide_seen_v1';

const STEPS = [
  { icon: '🎟', title: 'Pick your days', body: 'Reserve a seat, then tick the days you will attend.' },
  { icon: '🎥', title: 'Join live', body: 'Stay 75% of a session to count as present.' },
  { icon: '🏅', title: 'Earn your certificate', body: 'Pay per day, meet the bar, and it is verifiable forever.' },
];

/**
 * A floating first-run guide.
 *
 * This used to sit permanently on the home page as a "How it works" block, which
 * meant returning visitors were shown onboarding copy they had long since read. It
 * now appears once, floats above the content, and remembers that it was dismissed.
 */
export default function FirstRunGuide() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Nothing renders until we know whether this person has seen it, so the guide
    // cannot flash for someone who dismissed it on an earlier visit.
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(KEY);
    } catch {
      seen = null; // private mode: show it rather than crash
    }
    if (!seen) setOpen(true);
    setReady(true);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      /* nothing to remember it with */
    }
  };

  if (!ready) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How Learnovize works"
        style={{
          position: 'fixed', right: 18, bottom: 86, zIndex: 40,
          width: 52, height: 52, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #156B78, #0B5E2E)', color: '#fff',
          fontSize: 22, boxShadow: '0 8px 24px rgba(21,107,120,.35)',
        }}
      >
        ?
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="How Learnovize works"
      style={{
        position: 'fixed', right: 18, bottom: 86, zIndex: 41,
        width: 'min(320px, calc(100vw - 36px))',
        background: 'rgba(255,255,255,.86)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(21,107,120,.18)',
        borderRadius: 20,
        boxShadow: '0 18px 44px rgba(11,31,20,.18)',
        padding: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 20 }} aria-hidden>✨</span>
        <b style={{ fontSize: 16 }}>How it works</b>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--mut)', lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {STEPS.map((s, i) => (
          <div key={s.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span
              aria-hidden
              style={{
                width: 34, height: 34, flex: '0 0 34px', borderRadius: 11,
                background: i === 0 ? '#E9F3F6' : i === 1 ? '#E4F5EA' : '#FDF0E3',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
              }}
            >
              {s.icon}
            </span>
            <span>
              <b style={{ display: 'block', fontSize: 14 }}>{s.title}</b>
              <span className="muted" style={{ fontSize: 13 }}>{s.body}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="btnrow" style={{ marginTop: 14, marginBottom: 0 }}>
        <Link className="btn primary" href="/classes" onClick={dismiss}>Find a class</Link>
        <button className="btn" onClick={dismiss}>Got it</button>
      </div>
    </div>
  );
}
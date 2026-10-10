'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAccess } from '@/lib/client-auth';
import SiteNav from '../../components/SiteNav';

type Note = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

// The dashboard has linked here since the role tiles shipped, but the page was
// never written. The API has been serving notifications the whole time.
const TYPES: Record<string, { icon: string; tint: string; label: string }> = {
  'registration-confirmed': { icon: '🎟', tint: 'tint-leaf', label: 'Seat confirmed' },
  'attendance-recorded': { icon: '✓', tint: 'tint-leaf', label: 'Attendance recorded' },
  'attendance-at-risk': { icon: '⚠', tint: 'tint-clay', label: 'At risk of missing the minimum' },
  'attendance-corrected': { icon: '✎', tint: 'tint-accent', label: 'Attendance corrected' },
  'certificate-issued': { icon: '🏅', tint: 'tint-gold', label: 'Certificate issued' },
  'payment-received': { icon: '₦', tint: 'tint-gold', label: 'Payment received' },
  'new-training-from-followed': { icon: '🔔', tint: 'tint-accent', label: 'New class from a trainer you follow' },
  'training-updated': { icon: '🗓', tint: 'tint-accent', label: 'Class updated' },
  'training-cancelled': { icon: '⚠', tint: 'tint-clay', label: 'Class cancelled' },
  'registration-cancelled': { icon: '✕', tint: 'tint-clay', label: 'Registration cancelled' },
  'report-resolved': { icon: '🛡', tint: 'tint-accent', label: 'Report resolved' },
};

const FALLBACK = { icon: '🔔', tint: 'tint-neutral', label: 'Update' };

function when(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toDateString();
}

/** Link through when the notification is about something the person can open. */
function hrefFor(n: Note): string | null {
  const p = n.payload || {};
  if (typeof p.sessionId === 'string') return `/classroom/${p.sessionId}`;
  if (typeof p.slug === 'string') return `/t/${p.slug}/register`;
  if (typeof p.trainingId === 'string') return `/trainings/${p.trainingId}`;
  return null;
}

export default function Notifications() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const access = getAccess();
    if (!access) {
      router.replace('/login');
      return;
    }
    fetch('/api/me/notifications', { headers: { authorization: `Bearer ${access}` } })
      .then((r) => r.json())
      .then((j) => setNotes(j.notifications || []))
      .catch(() => setNotes([]));
  }, []);

  if (notes === null) {
    return <div className="wrap"><p className="muted" style={{ marginTop: 30 }}>Loading your alerts…</p></div>;
  }

  const unread = notes.filter((n) => !n.readAt).length;

  return (
    <div className="wrap">
      <SiteNav />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1>Alerts</h1>
        {unread > 0 && <span className="badge">{unread} new</span>}
      </div>

      {notes.length === 0 ? (
        <div className="surface surface-hero pat-dots" style={{ marginTop: 16, textAlign: 'center' }}>
          <span className="tile-icon tint-accent" aria-hidden>🔔</span>
          <p className="bigtitle" style={{ marginTop: 12 }}>Nothing yet</p>
          <p className="sub" style={{ maxWidth: 400, margin: '6px auto 0' }}>
            Seat confirmations, reminders and certificate notices land here.
          </p>
          <div className="btnrow" style={{ justifyContent: 'center' }}>
            <Link className="btn primary lg" href="/classes">Find a class</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {notes.map((n, i) => {
            const meta = TYPES[n.type] || FALLBACK;
            const href = hrefFor(n);
            const inner = (
              <div style={{ display: 'flex', gap: 13, alignItems: 'center' }}>
                <span className={`tile-icon ${meta.tint}`} aria-hidden
                  style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', fontSize: 19 }}>{meta.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 15, fontWeight: n.readAt ? 600 : 800 }}>{meta.label}</b>
                  {typeof n.payload?.title === 'string' && (
                    <span className="muted" style={{ fontSize: 13 }}>{n.payload.title}</span>
                  )}
                </span>
                <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{when(n.createdAt)}</span>
              </div>
            );
            return (
              <div key={n.id} className={`card rise rise-${Math.min(i + 1, 4)}`}
                style={{ padding: '14px 16px', borderLeft: n.readAt ? undefined : '3px solid var(--accent)' }}>
                {href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner}
              </div>
            );
          })}
        </div>
      )}

      <nav className="bottomnav"><div className="in">
        <Link href="/dashboard">🙂<br />Home</Link>
        <Link href="/feed">◎<br />Explore</Link>
        <Link href="/classes">📚<br />Classes</Link>
        <Link href="/me/registrations">🎟<br />Seats</Link>
        <Link href="/me/notifications" className="on">🔔<br />Alerts</Link>
      </div></nav>
    </div>
  );
}
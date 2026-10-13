'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PaymentDueBanner from './PaymentDueBanner';
import SiteNav from '../components/SiteNav';
import { getAccess } from '@/lib/client-auth';
import { headlineFor, tilesFor } from '@/lib/dashboard-roles';
import { lagosWhenLabel } from '@/lib/lagos';

type Me = {
  user: { id: string; email: string; role: 'admin' | 'trainer' | 'participant'; verified: boolean };
  trainer: { displayName: string; approvalState: string; canOfferPaidCert: boolean; plan: string } | null;
};

type MyTraining = {
  id: string; title: string; status: string; certMode: string;
  seatsTaken: number; cap: number; seatsLeft: number;
  nextSession: string | null; nextSessionAt: string | null;
  eligible: number; issuedCount: number; pendingApproval: number;
};

type Points = {
  points: number;
  rank: { key: string; label: string; icon: string };
  next: { label: string; icon: string; needed: number } | null;
  progress: { pct: number; into: number; span: number };
};

/**
 * Post-login home. Resolves the role server-side via /api/me and renders only what that
 * person can actually do. Icon tiles over prose — the header has to be readable at a glance.
 */
export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [trainings, setTrainings] = useState<MyTraining[] | null>(null);
  const [seats, setSeats] = useState<number | null>(null);
  const [certs, setCerts] = useState<number | null>(null);
  const [live, setLive] = useState<{ id: string; title: string } | null>(null);
  const [points, setPoints] = useState<Points | null>(null);

  const authed = (path: string) =>
    fetch(path, { headers: { authorization: `Bearer ${getAccess() ?? ''}` } }).then((r) => (r.ok ? r.json() : null));

  useEffect(() => {
    const access = getAccess();
    if (!access) {
      router.replace('/login');
      return;
    }
    authed('/api/me').then((j: Me | null) => {
      if (!j) return router.replace('/login');
      setMe(j);
      if (j.user.role === 'trainer' || j.user.role === 'admin') {
        authed('/api/trainer/trainings').then((t) => t && setTrainings(t.trainings));
      }
    });
    authed('/api/me/registrations').then((r) => r && setSeats((r.registrations || []).length));
    authed('/api/certificates/mine').then((c) => c && setCerts((c.certificates || []).length));
    authed('/api/me/points').then((x) => x && setPoints(x));
  }, []);

  if (!me) return <div className="wrap"><p className="muted" style={{ marginTop: 30 }}>Loading your dashboard…</p></div>;

  const { role } = me.user;
  const head = headlineFor(role);
  const tiles = tilesFor(role, { seats, certs });

  const pendingTotal = (trainings || []).reduce((n, t) => n + t.pendingApproval, 0);
  const nextUp = (trainings || []).find((t) => t.nextSession);

  return (
    <div className="wrap">
      <SiteNav />

      <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden className="u-num">{head.icon}</span>
        {head.title}
      </h1>
      <p className="sub">{me.user.email}</p>

      {/* Anything unpaid, before anything else on the page. */}
      <PaymentDueBanner />

{points && (
        <div
          className="card"
          style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
        >
          <span
            className="ibadge"
            style={{ background: 'var(--warn-soft)', color: 'var(--warn)', fontSize: 24 }}
            aria-hidden
          >
            {points.rank.icon}
          </span>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p className="u-h">
              {/* Icon carries the rank on its own — the ladder is Stone, Bronze,
                  Silver, Gold, so the picture says it without a word. */}
              <span aria-hidden style={{ marginRight: 8 }}>{points.rank.icon}</span>
              <span className="sr-only">{points.rank.label}</span>
              {points.points} point{points.points === 1 ? '' : 's'}
            </p>
            <p className="muted u-sub">
              {points.next ? `${points.next.needed} to ${points.next.icon} ${points.next.label}` : 'Top rank'}
            </p>
          </div>
          <div
            style={{
              width: 96, height: 8, borderRadius: 999,
              background: 'var(--line)', overflow: 'hidden',
            }}
            role="progressbar"
            aria-valuenow={points.progress.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ width: `${points.progress.pct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>
      )}

{role === 'trainer' && me.trainer && !me.trainer.canOfferPaidCert && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--warn)' }}>
          <div className="u-flex">
            <span className="ibadge" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', fontSize: 18 }} aria-hidden>⏳</span>
            <div>
              <p className="u-h">
                Teaching verification: {String(me.trainer.approvalState || 'none').toLowerCase()}
              </p>
              <p className="muted u-sub">
                Free and paid classes are both open to you. How many seats a class
                can hold comes from your plan, not from this review.
              </p>
            </div>
          </div>
        </div>
      )}

      {role === 'trainer' && pendingTotal > 0 && (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--leaf)' }}>
          <div className="u-flex">
            <span className="ibadge" style={{ background: 'var(--ok-soft)', color: 'var(--leaf)', fontSize: 18 }} aria-hidden>✓</span>
            <div style={{ flex: 1 }}>
              <p className="u-h">{pendingTotal} awaiting your approval</p>
              <p className="muted u-sub">Attendees who met the bar</p>
            </div>
            <Link className="btn primary" href="/trainings">Review</Link>
          </div>
        </div>
      )}

      {role === 'trainer' && nextUp && (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--accent)' }}>
          <div className="u-flex">
            <span className="ibadge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 18 }} aria-hidden>▶</span>
            <div className="u-grow">
              <p className="u-h">{nextUp.title}</p>
              <p className="muted u-sub">
                {nextUp.nextSessionAt ? lagosWhenLabel(nextUp.nextSessionAt) : ''}
              </p>
            </div>
            {nextUp.nextSession && (
              <Link className="btn primary" href={`/classroom/${nextUp.nextSession}`}>Start</Link>
            )}
          </div>
        </div>
      )}

      <h2 className="sec">Tiles</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 14 }}>
        {tiles.map((t) => (
          <Link
            key={t.href + t.label}
            href={t.href}
            style={{
              background: '#fff',
              border: '1px solid var(--line)',
              borderRadius: 18,
              padding: '18px 16px',
              boxShadow: 'var(--sh-1)',
              textDecoration: 'none',
              color: 'var(--ink)',
              position: 'relative',
            }}
          >
            <span
              className="ibadge"
              style={{ background: t.bg, color: t.fg, width: 46, height: 46, borderRadius: 15, fontSize: 22 }}
              aria-hidden
            >
              {t.icon}
            </span>
            <p className="u-h-md">{t.label}</p>
            {t.badge !== undefined && t.badge !== 0 && (
              <span className="badge" style={{ position: 'absolute', top: 14, right: 14 }}>{t.badge}</span>
            )}
          </Link>
        ))}
      </div>

      {role === 'trainer' && trainings && trainings.length > 0 && (
        <>
          <h2 className="sec">Your trainings</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {trainings.map((t) => (
              <Link
                key={t.id}
                href={`/trainings/${t.id}`}
                className="card"
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 14, alignItems: 'center', padding: 16 }}
              >
                <span className="ibadge" style={{ background: 'var(--pill)', color: 'var(--ink)' }} aria-hidden>📘</span>
                <div className="u-grow">
                  <p className="u-h">{t.title}</p>
                  <p className="muted u-sub-sm">
                    {t.seatsTaken}/{t.cap} seats · {t.issuedCount} issued
                    {t.pendingApproval > 0 ? ` · ${t.pendingApproval} to approve` : ''}
                  </p>
                </div>
                {t.status === 'full' && <span className="badge rev">Full</span>}
                {t.status === 'live' && <span className="badge ok">Live</span>}
              </Link>
            ))}
          </div>
        </>
      )}

      {role === 'trainer' && trainings && trainings.length === 0 && (
        <div className="card u-empty">
          <div className="u-num" aria-hidden>＋</div>
          <p className="u-h-lg">No trainings yet</p>
          <p className="muted u-sub">Host a free one right away</p>
          <div className="btnrow u-center">
            <Link className="btn primary" href="/trainings/new">Create</Link>
          </div>
        </div>
      )}

      {role === 'participant' && seats === 0 && (
        <div className="card u-empty">
          <div className="u-num" aria-hidden>◎</div>
          <p className="u-h-lg">No seats yet</p>
          <p className="muted u-sub">Find something live</p>
          <div className="btnrow u-center">
            <Link className="btn primary" href="/feed">Explore</Link>
          </div>
        </div>
      )}

{role === 'trainer' && (
        <p className="u-mt-4">
          Want learners to know you were checked?{' '}
          <Link className="btn link" href="/trainer/verification">Get verified →</Link>
        </p>
      )}

      {role === 'participant' && (
        <p className="u-mt-4">
          Want to teach? <Link className="btn link" href="/onboarding">Become a trainer →</Link>
        </p>
      )}

      <nav className="bottomnav"><div className="in">
        <Link href="/dashboard" className="on">⌂<br />Home</Link>
        <Link href="/feed">◎<br />Explore</Link>
        <Link href="/me/registrations">📚<br />Seats</Link>
        <Link href="/me/certificates">🏅<br />Certs</Link>
      </div></nav>
    </div>
  );
}
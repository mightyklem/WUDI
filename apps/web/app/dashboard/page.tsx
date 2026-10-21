'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PaymentDueBanner from './PaymentDueBanner';
import SiteNav from '../components/SiteNav';
import StandingPanel from '../components/StandingPanel';
import UpNext from '../components/UpNext';
import { authFetch, getAccess } from '@/lib/client-auth';
import { greetingFor, tilesFor } from '@/lib/dashboard-roles';
import { lagosWhenLabel } from '@/lib/lagos';
import { Skeleton, SkeletonCard } from '../components/Skeleton';
import Tabs from '../components/Tabs';
import { UxCard, UxCta } from '../components/ux';
import Icon from '@/components/Icon';

type Me = {
  user: {
    id: string; email: string; role: 'admin' | 'trainer' | 'participant'; verified: boolean;
    fullName: string | null;
  };
  trainer: { displayName: string; approvalState: string; canOfferPaidCert: boolean; plan: string } | null;
};

type MyTraining = {
  id: string; title: string; status: string; certMode: string;
  seatsTaken: number; cap: number; seatsLeft: number;
  nextSession: string | null; nextSessionAt: string | null;
  eligible: number; issuedCount: number; pendingApproval: number;
};

/**
 * Post-login home. Resolves the role server-side via /api/me and renders only what that
 * person can actually do. Icon tiles over prose -- the header has to be readable at a glance.
 */
export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [trainings, setTrainings] = useState<MyTraining[] | null>(null);
  const [seats, setSeats] = useState<number | null>(null);
  const [certs, setCerts] = useState<number | null>(null);
  // Which list of classes is open. One at a time: a trainer looking for the class they have
  // to run next should not have to scroll past the ones they already ran.
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  // The clock, read again every minute. A greeting that says good morning at noon
  // because the tab was opened at nine is worse than no greeting at all.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Through authFetch, so an expired token renews itself instead of every one of these
  // four calls failing with a 401 and dumping the person at the login page.
  const authed = (path: string) => authFetch(path).then((r) => (r.ok ? r.json() : null));

  useEffect(() => {
    if (!getAccess()) {
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
  }, []);

  // Skeletons shaped like the page they are standing in for. "Loading your dashboard..." was
  // honest but made the page jump from one line to a full screen, and a blank second is
  // indistinguishable from a broken one.
  if (!me) {
    return (
      <div className="wrap">
        <SiteNav />
        <div style={{ marginTop: 18 }}>
          <Skeleton width={240} height={30} radius={8} />
          <Skeleton width={190} height={13} style={{ marginTop: 10 }} />
        </div>
        <div style={{ display: 'grid', gap: 14, marginTop: 20 }}>
          <SkeletonCard height={84} />
          <SkeletonCard height={150} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 14 }}>
            {[0, 1, 2].map((i) => <SkeletonCard key={i} height={128} />)}
          </div>
          <SkeletonCard height={120} />
        </div>
      </div>
    );
  }

  const { role } = me.user;
  const tiles = tilesFor(role, { seats, certs });
  const greeting = greetingFor(now ?? new Date());
  // The name they gave us, if they gave us one. The API sends it precisely so a surface
  // can say hello to a person rather than to an address.
  const name = (me.user.fullName || '').trim();

  const pendingTotal = (trainings || []).reduce((n, t) => n + t.pendingApproval, 0);

  // Soonest first. The API hands them over newest-created-first, which is the order a
  // trainer built them in -- not the order they have to run in, and not the order the
  // "Next up" tag points at.
  const upcoming = (trainings || [])
    .filter((t) => t.nextSession)
    .sort((a, b) => new Date(a.nextSessionAt || 0).getTime() - new Date(b.nextSessionAt || 0).getTime());
  const past = (trainings || []).filter((t) => !t.nextSession);

  return (
    <div className="wrap">
      <SiteNav />

      {/* A welcome that knows what time it is, rather than a label for the page. The
          mark changes with the hour, so the top of the screen says something about now
          instead of only about the job. */}
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden style={{ display: 'inline-flex', color: 'var(--accent-mark)' }}>
          <Icon name={greeting.icon} size={30} strokeWidth={2} />
        </span>
        {greeting.text}{name ? `, ${name}` : ''}
      </h1>
      {/* The address was how we said who was here, back when the heading named a job
          rather than a person. Once the greeting carries the name it is a second line
          saying the same thing, so it only stays for somebody who has not given us a
          name to use. */}
      {!name && <p className="u-sub-sm" style={{ marginTop: 4 }}>{me.user.email}</p>}

      {/* Anything unpaid, before anything else on the page. */}
      <PaymentDueBanner />

      {/* Replaced a hand-written copy of this block. It worked, but it was a second
          definition of what a rank means -- and it had already drifted: this one showed
          no progress percentage next to the bar and no record of what earned the points,
          so the learner could see they were Gold without being able to find out why.
          One component, one meaning. */}
      <UpNext />

      <StandingPanel
        related={[
          { href: '/me/certificates', label: 'Certificates', value: certs, hint: 'Issued when you finish a programme' },
          { href: '/me/registrations', label: 'Seats held', value: seats, hint: 'Classes you are booked into' },
        ]}
      />

      {/* Trainer-specific notices. The section heading was removed at the trainer's request;
          the cards carry their own labels, so a heading here was a label for nothing. */}
      {role === 'trainer' && me.trainer && !me.trainer.canOfferPaidCert && (
        <div className="ux-card" style={{ marginTop: 16, borderLeft: '4px solid var(--warn)' }}>
          <div className="u-flex">
            <span className="ibadge" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', fontSize: 'var(--t-md)' }} aria-hidden>⏳</span>
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
        <div className="ux-card" style={{ marginTop: 12, borderLeft: '4px solid var(--leaf)' }}>
          <div className="u-flex">
            <span className="ibadge" style={{ background: 'var(--ok-soft)', color: 'var(--leaf)', fontSize: 'var(--t-md)' }} aria-hidden>✓</span>
            <div style={{ flex: 1 }}>
              <p className="u-h">{pendingTotal} awaiting your approval</p>
              <p className="muted u-sub">Attendees who met the bar</p>
            </div>
            {/* Quiet, not loud. The teal button on this screen belongs to the class you
                have to run -- there is one of those per screen, and it is the one a
                trainer is most likely to open. */}
            <UxCta quiet href="/trainings">Review</UxCta>
          </div>
        </div>
      )}

      {/* Manage your classes. Upcoming and past are separate lists behind their own tab,
          not one long page: a class a trainer still has to run is a task, and a class from
          last month is a record, and showing both at once is what made this feel like
          clutter. The count on each tab is so the button says what is behind it before it
          is pressed. */}
      {role === 'trainer' && trainings && trainings.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <Tabs
            tabs={[
              { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
              { key: 'past', label: 'Past', count: past.length },
            ]}
            value={tab}
            onChange={(k) => setTab(k as 'upcoming' | 'past')}
            variant="gold"
          />

          {/* Space between the strip and the first card. Without it the selected tab
              sat directly on the card, and the two read as one object. */}
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {tab === 'upcoming' && upcoming.map((t) => {
              const sessionId = t.nextSession as string;
              // One class is marked as the one to do next. It used to have a card of its
              // own above the list, saying the same thing as the first row underneath it
              // -- so the screen had two answers to "what do I do next" and two teal
              // buttons. The tag on the row is the same information, in one place.
              const isNext = t.id === upcoming[0].id;
              return (
                <UxCard key={t.id} best={isNext} bestLabel="Next up">
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="ibadge" style={{ background: 'var(--pill)', color: 'var(--ink)' }} aria-hidden>📘</span>
                    <div className="u-grow" style={{ minWidth: 160 }}>
                      <p className="u-h" style={{ margin: 0 }}>{t.title}</p>
                      <p className="muted u-sub-sm" style={{ margin: '2px 0 0' }}>
                        {t.seatsTaken}/{t.cap} seats · {t.issuedCount} issued
                        {t.pendingApproval > 0 ? ` · ${t.pendingApproval} to approve` : ''}
                      </p>
                      <p className="muted u-sub-sm" style={{ margin: '4px 0 0', color: 'var(--accent)', fontWeight: 600 }}>
                        Next: {t.nextSessionAt ? lagosWhenLabel(t.nextSessionAt) : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
                      {/* One filled button on the screen. The class you have to run next
                          is the one that shouts; the rest stay reachable, and quiet. */}
                      <UxCta quiet={!isNext} href={`/classroom/${sessionId}`}>
                        Join class <span aria-hidden>→</span>
                      </UxCta>
                      <UxCta quiet href={`/trainings/${t.id}#prepare`}>Prepare my class</UxCta>
                    </div>
                  </div>
                </UxCard>
              );
            })}

            {tab === 'past' && past.map((t) => (
              <div
                key={t.id}
                className="ux-card"
                style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', opacity: 0.65 }}
              >
                <span className="ibadge" style={{ background: 'var(--pill)', color: 'var(--ink)' }} aria-hidden>📘</span>
                <div className="u-grow" style={{ minWidth: 160 }}>
                  <p className="u-h" style={{ margin: 0 }}>{t.title}</p>
                  <p className="muted u-sub-sm" style={{ margin: '2px 0 0' }}>
                    {t.seatsTaken}/{t.cap} seats · {t.issuedCount} issued
                  </p>
                  <p className="muted u-sub-sm" style={{ margin: '4px 0 0', color: 'var(--warn)', fontWeight: 700 }}>
                    Ended
                  </p>
                  <p className="muted u-sub-sm" style={{ margin: '2px 0 0' }}>
                    This class has ended. Registration is closed.
                  </p>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <Link className="btn" href={`/trainings/${t.id}`}>Class details</Link>
                </div>
              </div>
              ))}
          </div>
        </section>
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

      <h2 className="sec" style={{ marginTop: 26 }}>Go somewhere</h2>
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
              style={{ background: t.bg, color: t.fg, width: 46, height: 46, borderRadius: 15, fontSize: 'var(--t-lg)' }}
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
          Want to get paid?{' '}
          <Link className="btn link" href="/trainer/approval">Verify your identity →</Link>
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
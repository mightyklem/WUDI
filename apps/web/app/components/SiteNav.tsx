'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { authFetch, clearSession, getAccess, needsRefresh, refreshAccess } from '@/lib/client-auth';
import Icon, { type IconName } from '@/components/Icon';
import { Skeleton, SkeletonNavAction } from './Skeleton';

/**
 * The one navigation bar.
 *
 * Every page used to hand-roll its own, which is why they disagreed: some offered
 * Log out, some Sign in, most neither. The landing page was the worst of it -- it is a
 * server component that cannot read localStorage, so it always rendered as though
 * nobody were signed in. Clicking Home therefore felt like being logged out, even
 * though the session was still there.
 *
 * So the rule is simple and enforced in one place: when signed in, Home IS the
 * dashboard. When signed out, it is the landing page.
 *
 * Explore / Trainers / My seats are icons because they are the three places a
 * returning person visits, and a label for each is three words saying what the icon
 * already says. Titles and aria-labels carry the real names for screen readers.
 */

const ICONS: { href: string; icon: IconName; label: string }[] = [
  { href: '/feed', icon: 'grid', label: 'Explore' },
  { href: '/trainers', icon: 'people', label: 'Trainers' },
  { href: '/me/registrations', icon: 'book', label: 'My seats' },
];

export default function SiteNav({ right }: { right?: React.ReactNode }) {
  const pathname = usePathname();
  // null means "not known yet", which is a third state and the whole point. It used to be
  // false, so every navigation rendered the signed-out header for the fraction of a second
  // it took to read localStorage -- a flash of "Sign in" on a page you were already logged
  // into, which reads as being logged out.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setSignedIn(!!getAccess());
    const onStore = () => setSignedIn(!!getAccess());
    window.addEventListener('storage', onStore);
    return () => window.removeEventListener('storage', onStore);
  }, []);

  // Renew before the token lapses rather than reacting to a 401 afterwards. This is why the
  // console filled with 401s on every tab: the refresh endpoint existed, but nothing had
  // ever asked for a new token, so the expiry was discovered by failing.
  useEffect(() => {
    if (!signedIn || !needsRefresh()) return;
    void refreshAccess();
  }, [signedIn, pathname]);

  // Unread count, so the bell is worth looking at. Goes through authFetch, so an expired
  // token renews itself instead of logging the person out.
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    authFetch('/api/me/notifications?unreadOnly=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j) setUnread(j.unread ?? 0); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [signedIn, pathname]);

  const home = signedIn ? '/dashboard' : '/';

  return (
    <div className="topbar">
      <Link className="logo" href={home} aria-label="Learnovize home">
        {/* The real wordmark rather than the name set in the site's own font. The two
            are not the same drawing, and a brand that changes typeface between the nav
            bar and a certificate is a brand nobody can recognise across three surfaces. */}
        <img src="/learnovize-mark.svg" alt="" width={34} height={34} />
        <img className="logo-word" src="/learnovize-wordmark.png" alt="Learnovize" width={132} height={20} />
      </Link>

      {/* Only for someone who can actually use them. A visitor arriving for the
          first time got three icons leading to pages behind a sign-in, which
          reads as a broken promise; the landing page now offers the mark and the
          two things they can actually do. */}
{signedIn === null ? (
          <nav aria-hidden style={{ display: 'flex', gap: 4 }}>
            {ICONS.map((i) => <Skeleton key={i.href} width={34} height={34} radius={9} />)}
          </nav>
        ) : signedIn && (
          <nav>
            {ICONS.map((i) => {
              const active = pathname === i.href || pathname.startsWith(i.href + '/');
              return (
                <Link
                  key={i.href}
                  className="navicon"
                  href={i.href}
                  title={i.label}
                  aria-label={i.label}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon name={i.icon} size={19} strokeWidth={active ? 2.3 : 1.9} />
                </Link>
              );
            })}
          </nav>
        )}

      <div className="topbar-actions">
        {right}
        {/* Placeholder, not "Sign in". The slot is filled with the same shape it will hold,
            so nothing shifts sideways when the real controls arrive. */}
        {signedIn === null ? (
          <SkeletonNavAction />
        ) : signedIn ? (
          <>
            {/* Was a Dashboard button with a home icon, which was the same destination as
                the logo one tap to its left. Two controls for one place is one too many,
                and it left the top-right corner with nothing that changed without the
                person going somewhere. Alerts is the thing that does change, so that is
                what earns the slot -- and the count is only meaningful because marks can
                now be acknowledged at all. */}
            <Link
              className="btn topbar-action"
              href="/me/notifications"
              aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}
              aria-current={pathname.startsWith('/me/notifications') ? 'page' : undefined}
              style={{ position: 'relative' }}
            >
              <span className="topbar-action-icon"><Icon name="bell" size={17} /></span>
              <span className="topbar-action-label">Alerts</span>
              {unread > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18,
                    padding: '0 5px', borderRadius: 999, background: 'var(--warn)',
                    color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: '18px',
                    textAlign: 'center', border: '2px solid var(--bg)',
                  }}
                >
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
            <button
              className="btn link topbar-action"
              aria-label="Log out"
              onClick={() => { clearSession(); window.location.href = '/'; }}
            >
              <span className="topbar-action-icon"><Icon name="logout" size={17} /></span>
              <span className="topbar-action-label">Log out</span>
            </button>
          </>
        ) : (
          <>
            <Link className="btn link" href="/login">Sign in</Link>
            <Link className="btn primary" href="/signup">Sign up</Link>
          </>
        )}
      </div>
    </div>
  );
}
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearSession, getAccess } from '@/lib/client-auth';
import Icon, { type IconName } from '@/components/Icon';

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
  const [signedIn, setSignedIn] = useState(false);

  // Read after mount, never during render: localStorage does not exist on the server,
  // so reading it there would make the server and client markup disagree.
  useEffect(() => {
    setSignedIn(!!getAccess());
    const onStore = () => setSignedIn(!!getAccess());
    window.addEventListener('storage', onStore);
    return () => window.removeEventListener('storage', onStore);
  }, []);

  const home = signedIn ? '/dashboard' : '/';

  return (
    <div className="topbar">
      <Link className="logo" href={home} aria-label="Learnovize home">
        {/* The real wordmark rather than the name set in the site's own font. The two
            are not the same drawing, and a brand that changes typeface between the nav
            bar and a certificate is a brand nobody can recognise across three surfaces. */}
        <img src="/learnovize-mark.svg" alt="" width={34} height={34} />
        <img className="logo-word" src="/learnovize-wordmark.png" alt="Learnovize" width={99} height={15} />
      </Link>

      {/* Only for someone who can actually use them. A visitor arriving for the
          first time got three icons leading to pages behind a sign-in, which
          reads as a broken promise; the landing page now offers the mark and the
          two things they can actually do. */}
      {signedIn && (
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
        {signedIn ? (
          <>
            {/* Filled when you are already on it. Standing on a page and seeing
                its own link sit there looking inactive is the clearest way to
                tell somebody that navigation does not track location. */}
            <Link
              className={pathname.startsWith('/dashboard') ? 'btn primary topbar-action' : 'btn topbar-action'}
              href="/dashboard"
              aria-label="Dashboard"
              aria-current={pathname.startsWith('/dashboard') ? 'page' : undefined}
            >
              <span className="topbar-action-icon"><Icon name="home" size={17} /></span>
              <span className="topbar-action-label">Dashboard</span>
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
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
        <img src="/logo.svg" alt="" width={26} height={26} />
        Learnovize
      </Link>

      <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {ICONS.map((i) => {
          const active = pathname === i.href || pathname.startsWith(i.href + '/');
          return (
            <Link
              key={i.href}
              href={i.href}
              title={i.label}
              aria-label={i.label}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: 'var(--r-sm)',
                textDecoration: 'none',
                // A solid teal fill, not a pale tint. The active state was
                // --accent-soft (#F0F8F8) on a white bar, which is invisible in
                // practice, plus a 1px inset border nobody could see. So the page
                // you were on looked exactly like the pages you were not.
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? '#fff' : 'var(--mut)',
                boxShadow: active ? 'none' : 'none',
                transition: 'background 120ms cubic-bezier(.2,.7,.3,1), color 120ms cubic-bezier(.2,.7,.3,1)',
              }}
            >
              <Icon name={i.icon} size={19} strokeWidth={active ? 2.3 : 1.9} />
            </Link>
          );
        })}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {right}
        {signedIn ? (
          <>
            {/* Filled when you are already on it. Standing on a page and seeing
                its own link sit there looking inactive is the clearest way to
                tell somebody that navigation does not track location. */}
            <Link
              className={pathname.startsWith('/dashboard') ? 'btn primary' : 'btn'}
              href="/dashboard"
              aria-current={pathname.startsWith('/dashboard') ? 'page' : undefined}
            >
              Dashboard
            </Link>
            <button
              className="btn link"
              onClick={() => { clearSession(); window.location.href = '/'; }}
            >
              Log out
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
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearSession, getAccess } from '@/lib/client-auth';

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

const ICONS = [
  { href: '/feed', icon: '🧭', label: 'Explore' },
  { href: '/trainers', icon: '👥', label: 'Trainers' },
  { href: '/me/registrations', icon: '🎫', label: 'My seats' },
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
                fontSize: 18, textDecoration: 'none',
                background: active ? 'var(--accent-soft, #E7F2F3)' : 'transparent',
                // The active icon has to read as selected, not just as a colour change.
                boxShadow: active ? 'inset 0 0 0 1px var(--accent, #0F5C68)' : 'none',
              }}
            >
              <span aria-hidden>{i.icon}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {right}
        {signedIn ? (
          <>
            <Link className="btn" href="/dashboard">Dashboard</Link>
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
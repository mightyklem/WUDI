'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SiteNav from './SiteNav';

const ITEMS = [
  { href: '/admin/verification', label: 'Verification' },
  { href: '/admin/approvals', label: 'Approvals' },
  { href: '/admin/payouts', label: 'Payouts' },
];

/**
 * Navigation for the admin surface.
 *
 * These three pages existed but nothing linked to them, so staff could only reach an
 * admin tool by typing its URL. That is the same class of problem SiteNav was built to
 * fix, one level down -- hence a second nav rather than folding staff tools into the
 * main bar, where every learner would have to see them.
 */
export default function AdminNav() {
  const pathname = usePathname();
  return (
    <>
      <SiteNav />
      <nav aria-label="Admin" className="subnav">
        {ITEMS.map((i) => {
          const active = pathname.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} className={active ? 'on' : undefined} aria-current={active ? 'page' : undefined}>
              {i.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
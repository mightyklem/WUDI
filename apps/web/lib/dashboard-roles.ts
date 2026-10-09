// Role -> what this person sees on their home. Kept pure and separate from the
// component so the mapping itself can be tested without a browser.

export type Role = 'admin' | 'trainer' | 'participant';

export type Tile = {
  href: string;
  icon: string;
  label: string;
  bg: string;
  fg: string;
  /** Optional count bubble; hidden when 0. */
  badge?: number;
};

export type Badges = { seats?: number | null; certs?: number | null };

const INK = '#1C2430';
const MUTED_TILE = { bg: '#EEF1F4', fg: INK };

export function roleOf(user: { isAdmin: boolean; isTrainer: boolean }): Role {
  if (user.isAdmin) return 'admin';
  if (user.isTrainer) return 'trainer';
  return 'participant';
}

export function headlineFor(role: Role) {
  if (role === 'admin') return { icon: '🛡', title: 'Admin console' };
  if (role === 'trainer') return { icon: '🎥', title: 'Your studio' };
  return { icon: '🙂', title: 'Welcome back' };
}

export function tilesFor(role: Role, badges: Badges = {}): Tile[] {
  // A 0 count means "nothing yet" — show the tile, hide the bubble.
  const count = (n: number | null | undefined) => (n && n > 0 ? n : undefined);
  const seats = count(badges.seats);
  const certs = count(badges.certs);

  const participant: Tile[] = [
    { href: '/feed', icon: '◎', label: 'Explore', bg: '#E9F3F6', fg: '#156B78' },
    // Browsing classes is how a learner finds something to attend; Explore alone
    // only shows what a trainer chose to post about.
    { href: '/classes', icon: '📚', label: 'Classes', bg: '#E9F3F6', fg: '#156B78' },
    { href: '/me/registrations', icon: '🎟', label: 'My seats', ...MUTED_TILE, badge: seats },
    { href: '/me/certificates', icon: '🏅', label: 'Certificates', bg: '#FDF0E3', fg: '#9A5B12', badge: certs },
    { href: '/trainers', icon: '🤝', label: 'Follow', bg: '#E4F5EA', fg: '#0B5E2E' },
    { href: '/me/notifications', icon: '🔔', label: 'Alerts', ...MUTED_TILE },
  ];

  // Trainers live here too, so they can still sit in on sessions.
  const trainer: Tile[] = [
    { href: '/trainings/new', icon: '＋', label: 'New training', bg: '#E9F3F6', fg: '#156B78' },
    { href: '/classes', icon: '📚', label: 'Classes', bg: '#E9F3F6', fg: '#156B78' },
    { href: '/feed', icon: '◎', label: 'Explore', ...MUTED_TILE },
    { href: '/me/registrations', icon: '🎟', label: 'Attend', ...MUTED_TILE },
    { href: '/me/certificates', icon: '🏅', label: 'Certificates', bg: '#FDF0E3', fg: '#9A5B12', badge: certs },
    { href: '/me/notifications', icon: '🔔', label: 'Alerts', ...MUTED_TILE },
  ];

  const admin: Tile[] = [
    { href: '/admin', icon: '🛡', label: 'Review queue', bg: '#FDECEC', fg: '#8F1D1D' },
    { href: '/admin/approvals', icon: '✓', label: 'Approvals', bg: '#E9F3F6', fg: '#156B78' },
    { href: '/admin/reports', icon: '⚑', label: 'Reports', bg: '#FDECEC', fg: '#8F1D1D' },
    { href: '/admin/payouts', icon: '₦', label: 'Payouts', bg: '#E4F5EA', fg: '#0B5E2E' },
  ];

  if (role === 'admin') return admin;
  if (role === 'trainer') return trainer;
  return participant;
}
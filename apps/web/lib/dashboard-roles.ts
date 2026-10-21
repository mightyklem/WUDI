// Role -> what this person sees on their home. Kept pure and separate from the
// component so the mapping itself can be tested without a browser.

import type { IconName } from '@/components/Icon';
import { lagosHour } from './lagos';

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

const INK = 'var(--ink)';
const MUTED_TILE = { bg: 'var(--pill)', fg: INK };

export function roleOf(user: { isAdmin: boolean; isTrainer: boolean }): Role {
  if (user.isAdmin) return 'admin';
  if (user.isTrainer) return 'trainer';
  return 'participant';
}

/**
 * What this person's home is for, in one line.
 *
 * It is a label for the page, not a welcome -- the greeting at the top of the screen
 * says hello, and this says what they are looking at when they get there.
 */
export function headlineFor(role: Role) {
  if (role === 'admin') return { title: 'Run the platform' };
  if (role === 'trainer') return { title: 'Run your classes' };
  return { title: 'Your seats and certificates' };
}

/**
 * The greeting at the top of the home page, and the mark that goes with it.
 *
 * The old heading named the job -- "Run your classes" -- which is a label for the page
 * rather than a welcome, and it is the same words for every hour of the day. Somebody
 * opening the app at six in the morning and again at eight in the evening gets the same
 * two words, so the page never acknowledges that they are there at all.
 *
 * The hour is the one in Lagos, not the one in the browser, because Lagos is where the
 * classes are taught and where the people opening this app are.
 */
export function greetingFor(now: Date = new Date()): { icon: IconName; text: string } {
  const hour = lagosHour(now);
  if (hour < 5) return { icon: 'moon', text: 'Good night' };
  if (hour < 12) return { icon: 'sunrise', text: 'Good morning' };
  if (hour < 17) return { icon: 'sun', text: 'Good afternoon' };
  if (hour < 21) return { icon: 'sunset', text: 'Good evening' };
  return { icon: 'moon', text: 'Good night' };
}

export function tilesFor(role: Role, badges: Badges = {}): Tile[] {
  // A 0 count means "nothing yet" — show the tile, hide the bubble.
  const count = (n: number | null | undefined) => (n && n > 0 ? n : undefined);
  const seats = count(badges.seats);
  const certs = count(badges.certs);

  const participant: Tile[] = [
    { href: '/feed', icon: '◎', label: 'Explore', bg: '#E9F3F6', fg: 'var(--accent)' },
    // Browsing classes is how a learner finds something to attend; Explore alone
    // only shows what a trainer chose to post about.
    { href: '/classes', icon: '📚', label: 'Classes', bg: '#E9F3F6', fg: 'var(--accent)' },
    { href: '/me/registrations', icon: '🎟', label: 'My seats', ...MUTED_TILE, badge: seats },
    { href: '/me/certificates', icon: '🏅', label: 'Certificates', bg: 'var(--warn-soft)', fg: 'var(--warn)', badge: certs },
    { href: '/trainers', icon: '🤝', label: 'Follow', bg: '#E4F5EA', fg: 'var(--leaf)' },
    { href: '/me/notifications', icon: '🔔', label: 'Alerts', ...MUTED_TILE },
  ];

  // Trainers live here too, so they can still sit in on sessions.
  const trainer: Tile[] = [
    { href: '/trainings/new', icon: '＋', label: 'New training', bg: '#E9F3F6', fg: 'var(--accent)' },
    { href: '/classes', icon: '📚', label: 'Classes', bg: '#E9F3F6', fg: 'var(--accent)' },
    { href: '/feed', icon: '◎', label: 'Explore', ...MUTED_TILE },
    { href: '/me/registrations', icon: '🎟', label: 'Attend', ...MUTED_TILE },
    { href: '/me/certificates', icon: '🏅', label: 'Certificates', bg: 'var(--warn-soft)', fg: 'var(--warn)', badge: certs },
    { href: '/me/notifications', icon: '🔔', label: 'Alerts', ...MUTED_TILE },
  ];

  const admin: Tile[] = [
    { href: '/admin/sessions', icon: '◉', label: 'Live rooms', bg: '#E9F3F6', fg: 'var(--accent)' },
    { href: '/admin', icon: '🛡', label: 'Review queue', bg: '#FDECEC', fg: '#8F1D1D' },
    { href: '/admin/approvals', icon: '✓', label: 'Approvals', bg: '#E9F3F6', fg: 'var(--accent)' },
    // Only /admin/reports exists today. Pointing a tile at a route that does not
    // exist is a 404 the user has to find, so reports live inside the console for now.
    { href: '/admin', icon: '⚑', label: 'Reports', bg: '#FDECEC', fg: '#8F1D1D' },
    { href: '/admin/payouts', icon: '₦', label: 'Payouts', bg: '#E4F5EA', fg: 'var(--leaf)' },
  ];

  if (role === 'admin') return admin;
  if (role === 'trainer') return trainer;
  return participant;
}
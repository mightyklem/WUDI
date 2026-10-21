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
// The tinted tiles are named rather than written out, so a tile in a dark theme is a
// dark tint instead of a pale one pasted onto a dark page.
const TEAL_TILE = { bg: 'var(--accent-soft)', fg: 'var(--accent-mark)' };
const GOLD_TILE = { bg: 'var(--gold-soft)', fg: 'var(--gold-ink)' };
const LEAF_TILE = { bg: 'var(--leaf-soft)', fg: 'var(--leaf-ink)' };
const CLAY_TILE = { bg: 'var(--clay-soft)', fg: 'var(--clay-ink)' };

export function roleOf(user: { isAdmin: boolean; isTrainer: boolean }): Role {
  if (user.isAdmin) return 'admin';
  if (user.isTrainer) return 'trainer';
  return 'participant';
}

/**
 * The hours of the day and the greeting that goes with each of them.
 *
 * Written as the hours themselves rather than as a set of rules, so the review board
 * and the home page cannot drift apart: the board shows these windows, and the home
 * page looks them up.
 */
export const GREETING_WINDOWS: { from: number; to: number; icon: IconName; text: string }[] = [
  { from: 0, to: 5, icon: 'moon', text: 'Good night' },
  { from: 5, to: 12, icon: 'sunrise', text: 'Good morning' },
  { from: 12, to: 17, icon: 'sun', text: 'Good afternoon' },
  { from: 17, to: 21, icon: 'sunset', text: 'Good evening' },
  { from: 21, to: 24, icon: 'moon', text: 'Good night' },
];

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
  const w = GREETING_WINDOWS.find((x) => hour >= x.from && hour < x.to);
  return w ? { icon: w.icon, text: w.text } : { icon: 'moon', text: 'Good night' };
}

export function tilesFor(role: Role, badges: Badges = {}): Tile[] {
  // A 0 count means "nothing yet" — show the tile, hide the bubble.
  const count = (n: number | null | undefined) => (n && n > 0 ? n : undefined);
  const seats = count(badges.seats);
  const certs = count(badges.certs);

  const participant: Tile[] = [
    { href: '/feed', icon: '◎', label: 'Explore', ...TEAL_TILE },
    // Browsing classes is how a learner finds something to attend; Explore alone
    // only shows what a trainer chose to post about.
    { href: '/classes', icon: '📚', label: 'Classes', ...TEAL_TILE },
    { href: '/me/registrations', icon: '🎟', label: 'My seats', ...MUTED_TILE, badge: seats },
    { href: '/me/certificates', icon: '🏅', label: 'Certificates', ...GOLD_TILE, badge: certs },
    { href: '/trainers', icon: '🤝', label: 'Follow', ...LEAF_TILE },
    { href: '/me/notifications', icon: '🔔', label: 'Alerts', ...MUTED_TILE },
  ];

  // Trainers live here too, so they can still sit in on sessions.
  const trainer: Tile[] = [
    { href: '/trainings/new', icon: '＋', label: 'New training', ...TEAL_TILE },
    { href: '/classes', icon: '📚', label: 'Classes', ...TEAL_TILE },
    { href: '/feed', icon: '◎', label: 'Explore', ...MUTED_TILE },
    { href: '/me/registrations', icon: '🎟', label: 'Attend', ...MUTED_TILE },
    { href: '/me/certificates', icon: '🏅', label: 'Certificates', ...GOLD_TILE, badge: certs },
    // Where the money goes, and how much of it there is. Neither page was linked from
    // anywhere, so a trainer who had been approved and was owed money had no way of
    // finding the screen that puts their bank account on file -- and the payout was
    // simply held, with nothing on screen to say why.
    { href: '/trainer/earnings', icon: '₦', label: 'Earnings', ...LEAF_TILE },
    { href: '/trainer/payout-settings', icon: '🏦', label: 'Payouts', ...MUTED_TILE },
    { href: '/me/notifications', icon: '🔔', label: 'Alerts', ...MUTED_TILE },
  ];

  const admin: Tile[] = [
    { href: '/admin/sessions', icon: '◉', label: 'Live rooms', ...TEAL_TILE },
    { href: '/admin', icon: '🛡', label: 'Review queue', ...CLAY_TILE },
    { href: '/admin/approvals', icon: '✓', label: 'Approvals', ...TEAL_TILE },
    // Only /admin/reports exists today. Pointing a tile at a route that does not
    // exist is a 404 the user has to find, so reports live inside the console for now.
    { href: '/admin', icon: '⚑', label: 'Reports', ...CLAY_TILE },
    { href: '/admin/payouts', icon: '₦', label: 'Payouts', ...LEAF_TILE },
  ];

  if (role === 'admin') return admin;
  if (role === 'trainer') return trainer;
  return participant;
}
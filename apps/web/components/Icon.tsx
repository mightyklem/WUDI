/**
 * Learnovize icons.
 *
 * These replace the emoji that were doing this job. Emoji are the single
 * biggest reason the product looked inconsistent: 🎙 is a grey microphone on
 * Windows, a blue one on Apple and a yellow one on Android, and ✋ renders at a
 * different size to 📷 beside it. Nothing lines up and nothing matches.
 *
 * Every icon is drawn on the same 24-unit grid with the same 2px stroke, so a
 * row of them aligns by construction rather than by luck. They inherit colour
 * and size from their context.
 */
export type IconName =
  | 'mic' | 'mic-off' | 'camera' | 'camera-off'
  | 'share' | 'hand' | 'chat' | 'people' | 'poll'
  | 'more' | 'leave' | 'power' | 'lock' | 'check' | 'check-circle'
  | 'clock' | 'calendar' | 'star' | 'heart' | 'lightbulb' | 'laughing'
  | 'shield' | 'wallet' | 'badge' | 'search' | 'close' | 'chevron-right'
  | 'chevron-left' | 'arrow-right' | 'play' | 'sparkles' | 'alert'
  | 'info' | 'link' | 'download' | 'book' | 'grid' | 'expand' | 'home' | 'logout' | 'flip'
  | 'bell' | 'sunrise' | 'sun' | 'sunset' | 'moon';

const P: Record<IconName, string> = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  'mic-off': 'M9 9v3a3 3 0 0 0 4.5 2.6M15 11V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 10.9 5.8M12 18v3M3 3l18 18',
  camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  'camera-off': 'M3 3l18 18M9 9v.5M15 13.5a3.5 3.5 0 0 1-5.3 3M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8',
  share: 'M4 5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM20 15v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4M8 10l8-4M8 10l8 4',
    // Two arcs with arrowheads: the conventional flip-camera mark, and legible at 19px
    // where a camera glyph with a rotation arrow would turn to mush.
    flip: 'M4 9a8 8 0 0 1 13.7-5.6M20 15a8 8 0 0 1-13.7 5.6M18 3v4h-4M6 21v-4h4',
  hand: 'M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-.5V6.5a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-5 5h-1a5 5 0 0 1-4.3-2.5L4 14.5a1.5 1.5 0 0 1 2.6-1.5L8 14',
  chat: 'M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z',
  people: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8',
  poll: 'M5 20V10M12 20V4M19 20v-6M3 21h18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  leave: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  power: 'M12 3v9M6.5 6.8a8 8 0 1 0 11 0',
  lock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
  check: 'M4 12l5 5L20 6',
  'check-circle': 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  calendar: 'M4 6h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM3 11h18M8 3v4M16 3v4',
  star: 'M12 3l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9z',
  heart: 'M12 20s-7-4.5-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5c0 5-7 9.5-7 9.5z',
  lightbulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5.9 1.2 1 2h5c.1-.8.4-1.5 1-2A6 6 0 0 0 12 3z',
  laughing: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  shield: 'M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10zM9 12l2 2 4-4',
  wallet: 'M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v1M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a1 1 0 0 0-1-1H4a1 1 0 0 1-1-1zM17 13h.01',
  badge: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.2 13.9L7 22l5-3 5 3-1.2-8.1',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  close: 'M6 6l12 12M18 6L6 18',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-left': 'M15 5l-7 7 7 7',
  'arrow-right': 'M4 12h15M13 6l6 6-6 6',
  play: 'M7 4l13 8-13 8z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z',
  alert: 'M12 8v5M12 17h.01M10.3 3.9L2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  expand: 'M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    // A bell rather than the alert triangle: that one already means "something is wrong",
    // and reusing it for "you have unread mail" would make the two indistinguishable.
    bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11',
    // The hour of the day, drawn rather than borrowed from the emoji set. A sun that is
    // half up is a morning; one that is half down is an evening.
  sunrise: 'M3 18h18M7 18a5 5 0 0 1 10 0M12 3v3M5.6 7.6 7 9M18.4 7.6 17 9',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v2M12 19v2M4.9 4.9 6.3 6.3M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1 6.3 17.7M17.7 6.3l1.4-1.4',
  sunset: 'M3 17h18M7 17a5 5 0 0 0 10 0M12 3v3M5.6 7.6 7 9M18.4 7.6 17 9',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
};

/** Icons whose meaning changes with state, paired here so callers stay honest. */
export function micIcon(on: boolean): IconName { return on ? 'mic' : 'mic-off'; }
export function cameraIcon(on: boolean): IconName { return on ? 'camera' : 'camera-off'; }

export default function Icon({
  name,
  size = 18,
  strokeWidth = 1.9,
  ...rest
}: {
  name: IconName;
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
  id?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={P[name]} />
    </svg>
  );
}
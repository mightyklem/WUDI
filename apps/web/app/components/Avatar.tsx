'use client';

/**
 * A person's picture, or their initials when they have not given one.
 *
 * Almost nobody uploads a picture on the first day, so a profile that shows an empty
 * grey circle reads as broken. Initials are always something, and they are the same
 * colour for everybody, which keeps a list of people looking like a list of people.
 */

const TINTS = [
  { bg: '#E4F1F3', fg: '#14616E' },
  { bg: '#FBF0DC', fg: '#7E4F0C' },
  { bg: '#E6F2E9', fg: '#235334' },
  { bg: '#FBEBE3', fg: '#93421F' },
  { bg: '#EDE9F6', fg: '#4B3A7A' },
  { bg: '#F6E9F0', fg: '#8A3A63' },
];

/** A stable colour for a name, so the same person is the same colour everywhere. */
function tintFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function initialsOf(name: string | null | undefined) {
  const n = (name || '').trim();
  if (!n) return '';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  photoUrl,
  size = 44,
  seed,
}: {
  name: string | null | undefined;
  photoUrl?: string | null;
  size?: number;
  /** Falls back to this when there is no name -- usually the email or the user id. */
  seed?: string;
}) {
  const key = (name || seed || '').trim();
  const tint = tintFor(key || 'x');
  const initials = initialsOf(name) || initialsOf(seed) || '?';

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name ? `${name}'s picture` : 'Picture'}
        width={size}
        height={size}
        style={{
          width: size, height: size, borderRadius: '50%', objectFit: 'cover',
          flex: '0 0 auto', display: 'block', border: '1px solid var(--line)',
          background: 'var(--pill)',
        }}
      />
    );
  }

  return (
    <span
      aria-hidden={!!name}
      title={name || undefined}
      style={{
        width: size, height: size, borderRadius: '50%', flex: '0 0 auto',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: tint.bg, color: tint.fg, fontWeight: 800,
        fontSize: Math.round(size * 0.38), lineHeight: 1,
        border: '1px solid var(--line)',
      }}
    >
      {initials}
    </span>
  );
}

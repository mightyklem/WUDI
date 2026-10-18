'use client';

/**
 * Placeholder shown while something is loading.
 *
 * Exists because the alternative was worse: a page that renders nothing while it waits looks
 * broken, and a page that renders the wrong thing while it waits looks like a decision. The
 * header did exactly that -- showing "Sign in" for the fraction of a second before it found
 * out the person was signed in, which read as being logged out on every navigation.
 *
 * Shaped like what it replaces, not a generic grey box, because a skeleton that matches the
 * final layout stops the page jumping when the real content arrives.
 */

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        background: 'linear-gradient(90deg, var(--line) 25%, var(--bg-soft, #f2f5f6) 50%, var(--line) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-sweep 1.4s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/** A block of lines, for a paragraph or list that has not arrived. */
export function SkeletonLines({ lines = 3, gap = 9 }: { lines?: number; gap?: number }) {
  return (
    <span style={{ display: 'grid', gap }}>
      {Array.from({ length: lines }, (_, i) => (
        // The last line is short, because text that ends flush looks like a table.
        <Skeleton key={i} width={i === lines - 1 ? '62%' : '100%'} height={13} />
      ))}
    </span>
  );
}

/** A card-sized placeholder, matching .card so the page does not resize under the reader. */
export function SkeletonCard({ height = 96 }: { height?: number }) {
  return <Skeleton height={height} radius={16} />;
}

/**
 * Nav-slot placeholder.
 *
 * Deliberately the same size as the buttons it stands in for. A narrower bar would make the
 * header jump sideways the instant the real controls arrived, which is the flash this whole
 * component exists to remove.
 */
export function SkeletonNavAction() {
  return <Skeleton width={84} height={38} radius={999} />;
}
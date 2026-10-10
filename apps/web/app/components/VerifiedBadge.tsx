/**
 * The verified badge.
 *
 * Takes the derived state from badgeState() rather than a boolean, because a badge that
 * has expired must read as "needs renewing", which is different from never having been
 * verified -- and a component handed a raw boolean has no way to tell those apart.
 */
export default function VerifiedBadge({
  state,
  size = 'md',
}: {
  state: { verified: boolean; expired?: boolean; label: string | null; rating?: string | null };
  size?: 'sm' | 'md';
}) {
  if (!state.verified) {
    if (!state.expired) return null;
    return (
      <span
        className="badge rev"
        style={{ fontSize: size === 'sm' ? 11 : 12 }}
        title="This verification has lapsed and needs renewing."
      >
        Verification lapsed
      </span>
    );
  }

  const rating = state.rating;
  // C is amber, not red. It means "developing", which is not a warning to a learner --
  // it should still read as verified, just with less behind it.
  const tone = rating === 'C' ? 'paid' : 'ok';

  return (
    <span className={`badge ${tone}`} style={{ fontSize: size === 'sm' ? 11 : 12 }}>
      <span aria-hidden="true">✓</span> Verified
      {rating ? ` · ${rating}` : ''}
      <span className="sr-only">
        {rating === 'A'
          ? ' rated expert'
          : rating === 'B'
            ? ' rated skilled'
            : rating === 'C'
              ? ' rated developing'
              : ''}
      </span>
    </span>
  );
}
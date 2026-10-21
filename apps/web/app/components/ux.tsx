/**
 * The three design rules, as components.
 *
 * A rule that lives only in a document gets argued about again in every review. These are
 * the shapes, so a screen uses them rather than re-deciding.
 *
 *   Clarity       the key numbers first, whitespace separating the rest
 *   Consistency   one card shape, one spacing rhythm, one accent colour
 *   Wow-factor    restraint, one focused call to action, one marked best option
 */

/** A row of figures. The number is the point; the label is under it. */
export function UxStats({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="ux-stats">{children}</div>;
}

/**
 * One figure.
 *
 * `lead` marks the one that matters most on the screen. One per screen, never two -- if
 * everything is the headline, nothing is.
 */
export function UxStat({
  value,
  label,
  lead,
}: {
  value: React.ReactNode;
  label: string;
  lead?: boolean;
}) {
  return (
    <div className="ux-stat" data-lead={lead || undefined}>
      <span className="ux-stat-n">{value}</span>
      <span className="ux-stat-l">{label}</span>
    </div>
  );
}

/**
 * A card.
 *
 * `best` marks the option you would pick if you picked only one. It is marked with a
 * coloured edge and a small tag rather than a fill, because a fill competes with the content
 * for attention and the content is the point.
 */
export function UxCard({
  children,
  best,
  bestLabel = 'Best',
  flat,
  style,
}: {
  children: React.ReactNode;
  /** Marks this as the recommended option. */
  best?: boolean;
  bestLabel?: string;
  /** No shadow, for a card inside a card. */
  flat?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`ux-card${best ? ' ux-best' : ''}`} data-flat={flat || undefined} style={style}>
      {best && <span className="ux-best-tag">{bestLabel}</span>}
      {children}
    </div>
  );
}

/** A section boundary. Whitespace and a hairline, not a filled bar. */
export function UxRule() {
  return <hr className="ux-rule" />;
}

/** The one call to action on a screen. */
export function UxCta({
  children,
  href,
  onClick,
  type,
  quiet,
  style,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  /** The quieter sibling, for the option beside the loud one. */
  quiet?: boolean;
  style?: React.CSSProperties;
}) {
  const cls = `btn ${quiet ? 'ux-cta-quiet' : 'ux-cta'}`;
  if (href) {
    return (
      <a className={cls} href={href} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type={type ?? 'button'} className={cls} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

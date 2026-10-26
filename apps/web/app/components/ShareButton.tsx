'use client';

import { useState } from 'react';

/**
 * Share a page.
 *
 * The phone's own share sheet when it has one, because a learner sharing a class with
 * a friend is nearly always on a phone and nearly always has somebody to send it to
 * there. Where there is no share sheet (desktop), direct links to WhatsApp, X,
 * Telegram, Facebook and LinkedIn are shown instead of a dead button, plus copy-link.
 */
export default function ShareButton({
  url,
  title,
  label = 'Share',
  className = 'btn',
  ariaLabel,
  titleAttr,
}: {
  url: string;
  title: string;
  label?: React.ReactNode;
  className?: string;
  /** Needed when the label is an icon alone, so the button still has a name. */
  ariaLabel?: string;
  titleAttr?: string;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  function absolute(): string {
    if (typeof window !== 'undefined' && url.startsWith('/')) {
      return new URL(url, window.location.origin).toString();
    }
    return url;
  }

  async function share() {
    const link = absolute();

    // The share sheet, where the phone has one.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url: link });
        return;
      } catch {
        // Cancelled, or the sheet refused. Falling through to copying is better than
        // showing an error for something the person chose to stop.
      }
    }

    // Desktop (or sheet refused): open the platform row instead of guessing.
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
      setExpanded((v) => !v);
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setSaid('Link copied');
    } catch {
      // A browser that will not let a page write to the clipboard still shows the
      // link, so the person can copy it themselves.
      setSaid(link);
    }
    setTimeout(() => setSaid(null), 2500);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(absolute());
      setSaid('Link copied');
    } catch {
      setSaid(absolute());
    }
    setTimeout(() => setSaid(null), 2500);
  }

  if (expanded) {
    const link = absolute();
    const text = encodeURIComponent(title);
    const enc = encodeURIComponent(link);
    const targets = [
      { name: 'WhatsApp', href: `https://wa.me/?text=${text}%20${enc}` },
      { name: 'X', href: `https://twitter.com/intent/tweet?text=${text}&url=${enc}` },
      { name: 'Telegram', href: `https://t.me/share/url?url=${enc}&text=${text}` },
      { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc}` },
      { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc}` },
    ];
    return (
      <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {targets.map((t) => (
          <a
            key={t.name}
            className="btn link"
            style={{ minHeight: 0, padding: '0 8px' }}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.name}
          </a>
        ))}
        <button type="button" className="btn link" style={{ minHeight: 0, padding: '0 8px' }} onClick={copy}>
          {said || 'Copy link'}
        </button>
        <button
          type="button"
          className="btn link"
          style={{ minHeight: 0, padding: '0 8px' }}
          onClick={() => setExpanded(false)}
          aria-label="Close share options"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={share}
      aria-label={ariaLabel}
      title={titleAttr}
      style={typeof label !== 'string' ? { minWidth: 48, justifyContent: 'center' } : undefined}
    >
      {said || label}
    </button>
  );
}

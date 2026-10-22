'use client';

import { useState } from 'react';

/**
 * Share a page.
 *
 * The phone's own share sheet when it has one, because a learner sharing a class with
 * a friend is nearly always on a phone and nearly always has somebody to send it to
 * there. Where there is no share sheet, the link is copied and said so, because a
 * button that does nothing when it is pressed is worse than no button.
 */
export default function ShareButton({
  url,
  title,
  label = 'Share',
  className = 'btn',
}: {
  url: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const [said, setSaid] = useState<string | null>(null);

  async function share() {
    const absolute =
      typeof window !== 'undefined' && url.startsWith('/')
        ? new URL(url, window.location.origin).toString()
        : url;

    // The share sheet, where the phone has one.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url: absolute });
        return;
      } catch {
        // Cancelled, or the sheet refused. Falling through to copying is better than
        // showing an error for something the person chose to stop.
      }
    }

    try {
      await navigator.clipboard.writeText(absolute);
      setSaid('Link copied');
    } catch {
      // A browser that will not let a page write to the clipboard still shows the
      // link, so the person can copy it themselves.
      setSaid(absolute);
    }
    setTimeout(() => setSaid(null), 2500);
  }

  return (
    <button type="button" className={className} onClick={share}>
      {said || label}
    </button>
  );
}

/**
 * Is this a picture we are willing to show?
 *
 * A profile picture is drawn on a page that strangers see, so it has to be an image we
 * hold and nothing else. A URL pointing anywhere -- a tracker on somebody else's page, a
 * script dressed as a picture -- is not something to put on a profile, and the check
 * has to be here rather than in each caller.
 */

/** One of our own uploads, or a full URL on an image file. */
export function validatePhotoUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  if (s.length > 500) return null;
  // Either our own upload path, or a full URL on the public host.
  if (s.startsWith('/uploads/') || s.startsWith('/assets/')) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(u.pathname)) return null;
      return s;
    } catch {
      return null;
    }
  }
  return null;
}

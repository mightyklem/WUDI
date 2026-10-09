'use client';
import { useState } from 'react';
import Link from 'next/link';

/**
 * Shareable class link with copy-to-clipboard.
 *
 * A bare <a> made the trainer select and copy the URL by hand every time, and offered
 * nowhere to go once they had it. Copying is the action they actually want -- they are
 * about to paste it into WhatsApp -- so that is the button, and the link to their own
 * dashboard appears afterwards rather than competing with it.
 */
export default function CopyInviteLink({ url, label = 'Invite link' }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setFailed(false);
    try {
      // navigator.clipboard needs a secure context. Fall back for anything older or
      // served over plain http, so the button is never silently dead.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('copy rejected');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          readOnly
          value={url}
          aria-label={`${label} to copy`}
          onFocus={(e) => e.currentTarget.select()}
          style={{ maxWidth: 320, fontSize: 13, padding: '6px 10px' }}
        />
        <button className="btn primary" style={{ minHeight: 0, padding: '7px 14px', fontSize: 13 }} onClick={copy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Once the link is in hand the trainer's next move is their own work, not the
          link again, so the dashboard appears only after a successful copy. */}
      {copied && (
        <Link className="btn link" href="/dashboard">
          Go to your dashboard →
        </Link>
      )}

      {failed && (
        <span className="muted" style={{ fontSize: 13 }}>
          Copy was blocked — select the link above and copy it manually.
        </span>
      )}
    </div>
  );
}
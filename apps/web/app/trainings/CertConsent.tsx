'use client';
import { useState } from 'react';
import Link from 'next/link';

/**
 * Consent to publish certificate details publicly.
 *
 * This exists because the register endpoints were all sending `certConsentPublic: true`
 * unconditionally — there was no checkbox anywhere in the product. The privacy policy
 * told people their name appears publicly "only if you tick the consent box at
 * registration", so the page described a control that did not exist, and every
 * registrant was published without ever being asked.
 *
 * Deliberately NOT pre-ticked. A default-checked box is not consent under NDPA: the
 * person has to take the affirmative action. Registration still works without it — the
 * learner gets their certificate, it simply is not listed on the public verification page.
 *
 * The explanation is behind an arrow rather than printed underneath. This sits on the
 * button that people are trying to press to buy something, and a paragraph about public
 * registration is the last thing that should be competing with that. The consequence of
 * ticking it is still one click away and still stated before they tick it.
 */
export default function CertConsent({
  checked,
  onChange,
  id = 'cert-consent',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        marginTop: 10,
        border: '1px solid var(--line-2)',
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface-2)',
      }}
    >
      {/* The row: tick the box, or open the detail. Separate targets on purpose -- one
          button doing both would mean the arrow is a mis-click that publishes a name. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 6px 4px 12px' }}>
        <label
          htmlFor={id}
          style={{
            display: 'flex', gap: 9, alignItems: 'center',
            flex: 1, cursor: 'pointer', fontSize: 'var(--t-sm)', fontWeight: 700, padding: '6px 0',
          }}
        >
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            style={{ flexShrink: 0 }}
          />
          <span>Yes, list me on the public register</span>
        </label>

        <button
          type="button"
          className="btn link"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={`${id}-detail`}
          aria-label={open ? 'Hide what this means' : 'Show what this means'}
          style={{
            padding: '8px 10px', fontSize: 'var(--t-xs)', color: 'var(--mut)',
            minWidth: 34, textAlign: 'center',
          }}
        >
          <span aria-hidden style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>
            ▾
          </span>
        </button>
      </div>

      {open && (
        <div
          id={`${id}-detail`}
          style={{
            padding: '0 12px 12px', fontSize: 'var(--t-sm)', lineHeight: 1.55,
            color: 'var(--mut)', borderTop: '1px solid var(--line-2)', paddingTop: 10, marginTop: 4,
          }}
        >
          Your name and certificate number become viewable by anyone with the link. Leave
          this unticked and you still get your certificate — it just is not published.{' '}
          <Link href="/privacy" target="_blank" className="btn link" style={{ fontSize: 'var(--t-sm)' }}>
            Privacy policy
          </Link>
        </div>
      )}
    </div>
  );
}
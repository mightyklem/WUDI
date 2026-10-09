'use client';
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
 * learner gets their certificate, it simply is not listed on the public verification
 * page.
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
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex', gap: 9, alignItems: 'flex-start',
        padding: '10px 12px', marginTop: 10,
        border: '1px solid var(--line-2, #E7E0D5)', borderRadius: 'var(--r-sm)',
        background: 'var(--surface-2, #F7F4EF)', cursor: 'pointer',
        fontSize: 13, lineHeight: 1.5,
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, flexShrink: 0 }}
      />
      <span>
        <b>Yes, list me on the public certificate register.</b>{' '}
        Your name and certificate number become viewable by anyone with the link. Leave
        this unticked and you still get your certificate — it just is not published.{' '}
        <Link href="/privacy" target="_blank" className="btn link" style={{ fontSize: 13 }}>
          Privacy policy
        </Link>
      </span>
    </label>
  );
}
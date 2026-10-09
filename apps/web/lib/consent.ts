/**
 * Consent wording, in one place.
 *
 * Kept out of the route file because Next.js does not allow importing from a route
 * module, and out of the client component because a copy there could drift from the
 * version recorded against the approval — leaving consentAt attesting to text the
 * trainer never actually saw.
 */

export const ID_CONSENT_VERSION = '2026-01-id-v1';

export function idConsentText(): string {
  return (
    'I agree that Learnovize may store and review the identity document I upload, ' +
    'for the sole purpose of verifying that I am who I say I am and deciding whether ' +
    'I may issue paid certificates. My document will be kept private, will not be ' +
    'published, and will not be shown to learners or other trainers. Staff who open it ' +
    'are recorded. I can withdraw this and have the document deleted by contacting support.'
  );
}
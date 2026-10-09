import { NextResponse } from 'next/server';
import { ID_CONSENT_VERSION, idConsentText } from '@/lib/consent';

export const dynamic = 'force-dynamic';

// GET /api/trainer/approval/consent-text
// The wording the trainer must agree to, served from the same module that records the
// version against their approval. A copy in the client component could drift from what
// gets stored, and then consentAt would attest to text nobody actually saw.
export async function GET() {
  return NextResponse.json({ text: idConsentText(), version: ID_CONSENT_VERSION });
}
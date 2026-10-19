import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getBearer, verifyAccessToken } from '@/lib/auth';
import { ID_CONSENT_VERSION } from '@/lib/consent';
import { describeAccess, idAccessQueryFor } from '@/lib/id-access';

export const dynamic = 'force-dynamic';

/**
 * Nigerian identity numbers, checked properly rather than "a string that exists".
 *
 * A National Identification Number is exactly 11 digits. Validating only the character
 * set would let "12345" through as an NIN, which tells a reviewer nothing and, worse,
 * makes a wrong claim look like a real one. Rejecting it here is kinder than having
 * staff spend the review discovering the document is not what was claimed.
 *
 * Passport numbers vary more across issuing series, so those are checked for
 * plausibility rather than a fixed pattern -- enough to catch a typo, or an email address
 * typed into the wrong box.
 */
const IDENTITY_TYPES = {
  nin: { label: 'National Identification Number (NIN)', test: (v: string) => /^\d{11}$/.test(v) },
  passport: { label: 'National passport', test: (v: string) => /^[A-Z0-9]{6,12}$/.test(v) },
} as const;
type IdentityType = keyof typeof IDENTITY_TYPES;

function normaliseIdentityNumber(raw: unknown, type: IdentityType): string | null {
  const v = String(raw ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
  return IDENTITY_TYPES[type].test(v) ? v : null;
}

/**
 * POST /api/trainer/approval
 *   { idDocKeys: string[], identityType: 'nin'|'passport', identityNumber: string,
 *     bankStatementKey?: string, evidence?: string, consent: boolean }
 *
 * Identity verification. It gates payouts, not teaching -- free and paid classes are
 * open either way. The document type and its number are both required, because a picture
 * with no claim attached to it cannot be checked against anything.
 */
export async function POST(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await prisma.trainerProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ error: 'Trainer profile required' }, { status: 403 });

  const { idDocKeys, evidence, consent, identityType, identityNumber, bankStatementKey } =
    (await req.json().catch(() => ({}))) as {
      idDocKeys?: string[]; evidence?: string; consent?: boolean;
      identityType?: string; identityNumber?: string; bankStatementKey?: string;
    };

  // Enforced here, not just in the form. The form previously had no checkbox at all, so
  // an identity document was being stored with no recorded basis for processing it. The
  // checkbox is the visible half; this is the half that actually holds.
  if (consent !== true) {
    return NextResponse.json(
      { error: 'You must agree to us storing your ID document before we can review it.' },
      { status: 400 },
    );
  }
  if (!Array.isArray(idDocKeys) || idDocKeys.length < 1 || idDocKeys.length > 5) {
    return NextResponse.json({ error: 'Upload 1-5 ID documents first (kind=id)' }, { status: 400 });
  }
  if (idDocKeys.some((k) => typeof k !== 'string' || !k.startsWith(`id/${userId}/`))) {
    return NextResponse.json({ error: 'ID keys must be your own uploads' }, { status: 400 });
  }

  const type = String(identityType || '').trim().toLowerCase();
  if (!(type in IDENTITY_TYPES)) {
    return NextResponse.json(
      { error: 'Choose which document you are supplying: NIN or national passport' },
      { status: 400 },
    );
  }
  const number = normaliseIdentityNumber(identityNumber, type as IdentityType);
  if (!number) {
    return NextResponse.json(
      {
        error:
          type === 'nin'
            ? 'A NIN is 11 digits. Check the number on your document.'
            : 'A passport number is 6-12 letters and digits. Check the number on your document.',
      },
      { status: 400 },
    );
  }

  // Same ownership rule as the ID keys. Without it a reviewer could be handed a document
  // that belongs to somebody else.
  let bank: string | null = null;
  if (bankStatementKey) {
    if (typeof bankStatementKey !== 'string' || !bankStatementKey.startsWith(`bankstatement/${userId}/`)) {
      return NextResponse.json({ error: 'Bank statement must be your own upload' }, { status: 400 });
    }
    bank = bankStatementKey;
  }

  const approval = await prisma.trainerApproval.create({
    data: {
      trainerId: userId,
      idDocUrls: idDocKeys,
      identityType: type,
      identityNumber: number,
      bankStatementKey: bank,
      expertiseEvidence: (evidence || '').slice(0, 2000) || null,
      consentAt: new Date(),
      consentVersion: ID_CONSENT_VERSION,
      status: 'pending',
    },
  });
  await prisma.trainerProfile.update({
    where: { userId },
    data: { approvalState: 'pending', rejectionReason: null },
  });
  return NextResponse.json({ approval }, { status: 201 });
}

// GET /api/trainer/approval — my latest request + state
//
// Also returns who has opened my identity documents. The consent text says staff access
// is recorded, which is only a real commitment if the trainer can actually see it --
// otherwise "recorded" is indistinguishable from "we may or may not have looked".
export async function GET(req: Request) {
  const token = getBearer(req);
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [profile, latest] = await Promise.all([
    prisma.trainerProfile.findUnique({ where: { userId } }),
    prisma.trainerApproval.findFirst({ where: { trainerId: userId }, orderBy: { createdAt: 'desc' } }),
  ]);

  // Only meaningful once documents have actually been submitted -- an empty key list
  // would otherwise match nothing and look like nobody ever looked, which is not the
  // same claim as "there is nothing to look at".
  const access = latest?.idDocUrls?.length
    ? await prisma.auditLog.findMany({
        where: idAccessQueryFor(userId),
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          createdAt: true,
          actor: { select: { email: true, trainerProfile: { select: { displayName: true } } } },
        },
      })
    : [];

  return NextResponse.json({
    approvalState: profile?.approvalState || 'none',
    paidCertApproved: profile?.paidCertApproved || false,
    rejectionReason: profile?.rejectionReason || null,
    latest,
    idAccessLog: access.map((row) =>
      describeAccess({
        createdAt: row.createdAt,
        actor: {
          displayName: row.actor?.trainerProfile?.displayName ?? null,
          email: row.actor?.email ?? null,
        },
      }),
    ),
  });
}

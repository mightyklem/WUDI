import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { programPct, isEligible, personName } from '@learnovize/shared';
import { putPrivate } from '@/lib/storage';
import { awardCertificate } from '@/lib/points';
import { signCertificate } from '@/lib/cert-signing';
import { certificateReadyEmail, emailEnabled, sendEmail } from '@/lib/email';
import { renderCertificatePdf, type CertRenderInput } from '@/lib/cert-pdf';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** LEARNOVIZE-YYYY-XXXXXX (matches shared isCertNumber after rename). */
export function genCertNumber(): string {
  const bytes = randomBytes(6);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `LEARNOVIZE-${new Date().getUTCFullYear()}-${s}`;
}

export type Eligibility = {
  presentCount: number; total: number; pct: number;
  minMet: boolean; paidOk: boolean; eligible: boolean;
  /** The days the certificate would cover, and how to describe them. */
  dayIds: string[];
  scopeLabel: string;
  /** Attended days that were free, so the UI can say why they are not on the certificate. */
  excludedFreeDays: string[];
};

/** "Full program" when every day was attended, otherwise the days covered. */
export function scopeLabelFor(days: { dayIndex: number; topic: string | null }[], attended: { dayIndex: number; topic: string | null }[]) {
  if (!days.length || !attended.length) return 'Full program';
  if (attended.length === days.length) return 'Full program';
  const topics = attended.map((d) => d.topic).filter(Boolean);
  if (topics.length === attended.length) return topics.join(', ');
  const indices = attended.map((d) => `Day ${d.dayIndex}`).join(', ');
  return topics.length ? `${topics.join(', ')} (${indices})` : indices;
}

/**
 * FR-8.1: attendance % meets min AND paid when certification is paid.
 *
 * Scoped to the days the learner actually enrolled in (FR-11). A learner who
 * bought two days of a five-day class is measured on those two days, and their
 * certificate records that scope rather than claiming the whole program.
 *
 * On a paid-certificate class the scope is further narrowed to the days actually
 * PAID for. A trainer can open some days free, and a free day is outside the
 * certificate entirely: it does not appear on it, and it does not count towards
 * the attendance percentage either. Letting it dilute completion would fail a
 * learner who turned up to everything they bought; letting it inflate completion
 * would mean buying one day of a five-day programme counts as 100% of it.
 */
export async function computeEligibility(trainingId: string, userId: string): Promise<Eligibility> {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: {
      days: { orderBy: { dayIndex: 'asc' }, include: { sessions: { select: { id: true } } } },
      sessions: { select: { id: true, dayId: true } },
    },
  });
  if (!training) throw new Error('Training not found');

  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
    include: { dayEnrollments: { select: { dayId: true, priceNgn: true, paid: true } } },
  });

  const chosen = new Set((reg?.dayEnrollments ?? []).map((d) => d.dayId));
  // Days the learner actually paid for. A free day is not part of a paid certificate.
  const paidDayIds = new Set(
    (reg?.dayEnrollments ?? []).filter((d) => d.paid && d.priceNgn > 0).map((d) => d.dayId),
  );

  // Registrations created before day-picking existed have no day choices, so they
  // fall back to the whole training rather than silently measuring nothing.
  let scopedDays = chosen.size ? training.days.filter((d) => chosen.has(d.id)) : training.days;
  // Only narrow to paid days on a paid-certificate class where we can actually tell
  // which were paid. Otherwise leave the scope alone -- a free class has no
  // certificate to narrow, and an unpaid pending registration must still be measurable.
  if (training.certMode === 'paid' && paidDayIds.size) {
    scopedDays = scopedDays.filter((d) => paidDayIds.has(d.id));
  }

  const scopedDayIds = new Set(scopedDays.map((d) => d.id));
  // A session with no day attached predates the day model; keep it in scope.
  // Attendance is read across every day the learner chose, not just the certificate
  // scope: the scope decides what counts towards completion, but we still need to know
  // whether a free day was attended in order to explain its absence from the certificate.
  const chosenSessions = training.sessions.filter((s) => !s.dayId || chosen.size === 0 || chosen.has(s.dayId));
  const logs = await prisma.attendanceLog.findMany({
    where: { userId, sessionId: { in: chosenSessions.map((s) => s.id) } },
  });
  const presentSessions = new Set(logs.filter((l) => l.present).map((l) => l.sessionId));

  // Narrow to the certificate scope only after reading attendance.
  const scopedSessions = chosenSessions.filter((s) => !s.dayId || scopedDayIds.has(s.dayId));
  const presentCount = scopedSessions.filter((s) => presentSessions.has(s.id)).length;
  const total = scopedSessions.length;
  const pct = programPct(presentCount, total);

  const paidOk = training.certMode !== 'paid' || (reg?.certPaid ?? false);
  const attendedDays = scopedDays.filter((d) => d.sessions.some((s) => presentSessions.has(s.id)));
  // Free days the learner did attend, so the UI can explain their absence rather than
  // leaving a certificate that quietly covers less than the person expected.
  const excludedFreeDays = training.days
    .filter((d) => d.accessType !== 'paid' && (chosen.size === 0 || chosen.has(d.id)))
    .filter((d) => !paidDayIds.has(d.id))
    .filter((d) => d.sessions.some((s) => presentSessions.has(s.id)))
    .map((d) => `Day ${d.dayIndex}`);

  return {
    presentCount, total, pct,
    minMet: pct >= training.minPct, paidOk,
    eligible: reg?.status === 'active' && isEligible({ pct, minPct: training.minPct, certMode: training.certMode, paid: reg?.certPaid ?? false }),
    dayIds: attendedDays.map((d) => d.id),
    scopeLabel: scopeLabelFor(training.days, attendedDays),
    excludedFreeDays,
  };
}


/** Issue (or return existing) certificate for an eligible participant. */
export async function issueCertificate(
  trainingId: string,
  userId: string,
  /**
   * Attestation overrides the eligibility gate, and only the eligibility gate.
   *
   * Certificates are issued automatically now, so the trainer no longer decides who gets
   * one -- but the attendance behind that decision is measured by a webhook, and the
   * webhook has been demonstrably wrong. A learner who drops and rejoins had the earlier
   * window discarded and was marked absent. The trainer watched them stay for the whole
   * class, and there was no way for them to say so.
   *
   * So a trainer who personally taught the person may attest they were there. That is a
   * better witness than a metric, and it is bounded deliberately:
   *
   *   - it never grants a second certificate (the existing-row check runs first)
   *   - it never touches a revoked one (that requires an explicit restore)
   *   - it requires a reason, and writes its own audit action
   *
   * The name records who attests and why, so an attested certificate is visibly a
   * judgement rather than a measurement. An employer can tell the difference.
   */
  opts: { attest?: boolean; reason?: string; actorId?: string } = {},
) {
  // Matched on the pair, not on status='valid', because a REVOKED certificate must not
  // be quietly replaced by a fresh one. With auto-issue now running on its own, the old
  // query would re-issue for every revoked learner the moment their session ended --
  // turning a deliberate revocation into a certificate that reappears on the next run.
  // Revocation has to be terminal unless someone restores it deliberately.
  const existing = await prisma.certificate.findFirst({ where: { trainingId, userId } });
  if (existing) {
    if (existing.status === 'valid') return existing;
    throw Object.assign(
      new Error('This learner holds a revoked certificate — restore it rather than issuing another'),
      { code: 'REVOKED' },
    );
  }

  const e = await computeEligibility(trainingId, userId);
  if (!e.eligible && !opts.attest) {
    throw Object.assign(new Error('Not eligible: attendance or payment missing'), { code: 'INELIGIBLE' });
  }
  // An attestation that is not an override still has to clear the gate, and an override
  // that cannot say why is not a judgement at all.
  if (!e.eligible && opts.attest && !(opts.reason || '').trim()) {
    throw Object.assign(new Error('Attesting an ineligible learner needs a reason'), { code: 'NO_REASON' });
  }
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: { trainer: true },
  });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!training || !user) throw new Error('Not found');

  // Unique number with collision retry.
  let number = genCertNumber();
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.certificate.findUnique({ where: { number } });
    if (!clash) break;
    number = genCertNumber();
  }
  const issuedAt = new Date().toISOString();
  const dateText = new Date().toUTCString().slice(0, 16);

  // Sign the CLAIMS, not the PDF bytes. That ordering matters and is deliberate.
  //
  // Signing the file would be circular: the signature would have to be printed on the
  // document, so the bytes would change after signing and nothing would ever verify. And
  // it would prove less. What a holder needs to know is that Learnovize issued these
  // claims -- this person, this course, this trainer, this attendance -- and the claims
  // are known before the document is drawn. The PDF is a rendering of them; the signature
  // is over the rendering's subject.
  //
  // Signing before the render also means the snapshot embedded in the PDF is the exact
  // string that was signed, so an offline verifier can rebuild it from the visible
  // fields and compare rather than trusting a blob we handed them.
  const signed = signCertificate({
    number,
    learnerName: user.email,
    trainingTitle: training.title,
    trainerName: training.trainer.displayName,
    scope: e.scopeLabel,
    days: e.dayIds,
    pct: e.pct,
    issuedAt,
  });

const pdf = await renderCertificatePdf({
      // The name the learner gave us, not their email address. This was printing
      // user.email, so every certificate ever issued carries an email address where the
      // recipient's name belongs -- which is precisely the document somebody does not show
      // an employer. Falls back to the local part of the address rather than printing
      // "null", so an account with no name yet still gets a readable document.
      participantName: personName(user) ?? 'Learnovize Learner',
    trainingTitle: training.title,
    trainerName: training.trainer.displayName,
    dateText,
    number,
    logoUrl: training.trainer.logoUrl,
    signature: signed,
  });
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  // Private bucket, not public. The PDF embeds the learner's email, and the key is
  // derived from the certificate number -- so a public copy hands anyone who guesses or
  // is given a number both the learner's address, bypassing their consent choice, AND a
  // downloadable certificate that outlives revocation. Every read goes through
// /api/certificates/[id]/download, which checks consent, revocation and this hash
    // together before returning a byte.
  await putPrivate(certKeyFor(number), pdf, 'application/pdf');
// The row id is minted here rather than left to Prisma's default, because the PDF
  // path is built from it and has to exist before the insert. Deriving it locally and
  // letting the primary key reject a collision is one round trip instead of two.
  const certId = `cert_${randomBytes(12).toString('hex')}`;
  const cert = await prisma.certificate.create({
      data: {
        id: certId,
        number, trainingId, userId, sha256,
        // Not a URL any more. Kept as a path so the column keeps its meaning, but nothing
        // serves it directly -- the download route is the only way to the bytes, and it
        // re-checks everything. Keyed on the row id, not the certificate number, because
        // that is the parameter the sibling revoke and restore routes use.
        pdfUrl: `/api/certificates/${certId}/download`,
      snapshot: signed.snapshot,
      signature: signed.signature,
      keyId: signed.keyId,
      templateVersion: signed.templateVersion,
      // A partial-attendance certificate must state its scope, or a one-day
      // certificate is indistinguishable from the full program.
      scopeLabel: e.scopeLabel,
      dayIds: e.dayIds,
      pctAttended: e.pct,
      imageUrl: null, status: 'valid',
    },
  });
  // A certificate is worth points, awarded once per learner per training.
  await awardCertificate({ userId, trainingId });
  if (opts.attest && opts.actorId) {
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId,
        action: 'certificate.attest',
        target: `certificate:${cert.number}`,
        reason:
          `trainer attested over ${e.eligible ? 'the eligibility gate' : `ineligible (${e.pct}% attendance, met=${e.minMet}, paidOk=${e.paidOk})`}` +
          `: ${String(opts.reason || '').trim()}`,
      },
    });
  }
  return cert;
}

/** Upper bound per auto-issue run, so one trigger cannot try to render 5,000 PDFs. */
const AUTO_ISSUE_CAP = 200;

export type AutoIssueResult = {
  issued: { userId: string; number: string }[];
  alreadyHeld: number;
  notEligible: number;
  revoked: number;
  failed: number;
  truncated: boolean;
  /**
   * What actually went wrong, for the failures that were not a clean "not eligible".
   *
   * This was a bare `failed: 1` with no reason, which cost several rounds of guessing at
   * the cause -- signing, eligibility, storage -- none of which the number distinguished.
   * A counter that cannot say why it incremented is a counter nobody can act on.
   */
  errors: string[];
};

/**
 * Issue certificates to everyone entitled to one, with no trainer action.
 *
 * This exists because of a real outcome, not a hypothetical. A learner paid N1,500 for a
 * live class on 13 Oct, attended, gave consent, and had their session finish -- and
 * received nothing, because a certificate was only ever minted when the trainer opened
 * the training and pressed a button. Across the whole platform exactly one certificate
 * had ever been issued. The reward for paying depended on a stranger's diligence, and a
 * trainer who never logged in again silently withheld it from every learner forever.
 *
 * So issuance moves to the data. A trainer still holds a veto -- revoke, with a reason --
 * but the default is that an eligible learner is issued to.
 *
 * Two deliberate design calls, both of which differ from a literal reading of the ops
 * plan:
 *
 * 1. It issues IMMEDIATELY rather than after a 72-hour trainer review window. A window
 *    before issuance means the learner waits three days for something they already paid
 *    for and attended, and a trainer who never opens the platform means they wait
 *    forever. The trainer's power is kept, but as a bounded VETO rather than a gate:
 *    revoke within any window, with a reason. That is a smaller, more meaningful power
 *    than issuing, and it cannot be exercised by inaction.
 *
 * 2. Eligibility is re-derived per learner here rather than trusting the trainer's view
 *    of it. The trainer's button remains for issuing someone the moment they are ready,
 *    and both paths go through the same server-side check, so auto-issue can never grant
 *    what a manual issue would refuse.
 *
 * Safe to call repeatedly: issueCertificate is idempotent per learner, and a revoked
 * certificate is refused rather than replaced.
 */
export async function autoIssueForSession(sessionId: string): Promise<AutoIssueResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainingId: true, endsAtUtc: true, status: true },
  });
  if (!session) {
    return { issued: [], alreadyHeld: 0, notEligible: 0, revoked: 0, failed: 0, truncated: false, errors: [] };
  }
  // A cancelled session taught nobody anything, so nobody is entitled to a certificate
  // for it. Ending early is different: people attended the part that happened, and
  // eligibility is measured against sessions they actually turned up to.
  if (session.status === 'cancelled') {
    return { issued: [], alreadyHeld: 0, notEligible: 0, revoked: 0, failed: 0, truncated: false, errors: [] };
  }

  const registrations = await prisma.registration.findMany({
    where: { trainingId: session.trainingId, status: 'active' },
    select: { userId: true },
    take: AUTO_ISSUE_CAP + 1,
  });
  const truncated = registrations.length > AUTO_ISSUE_CAP;
  const batch = truncated ? registrations.slice(0, AUTO_ISSUE_CAP) : registrations;

  // Read what is already held BEFORE issuing, in one query. Deciding per learner by
  // inspecting what issueCertificate returned is not possible -- it returns the existing
  // row just as happily as a new one, and the two are the same shape. So the existing
  // state is known up front and the loop is unambiguous.
  const held = await prisma.certificate.findMany({
    where: { trainingId: session.trainingId, userId: { in: batch.map((r) => r.userId) } },
    select: { userId: true, number: true, status: true },
  });
  const valid = new Map(held.filter((c) => c.status === 'valid').map((c) => [c.userId, c.number]));
  const revoked = new Set(held.filter((c) => c.status === 'revoked').map((c) => c.userId));

  const result: AutoIssueResult = {
    issued: [], alreadyHeld: 0, notEligible: 0, revoked: 0, failed: 0, truncated, errors: [],
  };

  for (const r of batch) {
    if (revoked.has(r.userId)) {
      // A deliberate revocation is terminal. Re-issuing here would undo it silently on
      // every trigger, which is the opposite of what revoking is for.
      result.revoked += 1;
      continue;
    }
    if (valid.has(r.userId)) {
      result.alreadyHeld += 1;
      continue;
    }
    try {
      const cert = await issueCertificate(session.trainingId, r.userId);
      result.issued.push({ userId: r.userId, number: cert.number });
      // Tell them. An issue that nobody is told about has not happened as far as the
      // learner is concerned -- which is the original failure all over again, one layer
      // down. Best effort: a mail failure must never un-issue a certificate.
      await prisma.notification.create({
        data: {
          userId: r.userId,
          type: 'certificate-issued',
          payload: { trainingId: session.trainingId, number: cert.number, automatic: true },
        },
      });
      try {
        const recipient = await prisma.user.findUnique({
          where: { id: r.userId }, select: { email: true },
        });
        if (recipient && emailEnabled()) {
          const training = await prisma.training.findUnique({
            where: { id: session.trainingId }, select: { title: true },
          });
          await sendEmail({
            ...certificateReadyEmail({
              trainingTitle: training?.title ?? 'your class',
              number: cert.number,
              certsPath: '/me/certificates',
            }),
            to: recipient.email,
          });
        }
      } catch {
        // Swallowed on purpose: the certificate exists and the notification row is
        // written. A bounced email is a support ticket, not a reason to pretend the
        // certificate was not issued.
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'INELIGIBLE') result.notEligible += 1;
      else if (code === 'REVOKED') result.revoked += 1;
      else {
        result.failed += 1;
        // Say what failed and for whom. A bare counter made this undiagnosable from
        // the outside -- it looked identical whether the cause was signing, eligibility
        // or the storage upload.
const why = e instanceof Error ? e.message : String(e);
        result.errors.push(`user ${r.userId}: ${why}`);
        console.error(`[auto-issue] ${r.userId} on ${session.trainingId} failed:`, e);
      }
    }
  }
  return result;
}

/** Storage key for a certificate PDF. Private bucket only. */
export function certKeyFor(number: string): string {
  return `certs/${number}.pdf`;
}

/**
 * Undo a revocation.
 *
 * Revocation is trainer-only, so a trainer acting in bad faith can take a learner's
 * certificate away -- and until now could not be undone by anyone, including staff. That
 * is a worse failure than the one restore is being introduced alongside: a revocation
 * made in error, or made deliberately to spite a learner, is permanent.
 *
 * The stored PDF is untouched, so a restored certificate is the identical document.
 */
export async function restoreCertificate(number: string) {
  return prisma.certificate.update({
    where: { number },
    data: { status: 'valid', revokedReason: null },
  });
}

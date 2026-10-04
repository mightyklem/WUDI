import { randomBytes, createHash } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/db';
import { programPct, isEligible } from '@learnovize/shared';
import { putPublic } from '@/lib/storage';

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
};

/** FR-8.1: attendance % meets min AND paid when certification is paid. */
export async function computeEligibility(trainingId: string, userId: string): Promise<Eligibility> {
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: { sessions: true },
  });
  if (!training) throw new Error('Training not found');
  const logs = await prisma.attendanceLog.findMany({
    where: { userId, session: { trainingId } },
  });
  const presentCount = logs.filter((l) => l.present).length;
  const pct = programPct(presentCount, training.sessions.length);
  const reg = await prisma.registration.findUnique({
    where: { trainingId_userId: { trainingId, userId } },
  });
  const paidOk = training.certMode !== 'paid' || (reg?.certPaid ?? false);
  return {
    presentCount, total: training.sessions.length, pct,
    minMet: pct >= training.minPct, paidOk,
    eligible: reg?.status === 'active' && isEligible({ pct, minPct: training.minPct, certMode: training.certMode, paid: reg?.certPaid ?? false }),
  };
}

export type CertRenderInput = {
  participantName: string;
  trainingTitle: string;
  trainerName: string;
  dateText: string;
  number: string;
  logoUrl?: string | null;
};

/** Co-branded PDF: trainer identity + Learnovize seal + number + non-accredited disclaimer. */
export async function renderCertificatePdf(input: CertRenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.17, 0.2);
  const mut = rgb(0.42, 0.45, 0.47);
  const teal = rgb(0.11, 0.49, 0.55);
  const green = rgb(0.05, 0.48, 0.24);

  // Border + seal
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: ink, borderWidth: 2 });
  page.drawCircle({ x: width - 130, y: 130, size: 52, color: green });
  page.drawText('L', { x: width - 143, y: 112, size: 44, font: serif, color: rgb(1, 1, 1) });

  let y = height - 110;
  const center = (text: string, size: number, font = sans, color = ink) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
    y -= size + 14;
  };

  center('Certificate of Completion', 34, serif);
  center('This certifies that', 13, sans, mut);
  center(input.participantName, 30, sansBold);
  center(`has completed ${input.trainingTitle}`, 15, sans);
  center(`Trainer: ${input.trainerName}  ·  ${input.dateText}`, 13, sans, mut);
  y -= 8;
  center(input.number, 16, sansBold, teal);
  y -= 4;
  center('Verify at /verify · Confirms attendance and completion only.', 11, sans, mut);
  center('Not a government-accredited qualification.', 11, sans, mut);

  // Trainer logo best-effort (absolute http[s] only); text fallback otherwise.
  if (input.logoUrl && /^https?:\/\//.test(input.logoUrl)) {
    try {
      const res = await fetch(input.logoUrl);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      const img = ct.includes('png') ? await doc.embedPng(buf) : await doc.embedJpg(buf);
      const scale = Math.min(120 / img.width, 60 / img.height, 1);
      page.drawImage(img, { x: 70, y: 90, width: img.width * scale, height: img.height * scale });
    } catch { /* logo optional — seal + name carry the branding */ }
  }
  page.drawText(input.trainerName, { x: 70, y: 70, size: 11, font: sans, color: mut });

  const hash = createHash('sha256').update(await doc.save()).digest('hex');
  void hash;
  return doc.save();
}

/** Issue (or return existing) certificate for an eligible participant. Trainer-approved. */
export async function issueCertificate(trainingId: string, userId: string) {
  const existing = await prisma.certificate.findFirst({
    where: { trainingId, userId, status: 'valid' },
  });
  if (existing) return existing;

  const e = await computeEligibility(trainingId, userId);
  if (!e.eligible) {
    throw Object.assign(new Error('Not eligible: attendance or payment missing'), { code: 'INELIGIBLE' });
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
  const pdf = await renderCertificatePdf({
    participantName: user.email,
    trainingTitle: training.title,
    trainerName: training.trainer.displayName,
    dateText: new Date().toUTCString().slice(0, 16),
    number,
    logoUrl: training.trainer.logoUrl,
  });
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  const pdfUrl = await putPublic(`certs/${number}.pdf`, pdf, 'application/pdf');
  return prisma.certificate.create({
    data: {
      number, trainingId, userId, pdfUrl, sha256,
      imageUrl: null, status: 'valid',
    },
  });
}

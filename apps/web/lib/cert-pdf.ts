import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Certificate PDF rendering.
 *
 * Split out of certs.ts because this is pure: given the same input it always produces the
 * same bytes, and it touches neither the database nor the network (the one exception is
 * the optional trainer logo, which is best-effort and has always been allowed to fail).
 *
 * That split is what makes it testable. Importing certs.ts drags in Prisma and the `@/`
 * path alias, which node cannot resolve outside Next.js -- so a pure renderer was only
 * ever testable by not testing it.
 */

export type CertRenderInput = {
  participantName: string;
  trainingTitle: string;
  trainerName: string;
  dateText: string;
  number: string;
  logoUrl?: string | null;
  /**
   * The trainer's uploaded signature image (public http[s] URL). Drawn below the
   * Learnovize seal at bottom-right, with the trainer's name beneath it.
   */
  signatureUrl?: string | null;
  /**
   * The signature block, printed onto the document.
   *
   * This is what makes the certificate verifiable OFFLINE. A holder is not holding a
   * session with our API, so if the signed payload lived only in our database then the
   * only way to check a document would be to trust us -- which is the precise thing the
   * signature exists to remove.
   */
  signature?: {
    snapshot: string;
    signature: string;
    keyId: string;
    templateVersion: string;
  } | null;
};

/** SHA-256 of the signed snapshot, printed so a reader can compare it themselves. */
function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

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

  // Border + Learnovize seal (brand logo replaces the letter L)
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: ink, borderWidth: 2 });

  // Learnovize logo at bottom right (replaces the former letter-L seal).
  // cwd is often already apps/web on Netlify; also try repo-root and next to this file.
  try {
    const candidates = [
      path.join(process.cwd(), 'public', 'learnovize-wordmark.png'),
      path.join(process.cwd(), 'apps', 'web', 'public', 'learnovize-wordmark.png'),
    ];
    const logoPath = candidates.find((p) => fs.existsSync(p));
    if (logoPath) {
      const logoBuf = fs.readFileSync(logoPath);
      const logoImg = await doc.embedPng(logoBuf);
      const lw = Math.min(170 / logoImg.width, 28 / logoImg.height, 1);
      page.drawImage(logoImg, { x: width - 180, y: 100, width: logoImg.width * lw, height: logoImg.height * lw });
    }
  } catch { /* best effort — the wordmark is a static brand asset */ }

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
  // The verify instruction names the page but used to carry no URL and no number, so a
  // reader holding the document had no way to get there from what was printed.
  center(`Verify at /verify/${input.number}`, 11, sans, mut);
  center('Confirms attendance and completion only.', 11, sans, mut);
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
    } catch { /* logo optional — brand mark carries the trainer identity */ }
  }

  // Trainer's uploaded signature image + name, bottom right below the Learnovize seal.
  if (input.signatureUrl && /^https?:\/\//.test(input.signatureUrl)) {
    try {
      const res = await fetch(input.signatureUrl);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      const img = ct.includes('png') ? await doc.embedPng(buf) : await doc.embedJpg(buf);
      const scale = Math.min(150 / img.width, 40 / img.height, 1);
      page.drawImage(img, { x: width - 180, y: 45, width: img.width * scale, height: img.height * scale });
    } catch { /* signature optional */ }
  }
  page.drawText(input.trainerName, { x: width - 180, y: 34, size: 10, font: sans, color: mut });

  // Signature block, bottom-right, below the seal rather than in the visual centre. The
  // claims above are what a person reads; this is what a machine checks. Kept small and
  // off the main axis so it does not compete with the certificate itself, but printed in
  // full -- a truncated signature is one that cannot be verified, which is worse than
  // none at all. Full values are on the verification page and in the database row.
  if (input.signature) {
    const x = width - 392;
    let sy = 118;
    const line = (t: string) => {
      page.drawText(t, { x, y: sy, size: 6.5, font: sans, color: mut });
      sy -= 8.5;
    };
    line(`Digitally signed - ${input.signature.templateVersion} - key ${input.signature.keyId}`);
    line(`signature: ${input.signature.signature.slice(0, 48)}`);
    line(`claims:    ${sha256Hex(input.signature.snapshot).slice(0, 48)}`);
  }

  return doc.save();
}
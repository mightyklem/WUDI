import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Encryption for bank account numbers.
 *
 * A trainer's account number is a real person's bank detail. Stored in the clear it
 * becomes the highest-value field in the database: one leak, one admin export, one
 * careless log line and someone else's money is reachable. So it is sealed with
 * AES-256-GCM, which also authenticates — a tampered ciphertext fails to decrypt rather
 * than silently yielding different digits.
 *
 * Keyed by PAYOUT_ENCRYPTION_KEY, deliberately NOT JWT_SECRET. Sharing one key between
 * token signing and data encryption means either rotating one breaks the other, or one
 * compromise silently unlocks both.
 */

const ALGO = 'aes-256-gcm';

export function payoutKey(): Buffer {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'PAYOUT_ENCRYPTION_KEY is not set. Generate one with: [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))',
    );
  }
  // Trimmed, because a key that arrived with a trailing newline would otherwise decode
  // to the right length by accident and fail later, somewhere far away, with an error
  // that says nothing about a newline.
  const buf = Buffer.from(raw.trim(), 'base64');
  if (buf.length !== 32) {
    throw new Error(`PAYOUT_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length}).`);
  }
  return buf;
}

/**
 * Whether this deployment can seal a bank account number.
 *
 * Checked before the save rather than after, so that a deployment missing the key says
 * so in words rather than throwing a stack trace at one person on one screen.
 */
export function payoutEncryptionReady(): boolean {
  try {
    payoutKey();
    return true;
  } catch {
    return false;
  }
}

/** Seals an account number. Format: iv.tag.ciphertext, all base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, payoutKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted value');
  const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv(ALGO, payoutKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Only ever the last four, for display. */
export function last4(accountNumber: string): string {
  return accountNumber.replace(/\s/g, '').slice(-4);
}

/** Nigerian account numbers are 10 digits. */
export function accountNumberProblem(value: string): string | null {
  const v = (value || '').replace(/\s/g, '');
  if (!/^\d{10}$/.test(v)) return 'Enter the 10-digit account number.';
  return null;
}
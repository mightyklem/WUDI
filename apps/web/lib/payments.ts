import { createHmac, randomBytes } from 'crypto';
import { trainerNet } from '@learnovize/shared';

export type Provider = 'mock' | 'paystack';

export function provider(): Provider {
  return process.env.PAYMENTS_PROVIDER === 'paystack' ? 'paystack' : 'mock';
}

export function payoutHoldDays(): number {
  const n = Number(process.env.PAYOUT_HOLD_DAYS || 7);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 7;
}

/** NGN amounts are whole naira everywhere in Wudi. Paystack takes kobo. */
export const toKobo = (ngn: number) => Math.round(ngn * 100);

export function newReference(prefix = 'LRN'): string {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`.toUpperCase();
}

/** Commission split for one cert payment (FR-9.3). Provider fee comes from the webhook; mock charges 0. */
export function splitPayment(amountNgn: number, providerFeeNgn: number, plan: string) {
  const p = plan === 'pro' || plan === 'business' ? plan : 'free';
  return trainerNet({ amountNgn, providerFeeNgn, plan: p });
}

export type InitResult = { reference: string; payUrl: string | null; accessCode: string | null };

/**
 * Paystack API origin. Overridable so the paid-webhook path can be exercised against a
 * local stub — Paystack has no API to mark a transaction paid without the customer
 * completing the hosted checkout page, so the settlement path is otherwise untestable.
 *
 * Only loopback hosts are accepted. A deployed instance can never be pointed at a remote
 * host, so a stray or leaked env var cannot redirect live payments.
 */
function paystackApi(): string {
  const base = (process.env.PAYSTACK_API_BASE || 'https://api.paystack.co').replace(/\/$/, '');
  if (base === 'https://api.paystack.co') return base;
  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    throw new Error('PAYSTACK_API_BASE is not a valid URL');
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('PAYSTACK_API_BASE may only point at localhost');
  }
  return base;
}

/** Initialize a checkout. Mock returns a local simulator; Paystack returns its hosted URL. */
export async function initCheckout(opts: { email: string; amountNgn: number; reference: string }): Promise<InitResult> {
  if (provider() === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
    const r = await fetch(`${paystackApi()}/transaction/initialize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: opts.email,
        amount: toKobo(opts.amountNgn),
        currency: 'NGN',
        reference: opts.reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/me/certificates`,
      }),
    });
    const j = await r.json();
    if (!j.status) throw new Error(`Paystack init failed: ${JSON.stringify(j)}`);
    const accessCode = (j.data.access_code as string) || null;
    return {
      reference: opts.reference,
      payUrl: j.data.authorization_url as string,
      accessCode,
    };
  }
  // Mock: no hosted page — the test/simulator endpoint completes it.
  return { reference: opts.reference, payUrl: null, accessCode: null };
}

/** Re-open a previously initialized Paystack checkout so an abandoned payment can be finished. */
export function resumeUrl(accessCode: string | null): string | null {
  if (!accessCode) return null;
  return `https://checkout.paystack.com/${accessCode}`;
}

/**
 * Paystack's verify payload reports `fees` in kobo and the legacy `fee` already in naira.
 * Prefer `fees`; never divide the naira field by 100 or the trainer's net is overstated 100x.
 */
function feeNgnFromVerify(d: Record<string, unknown>): number {
  if (typeof d.fees === 'number' && Number.isFinite(d.fees)) return Math.round(d.fees / 100);
  if (typeof d.fee === 'number' && Number.isFinite(d.fee)) return Math.round(d.fee);
  return 0;
}

/** Verify a Paystack transaction by reference. Mock is completed explicitly, never verified. */
export async function verifyPaystack(reference: string): Promise<{ paid: boolean; amountNgn: number; feeNgn: number }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
  const r = await fetch(`${paystackApi()}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const j = await r.json();
  const d = (j.data || {}) as Record<string, unknown>;
  return {
    paid: j.status === true && d.status === 'success',
    amountNgn: Math.round((Number(d.amount) || 0) / 100),
    feeNgn: feeNgnFromVerify(d),
  };
}

/** Paystack webhook signature: HMAC-SHA512 of the raw body with the secret key. */
export function validPaystackSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const mac = createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  return mac === signature.toLowerCase();
}

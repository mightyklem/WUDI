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

export type InitResult = { reference: string; payUrl: string | null };

/** Initialize a checkout. Mock returns a local simulator; Paystack returns its hosted URL. */
export async function initCheckout(opts: { email: string; amountNgn: number; reference: string }): Promise<InitResult> {
  if (provider() === 'paystack') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: opts.email,
        amount: toKobo(opts.amountNgn),
        reference: opts.reference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/me/certificates`,
      }),
    });
    const j = await r.json();
    if (!j.status) throw new Error(`Paystack init failed: ${JSON.stringify(j)}`);
    return { reference: opts.reference, payUrl: j.data.authorization_url as string };
  }
  // Mock: no hosted page — the test/simulator endpoint completes it.
  return { reference: opts.reference, payUrl: null };
}

/** Verify a Paystack transaction by reference. Mock is completed explicitly, never verified. */
export async function verifyPaystack(reference: string): Promise<{ paid: boolean; amountNgn: number; feeNgn: number }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const j = await r.json();
  const d = j.data || {};
  return {
    paid: j.status === true && d.status === 'success',
    amountNgn: Math.round((d.amount || 0) / 100),
    feeNgn: Math.round(((d.fees ?? d.fee) || 0) / 100),
  };
}

/** Paystack webhook signature: HMAC-SHA512 of the raw body with the secret key. */
export function validPaystackSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const mac = createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  return mac === signature.toLowerCase();
}

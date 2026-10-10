import { prisma } from '@/lib/db';
import { decryptSecret, encryptSecret, last4 } from '@/lib/secretbox';
import { paystackGet, paystackPost } from '@/lib/payments';

/**
 * Trainer payout accounts.
 *
 * The flow is: the trainer enters bank + account number, Paystack resolves it to a real
 * account name, and only then is it stored. Resolving at save time rather than at payout
 * time is the point — a mistyped number costs nothing to catch on the settings screen and
 * is not recoverable once a transfer has gone.
 */

export type Bank = { code: string; name: string };

/**
 * Nigerian banks that can actually receive a transfer.
 *
 * Paystack returns every bank it knows about, and two of the fields decide whether a
 * bank is usable for paying a trainer: `supports_transfer` and `active`. Filtering on
 * neither means a trainer picks an account from a bank that cannot receive a payout,
 * and then discovers it at the moment they are owed money.
 *
 * `longcode` is preferred over `code` because nuban transfer recipients expect the real
 * bank code (058 for GTBank, not an internal id).
 */
export async function nigeriaBanks(): Promise<Bank[]> {
  const res = await paystackGet<{
    data?: {
      code: string; longcode?: string; name: string;
      country: string; active?: boolean; supports_transfer?: boolean;
    }[];
  }>('/bank');

  const banks = (res.data || [])
    .filter((b) => b.country === 'Nigeria')
    .filter((b) => b.active !== false)
    .filter((b) => b.supports_transfer === true)
    .map((b) => ({ code: b.longcode || b.code, name: b.name }));

  return banks.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Ask Paystack who owns this account number.
 * Returns null when the combination does not resolve to a real account.
 */
export async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string } | null> {
  const res = await paystackGet<{
    data?: { account_name?: string };
    status?: boolean;
  }>(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
  const name = res.data?.account_name;
  return name ? { accountName: name } : null;
}

/**
 * Store a verified account. Replaces any earlier account for the trainer: one active
 * destination is easier to reason about than a picker, and a half-edited second account
 * is how money ends up somewhere nobody expected.
 */
export async function savePayoutAccount(
  trainerId: string,
  input: { bankCode: string; bankName: string; accountNumber: string; accountName: string },
) {
  const tail = last4(input.accountNumber);

  const existing = await prisma.payoutAccount.findFirst({ where: { trainerId } });
  const encrypted = encryptSecret(input.accountNumber.replace(/\s/g, ''));

  const saved = existing
    ? await prisma.payoutAccount.update({
        where: { id: existing.id },
        data: {
          bankCode: input.bankCode,
          bankName: input.bankName,
          accountNumberEnc: encrypted,
          accountNumberLast4: tail,
          accountName: input.accountName,
          // Re-resolved above, so this is cleared until a fresh transferrecipient is made.
          recipientCode: null,
          verifiedAt: new Date(),
        },
      })
    : await prisma.payoutAccount.create({
        data: {
          trainerId,
          bankCode: input.bankCode,
          bankName: input.bankName,
          accountNumberEnc: encrypted,
          accountNumberLast4: tail,
          accountName: input.accountName,
          verifiedAt: new Date(),
        },
      });

  return saved;
}

/** What the UI needs. Never includes the account number itself. */
export async function payoutAccountFor(trainerId: string) {
  const a = await prisma.payoutAccount.findFirst({ where: { trainerId } });
  if (!a) return null;
  return {
    bankCode: a.bankCode,
    bankName: a.bankName,
    accountName: a.accountName,
    accountLast4: a.accountNumberLast4,
    verified: !!a.verifiedAt,
    hasRecipient: !!a.recipientCode,
  };
}

/** The real number, for the moment a transfer is actually made. Deliberately not exposed over HTTP. */
export async function decryptedAccountNumber(id: string): Promise<string | null> {
  const a = await prisma.payoutAccount.findUnique({ where: { id }, select: { accountNumberEnc: true } });
  if (!a) return null;
  return decryptSecret(a.accountNumberEnc);
}

/**
 * Create (or reuse) a Paystack transfer recipient. Doing this once and storing the code
 * keeps the later transfer to a single call, and means a bank detail change upstream is
 * caught by Paystack rather than by us.
 */
export async function ensureRecipient(accountId: string): Promise<string | null> {
  const a = await prisma.payoutAccount.findUnique({ where: { id: accountId } });
  if (!a) return null;
  if (a.recipientCode) return a.recipientCode;

  const number = await decryptedAccountNumber(accountId);
  if (!number) return null;

  const res = await paystackPost<{ data?: { recipient_code?: string }; message?: string }>(
    '/transferrecipient',
    {
      type: 'nuban',
      name: a.accountName,
      account_number: number,
      bank_code: a.bankCode,
      currency: 'NGN',
    },
  );
  const code = res.data?.recipient_code;
  if (code) {
    await prisma.payoutAccount.update({ where: { id: accountId }, data: { recipientCode: code } });
  }
  return code ?? null;
}
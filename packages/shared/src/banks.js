/**
 * Which code to send a bank.
 *
 * Providers hand back more than one identifier for the same bank and they are not
 * interchangeable. Paystack returns `code` -- the real NUBAN bank code, 033 for UBA,
 * 044 for Access, 104 for Parallex -- and `longcode`, which is Paystack's own internal
 * identifier for the same bank ("033153513" for UBA).
 *
 * Sending the internal one is refused with "Unknown bank code", so a list built from
 * the wrong field fails for every bank where the two differ -- which is most of the
 * big ones.
 *
 * The rule is here, and tested, rather than in the middle of a provider response.
 */
export function bankCodeFor(bank) {
  if (!bank || typeof bank !== 'object') return null;
  const code = typeof bank.code === 'string' ? bank.code.trim() : '';
  if (code) return code;
  const long = typeof bank.longcode === 'string' ? bank.longcode.trim() : '';
  return long || null;
}

/**
 * The banks that can actually receive a transfer.
 *
 * Two fields decide it: `supports_transfer` and `active`. Filtering on neither means a
 * trainer picks an account at a bank that cannot receive a payout, and then discovers
 * it at the moment they are owed money.
 */
export function transferableBanks(banks) {
  return (banks || [])
    .filter((b) => b && b.country === 'Nigeria')
    .filter((b) => b.active !== false)
    .filter((b) => b.supports_transfer === true)
    .map((b) => ({ code: bankCodeFor(b), name: b.name }))
    .filter((b) => !!b.code)
    .sort((a, b) => a.name.localeCompare(b.name));
}

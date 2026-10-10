-- NDPA erasure: record that the person asked to be forgotten.
--
-- The row is kept rather than deleted. Payment, payout and attendance records carry a
-- statutory retention period, so cascading the User row away would destroy the
-- financial ledger as a side effect of a privacy request. Instead the row survives with
-- its identifying fields replaced by placeholders, leaving a pseudonymous counterparty
-- that keeps the books balanced.
--
-- deletedAt is the marker that the erasure happened. Login and token minting refuse it,
-- so the account is unreachable even though the row exists.

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Erasure is rare and support asks about it directly, so it needs to be findable.
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
-- Payout approvals and transfer tracking.
--
-- Payouts are released by an admin, not automatically, so the person who decided to send
-- real money has to be on the record: without approvedById, "paid" is unfalsifiable.
--
-- transferRef/transferId let a status be reconciled against Paystack rather than
-- inferred from our own optimistic write. failureReason is kept because "failed" with no
-- reason tells an admin nothing about whether to retry or to contact the trainer.

ALTER TABLE "Payout" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Payout" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Payout" ADD COLUMN "transferRef" TEXT;
ALTER TABLE "Payout" ADD COLUMN "transferId" TEXT;
ALTER TABLE "Payout" ADD COLUMN "failureReason" TEXT;

-- The admin queue: held payouts whose hold period has passed.
CREATE INDEX "Payout_status_holdUntil_idx" ON "Payout"("status", "holdUntil");

-- Transfer references are unique per provider, so a replayed webhook cannot mark two
-- payouts paid from one transfer.
CREATE UNIQUE INDEX "Payout_transferRef_key" ON "Payout"("transferRef") WHERE "transferRef" IS NOT NULL;
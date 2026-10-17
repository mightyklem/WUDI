-- On-chain anchoring columns for Base.
--
-- Both tables get the same five columns and the same semantics, because both anchor the
-- same way: a signed record is written first, and anchoring is a separate retryable step
-- that reports what it did.
--
-- Everything is nullable and defaults to 'pending' on purpose. Anchoring must never be a
-- precondition for issuing a certificate or awarding a point. Someone who turned up and
-- was verified has earned the thing, and an unreachable Base node is our problem to
-- retry, not a reason to withhold it from them. The opposite ordering -- confirm on-chain
-- before issuing -- would turn any RPC blip into a failed class.
--
-- chainStatus exists so 'not attempted yet' and 'attempted and failed' are distinguishable
-- without inspecting chainError for null. The first wants a worker to sweep the backlog;
-- the second wants a human to look at a broken RPC or a drained deployer wallet.

ALTER TABLE "Certificate" ADD COLUMN "chainId" INTEGER;
ALTER TABLE "Certificate" ADD COLUMN "chainTxHash" TEXT;
ALTER TABLE "Certificate" ADD COLUMN "chainStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Certificate" ADD COLUMN "chainError" TEXT;
ALTER TABLE "Certificate" ADD COLUMN "anchoredAt" TIMESTAMP(3);

ALTER TABLE "PointsEvent" ADD COLUMN "chainId" INTEGER;
ALTER TABLE "PointsEvent" ADD COLUMN "chainTxHash" TEXT;
ALTER TABLE "PointsEvent" ADD COLUMN "chainStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "PointsEvent" ADD COLUMN "chainError" TEXT;
ALTER TABLE "PointsEvent" ADD COLUMN "anchoredAt" TIMESTAMP(3);

-- The retry worker finds its work by status, so it needs an index that leads with it.
-- Without this, sweeping the backlog is a sequential scan of every certificate ever issued.
CREATE INDEX "Certificate_chainStatus_idx" ON "Certificate"("chainStatus");
CREATE INDEX "PointsEvent_chainStatus_idx" ON "PointsEvent"("chainStatus");

-- Existing rows pick up the column default and land on 'pending' rather than 'skipped'.
-- They have genuinely never been anchored, and marking them otherwise would hide them from
-- the very worker that should pick them up.

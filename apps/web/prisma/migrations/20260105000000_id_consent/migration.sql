-- Record when a trainer consented to Learnovize storing their identity document.
--
-- The approval form had no checkbox and this table had no column for it, so there was
-- no artifact proving consent was ever obtained for processing an identity document.
-- Both columns are nullable so existing rows are untouched: this records consent going
-- forward, it does not invent it retroactively.
--
-- consentVersion pins which wording was agreed to, so a future change can be shown to
-- have been consented to separately rather than inheriting this row's agreement.

ALTER TABLE "TrainerApproval" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "TrainerApproval" ADD COLUMN "consentVersion" TEXT;
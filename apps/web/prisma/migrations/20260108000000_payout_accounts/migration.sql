-- Where a trainer's money goes.
--
-- The account number is encrypted at rest, never stored in the clear: it is a real
-- person's bank account number, and a plaintext copy in this table turns any database
-- leak or careless log line into a direct route to someone's bank. Only the last four
-- digits are kept readable, so the settings screen can show which account is on file
-- without decrypting anything.
--
-- verifiedAt records that Paystack resolved the number to a real account name. Payouts
-- are refused without it, because a transfer to a mistyped account is not reversible.

CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumberEnc" TEXT NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "recipientCode" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayoutAccount_trainerId_bankCode_accountNumberLast4_key"
    ON "PayoutAccount"("trainerId", "bankCode", "accountNumberLast4");
CREATE INDEX "PayoutAccount_trainerId_idx" ON "PayoutAccount"("trainerId");

ALTER TABLE "PayoutAccount"
    ADD CONSTRAINT "PayoutAccount_trainerId_fkey"
    FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE;
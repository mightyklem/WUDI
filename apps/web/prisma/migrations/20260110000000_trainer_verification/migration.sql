-- Trainer verification: the paid badge.
--
-- Payment and judgement are stored separately on purpose. `paidAt`/`amountPaidNgn` record
-- that someone bought entry to review; `status`/`proofGrade`/`finalRating` record what a
-- person concluded about them. Keeping them apart is what stops a purchase from being
-- readable as a pass -- the whole meaning of the badge is that it was earned.
--
-- `refundPending` exists because money is taken before a decision is made. If the
-- review says no, the refund is owed and this flag makes it a tracked obligation rather
-- than something to remember.

CREATE TABLE "TrainerApplication" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "formSubtotal" INTEGER NOT NULL DEFAULT 0,
    "proofGrade" TEXT,
    "totalScore" INTEGER,
    "band" TEXT,
    "finalRating" TEXT,
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "amountPaidNgn" INTEGER,
    "paymentRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundPending" BOOLEAN NOT NULL DEFAULT false,
    "refundedAt" TIMESTAMP(3),
    "badgeExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainerApplication_trainerId_key" ON "TrainerApplication"("trainerId");
CREATE INDEX "TrainerApplication_status_idx" ON "TrainerApplication"("status");

ALTER TABLE "TrainerApplication"
    ADD CONSTRAINT "TrainerApplication_trainerId_fkey"
    FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Learner ratings of a trainer.
--
-- The unique index on (sessionId, authorId) is the anti-gaming core: without it one
-- attendee can rate the same trainer repeatedly and manufacture a reputation, and the
-- points attached to it become farmable.

CREATE TABLE "TrainerReview" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TrainerReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "TrainerReview_sessionId_authorId_key" ON "TrainerReview"("sessionId", "authorId");
CREATE INDEX "TrainerReview_trainerId_idx" ON "TrainerReview"("trainerId");

ALTER TABLE "TrainerReview"
    ADD CONSTRAINT "TrainerReview_trainerId_fkey"
    FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("userId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainerReview"
    ADD CONSTRAINT "TrainerReview_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
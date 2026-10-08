-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "dayIds" TEXT[],
ADD COLUMN     "pctAttended" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scopeLabel" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "PointsEvent" ADD COLUMN     "dayId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "dayId" TEXT;

-- CreateTable
CREATE TABLE "TrainingDay" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "dateUtc" TEXT NOT NULL,
    "topic" TEXT,
    "accessType" TEXT NOT NULL DEFAULT 'paid',
    "priceNgn" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrainingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayEnrollment" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "priceNgn" INTEGER NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DayEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainingDay_trainingId_dateUtc_idx" ON "TrainingDay"("trainingId", "dateUtc");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingDay_trainingId_dayIndex_key" ON "TrainingDay"("trainingId", "dayIndex");

-- CreateIndex
CREATE INDEX "DayEnrollment_dayId_idx" ON "DayEnrollment"("dayId");

-- CreateIndex
CREATE UNIQUE INDEX "DayEnrollment_registrationId_dayId_key" ON "DayEnrollment"("registrationId", "dayId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsEvent_userId_sessionId_reason_key" ON "PointsEvent"("userId", "sessionId", "reason");

-- AddForeignKey
ALTER TABLE "PointsEvent" ADD CONSTRAINT "PointsEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEvent" ADD CONSTRAINT "PointsEvent_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDay" ADD CONSTRAINT "TrainingDay_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayEnrollment" ADD CONSTRAINT "DayEnrollment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayEnrollment" ADD CONSTRAINT "DayEnrollment_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "TrainingDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "PointsEvent_userId_sessionId_reason_key";

-- AlterTable
ALTER TABLE "PointsEvent" ADD COLUMN     "ref" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PointsEvent_userId_ref_key" ON "PointsEvent"("userId", "ref");

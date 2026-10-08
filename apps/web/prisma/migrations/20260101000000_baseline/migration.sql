-- AlterTable
ALTER TABLE "FeedPost" ADD COLUMN     "adEndsAt" TIMESTAMP(3),
ADD COLUMN     "adStartsAt" TIMESTAMP(3),
ADD COLUMN     "adTargetId" TEXT,
ADD COLUMN     "adTargetType" TEXT,
ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "body" TEXT,
ADD COLUMN     "isAd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'training',
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "trainingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "quotedDays" INTEGER,
ADD COLUMN     "quotedPricePerDayNgn" INTEGER,
ADD COLUMN     "quotedTotalNgn" INTEGER;

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Training" ADD COLUMN     "accessType" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "pricePerDayNgn" INTEGER,
ADD COLUMN     "tier" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isOfficial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rank" TEXT NOT NULL DEFAULT 'Newcomer';

-- CreateTable
CREATE TABLE "PointsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "sessionId" TEXT,
    "trainingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'organization',
    "about" TEXT,
    "logoUrl" TEXT,
    "website" TEXT,
    "verification" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("orgId","userId")
);

-- CreateTable
CREATE TABLE "OrganizationApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "docUrls" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsEvent_userId_createdAt_idx" ON "PointsEvent"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "FeedPost_kind_status_createdAt_idx" ON "FeedPost"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Training_accessType_tier_idx" ON "Training"("accessType", "tier");

-- AddForeignKey
ALTER TABLE "PointsEvent" ADD CONSTRAINT "PointsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsEvent" ADD CONSTRAINT "PointsEvent_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApproval" ADD CONSTRAINT "OrganizationApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

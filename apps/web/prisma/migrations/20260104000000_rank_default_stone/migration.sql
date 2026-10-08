-- The rank ladder is Stone/Bronze/Silver/Gold. The column default was still
-- 'Newcomer', a rank that does not exist in the ladder, so every user with zero
-- points carried it. Backfill those rows and move the default onto Stone.
ALTER TABLE "User" ALTER COLUMN "rank" SET DEFAULT 'Stone';
UPDATE "User" SET "rank" = 'Stone' WHERE "rank" = 'Newcomer';
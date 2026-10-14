-- Record which identity document a trainer supplied, and its number.
--
-- TrainerApproval stored idDocUrls as a flat list of "an ID photo". A reviewer had to
-- guess what they were looking at, and nothing made the claim checkable -- two people
-- could supply the same document type and nothing would notice.
--
-- identityNumber is sensitive personal data under the NDPA. It is deliberately stored in
-- the clear rather than hashed: the point is for a reviewer to compare it against the
-- document image, which a hash would prevent. It is never returned by a public API,
-- never rendered on any verify page, and every staff read of it is audit-logged the same
-- way reads of the document image already are.
--
-- No unique constraint on identityNumber. A National Identification Number is one
-- person, so it ought to be unique -- but adding that constraint fails the deploy if any
-- existing row duplicates, and the table currently holds only a handful of rows that
-- were submitted before the numbers were recorded at all. Worth adding once the real
-- data is in and the duplicates have been looked at.
ALTER TABLE "TrainerApproval"
  ADD COLUMN "identityType" TEXT,
  ADD COLUMN "identityNumber" TEXT,
  ADD COLUMN "bankStatementKey" TEXT;
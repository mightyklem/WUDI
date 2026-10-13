-- Session event log, part 1: record when a room actually ended.
--
-- Session.status is set to 'ended' but the moment was never stored, so there was no way
-- to tell a class that ran its advertised length from one the trainer cut short ten
-- minutes in. That matters because ending early truncates stayedMs for everyone still
-- connected, which can drop them below the attendance threshold and cost them a
-- certificate. A dispute about exactly that was unanswerable.
--
-- Nullable and added without a default: existing rows have no known end time and must
-- not be backfilled with a guess. A null endedAtUtc means "not recorded", which is the
-- honest reading, not "ran to completion".
ALTER TABLE "Session"
  ADD COLUMN "endedAtUtc" TIMESTAMP(3);
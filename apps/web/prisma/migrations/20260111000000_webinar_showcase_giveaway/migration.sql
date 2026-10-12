-- Webinar framing: a room can be opened early and hold people in a lobby, and the
-- trainer can pin a product being demonstrated.
ALTER TABLE "Session"
  ADD COLUMN "opensAtUtc" TIMESTAMP(3),
  ADD COLUMN "admittedAtUtc" TIMESTAMP(3),
  ADD COLUMN "agenda" TEXT,
  ADD COLUMN "showcaseName" TEXT,
  ADD COLUMN "showcaseUrl" TEXT,
  ADD COLUMN "showcaseNote" TEXT,
  ADD COLUMN "showcaseImageUrl" TEXT;

-- A speech grant is persisted rather than held only in the LiveKit room, so a
-- learner who reconnects does not silently lose the right to speak they were given.
CREATE TABLE "SpeechGrant" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "SpeechGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpeechGrant_sessionId_userId_key" ON "SpeechGrant"("sessionId", "userId");
CREATE INDEX "SpeechGrant_userId_sessionId_idx" ON "SpeechGrant"("userId", "sessionId");

-- Giveaways are drawn on the server so the result can be shown to be fair, and so
-- it can be evidenced after the session.
CREATE TABLE "Giveaway" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "prize" TEXT NOT NULL,
  "rules" TEXT,
  "open" BOOLEAN NOT NULL DEFAULT true,
  "winners" TEXT,
  "drawnAt" TIMESTAMP(3),
  "requiresPayment" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Giveaway_sessionId_open_idx" ON "Giveaway"("sessionId", "open");

-- The unique constraint is the fairness guarantee: one person, one entry, no matter
-- how many times they refresh.
CREATE TABLE "GiveawayEntry" (
  "id" TEXT NOT NULL,
  "giveawayId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GiveawayEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GiveawayEntry_giveawayId_userId_key" ON "GiveawayEntry"("giveawayId", "userId");
CREATE INDEX "GiveawayEntry_userId_idx" ON "GiveawayEntry"("userId");

-- Several showcased items per session so a webinar can walk a catalogue.
CREATE TABLE "ShowcaseItem" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "note" TEXT,
  "url" TEXT,
  "imageUrl" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShowcaseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShowcaseItem_sessionId_position_idx" ON "ShowcaseItem"("sessionId", "position");

ALTER TABLE "SpeechGrant"
  ADD CONSTRAINT "SpeechGrant_sessionId_fkey" FOREIGN KEY ("sessionId")
    REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpeechGrant"
  ADD CONSTRAINT "SpeechGrant_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Giveaway"
  ADD CONSTRAINT "Giveaway_sessionId_fkey" FOREIGN KEY ("sessionId")
    REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GiveawayEntry"
  ADD CONSTRAINT "GiveawayEntry_giveawayId_fkey" FOREIGN KEY ("giveawayId")
    REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GiveawayEntry"
  ADD CONSTRAINT "GiveawayEntry_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShowcaseItem"
  ADD CONSTRAINT "ShowcaseItem_sessionId_fkey" FOREIGN KEY ("sessionId")
    REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
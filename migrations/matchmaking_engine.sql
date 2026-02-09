-- Matchmaking Engine Migration
-- Run this if Sequelize sync doesn't create the tables automatically

-- 1. Create match_type ENUM
DO $$ BEGIN
  CREATE TYPE "enum_matches_matchType" AS ENUM ('mutual_interest', 'accepted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create match_status ENUM
DO $$ BEGIN
  CREATE TYPE "enum_matches_status" AS ENUM ('active', 'unmatched', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create action_taken ENUM
DO $$ BEGIN
  CREATE TYPE "enum_daily_recommendations_actionTaken" AS ENUM ('none', 'interest', 'shortlist', 'reject', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Create matches table
CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  "user1AccountId" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
  "user2AccountId" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
  "matchScore" INTEGER DEFAULT 0,
  "matchType" "enum_matches_matchType" NOT NULL DEFAULT 'mutual_interest',
  status "enum_matches_status" NOT NULL DEFAULT 'active',
  "unmatchedBy" UUID,
  "unmatchedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_match_pair UNIQUE ("user1AccountId", "user2AccountId")
);

CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches("user1AccountId");
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches("user2AccountId");
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_score ON matches("matchScore");
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches("createdAt");

-- 5. Create daily_recommendations table
CREATE TABLE IF NOT EXISTS daily_recommendations (
  id SERIAL PRIMARY KEY,
  "accountId" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
  "recommendedAccountId" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  reason VARCHAR(255),
  date DATE NOT NULL,
  seen BOOLEAN DEFAULT FALSE,
  "actionTaken" "enum_daily_recommendations_actionTaken" DEFAULT 'none',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_daily_rec UNIQUE ("accountId", "recommendedAccountId", date)
);

CREATE INDEX IF NOT EXISTS idx_daily_rec_user_date ON daily_recommendations("accountId", date);
CREATE INDEX IF NOT EXISTS idx_daily_rec_date ON daily_recommendations(date);
CREATE INDEX IF NOT EXISTS idx_daily_rec_score ON daily_recommendations(score);
CREATE INDEX IF NOT EXISTS idx_daily_rec_seen ON daily_recommendations(seen);

-- 6. Add dailyActionLimit to subscription_plans (if not exists)
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS "dailyActionLimit" INTEGER DEFAULT 10;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS "dailyRecommendationLimit" INTEGER DEFAULT 5;

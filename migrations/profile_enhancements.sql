-- ============================================================================
-- Profile Enhancements Migration
-- Run this ONLY if sequelize.sync() does not auto-create these changes.
-- This script is safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).
-- ============================================================================

-- 1. Create ENUM types for profileStatus and profileVisibility
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_profileStatus') THEN
    CREATE TYPE "enum_users_profileStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_profileVisibility') THEN
    CREATE TYPE "enum_users_profileVisibility" AS ENUM ('public', 'members', 'hidden');
  END IF;
END$$;

-- 2. Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileStatus" "enum_users_profileStatus" DEFAULT 'draft';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileVisibility" "enum_users_profileVisibility" DEFAULT 'members';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileCompletionPct" INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- 3. Create partner_preferences table
CREATE TABLE IF NOT EXISTS partner_preferences (
  id SERIAL PRIMARY KEY,
  "accountId" UUID NOT NULL UNIQUE REFERENCES users("accountId") ON DELETE CASCADE,
  "ageMin" INTEGER,
  "ageMax" INTEGER,
  "heightMin" VARCHAR(255),
  "heightMax" VARCHAR(255),
  religions JSONB DEFAULT '[]',
  castes JSONB DEFAULT '[]',
  "willingToMarryFromAnyCaste" BOOLEAN DEFAULT FALSE,
  educations JSONB DEFAULT '[]',
  occupations JSONB DEFAULT '[]',
  "incomeMin" VARCHAR(255),
  "incomeMax" VARCHAR(255),
  locations JSONB DEFAULT '[]',
  "maritalStatuses" JSONB DEFAULT '[]',
  dosham VARCHAR(255),
  diet VARCHAR(255),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Add index on deletedAt for soft delete queries
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users ("deletedAt");

-- 5. Add index on profileStatus for admin queries
CREATE INDEX IF NOT EXISTS idx_users_profile_status ON users ("profileStatus");

-- 6. Add index on profileVisibility for listing queries
CREATE INDEX IF NOT EXISTS idx_users_profile_visibility ON users ("profileVisibility");

-- 7. Set existing users' profileStatus to 'submitted' if they have basic details
UPDATE users
SET "profileStatus" = 'submitted'
WHERE "profileStatus" IS NULL
  AND "accountId" IN (SELECT "accountId" FROM basic_details WHERE "dateOfBirth" IS NOT NULL);

-- Done
SELECT 'Profile enhancements migration completed successfully' AS status;

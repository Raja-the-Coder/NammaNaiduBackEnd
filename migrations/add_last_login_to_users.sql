-- Add lastLoginAt column to users table
-- This column tracks the last time a user logged in or verified OTP

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'lastLoginAt'
  ) THEN
    ALTER TABLE users ADD COLUMN "lastLoginAt" TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Also widen the otps.code column to accommodate bcrypt hashes (60 chars)
DO $$
BEGIN
  ALTER TABLE otps ALTER COLUMN code TYPE VARCHAR(255);
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Column otps.code already widened or does not exist';
END $$;

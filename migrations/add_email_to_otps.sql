-- Migration: Add email column to otps table
-- This migration adds the email column to support email-based OTP

-- Check if email column exists, if not, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'otps' 
        AND column_name = 'email'
    ) THEN
        ALTER TABLE otps ADD COLUMN email VARCHAR(255);
        COMMENT ON COLUMN otps.email IS 'Email address for email-based OTP verification';
    END IF;
END $$;

-- Make phone column nullable (if it's not already)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'otps' 
        AND column_name = 'phone'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE otps ALTER COLUMN phone DROP NOT NULL;
    END IF;
END $$;

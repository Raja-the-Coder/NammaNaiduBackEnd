-- Migration: Add vegetarian column to basic_details table
-- This migration adds vegetarian field to support diet preference in registration

-- Check if vegetarian column exists, if not, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'basic_details' 
        AND column_name = 'vegetarian'
    ) THEN
        ALTER TABLE basic_details ADD COLUMN "vegetarian" VARCHAR(255);
        COMMENT ON COLUMN basic_details."vegetarian" IS 'Diet preference: Vegetarian or Non-Vegetarian';
    END IF;
END $$;

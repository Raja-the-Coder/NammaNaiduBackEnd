-- Migration: Add familyType, familyValues, and aboutFamily columns to basic_details table
-- This migration adds family-related fields to support family details in registration

-- Check if familyType column exists, if not, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'basic_details' 
        AND column_name = 'familyType'
    ) THEN
        ALTER TABLE basic_details ADD COLUMN "familyType" VARCHAR(255);
        COMMENT ON COLUMN basic_details."familyType" IS 'Family type: Joint or Nuclear';
    END IF;
END $$;

-- Check if familyValues column exists, if not, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'basic_details' 
        AND column_name = 'familyValues'
    ) THEN
        ALTER TABLE basic_details ADD COLUMN "familyValues" VARCHAR(255);
        COMMENT ON COLUMN basic_details."familyValues" IS 'Family values: Orthodox, Traditional, Moderate, or Liberal';
    END IF;
END $$;

-- Check if aboutFamily column exists, if not, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'basic_details' 
        AND column_name = 'aboutFamily'
    ) THEN
        ALTER TABLE basic_details ADD COLUMN "aboutFamily" TEXT;
        COMMENT ON COLUMN basic_details."aboutFamily" IS 'Text description about the family';
    END IF;
END $$;

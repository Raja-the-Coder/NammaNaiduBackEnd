-- Migration: Add WhatsApp delivery tracking columns to otps table
-- Run this on your PostgreSQL database

ALTER TABLE otps
  ADD COLUMN IF NOT EXISTS "whatsappMessageId" VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "deliveryStatus" VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "deliveryError" TEXT DEFAULT NULL;

-- Add check constraint for deliveryStatus values
ALTER TABLE otps
  DROP CONSTRAINT IF EXISTS otps_delivery_status_check;

ALTER TABLE otps
  ADD CONSTRAINT otps_delivery_status_check
  CHECK ("deliveryStatus" IN ('pending', 'sent', 'delivered', 'read', 'failed'));

-- Index for fast webhook lookups by messageId
CREATE INDEX IF NOT EXISTS idx_otps_whatsapp_message_id ON otps ("whatsappMessageId");

-- Index for delivery status filtering in stats
CREATE INDEX IF NOT EXISTS idx_otps_delivery_status ON otps ("deliveryStatus");

#!/usr/bin/env node
/**
 * Migration: Add WhatsApp delivery columns to otps table
 * Run: node migrations/run-otp-whatsapp-migration.js
 * Requires: DATABASE_URL in .env or environment
 */
require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL is required. Set it in .env or environment.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔄 Adding OTP WhatsApp columns...');
    await client.query('BEGIN');

    await client.query(`ALTER TABLE otps ADD COLUMN IF NOT EXISTS "whatsappMessageId" VARCHAR(255);`);
    await client.query(`ALTER TABLE otps ADD COLUMN IF NOT EXISTS "deliveryStatus" VARCHAR(50) DEFAULT 'pending';`);
    await client.query(`ALTER TABLE otps ADD COLUMN IF NOT EXISTS "deliveryError" TEXT;`);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

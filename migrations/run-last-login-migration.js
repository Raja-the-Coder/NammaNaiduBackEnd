require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting lastLoginAt + OTP column migration...');
    
    const sqlFile = path.join(__dirname, 'add_last_login_to_users.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('   - Added lastLoginAt column to users table');
    console.log('   - Widened otps.code column to VARCHAR(255) for bcrypt hashes');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

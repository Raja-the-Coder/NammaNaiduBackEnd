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
    console.log('🔄 Starting family fields migration for basic_details table...');
    
    // Read the SQL file
    const sqlFile = path.join(__dirname, 'add_family_fields_to_basic_details.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute the migration
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('✅ Migration completed successfully!');
    console.log('   - Added familyType column to basic_details table');
    console.log('   - Added familyValues column to basic_details table');
    console.log('   - Added aboutFamily column to basic_details table');
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

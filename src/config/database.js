const { Sequelize } = require('sequelize');

/**
 * Database Configuration for Hostinger VPS PostgreSQL
 * 
 * Supports:
 * - DATABASE_URL connection string (recommended)
 * - Individual DB_* environment variables (fallback)
 * - SSL for external connections (Railway, Heroku, etc.)
 * - No SSL for localhost VPS connections (default)
 */

let sequelize;
const databaseUrl = process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV || 'development';

// Determine if SSL is required
const determineSSL = (url) => {
  if (!url) return false;
  
  // Force SSL via environment variable
  if (process.env.DB_SSL === 'true') return true;
  if (process.env.DB_SSL === 'false') return false;
  
  // External cloud providers need SSL
  const cloudProviders = ['railway', 'heroku', 'supabase', 'neon', 'render'];
  const isCloudProvider = cloudProviders.some(provider => url.includes(provider));
  
  // Localhost connections don't need SSL
  const isLocalhost = url.includes('localhost') || url.includes('127.0.0.1');
  
  return isCloudProvider && !isLocalhost;
};

if (databaseUrl) {
  const requiresSSL = determineSSL(databaseUrl);
  
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: nodeEnv === 'development' ? console.log : false,
    pool: {
      max: nodeEnv === 'production' ? 10 : 5,  // More connections in production
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: requiresSSL ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    } : {}
  });
  
  console.log(`[DB] Using DATABASE_URL (SSL: ${requiresSSL ? 'enabled' : 'disabled'})`);
} else {
  // Fallback to individual environment variables
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: nodeEnv === 'development' ? console.log : false,
      pool: {
        max: nodeEnv === 'production' ? 10 : 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    }
  );
  
  console.log(`[DB] Using individual DB_* variables`);
}

const connectDB = async () => {
  try {
    console.log('[DB] Connecting to PostgreSQL...');
    console.log(`[DB] Environment: ${nodeEnv}`);
    
    const databaseUrl = process.env.DATABASE_URL;
    
    // Validate DATABASE_URL doesn't contain placeholders
    if (databaseUrl) {
      if (databaseUrl.includes('PLACEHOLDER') || databaseUrl.includes('YOUR_')) {
        throw new Error('DATABASE_URL contains placeholder values. Please update with actual credentials.');
      }
      
      // Mask password for logging
      const maskedUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
      console.log('[DB] Connection:', maskedUrl);
    } else {
      console.log('[DB] Connection:', {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
      });
    }
    
    await sequelize.authenticate();
    console.log('[DB] PostgreSQL connected successfully!');
    
    // Sync models - creates tables that don't exist (safe for production)
    await sequelize.sync({ alter: false });
    console.log('[DB] Models synchronized');

    // Run profile enhancements migration (idempotent — safe to re-run)
    try {
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_profileStatus') THEN
            CREATE TYPE "enum_users_profileStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_profileVisibility') THEN
            CREATE TYPE "enum_users_profileVisibility" AS ENUM ('public', 'members', 'hidden');
          END IF;
        END$$;
      `);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileStatus" "enum_users_profileStatus" DEFAULT 'draft';`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileVisibility" "enum_users_profileVisibility" DEFAULT 'members';`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "profileCompletionPct" INTEGER DEFAULT 0;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users ("deletedAt");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_profile_status ON users ("profileStatus");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_profile_visibility ON users ("profileVisibility");`);
      console.log('[DB] Profile enhancements migration applied');
    } catch (migrationErr) {
      console.warn('[DB] Migration warning (non-fatal):', migrationErr.message);
    }

    // Seed default admin users (idempotent — skips if email already exists)
    try {
      const adminSeeds = [
        { id: 1, name: 'Admin User', email: 'namaAdmin@admin.com', password: '$2a$10$OwY2EOtu5R4nSlDIv69w8u0Ns6rtMj/0Lm6Jw86VqQAkxjFj0DXQ2', role: 'Super Admin', status: 'active' },
        { id: 2, name: 'Raja', email: 'admin@gmail.com', password: '$2a$10$f.8OEyLL6CZLCYx2KLYbbOJF4ID/Wq.CUE1oaK9MT964UCSIRlfqq', role: 'Moderator', status: 'active' },
        { id: 3, name: 'Customer Support', email: 'support@gmail.com', password: '$2a$10$aYDZ.dArK092zDqiO8GznuT4oeXIygVLfaLyiLYMVAPS3piD4iDCa', role: 'Customer Support', status: 'active' },
      ];
      for (const admin of adminSeeds) {
        await sequelize.query(
          `INSERT INTO admins (id, name, email, password, role, status, "createdAt", "updatedAt")
           VALUES (:id, :name, :email, :password, :role, :status, NOW(), NOW())
           ON CONFLICT (email) DO NOTHING;`,
          { replacements: admin }
        );
      }
      // Reset the auto-increment sequence to avoid conflicts
      await sequelize.query(`SELECT setval(pg_get_serial_sequence('admins', 'id'), COALESCE((SELECT MAX(id) FROM admins), 0) + 1, false);`);
      console.log('[DB] Admin users seeded');
    } catch (seedErr) {
      console.warn('[DB] Admin seed warning (non-fatal):', seedErr.message);
    }
    
  } catch (error) {
    console.error('[DB] Connection failed!');
    console.error('[DB] Error:', error.message);
    
    // Helpful error guidance
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n[DB] Hostname not found. Check your DATABASE_URL or DB_HOST.');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.error('\n[DB] Connection refused. Ensure PostgreSQL is running.');
      console.error('    On VPS: sudo systemctl status postgresql');
    } else if (error.message.includes('authentication failed')) {
      console.error('\n[DB] Authentication failed. Check username/password.');
    } else if (error.message.includes('does not exist')) {
      console.error('\n[DB] Database does not exist. Create it first.');
    }
    
    if (!process.env.DATABASE_URL && !process.env.DB_NAME) {
      console.error('\n[DB] No database configuration found!');
      console.error('    Set DATABASE_URL or DB_* variables in .env');
    }
    
    console.error('\n[DB] Full error:', error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };


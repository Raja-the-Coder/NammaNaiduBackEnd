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

    // Photo system enhancements migration (idempotent)
    try {
      await sequelize.query(`ALTER TABLE person_photos ADD COLUMN IF NOT EXISTS "primaryPhoto" INTEGER NOT NULL DEFAULT 1;`);
      await sequelize.query(`ALTER TABLE person_photos ADD COLUMN IF NOT EXISTS "photoOrder" VARCHAR(255) NOT NULL DEFAULT '1,2,3,4,5';`);
      await sequelize.query(`ALTER TABLE person_photos ADD COLUMN IF NOT EXISTS "faceVerified" BOOLEAN NOT NULL DEFAULT false;`);
      console.log('[DB] Photo system migration applied');
    } catch (photoMigrationErr) {
      console.warn('[DB] Photo migration warning (non-fatal):', photoMigrationErr.message);
    }

    // Basic details houseName migration (idempotent)
    try {
      await sequelize.query(`ALTER TABLE basic_details ADD COLUMN IF NOT EXISTS "houseName" VARCHAR(255);`);
      console.log('[DB] houseName migration applied');
    } catch (houseNameMigrationErr) {
      console.warn('[DB] houseName migration warning (non-fatal):', houseNameMigrationErr.message);
    }

    // Notification preferences & queue tables migration (idempotent)
    try {
      // Create batchMode enum if it doesn't exist
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notification_preferences_batchMode') THEN
            CREATE TYPE "enum_notification_preferences_batchMode" AS ENUM ('instant', 'hourly', 'daily');
          END IF;
        END$$;
      `);

      // Create notification_preferences table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS notification_preferences (
          id SERIAL PRIMARY KEY,
          "accountId" UUID NOT NULL UNIQUE REFERENCES users("accountId"),
          "interestEnabled" BOOLEAN DEFAULT true,
          "profileViewEnabled" BOOLEAN DEFAULT true,
          "shortlistEnabled" BOOLEAN DEFAULT true,
          "chatEnabled" BOOLEAN DEFAULT true,
          "systemEnabled" BOOLEAN DEFAULT true,
          "matchEnabled" BOOLEAN DEFAULT true,
          "pushEnabled" BOOLEAN DEFAULT true,
          "inAppEnabled" BOOLEAN DEFAULT true,
          "emailEnabled" BOOLEAN DEFAULT false,
          "quietHoursEnabled" BOOLEAN DEFAULT false,
          "quietHoursStart" VARCHAR(5) DEFAULT '22:00',
          "quietHoursEnd" VARCHAR(5) DEFAULT '07:00',
          timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
          "mutedUserIds" JSONB DEFAULT '[]',
          "batchMode" "enum_notification_preferences_batchMode" DEFAULT 'instant',
          "topicSubscriptions" JSONB DEFAULT '["announcements"]',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Create notification_queue reason enum
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_notification_queue_reason') THEN
            CREATE TYPE "enum_notification_queue_reason" AS ENUM ('quiet_hours', 'batching');
          END IF;
        END$$;
      `);

      // Create notification_queue table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS notification_queue (
          id BIGSERIAL PRIMARY KEY,
          "accountId" UUID NOT NULL,
          type VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          data JSONB DEFAULT '{}',
          reason "enum_notification_queue_reason" NOT NULL,
          "scheduledFor" TIMESTAMPTZ,
          sent BOOLEAN DEFAULT false,
          "sentAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Create indexes
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_notif_pref_account ON notification_preferences ("accountId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_notif_queue_account ON notification_queue ("accountId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_notif_queue_sent_scheduled ON notification_queue (sent, "scheduledFor");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_notif_queue_reason ON notification_queue (reason);`);

      console.log('[DB] Notification preferences & queue migration applied');
    } catch (notifPrefMigrationErr) {
      console.warn('[DB] Notification preferences migration warning (non-fatal):', notifPrefMigrationErr.message);
    }

    // Notification imageUrl column migration (idempotent)
    try {
      await sequelize.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;`);
      console.log('[DB] Notification imageUrl migration applied');
    } catch (notifImgMigrationErr) {
      console.warn('[DB] Notification imageUrl migration warning (non-fatal):', notifImgMigrationErr.message);
    }

    // Subscription, Coupon & Referral system migration (idempotent)
    try {
      // User subscription fields
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMPTZ;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "gracePeriodEndsAt" TIMESTAMPTZ;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "referralCode" VARCHAR(255) UNIQUE;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "referredBy" INTEGER REFERENCES users(id);`);

      // Coupons table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS coupons (
          id SERIAL PRIMARY KEY,
          code VARCHAR(255) NOT NULL UNIQUE,
          description VARCHAR(255),
          "discountType" VARCHAR(20) NOT NULL DEFAULT 'percentage',
          "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
          "maxDiscount" DECIMAL(10,2),
          "minOrderAmount" DECIMAL(10,2) DEFAULT 0,
          "maxUses" INTEGER,
          "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
          "usedCount" INTEGER NOT NULL DEFAULT 0,
          "applicablePlans" TEXT,
          "validFrom" TIMESTAMPTZ,
          "validUntil" TIMESTAMPTZ,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Coupon usage tracking
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS coupon_usages (
          id SERIAL PRIMARY KEY,
          "couponId" INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
          "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "transactionId" INTEGER REFERENCES subscription_transactions(id),
          "discountAmount" DECIMAL(10,2) NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Referrals table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS referrals (
          id SERIAL PRIMARY KEY,
          "referrerId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          "referredId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          "referrerReward" INTEGER NOT NULL DEFAULT 0,
          "referredReward" INTEGER NOT NULL DEFAULT 0,
          "rewardedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE("referredId")
        );
      `);

      // Indexes
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons (code);`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons (status);`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_coupon_usages_coupon ON coupon_usages ("couponId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_coupon_usages_user ON coupon_usages ("userId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals ("referrerId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals ("referredId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_subscription_expiry ON users ("subscriptionExpiresAt");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users ("referralCode");`);

      console.log('[DB] Subscription, Coupon & Referral migration applied');
    } catch (subMigrationErr) {
      console.warn('[DB] Subscription migration warning (non-fatal):', subMigrationErr.message);
    }

    // App Settings table migration (idempotent)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id SERIAL PRIMARY KEY,
          key VARCHAR(255) NOT NULL UNIQUE,
          value TEXT NOT NULL,
          description VARCHAR(255),
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings (key);`);

      // Seed default referral reward settings
      await sequelize.query(`
        INSERT INTO app_settings (key, value, description, "createdAt", "updatedAt")
        VALUES ('referral_referrer_reward', '3', 'Tokens given to the referrer when referred user makes first purchase', NOW(), NOW())
        ON CONFLICT (key) DO NOTHING;
      `);
      await sequelize.query(`
        INSERT INTO app_settings (key, value, description, "createdAt", "updatedAt")
        VALUES ('referral_referred_reward', '2', 'Tokens given to the new user when they apply a referral code', NOW(), NOW())
        ON CONFLICT (key) DO NOTHING;
      `);

      console.log('[DB] App Settings migration applied');
    } catch (settingsMigrationErr) {
      console.warn('[DB] App Settings migration warning (non-fatal):', settingsMigrationErr.message);
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


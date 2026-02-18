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

    // Chat Reports & Chat Token Usages migration (idempotent)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS chat_reports (
          id SERIAL PRIMARY KEY,
          "conversationId" VARCHAR(255) NOT NULL,
          "reporterAccountId" UUID NOT NULL,
          "reportedAccountId" UUID NOT NULL,
          reason VARCHAR(50) NOT NULL CHECK (reason IN ('inappropriate','harassment','spam','fake_profile','other')),
          description TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','action_taken','dismissed')),
          "adminNotes" TEXT,
          "reviewedBy" INTEGER,
          "reviewedAt" TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chat_reports_conversation ON chat_reports ("conversationId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chat_reports_reporter ON chat_reports ("reporterAccountId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chat_reports_status ON chat_reports (status);`);

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS chat_token_usages (
          id SERIAL PRIMARY KEY,
          "userId" UUID NOT NULL,
          "conversationId" VARCHAR(255) NOT NULL,
          "otherUserId" UUID NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE ("userId", "conversationId")
        );
      `);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_chat_token_usages_user ON chat_token_usages ("userId");`);

      console.log('[DB] Chat Reports & Token Usages migration applied');
    } catch (chatMigrationErr) {
      console.warn('[DB] Chat migration warning (non-fatal):', chatMigrationErr.message);
    }

    // Safety & Abuse system migration (idempotent)
    try {
      // user_blocks table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS user_blocks (
          id SERIAL PRIMARY KEY,
          "blockerAccountId" UUID NOT NULL,
          "blockedAccountId" UUID NOT NULL,
          reason TEXT,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE("blockerAccountId", "blockedAccountId")
        );
      `);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks ("blockerAccountId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks ("blockedAccountId");`);

      // user_reports table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS user_reports (
          id SERIAL PRIMARY KEY,
          "reporterAccountId" UUID NOT NULL,
          "reportedAccountId" UUID NOT NULL,
          reason VARCHAR(50) NOT NULL,
          description TEXT,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          "adminNotes" TEXT,
          "reviewedBy" INTEGER,
          "reviewedAt" TIMESTAMPTZ,
          "actionTaken" VARCHAR(50),
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports ("reporterAccountId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports ("reportedAccountId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports (status);`);

      // New columns on users table for safety
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "reportCount" INTEGER DEFAULT 0;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "isFlagged" BOOLEAN DEFAULT false;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "flagReason" TEXT;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "profilePaused" BOOLEAN DEFAULT false;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "verifiedOnlyChat" BOOLEAN DEFAULT false;`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_is_flagged ON users ("isFlagged");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_users_profile_paused ON users ("profilePaused");`);

      console.log('[DB] Safety & Abuse migration applied');
    } catch (safetyMigrationErr) {
      console.warn('[DB] Safety migration warning (non-fatal):', safetyMigrationErr.message);
    }

    // CMS: page_contents and success_stories tables (idempotent)
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS page_contents (
          id SERIAL PRIMARY KEY,
          slug VARCHAR(100) NOT NULL UNIQUE,
          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          "metaDescription" VARCHAR(500),
          "isPublished" BOOLEAN DEFAULT false,
          "lastEditedBy" INTEGER,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_page_contents_slug ON page_contents (slug);`);

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS success_stories (
          id SERIAL PRIMARY KEY,
          "groomName" VARCHAR(100) NOT NULL,
          "brideName" VARCHAR(100) NOT NULL,
          subcaste VARCHAR(100),
          "marriedYear" INTEGER,
          story TEXT NOT NULL,
          "photoUrl" VARCHAR(500),
          rating INTEGER DEFAULT 5,
          "isPublished" BOOLEAN DEFAULT true,
          "displayOrder" INTEGER DEFAULT 0,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Seed default page slugs
      const defaultPages = [
        { slug: 'about-us', title: 'About Us' },
        { slug: 'privacy-policy', title: 'Privacy Policy' },
        { slug: 'terms-of-use', title: 'Terms of Use' },
        { slug: 'security-tips', title: 'Security Tips' },
        { slug: 'cookie-policy', title: 'Cookie Policy' },
        { slug: 'contact-us', title: 'Contact Us' },
      ];
      for (const page of defaultPages) {
        await sequelize.query(
          `INSERT INTO page_contents (slug, title, content, "isPublished", "createdAt", "updatedAt")
           VALUES (:slug, :title, '', false, NOW(), NOW())
           ON CONFLICT (slug) DO NOTHING;`,
          { replacements: page }
        );
      }

      console.log('[DB] CMS page_contents & success_stories migration applied');
    } catch (cmsMigrationErr) {
      console.warn('[DB] CMS migration warning (non-fatal):', cmsMigrationErr.message);
    }

    // Privacy settings table migration (idempotent)
    try {
      // Create ENUM types for privacy settings
      await sequelize.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_privacy_settings_profileVisibility') THEN
            CREATE TYPE "enum_privacy_settings_profileVisibility" AS ENUM ('public', 'members', 'hidden');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_privacy_settings_showPhotosTo') THEN
            CREATE TYPE "enum_privacy_settings_showPhotosTo" AS ENUM ('everyone', 'accepted_only', 'premium_only', 'nobody');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_privacy_settings_showPhone') THEN
            CREATE TYPE "enum_privacy_settings_showPhone" AS ENUM ('everyone', 'accepted_only', 'premium_only', 'nobody');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_privacy_settings_showEmail') THEN
            CREATE TYPE "enum_privacy_settings_showEmail" AS ENUM ('everyone', 'accepted_only', 'nobody');
          END IF;
        END$$;
      `);

      // Create privacy_settings table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS privacy_settings (
          id SERIAL PRIMARY KEY,
          "accountId" UUID NOT NULL UNIQUE REFERENCES users("accountId") ON DELETE CASCADE,
          "profileVisibility" "enum_privacy_settings_profileVisibility" DEFAULT 'members',
          "showPhotosTo" "enum_privacy_settings_showPhotosTo" DEFAULT 'everyone',
          "blurPhotos" BOOLEAN DEFAULT false,
          "showPhone" "enum_privacy_settings_showPhone" DEFAULT 'accepted_only',
          "showEmail" "enum_privacy_settings_showEmail" DEFAULT 'nobody',
          "hideFromSearch" BOOLEAN DEFAULT false,
          "hideLastSeen" BOOLEAN DEFAULT true,
          "hideOnlineStatus" BOOLEAN DEFAULT true,
          "visibleToCastes" JSONB DEFAULT NULL,
          "visibleToReligions" JSONB DEFAULT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Create index
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_privacy_settings_account ON privacy_settings ("accountId");`);

      // Backfill: create default privacy_settings for existing users who don't have one
      await sequelize.query(`
        INSERT INTO privacy_settings ("accountId", "profileVisibility", "createdAt", "updatedAt")
        SELECT u."accountId",
               COALESCE(u."profileVisibility", 'members')::"enum_privacy_settings_profileVisibility",
               NOW(), NOW()
        FROM users u
        WHERE u."accountId" NOT IN (SELECT "accountId" FROM privacy_settings)
          AND u."deletedAt" IS NULL
        ON CONFLICT ("accountId") DO NOTHING;
      `);

      console.log('[DB] Privacy settings migration applied');
    } catch (privacyMigrationErr) {
      console.warn('[DB] Privacy settings migration warning (non-fatal):', privacyMigrationErr.message);
    }

    // Legal & Compliance migration (consent_logs table + user columns) — idempotent
    try {
      // Add accepted_terms columns to users table
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "acceptedTermsAt" TIMESTAMPTZ;`);
      await sequelize.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "acceptedTermsVersion" VARCHAR(50);`);

      // Create ENUM types for consent_logs
      await sequelize.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_consent_logs_action') THEN
            CREATE TYPE "enum_consent_logs_action" AS ENUM ('grant', 'withdraw');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_consent_logs_policyType') THEN
            CREATE TYPE "enum_consent_logs_policyType" AS ENUM ('terms', 'privacy', 'all');
          END IF;
        END$$;
      `);

      // Create consent_logs table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS consent_logs (
          id SERIAL PRIMARY KEY,
          "accountId" UUID NOT NULL REFERENCES users("accountId") ON DELETE CASCADE,
          action "enum_consent_logs_action" NOT NULL,
          "policyType" "enum_consent_logs_policyType" NOT NULL,
          "policyVersion" VARCHAR(50) NOT NULL DEFAULT '1.0',
          "ipAddress" VARCHAR(45),
          "userAgent" VARCHAR(500),
          metadata JSONB,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Indexes
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_consent_logs_account ON consent_logs ("accountId");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_consent_logs_action ON consent_logs (action);`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_consent_logs_policy_type ON consent_logs ("policyType");`);
      await sequelize.query(`CREATE INDEX IF NOT EXISTS idx_consent_logs_created ON consent_logs ("createdAt");`);

      // Seed default Privacy Policy and Terms of Service CMS pages (idempotent)
      await sequelize.query(`
        INSERT INTO page_contents (slug, title, content, "metaDescription", "isPublished", "createdAt", "updatedAt")
        VALUES
          ('privacy-policy', 'Privacy Policy', '<h2>Privacy Policy</h2>
<p><strong>Effective Date:</strong> February 16, 2026 &nbsp;|&nbsp; <strong>Version:</strong> 1.0</p>
<p>Namma Naidu Matrimony (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is committed to protecting your personal data in accordance with the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong> and applicable Indian laws.</p>

<h3>1. Data We Collect</h3>
<ul>
<li><strong>Identity data:</strong> name, gender, date of birth, photos.</li>
<li><strong>Contact data:</strong> phone number, email address.</li>
<li><strong>Profile data:</strong> religion, caste, education, occupation, family details, horoscope, partner preferences.</li>
<li><strong>Usage data:</strong> device info, IP address, app interactions, timestamps.</li>
<li><strong>Payment data:</strong> transaction IDs processed by our payment gateway (we do not store card numbers).</li>
</ul>

<h3>2. Purpose of Processing</h3>
<p>We process your data solely to provide matrimony matchmaking services, communicate with you, improve our platform, and comply with legal obligations.</p>

<h3>3. Consent</h3>
<p>By registering on our platform and accepting this Privacy Policy, you provide <strong>free, specific, informed, unconditional, and unambiguous</strong> consent to the collection and processing of your personal data as described herein (Section 6, DPDP Act 2023).</p>

<h3>4. Data Sharing</h3>
<p>Your profile information is visible to other registered members as per your privacy settings. We do not sell your personal data. We may share data with: (a) payment processors, (b) cloud hosting providers, (c) law enforcement when required by law.</p>

<h3>5. Data Retention</h3>
<p>Your data is retained as long as your account is active. Upon account deletion, we erase your personal data within 30 days, except where retention is required by law.</p>

<h3>6. Your Rights (DPDP Act 2023)</h3>
<ul>
<li><strong>Right to access</strong> &ndash; Request a summary of your personal data we hold.</li>
<li><strong>Right to correction</strong> &ndash; Update inaccurate or incomplete data via your profile settings.</li>
<li><strong>Right to erasure</strong> &ndash; Delete your account and all associated personal data.</li>
<li><strong>Right to withdraw consent</strong> &ndash; Withdraw consent at any time via Profile Settings &rarr; Legal &amp; Compliance. Withdrawal may result in account deactivation.</li>
<li><strong>Right to grievance redressal</strong> &ndash; Contact our Grievance Officer (see below).</li>
<li><strong>Right to nominate</strong> &ndash; Nominate a person to exercise your rights in case of death or incapacity.</li>
</ul>

<h3>7. Data Security</h3>
<p>We employ industry-standard encryption (TLS/SSL), hashed passwords (bcrypt), and access controls to protect your data.</p>

<h3>8. Grievance Officer</h3>
<p>Name: Namma Naidu Grievance Officer<br/>Email: grievance@nammanaidu.com<br/>Response time: Within 72 hours of receipt.</p>

<h3>9. Changes to This Policy</h3>
<p>We may update this policy periodically. If changes are material, we will notify you via email or in-app notification and request re-consent where required.</p>',
          'Privacy Policy for Namma Naidu Matrimony — DPDP Act 2023 compliant.', true, NOW(), NOW()),

          ('terms-of-use', 'Terms & Conditions', '<h2>Terms &amp; Conditions</h2>
<p><strong>Effective Date:</strong> February 16, 2026 &nbsp;|&nbsp; <strong>Version:</strong> 1.0</p>
<p>Welcome to Namma Naidu Matrimony. By registering or using our services, you agree to be bound by these Terms &amp; Conditions.</p>

<h3>1. Eligibility</h3>
<ul>
<li>You must be at least 18 years of age (21 for male users intending to marry).</li>
<li>You must be legally competent to enter into a contract under the Indian Contract Act, 1872.</li>
<li>You must not be a married person (unless legally separated / divorced).</li>
</ul>

<h3>2. Account Registration</h3>
<p>You agree to provide accurate, current, and complete information. You are responsible for maintaining the confidentiality of your login credentials.</p>

<h3>3. Acceptable Use</h3>
<p>You shall not: (a) post false or misleading information, (b) harass or abuse other members, (c) use the platform for commercial purposes, (d) scrape or data-mine the platform, (e) impersonate another person.</p>

<h3>4. Profile Verification</h3>
<p>We reserve the right to verify profiles, request documents, and reject or remove profiles that violate our policies.</p>

<h3>5. Subscription &amp; Payments</h3>
<p>Some features require a paid subscription. All payments are processed securely via Razorpay. Refund policies are governed by our Refund Policy.</p>

<h3>6. Privacy &amp; Data Protection</h3>
<p>Your use of the platform is also governed by our <a href="/privacy-policy">Privacy Policy</a>, which complies with the DPDP Act, 2023.</p>

<h3>7. Content Ownership</h3>
<p>You retain ownership of content you upload. By uploading, you grant us a non-exclusive license to display it on the platform for matchmaking purposes.</p>

<h3>8. Limitation of Liability</h3>
<p>Namma Naidu Matrimony acts as an intermediary platform. We are not responsible for the conduct of any member, the accuracy of profiles, or any outcomes resulting from interactions on the platform.</p>

<h3>9. Termination</h3>
<p>We may suspend or terminate your account if you violate these Terms. You may delete your account at any time via Profile Settings.</p>

<h3>10. Governing Law</h3>
<p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana.</p>

<h3>11. Consent Withdrawal</h3>
<p>Under the DPDP Act 2023, you have the right to withdraw your consent to data processing at any time. You can do so via Profile Settings &rarr; Legal &amp; Compliance. Please note that withdrawing consent may result in the deactivation of your account.</p>

<h3>12. Changes to Terms</h3>
<p>We reserve the right to modify these Terms. Material changes will be communicated via email or in-app notification.</p>

<h3>13. Contact</h3>
<p>For queries, contact us at: support@nammanaidu.com</p>',
          'Terms and Conditions for Namma Naidu Matrimony.', true, NOW(), NOW())
        ON CONFLICT (slug) DO NOTHING;
      `);

      console.log('[DB] Legal & Compliance migration applied');
    } catch (legalMigrationErr) {
      console.warn('[DB] Legal migration warning (non-fatal):', legalMigrationErr.message);
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


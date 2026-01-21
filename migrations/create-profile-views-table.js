require('dotenv').config();
const { sequelize } = require('../src/config/database');

const createProfileViewsTable = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established.');

    // Create profile_views table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS "profile_views" (
        "id" SERIAL PRIMARY KEY,
        "viewerId" UUID NOT NULL,
        "viewedUserId" UUID NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "profile_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("accountId") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "profile_views_viewedUserId_fkey" FOREIGN KEY ("viewedUserId") REFERENCES "users"("accountId") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "unique_viewer_viewed" UNIQUE ("viewerId", "viewedUserId")
      );
    `);

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "profile_views_viewerId" ON "profile_views"("viewerId");
      CREATE INDEX IF NOT EXISTS "profile_views_viewedUserId" ON "profile_views"("viewedUserId");
    `);

    console.log('✅ Migration successful: "profile_views" table created.');
    console.log('✅ Indexes created successfully.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

createProfileViewsTable();

# Fix Database Migration Issue After Mobile Registration

If you're getting a database migration error after registering from the mobile app, follow these steps:

## Quick Fix

### Step 1: Navigate to Migrations Folder

```bash
cd NammaNaiduBackend/migrations
```

### Step 2: Run the Vegetarian Migration

```bash
node run-vegetarian-migration.js
```

You should see:
```
🔄 Starting vegetarian field migration for basic_details table...
✅ Migration completed successfully!
   - Added vegetarian column to basic_details table
```

### Step 3: Restart Your Backend Server

After running the migration, restart your backend server:

```bash
# If using npm
npm start

# If using nodemon
nodemon src/server.js

# If using PM2
pm2 restart your-app-name
```

### Step 4: Try Registration Again

The registration should now work correctly!

---

## Alternative: Run SQL Directly

If the Node.js script doesn't work, you can run the SQL directly:

### Using psql (PostgreSQL command line)

```bash
psql -U your_username -d your_database -f add_vegetarian_to_basic_details.sql
```

### Using a Database GUI (pgAdmin, DBeaver, etc.)

1. Open your database client
2. Connect to your database
3. Open and run the SQL file: `migrations/add_vegetarian_to_basic_details.sql`

### Manual SQL

Connect to your database and run:

```sql
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
```

---

## Verify Migration Success

After running the migration, verify it worked:

```sql
-- Check if column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'basic_details' 
AND column_name = 'vegetarian';
```

You should see the `vegetarian` column listed.

---

## Troubleshooting

### Error: "Cannot find module 'pg'"

Install PostgreSQL client:
```bash
npm install pg
```

### Error: "Connection refused"

1. Check your `DATABASE_URL` in `.env` file
2. Make sure your database server is running
3. Verify database credentials are correct

### Error: "Permission denied"

Your database user needs ALTER TABLE permissions. Contact your database administrator or use a user with proper permissions.

### Still Getting Errors?

1. Check the backend server logs for the exact error message
2. Verify which column is missing (it might not be vegetarian)
3. Check the `migrations/README.md` for other migration scripts

---

## Need Help?

If you continue to have issues:
1. Check the error message in your backend logs
2. Verify your database connection is working
3. Make sure you're running the migration on the correct database

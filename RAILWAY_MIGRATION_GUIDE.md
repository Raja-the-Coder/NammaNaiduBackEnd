# Railway PostgreSQL Migration Guide

## How to Run the Vegetarian Migration on Railway

Since you're using Railway PostgreSQL, here are the easiest ways to run the migration:

---

## Option 1: Railway Web Interface (Easiest! ⭐)

### Step 1: Access Railway Dashboard
1. Go to [railway.app](https://railway.app)
2. Log in to your account
3. Select your project
4. Click on your **PostgreSQL** service

### Step 2: Open Query Tab
1. In the PostgreSQL service page, look for **"Query"** or **"Data"** tab
2. Click on it to open the SQL query editor

### Step 3: Run the Migration SQL
Copy and paste this SQL into the query editor:

```sql
-- Add vegetarian column to basic_details table
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

### Step 4: Execute
1. Click **"Run"** or press **Ctrl+Enter** (or **Cmd+Enter** on Mac)
2. You should see a success message
3. Done! ✅

---

## Option 2: Railway CLI (Command Line)

### Step 1: Install Railway CLI (if not installed)
```bash
npm i -g @railway/cli
```

### Step 2: Login to Railway
```bash
railway login
```

### Step 3: Link to Your Project
```bash
railway link
```

### Step 4: Connect to Database and Run SQL
```bash
# Connect to PostgreSQL shell
railway connect postgres

# Then run the SQL (copy the SQL from Option 1 above)
# Or use psql to run the file directly:
railway run psql $DATABASE_URL -f migrations/add_vegetarian_to_basic_details.sql
```

---

## Option 3: External pgAdmin (If You Have It Set Up)

If you've already connected pgAdmin to your Railway database:

### Step 1: Open pgAdmin
1. Connect to your Railway PostgreSQL server
2. Navigate to your database

### Step 2: Open Query Tool
1. Right-click on your database
2. Select **"Query Tool"**

### Step 3: Run the SQL
1. Paste the SQL from Option 1 above
2. Click **"Execute"** (F5)
3. Done! ✅

---

## Option 4: Using psql with Railway Connection String

### Step 1: Get Your Database URL from Railway
1. Go to Railway dashboard
2. Click on your PostgreSQL service
3. Go to **"Variables"** tab
4. Copy the `DATABASE_URL` or `POSTGRES_URL`

### Step 2: Run Migration
```bash
# Using the connection string directly
psql "your-railway-database-url" -f migrations/add_vegetarian_to_basic_details.sql

# Or connect interactively first
psql "your-railway-database-url"
# Then paste and run the SQL
```

---

## Verify Migration Success

After running the migration, verify it worked by running this SQL in Railway's query editor:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'basic_details' 
AND column_name = 'vegetarian';
```

You should see:
```
column_name | data_type
------------|-----------
vegetarian  | character varying
```

---

## After Migration

1. **Restart your backend server** (if it's running on Railway, it will auto-restart)
2. **Try registration again** from your mobile app
3. The migration error should be gone! ✅

---

## Troubleshooting

### "Permission denied" Error
- Make sure you're using the correct database user
- Railway's default user should have all permissions

### "Table does not exist" Error
- Make sure you're connected to the correct database
- Check that `basic_details` table exists first:
  ```sql
  SELECT * FROM information_schema.tables WHERE table_name = 'basic_details';
  ```

### "Column already exists" Error
- This is fine! The migration checks if the column exists first
- Your database is already up to date

---

## Quick Reference: The SQL to Run

```sql
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

**Just copy this SQL and run it in Railway's query editor!** 🚀

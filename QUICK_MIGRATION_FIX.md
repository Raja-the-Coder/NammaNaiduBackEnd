# Quick Fix: Run Vegetarian Migration

## The Problem
The migration script can't connect to your database. You have two options:

---

## Option 1: Fix Database Connection (Then Run Migration)

### Step 1: Check Your .env File
Make sure your `.env` file in `NammaNaiduBackend` has the `DATABASE_URL` set:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

**For Railway/Cloud databases:**
```env
DATABASE_URL=postgresql://postgres:password@your-host:5432/railway
```

### Step 2: Make Sure Database is Running
- If using local PostgreSQL: Start PostgreSQL service
- If using Railway/Cloud: Database should already be running

### Step 3: Run Migration
```powershell
cd "d:\KR\My Project\Matri\NammaNaiduBackend\migrations"
node run-vegetarian-migration.js
```

---

## Option 2: Run SQL Directly (Easier!)

If you have access to your database through pgAdmin, DBeaver, or any SQL client:

### Copy and Run This SQL:

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

### Steps:
1. Open your database client (pgAdmin, DBeaver, etc.)
2. Connect to your database
3. Open a SQL query window
4. Paste the SQL above
5. Run it (F5 or Execute button)
6. Done! ✅

---

## Verify It Worked

Run this SQL to check:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'basic_details' 
AND column_name = 'vegetarian';
```

You should see the `vegetarian` column listed.

---

## After Migration

**Restart your backend server** and try registration again!

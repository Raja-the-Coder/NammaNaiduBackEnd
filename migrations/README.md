# Database Migrations

## Quick Start: Running Migrations

All migrations can be run using Node.js scripts. Make sure your `.env` file has the `DATABASE_URL` configured.

```bash
# Navigate to migrations folder
cd migrations

# Run a specific migration
node run-vegetarian-migration.js
node run-family-fields-migration.js
# ... etc
```

---

## Migration: Add Vegetarian Column to basic_details

**Required for:** User registration with diet preference

### Run Migration

```bash
cd migrations
node run-vegetarian-migration.js
```

### What it does

Adds a `vegetarian` column to the `basic_details` table to store diet preference (Vegetarian/Non-Vegetarian).

### After Migration

Restart your backend server. The registration will now work correctly.

---

## Migration: Change personId from INTEGER to UUID

The `person_photos` table needs to be updated to use UUID for `personId` instead of INTEGER.

### Option 1: Fresh Start (Delete all existing data)

If you don't have important data in the `person_photos` table, use this script:

```bash
psql -U your_username -d your_database -f alter_person_photos_personid_to_uuid.sql
```

Or run the SQL directly in your PostgreSQL client.

### Option 2: Preserve Existing Data

If you have existing photo data that you want to keep, use this script which maps existing user IDs to accountIds:

```bash
psql -U your_username -d your_database -f alter_person_photos_personid_to_uuid_preserve_data.sql
```

### Manual Steps (if scripts don't work)

1. Connect to your PostgreSQL database
2. Run the SQL commands from one of the migration files
3. Verify the column type: `\d person_photos` in psql

### After Migration

Restart your backend server. The model is already configured to use UUID, so it should work correctly after the migration.

---

## Common Migration Issues

### Error: "column does not exist"

If you get this error during registration, it means a migration hasn't been run. Check which column is missing and run the corresponding migration:

- **vegetarian**: `node run-vegetarian-migration.js`
- **pincode/district**: Check if these columns exist, may need manual SQL
- **familyType/familyValues**: `node run-family-fields-migration.js`

### Error: "Connection refused" or "Cannot connect to database"

Make sure your `DATABASE_URL` in `.env` is correct and the database server is running.

### Error: "Permission denied"

Make sure your database user has ALTER TABLE permissions.

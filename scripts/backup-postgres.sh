#!/bin/bash

# ============================================
# PostgreSQL Backup Script
# ============================================
# 
# Setup cron job for daily backups:
#   crontab -e
#   Add: 0 2 * * * /home/deploy/nammanaidu/NammaNaiduBackend/scripts/backup-postgres.sh
#   (Runs at 2 AM daily)
#
# To restore:
#   gunzip < backup_file.sql.gz | sudo -u postgres psql database_name
# ============================================

# Configuration
BACKUP_DIR="/home/deploy/backups/postgres"
RETENTION_DAYS=7  # Keep backups for 7 days
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Databases to backup
DATABASES=("app_dev_db" "app_prod_db")

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

echo "============================================"
echo "PostgreSQL Backup - $DATE"
echo "============================================"

# Backup each database
for DB in "${DATABASES[@]}"; do
    BACKUP_FILE="$BACKUP_DIR/${DB}_${DATE}.sql.gz"
    
    echo -n "Backing up $DB... "
    
    if sudo -u postgres pg_dump $DB | gzip > $BACKUP_FILE; then
        SIZE=$(du -h $BACKUP_FILE | cut -f1)
        echo -e "${GREEN}OK${NC} ($SIZE)"
    else
        echo -e "${RED}FAILED${NC}"
    fi
done

# Delete old backups
echo ""
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

# List current backups
echo ""
echo "Current backups:"
ls -lh $BACKUP_DIR/*.sql.gz 2>/dev/null || echo "No backups found"

# Calculate total size
TOTAL_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
echo ""
echo "Total backup size: $TOTAL_SIZE"
echo "============================================"
echo "Backup complete!"

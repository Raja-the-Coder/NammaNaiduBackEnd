#!/bin/bash

# ============================================
# Deployment Script
# ============================================
# Run this to deploy updates:
#   bash scripts/deploy.sh
# ============================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  NammaNaidu Deployment${NC}"
echo -e "${GREEN}============================================${NC}"

# Navigate to project directory
cd "$(dirname "$0")/.."

echo -e "\n${YELLOW}[1/5] Pulling latest changes...${NC}"
git pull origin main

echo -e "\n${YELLOW}[2/5] Installing dependencies...${NC}"
npm install --production

echo -e "\n${YELLOW}[3/5] Running migrations (if any)...${NC}"
# Uncomment and add your migration commands here
# npm run migrate

echo -e "\n${YELLOW}[4/5] Reloading PM2 (zero-downtime)...${NC}"
pm2 reload ecosystem.config.js --env production

echo -e "\n${YELLOW}[5/5] Checking status...${NC}"
pm2 status

echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"

# Show recent logs
echo -e "\nRecent logs:"
pm2 logs --lines 10 --nostream

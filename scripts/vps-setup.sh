#!/bin/bash

# ============================================
# VPS Initial Setup Script
# ============================================
# Run as root: bash vps-setup.sh
#
# This script:
# 1. Creates a non-root user
# 2. Configures SSH security
# 3. Installs Node.js, PM2, Nginx
# 4. Sets up firewall
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  NammaNaidu VPS Setup Script${NC}"
echo -e "${GREEN}============================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root: sudo bash vps-setup.sh${NC}"
    exit 1
fi

# ============================================
# 1. Create non-root user
# ============================================
echo -e "\n${YELLOW}[1/6] Creating non-root user...${NC}"

read -p "Enter username for new user (e.g., deploy): " USERNAME

if id "$USERNAME" &>/dev/null; then
    echo -e "${YELLOW}User $USERNAME already exists, skipping...${NC}"
else
    adduser --gecos "" $USERNAME
    usermod -aG sudo $USERNAME
    echo -e "${GREEN}User $USERNAME created and added to sudo group${NC}"
fi

# ============================================
# 2. Configure SSH security
# ============================================
echo -e "\n${YELLOW}[2/6] Configuring SSH security...${NC}"

# Backup SSH config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Create SSH directory for new user
mkdir -p /home/$USERNAME/.ssh
chmod 700 /home/$USERNAME/.ssh

# Copy root's authorized_keys if exists
if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys /home/$USERNAME/.ssh/
    chmod 600 /home/$USERNAME/.ssh/authorized_keys
    chown -R $USERNAME:$USERNAME /home/$USERNAME/.ssh
    echo -e "${GREEN}Copied SSH keys to new user${NC}"
fi

# Harden SSH config (optional - uncomment if you want)
# sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
# sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
# sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

echo -e "${YELLOW}NOTE: Root login and password auth are still enabled.${NC}"
echo -e "${YELLOW}After testing SSH with $USERNAME, you can disable them manually:${NC}"
echo -e "  sudo nano /etc/ssh/sshd_config"
echo -e "  Set: PermitRootLogin no"
echo -e "  Set: PasswordAuthentication no"
echo -e "  Then: sudo systemctl restart sshd"

# ============================================
# 3. Install Node.js (LTS)
# ============================================
echo -e "\n${YELLOW}[3/6] Installing Node.js LTS...${NC}"

if command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js already installed: $(node -v)${NC}"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo -e "${GREEN}Node.js installed: $(node -v)${NC}"
fi

# ============================================
# 4. Install PM2 globally
# ============================================
echo -e "\n${YELLOW}[4/6] Installing PM2...${NC}"

if command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 already installed${NC}"
else
    npm install -g pm2
    echo -e "${GREEN}PM2 installed${NC}"
fi

# Setup PM2 to start on boot
pm2 startup systemd -u $USERNAME --hp /home/$USERNAME
echo -e "${GREEN}PM2 configured to start on boot${NC}"

# ============================================
# 5. Install and configure Nginx
# ============================================
echo -e "\n${YELLOW}[5/6] Installing Nginx...${NC}"

if command -v nginx &> /dev/null; then
    echo -e "${YELLOW}Nginx already installed${NC}"
else
    apt-get install -y nginx
    echo -e "${GREEN}Nginx installed${NC}"
fi

# Start and enable Nginx
systemctl start nginx
systemctl enable nginx

# Install Certbot for SSL
apt-get install -y certbot python3-certbot-nginx
echo -e "${GREEN}Certbot installed for SSL certificates${NC}"

# ============================================
# 6. Configure UFW Firewall
# ============================================
echo -e "\n${YELLOW}[6/6] Configuring firewall (UFW)...${NC}"

apt-get install -y ufw

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow ssh

# Allow HTTP and HTTPS
ufw allow 'Nginx Full'

# Enable firewall
echo "y" | ufw enable

echo -e "${GREEN}Firewall configured and enabled${NC}"
ufw status

# ============================================
# Summary
# ============================================
echo -e "\n${GREEN}============================================${NC}"
echo -e "${GREEN}  VPS Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo -e ""
echo -e "Next steps:"
echo -e "  1. Test SSH login with new user:"
echo -e "     ${YELLOW}ssh $USERNAME@your-vps-ip${NC}"
echo -e ""
echo -e "  2. Clone your project:"
echo -e "     ${YELLOW}git clone your-repo /home/$USERNAME/nammanaidu${NC}"
echo -e ""
echo -e "  3. Setup environment:"
echo -e "     ${YELLOW}cd /home/$USERNAME/nammanaidu/NammaNaiduBackend${NC}"
echo -e "     ${YELLOW}cp .env.production .env${NC}"
echo -e "     ${YELLOW}npm install${NC}"
echo -e ""
echo -e "  4. Start with PM2:"
echo -e "     ${YELLOW}pm2 start ecosystem.config.js --env production${NC}"
echo -e "     ${YELLOW}pm2 save${NC}"
echo -e ""
echo -e "  5. Setup Nginx:"
echo -e "     ${YELLOW}sudo cp nginx.conf /etc/nginx/sites-available/nammanaidu${NC}"
echo -e "     ${YELLOW}sudo ln -s /etc/nginx/sites-available/nammanaidu /etc/nginx/sites-enabled/${NC}"
echo -e "     ${YELLOW}sudo nginx -t && sudo systemctl reload nginx${NC}"
echo -e ""
echo -e "  6. Setup SSL (after domain is pointed):"
echo -e "     ${YELLOW}sudo certbot --nginx -d api.yourdomain.com${NC}"
echo -e ""

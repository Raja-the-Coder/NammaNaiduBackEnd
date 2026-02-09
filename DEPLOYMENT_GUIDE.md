# NammaNaidu Backend - VPS Deployment Guide

## Quick Reference

| Environment | Database URL |
|-------------|--------------|
| DEV | `postgresql://app_dev_user:DevStrong@123@localhost:5432/app_dev_db` |
| PROD | `postgresql://app_prod_user:ProdStrong@123@localhost:5432/app_prod_db` |

---

## Phase 1: VPS Initial Setup (One-time)

### Step 1: Create Non-Root User

SSH into your VPS as root:
```bash
ssh root@your-vps-ip
```

Run the setup script (or do manually):
```bash
# Option A: Use the provided script
bash scripts/vps-setup.sh

# Option B: Manual steps
adduser deploy
usermod -aG sudo deploy

# Copy SSH keys to new user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

### Step 2: Test SSH with New User

In a **new terminal** (keep root session open):
```bash
ssh deploy@your-vps-ip
```

If it works, you can later disable root login.

### Step 3: Install Dependencies

As the deploy user:
```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node -v   # Should show v20.x.x
npm -v    # Should show 10.x.x

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx
sudo apt-get install -y nginx

# Install Certbot for SSL
sudo apt-get install -y certbot python3-certbot-nginx
```

### Step 4: Configure Firewall

```bash
sudo apt-get install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

## Phase 2: Deploy the Application

### Step 1: Clone Repository

```bash
cd /home/deploy
git clone https://github.com/your-username/namma-naidu.git nammanaidu
cd nammanaidu/NammaNaiduBackend
```

### Step 2: Setup Environment

```bash
# Copy production environment file
cp .env.production .env

# Edit with your actual values
nano .env
```

**Important**: Update these in `.env`:
- `JWT_SECRET` - Change to a strong, unique secret
- `CORS_ORIGIN` - Your frontend domain
- `EMAIL_*` - Your email credentials

### Step 3: Install Dependencies

```bash
npm install --production
```

### Step 4: Create Logs Directory

```bash
mkdir -p logs
```

### Step 5: Test Database Connection

```bash
node -e "require('dotenv').config(); require('./src/config/database').connectDB()"
```

### Step 6: Start with PM2

```bash
# Start in production mode
pm2 start ecosystem.config.js --env production

# Save PM2 configuration for auto-restart
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs
```

### Step 7: Verify

```bash
pm2 status
pm2 logs --lines 20

# Test API
curl http://localhost:5000/health
```

---

## Phase 3: Setup Nginx Reverse Proxy

### Step 1: Copy Nginx Configuration

```bash
sudo cp nginx.conf /etc/nginx/sites-available/nammanaidu
```

### Step 2: Edit Domain

```bash
sudo nano /etc/nginx/sites-available/nammanaidu
# Change 'api.yourdomain.com' to your actual domain
```

### Step 3: Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/nammanaidu /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### Step 4: Test

```bash
# Test via Nginx (should work with IP before domain setup)
curl http://your-vps-ip
```

---

## Phase 4: Domain & SSL Setup

### Step 1: Point Domain to VPS

In your domain registrar (Hostinger, GoDaddy, etc.):
- Add an A record: `api` → `your-vps-ip`
- Wait 5-30 minutes for DNS propagation

### Step 2: Verify DNS

```bash
ping api.yourdomain.com
# Should resolve to your VPS IP
```

### Step 3: Install SSL Certificate

```bash
sudo certbot --nginx -d api.yourdomain.com
```

Follow the prompts:
- Enter email for renewal notices
- Agree to terms
- Choose to redirect HTTP to HTTPS (recommended)

### Step 4: Verify SSL

```bash
curl https://api.yourdomain.com/health
```

### Step 5: Enable HTTPS Config in Nginx

Edit `/etc/nginx/sites-available/nammanaidu`:
- Uncomment the HTTPS server block
- Comment out the temporary HTTP proxy section

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Phase 5: Setup Backups

### Step 1: Create Backup Directory

```bash
mkdir -p /home/deploy/backups/postgres
```

### Step 2: Make Script Executable

```bash
chmod +x scripts/backup-postgres.sh
```

### Step 3: Test Backup

```bash
./scripts/backup-postgres.sh
```

### Step 4: Setup Daily Cron Job

```bash
crontab -e
```

Add this line (runs at 2 AM daily):
```
0 2 * * * /home/deploy/nammanaidu/NammaNaiduBackend/scripts/backup-postgres.sh >> /home/deploy/backups/backup.log 2>&1
```

### Step 5: Verify Cron

```bash
crontab -l
```

---

## Useful Commands

### PM2 Commands
```bash
pm2 status              # Check status
pm2 logs                # View logs (follow mode)
pm2 logs --lines 100    # Last 100 lines
pm2 restart all         # Restart all
pm2 reload all          # Zero-downtime reload
pm2 stop all            # Stop all
pm2 monit               # Real-time monitoring
```

### Database Commands
```bash
# Connect to PostgreSQL
sudo -u postgres psql

# List databases
sudo -u postgres psql -c "\l"

# Connect to specific database
sudo -u postgres psql -d app_prod_db

# Manual backup
sudo -u postgres pg_dump app_prod_db > backup.sql

# Restore backup
gunzip < backup.sql.gz | sudo -u postgres psql app_prod_db
```

### Nginx Commands
```bash
sudo nginx -t                    # Test config
sudo systemctl reload nginx      # Reload (no downtime)
sudo systemctl restart nginx     # Full restart
sudo systemctl status nginx      # Check status
sudo tail -f /var/log/nginx/error.log    # Error logs
```

### SSL Commands
```bash
sudo certbot certificates        # List certificates
sudo certbot renew --dry-run     # Test renewal
sudo certbot renew               # Renew all
```

---

## Deployment Updates

For future deployments:

```bash
cd /home/deploy/nammanaidu/NammaNaiduBackend
./scripts/deploy.sh
```

Or manually:
```bash
git pull origin main
npm install --production
pm2 reload all
```

---

## Troubleshooting

### PM2 won't start
```bash
pm2 logs                    # Check error logs
pm2 delete all
pm2 start ecosystem.config.js --env production
```

### Database connection failed
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check if listening
sudo netstat -plnt | grep 5432

# Test connection
sudo -u postgres psql -c "\conninfo"
```

### Nginx 502 Bad Gateway
```bash
# Check if Node.js is running
pm2 status

# Check Nginx error log
sudo tail -f /var/log/nginx/error.log

# Verify port
curl http://localhost:5000/health
```

### SSL certificate issues
```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Check Nginx SSL config
sudo nginx -t
```

---

## Security Checklist

- [ ] Non-root user created
- [ ] SSH key authentication working
- [ ] Root login disabled (optional)
- [ ] Password authentication disabled (optional)
- [ ] Firewall enabled (UFW)
- [ ] SSL certificate installed
- [ ] Strong JWT_SECRET set
- [ ] Static OTP disabled in production
- [ ] Database passwords are strong
- [ ] Backups configured and tested

---

## Mobile App Configuration

Update your Flutter app's API base URL:

```dart
// lib/core/config/app_config.dart
class AppConfig {
  static const String apiBaseUrl = 'https://api.yourdomain.com';
}
```

Or use environment variables:
```dart
const String apiBaseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'https://api.yourdomain.com',
);
```

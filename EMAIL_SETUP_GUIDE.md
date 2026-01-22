# Email Setup Guide - Fixing SMTP Connection Timeout

## Problem: SMTP Connection Timeout (ETIMEDOUT)

If you're seeing `ETIMEDOUT` errors when sending emails, it's because **SMTP ports (587/465) are blocked** on your hosting provider (Railway, Render, VPS, etc.).

## ✅ Solution: Use Email API (NOT SMTP)

**Email APIs** don't require SMTP ports and work reliably on all cloud platforms, including **Render Free**.

### 🎯 For Render Free: Use SendGrid (ONLY SOLUTION)

SendGrid is the **only email service that works reliably on Render Free tier**.

### Quick Setup (5 minutes)

1. **Sign up for SendGrid** (Free tier: 100 emails/day)
   - Go to: https://sendgrid.com
   - Sign up with your email

2. **Get your API Key**
   - Go to: https://app.sendgrid.com/settings/api_keys
   - Click "Create API Key"
   - Choose "Full Access" or "Restricted Access" (Mail Send)
   - Copy the key (starts with `SG.`)

3. **Verify your sender email**
   - Go to: https://app.sendgrid.com/settings/sender_auth/senders/new
   - Add and verify your sender email address
   - This email will be used as the "from" address

4. **Set Environment Variable**
   - **Render**: Dashboard → Your Service → Environment → Add `SENDGRID_API_KEY`
   - **Local**: Add to `.env` file:
     ```
     SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
     SENDGRID_FROM_EMAIL=your-verified-email@yourdomain.com
     ```

5. **Install package** (if not already installed)
   ```bash
   npm install @sendgrid/mail
   ```

6. **Restart your server**
   - Render: Auto-restarts when you add variables
   - Local: Restart your Node.js server

7. **Test it!**
   - Send an OTP via email
   - Check server logs - you should see: `✅ Email sent via SendGrid API`

### That's it! 🎉

No more SMTP port issues. SendGrid API works through HTTPS (port 443), which is never blocked.

---

## Alternative: Resend API (For Railway/VPS)

**Resend API** doesn't require SMTP ports and works reliably on all cloud platforms.

### Quick Setup (5 minutes)

1. **Sign up for Resend** (Free tier: 3,000 emails/month)
   - Go to: https://resend.com
   - Sign up with your email

2. **Get your API Key**
   - Go to: https://resend.com/api-keys
   - Click "Create API Key"
   - Copy the key (starts with `re_`)

3. **Set Environment Variable**
   - **Railway**: Dashboard → Your Service → Variables → Add `RESEND_API_KEY`
   - **Local**: Add to `.env` file:
     ```
     RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
     ```

4. **Restart your server**
   - Railway: Auto-restarts when you add variables
   - Local: Restart your Node.js server

5. **Test it!**
   - Send an OTP via email
   - Check server logs - you should see: `✅ Email sent via Resend API`

### That's it! 🎉

No more SMTP port issues. Resend API works through HTTPS (port 443), which is never blocked.

---

## Alternative: Fix SMTP Configuration

If you prefer to use SMTP (Gmail), update your configuration:

### Updated Gmail SMTP Config

The code now uses explicit host/port/secure settings (more reliable):

```javascript
// Already configured in mailer.js
host: 'smtp.gmail.com',
port: 587,
secure: false, // MUST be false for port 587
```

### Environment Variables

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password  # NOT your regular password!
```

### Gmail App Password Setup

1. Enable 2-Step Verification: https://myaccount.google.com/security
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use the 16-character password (no spaces) as `EMAIL_PASS`

---

## How It Works Now

The email service automatically:

1. **Tries SendGrid API first** (if `SENDGRID_API_KEY` is set) - **Recommended for Render Free**
2. **Tries Resend API** (if `RESEND_API_KEY` is set) - Recommended for Railway/VPS
3. **Falls back to SMTP** (if `EMAIL_USER` and `EMAIL_PASS` are set)
4. **Provides clear error messages** if all fail

### Priority Order:
1. ✅ **SendGrid API** (if `SENDGRID_API_KEY` is set) - **Works on Render Free**
2. ✅ Resend API (if `RESEND_API_KEY` is set) - Works on Railway/VPS
3. ✅ SMTP (if `EMAIL_USER` and `EMAIL_PASS` are set) - May be blocked on cloud platforms

---

## Troubleshooting

### SendGrid API Issues

**Error: "SENDGRID_API_KEY is not configured"**
- Make sure you set `SENDGRID_API_KEY` in environment variables
- Restart your server after adding the variable

**Error: "Invalid API key"**
- Verify your API key is correct (starts with `SG.`)
- Check if the key is active in SendGrid dashboard
- Regenerate API key if needed

**Error: "The from address does not match a verified Sender Identity"**
- You must verify your sender email in SendGrid
- Go to: https://app.sendgrid.com/settings/sender_auth/senders/new
- Add and verify your email address
- Use the verified email as `SENDGRID_FROM_EMAIL` or in the `from` parameter

### Resend API Issues

**Error: "RESEND_API_KEY is not configured"**
- Make sure you set `RESEND_API_KEY` in environment variables
- Restart your server after adding the variable

**Error: "Invalid API key"**
- Verify your API key is correct
- Check if the key is active in Resend dashboard

### SMTP Issues

**Error: ETIMEDOUT / ECONNECTION**
- SMTP ports are blocked on your hosting provider
- **Solution**: Use Resend API instead (see above)

**Error: EAUTH (Authentication Failed)**
- Verify `EMAIL_PASS` is an App Password (not regular password)
- Ensure 2-Step Verification is enabled
- Regenerate App Password if needed

---

## Cost Comparison

| Service | Free Tier | Paid Plans | Works on Render Free |
|---------|-----------|------------|---------------------|
| **SendGrid** | 100 emails/day | $19.95/month for 50k emails | ✅ **YES** |
| **Resend** | 3,000 emails/month | $20/month for 50k emails | ✅ Yes |
| **Gmail SMTP** | Unlimited* | Free (with Gmail account) | ❌ No (ports blocked) |

*Gmail SMTP has rate limits and may be blocked on cloud platforms

---

## Recommended Setup

**For Render Free:**
- ✅ Use **SendGrid API** (ONLY solution that works reliably)

**For Railway/VPS:**
- ✅ Use **SendGrid API** or **Resend API** (both work, no port issues)

**For Local Development:**
- ✅ Use **SendGrid API** (same as production, recommended)
- Or use **Gmail SMTP** (free, easy setup, but won't work on cloud)

---

## Need Help?

Check server logs when sending OTP - they now include:
- Which provider was used (Resend or SMTP)
- Detailed error messages
- Helpful suggestions for fixing issues

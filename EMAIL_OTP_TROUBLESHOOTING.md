# Email OTP Troubleshooting Guide

## Issue: OTP works locally but not on server

### Step 1: Check Server Logs

When the server starts, you should see:
```
🔍 Verifying email transporter configuration...
   EMAIL_USER: your-email@gmail.com
   EMAIL_PASS: ***SET***
✅ Email transporter verified and ready
```

If you see errors, note the error code and message.

### Step 2: Verify Environment Variables on Server

**For Railway:**
1. Go to Railway Dashboard → Your Service → Variables
2. Verify these variables are set:
   - `EMAIL_USER` = your Gmail address (e.g., `aravindrajacoder@gmail.com`)
   - `EMAIL_PASS` = Gmail App Password (16 characters, no spaces)

**For Other Hosting:**
- Check your `.env` file or environment variable configuration
- Ensure variables are loaded correctly

### Step 3: Check Gmail App Password

1. Go to https://myaccount.google.com/apppasswords
2. Verify 2-Step Verification is enabled
3. Generate a new App Password if needed
4. Copy the 16-character password (no spaces)
5. Set it as `EMAIL_PASS` on your server

### Step 4: Check Server Logs When Sending OTP

When you call `/api/auth/otp/send` with email, check server logs for:

**Success:**
```
📧 Attempting to send OTP email...
   From: your-email@gmail.com
   To: recipient@example.com
   OTP: 123456
✅ OTP email sent successfully!
   Message ID: <message-id>
   Response: 250 2.0.0 OK
```

**Error - Authentication Failed:**
```
❌ ERROR SENDING OTP EMAIL
Error Message: Invalid login
Error Code: EAUTH
⚠️  AUTHENTICATION ERROR:
   - Check if EMAIL_USER and EMAIL_PASS are correct
   - Verify App Password is valid (not regular password)
   - Ensure 2-Step Verification is enabled
```

**Error - Connection Failed:**
```
❌ ERROR SENDING OTP EMAIL
Error Message: Connection timeout
Error Code: ECONNECTION
⚠️  CONNECTION ERROR:
   - Check server internet connection
   - Verify firewall allows SMTP (port 587/465)
   - Check if Gmail SMTP is accessible from server
```

### Step 5: Test Email Configuration

You can test the email configuration by checking server startup logs. If you see:
```
❌ EMAIL TRANSPORTER VERIFICATION FAILED
```

This means the email configuration is incorrect before any OTP is sent.

### Step 6: Common Issues and Solutions

#### Issue: EAUTH (Authentication Error)
**Solution:**
- Verify `EMAIL_USER` is the full Gmail address
- Verify `EMAIL_PASS` is an App Password (16 chars), not your regular password
- Regenerate App Password if needed
- Ensure 2-Step Verification is enabled

#### Issue: ECONNECTION / ETIMEDOUT
**Solution:**
- Check server has internet connectivity
- Verify firewall allows outbound connections on ports 587 and 465
- Some hosting providers block SMTP - check with your provider
- Try using a different email service (SendGrid, Mailgun, etc.)

#### Issue: Email sent but not received
**Solution:**
- Check spam/junk folder
- Verify recipient email address is correct
- Check Gmail account for any security alerts
- Wait a few minutes (Gmail can delay emails)

#### Issue: Environment variables not loading
**Solution:**
- Restart the server after setting environment variables
- Verify variable names are exactly `EMAIL_USER` and `EMAIL_PASS`
- Check for typos or extra spaces
- For Railway: Variables are case-sensitive

### Step 7: Enable Debug Mode (Temporary)

In `src/mailer.js`, temporarily change:
```javascript
debug: true,  // Change from false to true
logger: true, // Change from false to true
```

This will show detailed SMTP communication logs.

### Step 8: Alternative Email Services

If Gmail continues to fail, consider:
- **SendGrid** (Free tier: 100 emails/day)
- **Mailgun** (Free tier: 5,000 emails/month)
- **AWS SES** (Very cheap, requires setup)
- **Resend** (Modern, developer-friendly)

Update `src/mailer.js` with the new SMTP configuration.

### Step 9: Verify OTP is Still Generated

Even if email fails, the OTP is still:
- Generated and stored in database
- Returned in the API response

Check the API response - it should include:
```json
{
  "status": true,
  "mailid": "user@example.com",
  "otp": "123456"
}
```

The OTP in the response can be used for testing even if email doesn't arrive.

### Step 10: Check Server Console Output

When sending OTP, watch the server console for:
- Email sending attempts
- Success/error messages
- Detailed error information

All errors are logged with detailed information to help diagnose the issue.

---

## Quick Checklist

- [ ] `EMAIL_USER` is set on server
- [ ] `EMAIL_PASS` is set on server (App Password, not regular password)
- [ ] 2-Step Verification is enabled in Google Account
- [ ] App Password is valid (16 characters)
- [ ] Server has internet connectivity
- [ ] Firewall allows SMTP ports (587, 465)
- [ ] Server logs show email transporter verification
- [ ] Check server logs when sending OTP
- [ ] OTP is returned in API response (can use for testing)

---

## Need More Help?

Check the server logs for detailed error messages. All email-related errors are logged with:
- Error message
- Error code
- Suggested solutions
- Common issue patterns

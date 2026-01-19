const nodemailer = require('nodemailer');
require('dotenv').config();

// Create a reusable transporter object using Gmail SMTP with optimized settings
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // Connection pool settings for better performance
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    // Timeout settings
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
    // Retry settings
    retry: {
        attempts: 2,
        delay: 1000,
    },
    // Debug mode (set to true for troubleshooting)
    debug: false,
    logger: false,
});

// Verify connection on startup with detailed logging
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    console.log('🔍 Verifying email transporter configuration...');
    console.log('   EMAIL_USER:', process.env.EMAIL_USER);
    console.log('   EMAIL_PASS:', process.env.EMAIL_PASS ? '***SET***' : 'NOT SET');
    
    transporter.verify((error, success) => {
        if (error) {
            console.error('═══════════════════════════════════════════════════════');
            console.error('❌ EMAIL TRANSPORTER VERIFICATION FAILED');
            console.error('═══════════════════════════════════════════════════════');
            console.error('Error:', error.message);
            console.error('Code:', error.code);
            console.error('Command:', error.command);
            
            if (error.code === 'EAUTH') {
                console.error('⚠️  AUTHENTICATION FAILED:');
                console.error('   - Verify EMAIL_USER is correct');
                console.error('   - Verify EMAIL_PASS is an App Password (not regular password)');
                console.error('   - Check if 2-Step Verification is enabled');
                console.error('   - Generate new App Password: https://myaccount.google.com/apppasswords');
            } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
                console.error('⚠️  CONNECTION FAILED:');
                console.error('   - Check server internet connectivity');
                console.error('   - Verify firewall allows SMTP ports (587, 465)');
                console.error('   - Check if Gmail SMTP is accessible');
            }
            console.error('═══════════════════════════════════════════════════════');
        } else {
            console.log('✅ Email transporter verified and ready');
            console.log('   Service: Gmail SMTP');
            console.log('   User:', process.env.EMAIL_USER);
        }
    });
} else {
    console.warn('⚠️  Email transporter not configured:');
    console.warn('   EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
    console.warn('   EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET' : 'NOT SET');
    console.warn('   Email OTP functionality will not work');
}

module.exports = transporter;

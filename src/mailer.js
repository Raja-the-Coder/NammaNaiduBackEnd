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

// Verify connection on startup (optional, can be removed if causing issues)
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter.verify((error, success) => {
        if (error) {
            console.error('❌ Email transporter verification failed:', error.message);
        } else {
            console.log('✅ Email transporter ready');
        }
    });
}

module.exports = transporter;

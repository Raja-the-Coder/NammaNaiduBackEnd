const nodemailer = require('nodemailer');
require('dotenv').config();

// Determine SMTP configuration
const getSmtpConfig = () => {
    // If custom SMTP host is provided, use it
    if (process.env.EMAIL_HOST) {
        return {
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || '587'),
            secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            // Connection pool settings for better performance
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            // Increased timeout settings for better reliability
            connectionTimeout: 30000, // 30 seconds (increased from 10)
            greetingTimeout: 30000,  // 30 seconds (increased from 10)
            socketTimeout: 30000,    // 30 seconds (increased from 10)
            // Retry settings
            retry: {
                attempts: 3, // Increased from 2
                delay: 2000, // 2 seconds delay between retries
            },
            // TLS options for better compatibility
            tls: {
                rejectUnauthorized: false, // Accept self-signed certificates
            },
            // Debug mode (set to true for troubleshooting)
            debug: process.env.EMAIL_DEBUG === 'true',
            logger: process.env.EMAIL_DEBUG === 'true',
        };
    }
    
    // Default Gmail configuration with explicit host/port/secure settings
    // This is more reliable than using service: 'gmail'
    return {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // MUST be false for port 587, true for 465
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        // Connection pool settings for better performance
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        // Increased timeout settings for better reliability
        connectionTimeout: 30000, // 30 seconds
        greetingTimeout: 30000,    // 30 seconds
        socketTimeout: 30000,      // 30 seconds
        // Retry settings
        retry: {
            attempts: 3,
            delay: 2000, // 2 seconds delay between retries
        },
        // TLS options for better compatibility
        tls: {
            rejectUnauthorized: false, // Accept self-signed certificates
            ciphers: 'SSLv3', // Use SSLv3 for better compatibility
        },
        // Debug mode (set to true for troubleshooting)
        debug: process.env.EMAIL_DEBUG === 'true',
        logger: process.env.EMAIL_DEBUG === 'true',
    };
};

// Create a reusable transporter object using SMTP with optimized settings
const transporter = nodemailer.createTransport(getSmtpConfig());

// Verify connection on startup with detailed logging (non-blocking)
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    console.log('🔍 Verifying email transporter configuration...');
    console.log('   EMAIL_USER:', process.env.EMAIL_USER);
    console.log('   EMAIL_PASS:', process.env.EMAIL_PASS ? '***SET***' : 'NOT SET');
    console.log('   EMAIL_HOST:', process.env.EMAIL_HOST || 'Gmail (default)');
    console.log('   EMAIL_PORT:', process.env.EMAIL_PORT || '587 (default)');
    console.log('   Connection Timeout: 30 seconds');
    
    // Use async/await with timeout wrapper
    const verifyWithTimeout = async () => {
        try {
            // Set a timeout for verification (35 seconds)
            const verificationPromise = transporter.verify();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Verification timeout after 35 seconds')), 35000)
            );
            
            await Promise.race([verificationPromise, timeoutPromise]);
            
            console.log('✅ Email transporter verified and ready');
            console.log('   Service:', process.env.EMAIL_HOST || 'Gmail SMTP');
            console.log('   User:', process.env.EMAIL_USER);
        } catch (error) {
            console.error('═══════════════════════════════════════════════════════');
            console.error('❌ EMAIL TRANSPORTER VERIFICATION FAILED');
            console.error('═══════════════════════════════════════════════════════');
            console.error('Error:', error.message);
            console.error('Code:', error.code || 'TIMEOUT');
            console.error('Command:', error.command || 'VERIFY');
            
            if (error.code === 'EAUTH') {
                console.error('⚠️  AUTHENTICATION FAILED:');
                console.error('   - Verify EMAIL_USER is correct');
                console.error('   - Verify EMAIL_PASS is an App Password (not regular password)');
                console.error('   - Check if 2-Step Verification is enabled');
                console.error('   - Generate new App Password: https://myaccount.google.com/apppasswords');
            } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
                console.error('⚠️  CONNECTION FAILED:');
                console.error('   - Check server internet connectivity');
                console.error('   - Verify firewall allows SMTP ports (587, 465)');
                console.error('   - Check if SMTP server is accessible');
                console.error('   - Try increasing timeout or using different SMTP service');
                console.error('   - Consider using SendGrid, Mailgun, or AWS SES as alternatives');
                console.error('');
                console.error('💡 TIP: Email will still attempt to send, verification is just a check.');
                console.error('   If emails fail to send, check the error logs when sending.');
            }
            console.error('═══════════════════════════════════════════════════════');
        }
    };
    
    // Run verification asynchronously (non-blocking)
    verifyWithTimeout().catch(() => {
        // Error already logged above
    });
} else {
    console.warn('⚠️  Email transporter not configured:');
    console.warn('   EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
    console.warn('   EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET' : 'NOT SET');
    console.warn('   Email OTP functionality will not work');
}

/**
 * Helper function to send email with better error handling
 * @param {Object} mailOptions - Nodemailer mail options
 * @returns {Promise} - Promise that resolves with email info or rejects with error
 */
const sendEmail = async (mailOptions) => {
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', info.messageId);
        return info;
    } catch (error) {
        console.error('❌ Failed to send email:');
        console.error('   To:', mailOptions.to);
        console.error('   Subject:', mailOptions.subject);
        console.error('   Error:', error.message);
        console.error('   Code:', error.code);
        
        // Re-throw error so caller can handle it
        throw error;
    }
};

module.exports = transporter;
module.exports.sendEmail = sendEmail;

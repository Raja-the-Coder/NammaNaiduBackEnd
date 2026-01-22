// Email service with support for multiple providers
// Supports: SendGrid API (works on Render Free), Resend API, SMTP (Nodemailer)

const nodemailer = require('nodemailer');

/**
 * Send email using SendGrid API (RECOMMENDED for Render Free)
 * SendGrid works on Render Free tier and doesn't require SMTP ports
 */
const sendEmailViaSendGrid = async (to, subject, html, from = null) => {
  try {
    // Check if SendGrid API key is configured
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY is not configured');
    }

    // Dynamically require SendGrid (only if needed)
    let sgMail;
    try {
      sgMail = require('@sendgrid/mail');
    } catch (e) {
      throw new Error('@sendgrid/mail is not installed. Run: npm install @sendgrid/mail');
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const fromEmail = from || process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_USER || 'noreply@yourdomain.com';

    const msg = {
      to: to,
      from: fromEmail, // Must be verified in SendGrid
      subject: subject,
      html: html,
      text: html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
    };

    const [response] = await sgMail.send(msg);

    console.log('✅ Email sent via SendGrid API');
    console.log('   Status Code:', response.statusCode);
    console.log('   Message ID:', response.headers['x-message-id']);

    return {
      success: true,
      messageId: response.headers['x-message-id'] || 'unknown',
      provider: 'sendgrid',
    };
  } catch (error) {
    console.error('❌ SendGrid API error:', error.message);
    if (error.response) {
      console.error('   Status Code:', error.response.statusCode);
      console.error('   Body:', error.response.body);
    }
    throw error;
  }
};

/**
 * Send email using Resend API (recommended for Railway/Render/VPS)
 * Resend doesn't require SMTP ports and works reliably on cloud platforms
 */
const sendEmailViaResend = async (to, subject, html, from = null) => {
  try {
    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    // Use built-in fetch (Node 18+) or require node-fetch for older versions
    let fetch;
    if (typeof global.fetch !== 'undefined') {
      fetch = global.fetch;
    } else {
      // Try to use node-fetch if available (for Node < 18)
      try {
        fetch = require('node-fetch');
      } catch (e) {
        throw new Error('fetch is not available. Please use Node.js 18+ or install node-fetch: npm install node-fetch');
      }
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = from || process.env.EMAIL_USER || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `Resend API error: ${response.status}`);
    }

    console.log('✅ Email sent via Resend API:', data.id);
    return {
      success: true,
      messageId: data.id,
      provider: 'resend',
    };
  } catch (error) {
    console.error('❌ Resend API error:', error.message);
    throw error;
  }
};

/**
 * Send email using SMTP (Nodemailer)
 * Fallback when Resend is not configured
 */
const sendEmailViaSmtp = async (to, subject, html, from = null) => {
  try {
    const transporter = require('../mailer');
    const fromEmail = from || process.env.EMAIL_USER;

    if (!fromEmail) {
      throw new Error('EMAIL_USER is not configured');
    }

    const info = await transporter.sendMail({
      from: fromEmail,
      to: to,
      subject: subject,
      html: html,
    });

    console.log('✅ Email sent via SMTP:', info.messageId);
    return {
      success: true,
      messageId: info.messageId,
      provider: 'smtp',
    };
  } catch (error) {
    console.error('❌ SMTP error:', error.message);
    throw error;
  }
};

/**
 * Main email sending function
 * Priority: SendGrid > Resend > SMTP
 */
const sendEmail = async (to, subject, html, from = null) => {
  // Priority 1: Try SendGrid API if configured (RECOMMENDED for Render Free)
  if (process.env.SENDGRID_API_KEY) {
    try {
      return await sendEmailViaSendGrid(to, subject, html, from);
    } catch (sendgridError) {
      console.warn('⚠️  SendGrid API failed, trying next provider...');
      // Fall through to next provider
    }
  }

  // Priority 2: Try Resend API if configured
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendEmailViaResend(to, subject, html, from);
    } catch (resendError) {
      console.warn('⚠️  Resend API failed, trying next provider...');
      // Fall through to SMTP
    }
  }

  // Priority 3: Fallback to SMTP
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      return await sendEmailViaSmtp(to, subject, html, from);
    } catch (smtpError) {
      // If SMTP also fails, provide helpful error message
      const availableProviders = [];
      if (!process.env.SENDGRID_API_KEY) availableProviders.push('SENDGRID_API_KEY (recommended for Render Free)');
      if (!process.env.RESEND_API_KEY) availableProviders.push('RESEND_API_KEY');
      
      if (availableProviders.length > 0) {
        throw new Error(`SMTP failed: ${smtpError.message}. Consider using an email API instead. Available options: ${availableProviders.join(', ')}`);
      }
      throw smtpError;
    }
  }

  throw new Error('No email provider configured. Set SENDGRID_API_KEY (recommended for Render Free), RESEND_API_KEY, or EMAIL_USER/EMAIL_PASS');
};

module.exports = { 
  sendEmail,
  sendEmailViaSendGrid,
  sendEmailViaResend,
  sendEmailViaSmtp,
};

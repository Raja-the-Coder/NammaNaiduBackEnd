const rateLimit = require('express-rate-limit');

/**
 * Rate limiting middleware for auth endpoints.
 * Protects against brute-force attacks and abuse.
 */

// OTP send: strict limit (3 requests per minute per IP)
const otpSendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after 1 minute.',
    error: 'RATE_LIMIT_OTP_SEND',
  },
  keyGenerator: (req) => {
    // Use IP + phone/email combo for more targeted limiting
    const identifier = req.body.mobileno || req.body.mailid || '';
    return `${req.ip}-${identifier}`;
  },
  validate: false, // Custom keyGenerator handles IP ourselves
});

// OTP verify: moderate limit (10 requests per minute per IP)
const otpVerifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many verification attempts. Please try again after 1 minute.',
    error: 'RATE_LIMIT_OTP_VERIFY',
  },
});

// Login: moderate limit (10 requests per minute per IP)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 1 minute.',
    error: 'RATE_LIMIT_LOGIN',
  },
});

// Password reset: strict limit (5 requests per 15 minutes per IP)
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many password reset requests. Please try again after 15 minutes.',
    error: 'RATE_LIMIT_PASSWORD_RESET',
  },
});

// General API: relaxed limit (100 requests per minute per IP)
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please slow down.',
    error: 'RATE_LIMIT_GENERAL',
  },
});

// Interest/profile-action: 20 per day per user (not per IP)
const interestLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Daily interest limit reached (20/day). Upgrade to premium for more.',
    error: 'RATE_LIMIT_INTEREST',
  },
  keyGenerator: (req) => {
    // Rate limit per authenticated user, not per IP
    return `interest:${req.accountId || req.ip}`;
  },
  validate: false,
});

module.exports = {
  otpSendLimiter,
  otpVerifyLimiter,
  loginLimiter,
  passwordResetLimiter,
  generalApiLimiter,
  interestLimiter,
};

const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  firebaseLogin,
  sendOtp,
  verifyOtp,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
} = require('./auth.controller');
const { validate } = require('../../middleware/validation.middleware');
const { authenticate } = require('../../middleware/auth.middleware');
const {
  otpSendLimiter,
  otpVerifyLimiter,
  loginLimiter,
  passwordResetLimiter,
} = require('../../middleware/rateLimit.middleware');

const router = express.Router();

// Deprecated: use POST /api/auth/otp/send and POST /api/auth/otp/verify instead.
router.post('/send-otp', otpSendLimiter, (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '');
  const countryCode = req.body.countryCode || '+91';
  req.body = { isemailid: false, mobileno: countryCode + mobile };
  sendOtp(req, res);
});

router.post('/verify-otp', otpVerifyLimiter, (req, res) => {
  const mobile = String(req.body.mobile || '').replace(/\D/g, '');
  const countryCode = req.body.countryCode || '+91';
  req.body = {
    isemailid: false,
    otp: req.body.otp,
    mobileno: countryCode + mobile,
    mobile: req.body.mobile,
    countryCode,
    name: req.body.name,
    gender: req.body.gender,
    profileFor: req.body.profileFor,
  };
  verifyOtp(req, res);
});

router.post(
  '/firebase-login',
  [
    body('idToken').trim().notEmpty().withMessage('Firebase ID token is required'),
    body('name').optional().trim(),
    body('gender')
      .optional()
      .isIn(['Male', 'Female', 'Other'])
      .withMessage('Gender must be Male, Female, or Other'),
    body('profileFor').optional().trim(),
    body('countryCode').optional().trim(),
    validate,
  ],
  firebaseLogin
);

// Register route
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    validate,
  ],
  register
);

// Login route (handles both user and admin login)
router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  login
);

// New OTP endpoints
router.post(
  '/otp/send',
  otpSendLimiter,
  [
    body('isemailid').isBoolean().withMessage('isemailid must be a boolean'),
    body('mobileno')
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Please provide a valid mobile number'),
    body('mailid')
      .optional()
      .isEmail()
      .withMessage('Please provide a valid email'),
    validate,
  ],
  sendOtp
);

router.post(
  '/otp/verify',
  otpVerifyLimiter,
  [
    body('isemailid').isBoolean().withMessage('isemailid must be a boolean'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
    body('mobileno')
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Please provide a valid mobile number'),
    body('mailid')
      .optional()
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('name').optional().trim(),
    body('gender').optional().trim().isIn(['Male', 'Female', 'Other']).withMessage('Gender must be Male, Female, or Other'),
    body('profileFor').optional().trim(),
    body('mobile').optional().trim(),
    body('countryCode').optional().trim(),
    validate,
  ],
  verifyOtp
);

// Resend OTP (supports SMS retry via MSG91 voice/text)
router.post(
  '/otp/resend',
  otpSendLimiter,
  [
    body('isemailid').isBoolean().withMessage('isemailid must be a boolean'),
    body('mobileno')
      .optional()
      .trim()
      .matches(/^\+?[1-9]\d{1,14}$/)
      .withMessage('Please provide a valid mobile number'),
    body('mailid')
      .optional()
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('retryType')
      .optional()
      .trim()
      .isIn(['text', 'voice'])
      .withMessage('retryType must be text or voice'),
    validate,
  ],
  sendOtp // reuses sendOtp with retryType flag
);

// Refresh token - exchange refresh token for new access token
router.post(
  '/refresh-token',
  [
    body('refreshToken').trim().notEmpty().withMessage('Refresh token is required'),
    validate,
  ],
  refreshToken
);

// Logout - revoke refresh token
router.post(
  '/logout',
  authenticate,
  logout
);

// Forgot password - send reset OTP to email
router.post(
  '/forgot-password',
  passwordResetLimiter,
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    validate,
  ],
  forgotPassword
);

// Reset password - verify OTP and set new password
router.post(
  '/reset-password',
  passwordResetLimiter,
  [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    validate,
  ],
  resetPassword
);

module.exports = router;



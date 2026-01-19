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
} = require('./auth.controller');
const { validate } = require('../../middleware/validation.middleware');

const router = express.Router();

router.post(
  '/send-otp',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('gender')
      .trim()
      .isIn(['Male', 'Female', 'Other'])
      .withMessage('Gender must be Male, Female, or Other'),
    body('mobile')
      .trim()
      .matches(/^[0-9]{6,15}$/)
      .withMessage('Mobile number must contain only digits'),
    body('email').optional().isEmail().withMessage('Please provide a valid email'),
    body('countryCode').optional().trim(),
    body('profileFor').optional().trim(),
    validate,
  ],
  sendRegistrationOtp
);

router.post(
  '/verify-otp',
  [
    body('mobile').trim().notEmpty().withMessage('Mobile number is required'),
    body('countryCode').optional().trim(),
    body('otp').trim().notEmpty().withMessage('OTP is required'),
    body('name').optional().trim(),
    body('gender')
      .optional()
      .isIn(['Male', 'Female', 'Other'])
      .withMessage('Gender must be Male, Female, or Other'),
    body('profileFor').optional().trim(),
    validate,
  ],
  verifyRegistrationOtp
);

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
    validate,
  ],
  verifyOtp
);

module.exports = router;



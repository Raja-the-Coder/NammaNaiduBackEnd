const express = require('express');
const { body } = require('express-validator');
const {
  getProfile,
  updateProfile,
  getAllUsers,
  saveBasicDetails,
  createProfileAction,
  removeProfileAction,
  getProfileAction,
  getMyProfileActions,
  getReceivedProfileActions,
  getOppositeGenderProfiles,
  getProfileByAccountId,
  searchProfiles,
} = require('./user.controller');
const photoRoutes = require('./photo.routes');
const { authenticate } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// IMPORTANT: More specific routes (with parameters) should come BEFORE less specific routes
// Get user profile by accountId (for viewing other users' profiles) - must come before /profile
router.get('/profile/:accountId', getProfileByAccountId);

// Get current user profile
router.get('/profile', getProfile);

// Update user profile
router.put('/profile', updateProfile);

router.post(
  '/basic-details',
  [
    body('email').optional().isEmail().withMessage('Please provide a valid email'),
    body('password')
      .optional()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('dobDay').optional().isInt({ min: 1, max: 31 }).withMessage('dobDay must be between 1 and 31'),
    body('dobMonth')
      .optional()
      .custom((value) => {
        const num = parseInt(value);
        if (!isNaN(num)) {
          if (num < 1 || num > 12) {
            throw new Error('dobMonth must be between 1 and 12');
          }
          return true;
        }
        const months = [
          'january',
          'february',
          'march',
          'april',
          'may',
          'june',
          'july',
          'august',
          'september',
          'october',
          'november',
          'december',
        ];
        if (typeof value === 'string' && months.includes(value.toLowerCase())) {
          return true;
        }
        throw new Error('dobMonth must be a valid month number (1-12) or name');
      }),
    body('dobYear').optional().isInt({ min: 1900 }).withMessage('dobYear must be >= 1900'),
    body('dateOfBirth').optional().isISO8601().withMessage('dateOfBirth must be a valid date'),
    body('height').optional().trim(),
    body('physicalStatus').optional().trim(),
    body('maritalStatus').optional().trim(),
    body('religion').optional().trim(),
    body('caste').optional().trim(),
    body('subcaste').optional().trim(),
    body('willingToMarryFromAnyCaste').optional().isBoolean().withMessage('willingToMarryFromAnyCaste must be boolean'),
    body('dosham').optional().trim(),
    body('country').optional().trim(),
    body('state').optional().trim(),
    body('city').optional().trim(),
    body('education').optional().trim(),
    body('employmentType').optional().trim(),
    body('occupation').optional().trim(),
    body('currency').optional().trim(),
    body('annualIncome').optional().trim(),
    body('familyStatus').optional().trim(),
    body('familyType').optional().trim(),
    body('familyValues').optional().trim(),
    body('aboutFamily').optional().trim(),
    validate,
  ],
  saveBasicDetails
);

// Get all users
router.get('/', getAllUsers);

// Profile Actions Routes
// Create or update profile action (interest, shortlist, reject)
router.post(
  '/profile-actions',
  [
    body('actionType')
      .isIn(['interest', 'shortlist', 'reject', 'accept'])
      .withMessage('Action type must be interest, shortlist, reject, or accept'),
    body('targetUserId')
      .notEmpty()
      .withMessage('targetUserId is required')
      .isUUID()
      .withMessage('targetUserId must be a valid UUID'),
    validate,
  ],
  createProfileAction
);

// Remove profile action
router.delete(
  '/profile-actions',
  [
    body('actionType')
      .isIn(['interest', 'shortlist', 'reject', 'accept'])
      .withMessage('Action type must be interest, shortlist, reject, or accept'),
    body('targetUserId')
      .notEmpty()
      .withMessage('targetUserId is required')
      .isUUID()
      .withMessage('targetUserId must be a valid UUID'),
    validate,
  ],
  removeProfileAction
);

// Get profile actions for a specific target user
router.get('/profile-actions/:targetUserId', getProfileAction);

// Get all actions performed by the current user (with optional filter)
router.get('/my-profile-actions', getMyProfileActions);

// Get all actions received by the current user (with optional filter)
router.get('/received-profile-actions', getReceivedProfileActions);

// Get opposite gender profiles (uses authenticated user's ID or provided ID as query parameter)
router.get('/opposite-gender-profiles', getOppositeGenderProfiles);
router.get('/opposite-gender-profiles/:id', getOppositeGenderProfiles);

// Search profiles
router.get('/search', searchProfiles);

// Photo routes
router.use('/', photoRoutes);

module.exports = router;



const express = require('express');
const { body, param, query } = require('express-validator');
const {
  getAllUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
  getDeletedUsers,
  restoreUser,
  permanentDeleteUser,
  getPendingApprovals,
  approvePendingItem,
  rejectPendingItem,
  getBlockedUsers,
  getUserHoroscope,
  getUserFamily,
  getUserHobbies,
} = require('./user.controller');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const { validate } = require('../../middleware/validation.middleware');

const router = express.Router();

// All routes require admin authentication
router.use(authenticateAdmin);

// Get all users
router.get(
  '/users',
  [
    query('status').optional().isIn(['all', 'Active', 'Inactive', 'active', 'inactive']),
    query('gender').optional().isIn(['all', 'Male', 'Female']),
    query('search').optional().trim(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  getAllUsers
);

// Get pending approvals
router.get('/users/pending', getPendingApprovals);

// Approve pending item
router.post(
  '/users/pending/approve',
  [
    body('userId').isInt().withMessage('userId must be an integer'),
    body('type').isIn(['photo', 'profile', 'proof', 'kyc']).withMessage('type must be photo, profile, proof, or kyc'),
    validate,
  ],
  approvePendingItem
);

// Reject pending item
router.post(
  '/users/pending/reject',
  [
    body('userId').isInt().withMessage('userId must be an integer'),
    body('type').isIn(['photo', 'profile', 'proof', 'kyc']).withMessage('type must be photo, profile, proof, or kyc'),
    body('reason').optional().trim(),
    validate,
  ],
  rejectPendingItem
);

// Get blocked users
router.get('/users/blocked', getBlockedUsers);

// Soft-deleted users management
router.get('/users/deleted', getDeletedUsers);
router.post(
  '/users/:id/restore',
  [
    param('id').isInt().withMessage('User ID must be an integer'),
    validate,
  ],
  restoreUser
);
router.delete(
  '/users/:id/permanent',
  [
    param('id').isInt().withMessage('User ID must be an integer'),
    validate,
  ],
  permanentDeleteUser
);

// Get user by ID
router.get('/users/:id', getUserById);

// Update user (general update)
router.put(
  '/users/:id',
  [
    param('id').isInt().withMessage('User ID must be an integer'),
    validate,
  ],
  updateUser
);

// Update user status (block/unblock)
router.put(
  '/users/:id/status',
  [
    param('id').isInt().withMessage('User ID must be an integer'),
    body('isActive').isBoolean().withMessage('isActive must be a boolean'),
    validate,
  ],
  updateUserStatus
);

// Delete user
router.delete(
  '/users/:id',
  [
    param('id').isInt().withMessage('User ID must be an integer'),
    validate,
  ],
  deleteUser
);

// Get user horoscope by accountId
router.get(
  '/users/:accountId/horoscope',
  [
    param('accountId').isUUID().withMessage('Account ID must be a valid UUID'),
    validate,
  ],
  getUserHoroscope
);

// Get user family by accountId
router.get(
  '/users/:accountId/family',
  [
    param('accountId').isUUID().withMessage('Account ID must be a valid UUID'),
    validate,
  ],
  getUserFamily
);

// Get user hobbies by accountId
router.get(
  '/users/:accountId/hobbies',
  [
    param('accountId').isUUID().withMessage('Account ID must be a valid UUID'),
    validate,
  ],
  getUserHobbies
);

module.exports = router;


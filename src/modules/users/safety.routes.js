const express = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const {
  blockUser,
  unblockUser,
  getBlockedUsers,
  reportUser,
  getSafetySettings,
  updateSafetySettings,
} = require('./safety.controller');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Block / Unblock
router.post('/block', blockUser);
router.delete('/block', unblockUser);
router.get('/blocked-users', getBlockedUsers);

// Report
router.post('/report', reportUser);

// Safety settings
router.get('/safety-settings', getSafetySettings);
router.put('/safety-settings', updateSafetySettings);

module.exports = router;

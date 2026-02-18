const express = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const {
  getPrivacySettings,
  updatePrivacySettings,
  resetPrivacySettings,
} = require('./privacy.controller');

const router = express.Router();
router.use(authenticate);

router.get('/privacy', getPrivacySettings);
router.put('/privacy', updatePrivacySettings);
router.post('/privacy/reset', resetPrivacySettings);

module.exports = router;

const express = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const {
  getSuspiciousUsers,
  getSuspiciousBehaviorStats,
  actionSuspiciousUser,
} = require('./suspiciousBehavior.controller');

const router = express.Router();
router.use(authenticateAdmin);

router.get('/suspicious-users', getSuspiciousUsers);
router.get('/suspicious-stats', getSuspiciousBehaviorStats);
router.put('/suspicious-users/:accountId', actionSuspiciousUser);

module.exports = router;

const express = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const {
  getReports,
  getReportDetail,
  updateReport,
  getFlaggedUsers,
  reviewFlaggedUser,
  getBlocksList,
  getAbuseStats,
} = require('./safetyAdmin.controller');

const router = express.Router();
router.use(authenticateAdmin);

// Reports
router.get('/reports', getReports);
router.get('/reports/:id', getReportDetail);
router.put('/reports/:id', updateReport);

// Flagged users
router.get('/flagged-users', getFlaggedUsers);
router.put('/flagged-users/:accountId', reviewFlaggedUser);

// Blocks
router.get('/blocks', getBlocksList);

// Stats
router.get('/abuse-stats', getAbuseStats);

module.exports = router;

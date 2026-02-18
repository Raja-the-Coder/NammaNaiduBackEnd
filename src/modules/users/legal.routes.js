const express = require('express');
const { authenticate } = require('../../middleware/auth.middleware');
const {
  getConsentStatus,
  acceptTerms,
  withdrawConsent,
  getConsentHistory,
  getCurrentPolicyVersion,
} = require('./legal.controller');

const router = express.Router();

// Public — no auth needed
router.get('/legal/policy-version', getCurrentPolicyVersion);

// Authenticated routes
router.use(authenticate);
router.get('/legal/consent-status', getConsentStatus);
router.post('/legal/accept', acceptTerms);
router.post('/legal/withdraw', withdrawConsent);
router.get('/legal/consent-history', getConsentHistory);

module.exports = router;

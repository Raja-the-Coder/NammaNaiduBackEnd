const express = require('express');
const router = express.Router();
const {
  getOtpDeliveryStats,
  sendMarketingMessage,
  broadcastMessage,
  handleWebhookGet,
  handleWebhookPost,
} = require('./whatsapp.controller');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');

// ── Webhook (public — Meta calls this directly) ───────────────────
// GET  = Meta verification challenge
// POST = Delivery status updates
router.get('/webhook', handleWebhookGet);
router.post('/webhook', handleWebhookPost);

// ── Admin-only routes ─────────────────────────────────────────────
router.get('/otp-stats', authenticateAdmin, getOtpDeliveryStats);
router.post('/send-marketing', authenticateAdmin, sendMarketingMessage);
router.post('/broadcast', authenticateAdmin, broadcastMessage);

module.exports = router;

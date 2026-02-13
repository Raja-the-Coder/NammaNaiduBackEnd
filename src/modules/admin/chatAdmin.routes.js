const express = require('express');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');
const {
  listConversations,
  getConversationMessages,
  listReports,
  updateReport,
} = require('./chatAdmin.controller');

const router = express.Router();
router.use(authenticateAdmin);

router.get('/chat/conversations', listConversations);
router.get('/chat/conversations/:conversationId/messages', getConversationMessages);
router.get('/chat/reports', listReports);
router.put('/chat/reports/:reportId', updateReport);

module.exports = router;

const express = require('express');
const { body } = require('express-validator');
const { authenticate } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');
const {
  getConversations,
  getMessages,
  findOrCreateConversation,
  sendMessage,
  markMessageRead,
} = require('./message.controller');

const router = express.Router();
router.use(authenticate);

router.get('/conversations', getConversations);
router.get('/conversations/:conversationId', getMessages);
router.post(
  '/conversations',
  [body('otherAccountId').notEmpty().isUUID().withMessage('otherAccountId must be a valid UUID')],
  validate,
  findOrCreateConversation
);
router.post(
  '/conversations/:conversationId/messages',
  [body('body').notEmpty().trim().isLength({ min: 1, max: 5000 }).withMessage('Message body 1-5000 chars')],
  validate,
  sendMessage
);
router.put('/conversations/:conversationId/messages/:messageId/read', markMessageRead);

module.exports = router;

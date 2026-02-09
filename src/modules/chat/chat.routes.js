const express = require('express');
const { body, param } = require('express-validator');
const {
  createConversation,
  sendMessage,
  markAsRead,
  blockConversation,
  unblockConversation,
  getStreamToken,
} = require('./chat.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { validate } = require('../../middleware/validation.middleware');

const router = express.Router();
router.use(authenticate);

router.get('/stream-token', getStreamToken);

router.post(
  '/conversations',
  [
    body('otherUserId')
      .notEmpty()
      .withMessage('otherUserId is required')
      .isUUID()
      .withMessage('otherUserId must be a valid UUID'),
  ],
  validate,
  createConversation
);

router.post(
  '/messages',
  [
    body('conversationId').notEmpty().withMessage('conversationId is required'),
    body('text')
      .notEmpty()
      .withMessage('text is required')
      .isLength({ max: 5000 })
      .withMessage('Message too long (max 5000 characters)'),
    body('type')
      .optional()
      .isIn(['text', 'image', 'document'])
      .withMessage('type must be text, image, or document'),
  ],
  validate,
  sendMessage
);

router.put(
  '/conversations/:conversationId/read',
  [param('conversationId').notEmpty().withMessage('conversationId is required')],
  validate,
  markAsRead
);

router.put(
  '/conversations/:conversationId/block',
  [param('conversationId').notEmpty().withMessage('conversationId is required')],
  validate,
  blockConversation
);

router.put(
  '/conversations/:conversationId/unblock',
  [param('conversationId').notEmpty().withMessage('conversationId is required')],
  validate,
  unblockConversation
);

module.exports = router;

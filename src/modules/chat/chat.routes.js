const express = require('express');
const { body, param } = require('express-validator');
const {
  createConversation,
  sendMessage,
  markAsRead,
  blockConversation,
  unblockConversation,
  getStreamToken,
  reportConversation,
  deleteConversation,
  uploadChatImage,
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
      .optional()
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

// Report a conversation
router.post(
  '/conversations/:conversationId/report',
  [
    param('conversationId').notEmpty().withMessage('conversationId is required'),
    body('reason')
      .notEmpty()
      .withMessage('reason is required')
      .isIn(['inappropriate', 'harassment', 'spam', 'fake_profile', 'other'])
      .withMessage('Invalid reason'),
    body('description').optional().isLength({ max: 1000 }).withMessage('Description too long'),
  ],
  validate,
  reportConversation
);

// Delete a conversation (soft delete for the user)
router.delete(
  '/conversations/:conversationId',
  [param('conversationId').notEmpty().withMessage('conversationId is required')],
  validate,
  deleteConversation
);

// Upload chat image
router.post(
  '/upload-image',
  [
    body('image').notEmpty().withMessage('image (base64) is required'),
    body('conversationId').notEmpty().withMessage('conversationId is required'),
  ],
  validate,
  uploadChatImage
);

module.exports = router;

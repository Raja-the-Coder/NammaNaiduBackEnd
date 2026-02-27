const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const { authenticateAdmin } = require('../../middleware/adminAuth.middleware');

// Get notification statistics (Admin only)
router.get('/stats', authenticateAdmin, notificationController.getNotificationStats);

// Get notification queue statistics (Admin only)
router.get('/queue-stats', authenticateAdmin, notificationController.getQueueStats);

// Get notification history (Admin only)
router.get('/history', authenticateAdmin, notificationController.getNotificationHistory);

// Send push notification to target audience (Admin only)
router.post('/send-push', authenticateAdmin, notificationController.sendPushNotification);

// Send push notification to an FCM topic (Admin only)
router.post('/send-topic', authenticateAdmin, notificationController.sendTopicPush);

// Upload media for WhatsApp notification (Admin only)
router.post('/upload-media', authenticateAdmin, notificationController.uploadWhatsAppMedia);

// Send WhatsApp notification to target users (Admin only)
router.post('/send-whatsapp', authenticateAdmin, notificationController.sendWhatsAppNotification);

module.exports = router;

const User = require('../../models/User.model');
const SubscriptionTransaction = require('../../models/SubscriptionTransaction.model');
const Notification = require('../../models/Notification.model');
const DeviceToken = require('../../models/DeviceToken.model');
const { sendPushNotificationToUser, sendPushNotificationToUsers } = require('../../services/push-notification.service');
const { Op } = require('sequelize');

/**
 * Send push notification to users based on target audience
 * POST /api/admin/notifications/send-push
 */
const sendPushNotification = async (req, res) => {
  try {
    const { title, message, target, imageUrl } = req.body;

    // Validation
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required',
      });
    }

    if (!target || !['all', 'premium', 'active'].includes(target)) {
      return res.status(400).json({
        success: false,
        message: 'Target must be one of: all, premium, active',
      });
    }

    let targetUsers = [];

    // Get users based on target audience
    if (target === 'all') {
      // Get all active users
      targetUsers = await User.findAll({
        where: {
          isActive: true,
          role: 'user',
        },
        attributes: ['accountId', 'id'],
      });
    } else if (target === 'premium') {
      // Get users with active premium subscriptions
      const premiumUsers = await SubscriptionTransaction.findAll({
        where: {
          status: 'success',
        },
        include: [
          {
            model: User,
            as: 'user',
            where: {
              isActive: true,
              role: 'user',
            },
            attributes: ['accountId', 'id'],
          },
        ],
        attributes: ['userId'],
      });

      // Extract unique user accountIds
      const uniqueUserIds = [...new Set(premiumUsers.map((t) => t.userId))];
      targetUsers = await User.findAll({
        where: {
          id: uniqueUserIds,
          isActive: true,
        },
        attributes: ['accountId', 'id'],
      });
    } else if (target === 'active') {
      // Get users who have logged in recently (within last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      targetUsers = await User.findAll({
        where: {
          isActive: true,
          role: 'user',
          updatedAt: {
            [Op.gte]: thirtyDaysAgo,
          },
        },
        attributes: ['accountId', 'id'],
      });
    }

    if (targetUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No users found for target audience: ${target}`,
      });
    }

    const accountIds = targetUsers.map((user) => user.accountId);

    console.log(`\n📤 Sending push notification to ${targetUsers.length} users (target: ${target})`);
    console.log(`Title: "${title}"`);
    console.log(`Message: "${message}"`);
    console.log(`Account IDs: ${accountIds.slice(0, 5).join(', ')}${accountIds.length > 5 ? '...' : ''}`);

    // Check how many users have FCM tokens (with error handling)
    let deviceTokensCount = 0;
    try {
      deviceTokensCount = await DeviceToken.count({
        where: {
          accountId: accountIds,
          isActive: true,
        },
      });
      console.log(`📱 Found ${deviceTokensCount} active device token(s) for ${targetUsers.length} user(s)`);
    } catch (countError) {
      console.error(`⚠️ Error counting device tokens: ${countError.message}`);
      console.log(`📱 Proceeding with notification send (count unavailable)`);
      // Continue execution even if count fails
    }

    // Get sample tokens to check if they're valid (non-blocking, for debugging only)
    try {
      const sampleTokens = await DeviceToken.findAll({
        where: {
          accountId: accountIds.slice(0, 3),
          isActive: true,
        },
        attributes: ['fcmToken', 'device', 'accountId'],
        limit: 3,
      });

      if (sampleTokens.length > 0) {
        console.log(`\n📋 Sample tokens:`);
        sampleTokens.forEach((token) => {
          const isPlaceholder = token.fcmToken.includes('fcm_token_placeholder') || token.fcmToken.includes('web_fcm_token');
          console.log(`   ${token.accountId}: ${token.device} - ${isPlaceholder ? '⚠️ PLACEHOLDER' : '✅ Valid'} (${token.fcmToken.substring(0, 30)}...)`);
        });
      }
    } catch (sampleError) {
      // Non-critical error, just log and continue
      console.log(`⚠️ Could not fetch sample tokens (non-critical): ${sampleError.message}`);
    }

    // Send push notifications (with optional image)
    const pushNotification = { title, body: message };
    if (imageUrl) pushNotification.image = imageUrl;

    const result = await sendPushNotificationToUsers(
      accountIds,
      pushNotification,
      {
        type: 'admin_notification',
        target: target,
        timestamp: new Date().toISOString(),
        ...(imageUrl ? { imageUrl } : {}),
      }
    );

    console.log(`\n📊 Notification send summary:`);
    console.log(`   Total users: ${targetUsers.length}`);
    console.log(`   Device tokens found: ${deviceTokensCount}`);
    console.log(`   Successfully sent: ${result.sentCount}`);
    console.log(`   Failed: ${result.failedCount || 0}`);

    if (result.sentCount === 0 && deviceTokensCount > 0) {
      console.log(`\n⚠️ WARNING: No notifications were sent despite having ${deviceTokensCount} device token(s).`);
      console.log(`   This might indicate that all tokens are placeholders or invalid.`);
    }

    // Create notification records in database for all users
    try {
      const notificationRecords = targetUsers.map((user) => ({
        userId: user.accountId,
        senderId: null, // Admin notification
        type: 'system',
        title,
        message,
        imageUrl: imageUrl || null,
        isRead: false,
      }));

      await Notification.bulkCreate(notificationRecords);
    } catch (notifError) {
      console.error('Error creating notification records:', notifError);
      // Non-blocking, continue response
    }

    res.json({
      success: true,
      message: `Push notification sent to ${result.sentCount} users`,
      data: {
        target,
        totalUsers: targetUsers.length,
        deviceTokensFound: deviceTokensCount,
        sentCount: result.sentCount,
        failedCount: result.failedCount || 0,
      },
    });
  } catch (error) {
    console.error('Error sending push notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send push notification',
      error: error.message,
    });
  }
};

/**
 * Get notification statistics (for debugging)
 * GET /api/admin/notifications/stats
 */
const getNotificationStats = async (req, res) => {
  try {
    const totalUsers = await User.count({
      where: {
        isActive: true,
        role: 'user',
      },
    });

    const totalDeviceTokens = await DeviceToken.count({
      where: {
        isActive: true,
      },
    });

    const validDeviceTokens = await DeviceToken.count({
      where: {
        isActive: true,
        fcmToken: {
          [Op.notLike]: '%fcm_token_placeholder%',
        },
      },
    });

    const mobileTokens = await DeviceToken.count({
      where: {
        isActive: true,
        device: 'mobile',
        fcmToken: {
          [Op.notLike]: '%fcm_token_placeholder%',
        },
      },
    });

    const webTokens = await DeviceToken.count({
      where: {
        isActive: true,
        device: 'web',
        fcmToken: {
          [Op.notLike]: '%web_fcm_token%',
        },
      },
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalDeviceTokens,
        validDeviceTokens,
        placeholderTokens: totalDeviceTokens - validDeviceTokens,
        mobileTokens,
        webTokens,
      },
    });
  } catch (error) {
    console.error('Error getting notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification stats',
      error: error.message,
    });
  }
};

/**
 * Send push notification to an FCM topic
 * POST /api/admin/notifications/send-topic
 */
const sendTopicPush = async (req, res) => {
  try {
    const { title, message, topic, imageUrl } = req.body;

    if (!title || !message || !topic) {
      return res.status(400).json({
        success: false,
        message: 'title, message, and topic are required',
      });
    }

    const allowedTopics = ['announcements', 'new_profiles', 'promotions', 'tips', 'events'];
    if (!allowedTopics.includes(topic)) {
      return res.status(400).json({
        success: false,
        message: `Invalid topic. Allowed: ${allowedTopics.join(', ')}`,
      });
    }

    const pushNotification = { title, body: message };
    if (imageUrl) pushNotification.image = imageUrl;

    const { sendTopicNotification } = require('../../config/firebase-admin');
    const result = await sendTopicNotification(topic, pushNotification, {
      type: 'topic_notification',
      topic,
      timestamp: new Date().toISOString(),
      ...(imageUrl ? { imageUrl } : {}),
    });

    res.json({
      success: true,
      message: `Topic notification sent to '${topic}'`,
      data: { messageId: result },
    });
  } catch (error) {
    console.error('Error sending topic notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send topic notification',
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/notifications/queue-stats
 * Get notification queue statistics
 */
const getQueueStats = async (req, res) => {
  try {
    const NotificationQueue = require('../../models/NotificationQueue.model');

    const pending = await NotificationQueue.count({ where: { sent: false } });
    const pendingQuietHours = await NotificationQueue.count({ where: { sent: false, reason: 'quiet_hours' } });
    const pendingBatching = await NotificationQueue.count({ where: { sent: false, reason: 'batching' } });
    const sentToday = await NotificationQueue.count({
      where: {
        sent: true,
        sentAt: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    });

    res.json({
      success: true,
      data: {
        pending,
        pendingQuietHours,
        pendingBatching,
        sentToday,
      },
    });
  } catch (error) {
    console.error('Error getting queue stats:', error);
    res.status(500).json({ success: false, message: 'Failed to get queue stats', error: error.message });
  }
};

/**
 * GET /api/admin/notifications/history
 * Get sent notification history (system/admin notifications)
 * Query params: page (default 1), limit (default 20)
 */
const getNotificationHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const { count, rows } = await Notification.findAndCountAll({
      where: { type: 'system', senderId: null },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      attributes: ['id', 'title', 'message', 'imageUrl', 'createdAt'],
    });

    // De-duplicate: admin bulk-sends create one row per user with same title+message+time.
    // Group by title+message+createdAt (rounded to second) to get unique sends.
    const uniqueSends = [];
    const seen = new Set();
    for (const n of rows) {
      const key = `${n.title}|${n.message}|${n.createdAt.toISOString().slice(0, 19)}`;
      if (!seen.has(key)) {
        seen.add(key);
        // Count how many users received this notification
        const recipientCount = await Notification.count({
          where: {
            type: 'system',
            senderId: null,
            title: n.title,
            message: n.message,
            createdAt: n.createdAt,
          },
        });
        uniqueSends.push({
          id: n.id,
          title: n.title,
          message: n.message,
          imageUrl: n.imageUrl,
          sentAt: n.createdAt,
          recipientCount,
        });
      }
    }

    res.json({
      success: true,
      data: {
        notifications: uniqueSends,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notification history', error: error.message });
  }
};

module.exports = {
  sendPushNotification,
  getNotificationStats,
  sendTopicPush,
  getQueueStats,
  getNotificationHistory,
};

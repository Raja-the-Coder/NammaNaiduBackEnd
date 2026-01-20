const { sendNotification, sendMulticastNotification } = require('../config/firebase-admin');
const DeviceToken = require('../models/DeviceToken.model');

/**
 * Send push notification to a user by their accountId
 * @param {string} accountId - User's account ID
 * @param {Object} notification - Notification object with title and body
 * @param {Object} data - Additional data to send with notification
 * @returns {Promise<Object>} Result object with success status
 */
const sendPushNotificationToUser = async (accountId, notification, data = {}) => {
  try {
    // Get all active FCM tokens for the user
    const deviceTokens = await DeviceToken.findAll({
      where: {
        accountId: accountId,
        isActive: true,
      },
      attributes: ['fcmToken'],
    });

    if (deviceTokens.length === 0) {
      console.log(`No active FCM tokens found for user ${accountId}`);
      return {
        success: false,
        message: 'No active FCM tokens found for user',
        sentCount: 0,
      };
    }

    const fcmTokens = deviceTokens
      .map((token) => token.fcmToken)
      .filter((token) => {
        // Filter out placeholder tokens
        if (!token || token.trim() === '') return false;
        if (token.includes('fcm_token_placeholder') || token.includes('web_fcm_token')) return false;
        return true;
      });

    if (fcmTokens.length === 0) {
      console.log(`No valid FCM tokens found for user ${accountId}`);
      console.log(`Found ${deviceTokens.length} device tokens, but all are invalid or placeholders`);
      return {
        success: false,
        message: 'No valid FCM tokens found for user',
        sentCount: 0,
      };
    }

    console.log(`Found ${fcmTokens.length} valid FCM token(s) for user ${accountId}`);

    // If only one token, use single send
    if (fcmTokens.length === 1) {
      try {
        await sendNotification(fcmTokens[0], notification, data);
        return {
          success: true,
          message: 'Push notification sent successfully',
          sentCount: 1,
        };
      } catch (error) {
        console.error(`Error sending notification to token ${fcmTokens[0]}:`, error);
        
        // Check if token is invalid and should be removed
        // Firebase Admin SDK error structure: error.code or error.errorInfo.code
        const errorCode = error.code || (error.errorInfo && error.errorInfo.code) || error.errorInfo?.code;
        if (errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/unregistered') {
          try {
            const [updatedCount] = await DeviceToken.update(
              { isActive: false },
              {
                where: {
                  fcmToken: fcmTokens[0],
                  isActive: true,
                },
              }
            );
            if (updatedCount > 0) {
              console.log(`🧹 Removed invalid token from database (${updatedCount} token(s) deactivated)`);
            }
          } catch (cleanupError) {
            console.error(`⚠️ Error removing invalid token:`, cleanupError.message);
          }
        }
        
        return {
          success: false,
          message: 'Failed to send push notification',
          error: error.message,
          sentCount: 0,
        };
      }
    }

    // If multiple tokens, use multicast
    try {
      const response = await sendMulticastNotification(fcmTokens, notification, data);
      return {
        success: true,
        message: 'Push notifications sent successfully',
        sentCount: response.successCount,
        failedCount: response.failureCount,
      };
    } catch (error) {
      console.error(`Error sending multicast notification:`, error);
      return {
        success: false,
        message: 'Failed to send push notifications',
        error: error.message,
        sentCount: 0,
      };
    }
  } catch (error) {
    console.error('Error in sendPushNotificationToUser:', error);
    return {
      success: false,
      message: 'Failed to send push notification',
      error: error.message,
      sentCount: 0,
    };
  }
};

/**
 * Send push notification to multiple users
 * @param {string[]} accountIds - Array of user account IDs
 * @param {Object} notification - Notification object with title and body
 * @param {Object} data - Additional data to send with notification
 * @returns {Promise<Object>} Result object with success status
 */
const sendPushNotificationToUsers = async (accountIds, notification, data = {}) => {
  try {
    // Get all active FCM tokens for all users
    // Add retry logic for database connection issues
    let deviceTokens;
    let retries = 3;
    let lastError;
    
    while (retries > 0) {
      try {
        deviceTokens = await DeviceToken.findAll({
          where: {
            accountId: accountIds,
            isActive: true,
          },
          attributes: ['fcmToken'],
        });
        break; // Success, exit retry loop
      } catch (dbError) {
        lastError = dbError;
        retries--;
        if (retries > 0 && (dbError.name === 'SequelizeDatabaseError' || dbError.code === 'ECONNRESET')) {
          console.log(`⚠️ Database connection error, retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        } else {
          throw dbError; // Non-retryable error or out of retries
        }
      }
    }
    
    if (!deviceTokens) {
      throw lastError || new Error('Failed to fetch device tokens after retries');
    }

    if (deviceTokens.length === 0) {
      console.log(`No active FCM tokens found for users`);
      return {
        success: false,
        message: 'No active FCM tokens found for users',
        sentCount: 0,
      };
    }

    const fcmTokens = deviceTokens
      .map((token) => token.fcmToken)
      .filter((token) => {
        // Filter out placeholder tokens
        if (!token || token.trim() === '') return false;
        if (token.includes('fcm_token_placeholder') || token.includes('web_fcm_token')) return false;
        return true;
      });

    if (fcmTokens.length === 0) {
      console.log(`No valid FCM tokens found for users`);
      console.log(`Found ${deviceTokens.length} device tokens, but all are invalid or placeholders`);
      return {
        success: false,
        message: 'No valid FCM tokens found for users',
        sentCount: 0,
      };
    }

    console.log(`Found ${fcmTokens.length} valid FCM token(s) for ${accountIds.length} user(s)`);
    console.log(`Sending notification: "${notification.title}" - "${notification.body}"`);

    // Use multicast for multiple tokens
    try {
      const response = await sendMulticastNotification(fcmTokens, notification, data);
      console.log(`Notification send result: ${response.successCount} successful, ${response.failureCount} failed`);
      
      // Clean up invalid tokens after failed sends
      if (response.failureCount > 0 && response.responses) {
        const invalidTokenIndices = [];
        const tokensToRemove = [];
        
        response.responses.forEach((resp, index) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            // These error codes indicate the token should be removed
            if (errorCode === 'messaging/invalid-registration-token' ||
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/unregistered') {
              invalidTokenIndices.push(index);
              tokensToRemove.push(fcmTokens[index]);
            }
          }
        });
        
        // Remove invalid tokens from database
        if (tokensToRemove.length > 0) {
          try {
            const [updatedCount] = await DeviceToken.update(
              { isActive: false },
              {
                where: {
                  fcmToken: tokensToRemove,
                  isActive: true,
                },
              }
            );
            console.log(`\n🧹 Cleaned up ${updatedCount} invalid token(s) from database (deactivated)`);
          } catch (cleanupError) {
            console.error(`⚠️ Error cleaning up invalid tokens:`, cleanupError.message);
          }
        }
        
        // Log detailed failure information
        console.error(`\n❌ Detailed failure information:`);
        response.responses.forEach((resp, index) => {
          if (!resp.success) {
            const errorCode = resp.error?.code || 'UNKNOWN';
            const errorMessage = resp.error?.message || 'Unknown error';
            console.error(`   Token ${index + 1}: ${errorCode} - ${errorMessage}`);
            if (errorCode === 'messaging/invalid-registration-token' || 
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/unregistered') {
              console.error(`   ✅ Token has been automatically removed from database.`);
            }
          }
        });
      }
      
      return {
        success: true,
        message: 'Push notifications sent successfully',
        sentCount: response.successCount,
        failedCount: response.failureCount,
      };
    } catch (error) {
      console.error(`\n❌ Error sending multicast notification:`, {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      return {
        success: false,
        message: 'Failed to send push notifications',
        error: error.message,
        sentCount: 0,
      };
    }
  } catch (error) {
    console.error('Error in sendPushNotificationToUsers:', error);
    return {
      success: false,
      message: 'Failed to send push notifications',
      error: error.message,
      sentCount: 0,
    };
  }
};

module.exports = {
  sendPushNotificationToUser,
  sendPushNotificationToUsers,
};


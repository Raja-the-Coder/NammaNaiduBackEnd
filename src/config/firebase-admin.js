const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let firebaseAdmin = null;

/**
 * Initialize Firebase Admin SDK
 * Priority: Environment variable (Railway/production) > JSON file (local development)
 * 
 * Railway: Uses FIREBASE_SERVICE_ACCOUNT environment variable (already configured)
 * Local: Uses firebase-service-account.json file in src/config/ directory
 */
const initializeFirebaseAdmin = () => {
  try {
    if (admin.apps.length > 0) {
      firebaseAdmin = admin.app();
      return firebaseAdmin;
    }

    let serviceAccount;

    // Load from environment variable (Railway/production) or JSON file (local)
    // Railway automatically provides FIREBASE_SERVICE_ACCOUNT from environment variables
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT.trim();

        // Railway can store JSON in different formats:
        // 1. As a single-line string with escaped newlines (\n)
        // 2. As a multiline string with actual newlines
        // 3. As a base64 encoded string (less common)

        // Try to parse directly first (handles escaped newlines)
        try {
          serviceAccount = JSON.parse(jsonString);
        } catch (firstParseError) {
          // If direct parse fails, try handling actual newlines
          // Replace actual newlines with escaped newlines for private_key field
          if (jsonString.includes('\n') && !jsonString.includes('\\n')) {
            // Handle multiline JSON from Railway
            // Replace actual newlines in the private_key value only
            jsonString = jsonString.replace(/"private_key":\s*"([^"]*(?:\n[^"]*)*)"/g, (match, keyValue) => {
              const escapedKey = keyValue.replace(/\n/g, '\\n').replace(/\r/g, '');
              return `"private_key": "${escapedKey}"`;
            });
            // Also remove any carriage returns
            jsonString = jsonString.replace(/\r/g, '');
            serviceAccount = JSON.parse(jsonString);
          } else {
            // If still fails, try base64 decode (Railway sometimes encodes large values)
            try {
              const decoded = Buffer.from(jsonString, 'base64').toString('utf8');
              serviceAccount = JSON.parse(decoded);
            } catch (base64Error) {
              throw firstParseError; // Throw original error
            }
          }
        }

        console.log('✅ Successfully loaded Firebase service account from environment variable');
      } catch (parseError) {
        console.error('❌ Firebase JSON parse error:', parseError.message);
        console.error('📝 First 200 chars of FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 200));
        console.error('💡 Tip: Make sure the JSON is valid and properly formatted in Railway');
        throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT JSON: ${parseError.message}`);
      }
    } else {
      // Try standard paths for local development
      const possiblePaths = [
        path.join(__dirname, 'firebase-service-account.json'),
        path.resolve(process.cwd(), 'src/config/nammamatrimonyapp-firebase-adminsdk-fbsvc-43d0c67ff2.json'),
      ];

      let serviceAccountPath = null;
      for (const possiblePath of possiblePaths) {
        const normalizedPath = path.normalize(possiblePath);
        if (fs.existsSync(normalizedPath)) {
          serviceAccountPath = normalizedPath;
          break;
        }
      }

      if (serviceAccountPath) {
        try {
          const serviceAccountFile = fs.readFileSync(serviceAccountPath, 'utf8');
          serviceAccount = JSON.parse(serviceAccountFile);
        } catch (fileError) {
          throw new Error(`Failed to read service account file: ${fileError.message}`);
        }
      } else {
        // For Railway/production: FIREBASE_SERVICE_ACCOUNT should be set as environment variable
        // For local development: Place firebase-service-account.json in src/config/
        throw new Error(
          'Firebase service account not found. ' +
          'For Railway/production: Set FIREBASE_SERVICE_ACCOUNT environment variable. ' +
          'For local development: Place firebase-service-account.json in src/config/'
        );
      }
    }

    // Validate required fields
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Invalid service account: missing required fields');
    }

    // Initialize Firebase Admin
    firebaseAdmin = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    console.log('Firebase Admin SDK initialized successfully');
    return firebaseAdmin;
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error.message);
    throw error;
  }
};

/**
 * Check if Firebase Admin is initialized
 * @returns {boolean} True if initialized, false otherwise
 */
const isFirebaseAdminInitialized = () => {
  return firebaseAdmin !== null && admin.apps.length > 0;
};

/**
 * Get Firebase Admin instance
 * @returns {admin.app.App} Firebase Admin app instance
 */
const getFirebaseAdmin = () => {
  if (!firebaseAdmin) {
    // Try to initialize if not already done
    try {
      return initializeFirebaseAdmin();
    } catch (error) {
      throw new Error(
        'Firebase Admin not initialized. ' +
        'For Railway/production: Set FIREBASE_SERVICE_ACCOUNT environment variable. ' +
        'For local development: Place firebase-service-account.json in src/config/'
      );
    }
  }
  return firebaseAdmin;
};

/**
 * Get Firebase Messaging instance for sending push notifications
 * @returns {admin.messaging.Messaging} Firebase Messaging instance
 */
const getMessaging = () => {
  const adminInstance = getFirebaseAdmin();
  return adminInstance.messaging();
};

/**
 * Send push notification to a single device
 * @param {string} fcmToken - FCM token of the target device
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<string>} Message ID
 */
const sendNotification = async (fcmToken, notification, data = {}) => {
  try {
    const messaging = getMessaging();

    const message = {
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_importance_channel',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await messaging.send(message);
    return response;
  } catch (error) {
    console.error('Error sending notification:', error.message);
    throw error;
  }
};

/**
 * Send push notification to multiple devices
 * @param {string[]} fcmTokens - Array of FCM tokens
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<admin.messaging.BatchResponse>} Batch response
 */
const sendMulticastNotification = async (fcmTokens, notification, data = {}) => {
  try {
    const messaging = getMessaging();

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_importance_channel',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      tokens: fcmTokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    if (response.failureCount > 0) {
      console.warn(`\n⚠️ Failed to send ${response.failureCount} of ${fcmTokens.length} notifications`);
      
      // Log detailed failure information
      if (response.responses && response.responses.length > 0) {
        response.responses.forEach((resp, index) => {
          if (!resp.success && resp.error) {
            const error = resp.error;
            console.error(`   Token ${index + 1} (${fcmTokens[index].substring(0, 30)}...):`);
            console.error(`      Code: ${error.code}`);
            console.error(`      Message: ${error.message}`);
            
            // Provide specific guidance for common error codes
            if (error.code === 'messaging/invalid-registration-token' || 
                error.code === 'messaging/registration-token-not-registered') {
              console.error(`      ⚠️ Action: This token is invalid or unregistered. It should be removed from the database.`);
            } else if (error.code === 'messaging/invalid-argument') {
              console.error(`      ⚠️ Action: Check notification payload format.`);
            } else if (error.code === 'messaging/unregistered') {
              console.error(`      ⚠️ Action: App was uninstalled. Token should be removed.`);
            }
          }
        });
      }
    }

    return response;
  } catch (error) {
    console.error('Error sending multicast notification:', error.message);
    throw error;
  }
};

/**
 * Send push notification to a topic
 * @param {string} topic - Topic name
 * @param {Object} notification - Notification payload
 * @param {Object} data - Additional data payload
 * @returns {Promise<string>} Message ID
 */
const sendTopicNotification = async (topic, notification, data = {}) => {
  try {
    const messaging = getMessaging();

    const message = {
      topic: topic,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        // Convert all data values to strings (FCM requirement)
        ...Object.keys(data).reduce((acc, key) => {
          acc[key] = String(data[key]);
          return acc;
        }, {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'high_importance_channel',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await messaging.send(message);
    return response;
  } catch (error) {
    console.error('Error sending topic notification:', error.message);
    throw error;
  }
};

module.exports = {
  initializeFirebaseAdmin,
  getFirebaseAdmin,
  isFirebaseAdminInitialized,
  getMessaging,
  sendNotification,
  sendMulticastNotification,
  sendTopicNotification,
};


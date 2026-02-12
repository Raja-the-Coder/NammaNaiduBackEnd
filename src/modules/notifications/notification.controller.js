const Notification = require('../../models/Notification.model');
const NotificationPreference = require('../../models/NotificationPreference.model');
const User = require('../../models/User.model');
const PersonPhoto = require('../../models/PersonPhoto.model');
const DeviceToken = require('../../models/DeviceToken.model');
const { getOrCreatePreferences } = require('../../services/notification.service');
const { getMessaging } = require('../../config/firebase-admin');

// ═══════════════════════════════════════════════════════════
// Existing endpoints
// ═══════════════════════════════════════════════════════════

const getMyNotifications = async (req, res) => {
    try {
        const userId = req.accountId;

        const notifications = await Notification.findAll({
            where: { userId },
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['name', 'accountId', 'userCode'],
                    include: [{
                        model: PersonPhoto,
                        as: 'personPhoto',
                        attributes: ['photo1']
                    }]
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        res.json({
            success: true,
            data: notifications
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications'
        });
    }
};

const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.accountId;

        await Notification.update(
            { isRead: true },
            { where: { id, userId } }
        );

        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification'
        });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        const userId = req.accountId;

        await Notification.update(
            { isRead: true },
            { where: { userId, isRead: false } }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('Error marking all as read:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notifications'
        });
    }
};

// ═══════════════════════════════════════════════════════════
// Notification Preferences
// ═══════════════════════════════════════════════════════════

/**
 * GET /api/notifications/preferences
 * Retrieve the current user's notification preferences
 */
const getPreferences = async (req, res) => {
    try {
        const pref = await getOrCreatePreferences(req.accountId);
        res.json({ success: true, data: pref });
    } catch (error) {
        console.error('Error fetching preferences:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notification preferences' });
    }
};

/**
 * PUT /api/notifications/preferences
 * Update notification preferences (partial update)
 */
const updatePreferences = async (req, res) => {
    try {
        const accountId = req.accountId;
        const allowedFields = [
            'interestEnabled', 'profileViewEnabled', 'shortlistEnabled',
            'chatEnabled', 'systemEnabled', 'matchEnabled',
            'pushEnabled', 'inAppEnabled', 'emailEnabled',
            'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd', 'timezone',
            'batchMode',
        ];

        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ success: false, message: 'No valid fields to update' });
        }

        // Validate quiet hours format (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
        if (updates.quietHoursStart && !timeRegex.test(updates.quietHoursStart)) {
            return res.status(400).json({ success: false, message: 'quietHoursStart must be in HH:MM format (24h)' });
        }
        if (updates.quietHoursEnd && !timeRegex.test(updates.quietHoursEnd)) {
            return res.status(400).json({ success: false, message: 'quietHoursEnd must be in HH:MM format (24h)' });
        }

        // Validate batchMode
        if (updates.batchMode && !['instant', 'hourly', 'daily'].includes(updates.batchMode)) {
            return res.status(400).json({ success: false, message: 'batchMode must be instant, hourly, or daily' });
        }

        const pref = await getOrCreatePreferences(accountId);
        await pref.update(updates);

        res.json({ success: true, message: 'Preferences updated', data: pref });
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ success: false, message: 'Failed to update preferences' });
    }
};

// ═══════════════════════════════════════════════════════════
// Mute Users
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/notifications/mute/:targetAccountId
 * Mute notifications from a specific user
 */
const muteUser = async (req, res) => {
    try {
        const accountId = req.accountId;
        const { targetAccountId } = req.params;

        if (accountId === targetAccountId) {
            return res.status(400).json({ success: false, message: 'Cannot mute yourself' });
        }

        const pref = await getOrCreatePreferences(accountId);
        const mutedList = Array.isArray(pref.mutedUserIds) ? [...pref.mutedUserIds] : [];

        if (!mutedList.includes(targetAccountId)) {
            mutedList.push(targetAccountId);
            await pref.update({ mutedUserIds: mutedList });
        }

        res.json({ success: true, message: 'User muted', data: { mutedUserIds: mutedList } });
    } catch (error) {
        console.error('Error muting user:', error);
        res.status(500).json({ success: false, message: 'Failed to mute user' });
    }
};

/**
 * DELETE /api/notifications/mute/:targetAccountId
 * Unmute notifications from a specific user
 */
const unmuteUser = async (req, res) => {
    try {
        const accountId = req.accountId;
        const { targetAccountId } = req.params;

        const pref = await getOrCreatePreferences(accountId);
        const mutedList = Array.isArray(pref.mutedUserIds) ? pref.mutedUserIds.filter(id => id !== targetAccountId) : [];
        await pref.update({ mutedUserIds: mutedList });

        res.json({ success: true, message: 'User unmuted', data: { mutedUserIds: mutedList } });
    } catch (error) {
        console.error('Error unmuting user:', error);
        res.status(500).json({ success: false, message: 'Failed to unmute user' });
    }
};

/**
 * GET /api/notifications/muted-users
 * Get list of muted user IDs
 */
const getMutedUsers = async (req, res) => {
    try {
        const pref = await getOrCreatePreferences(req.accountId);
        res.json({ success: true, data: { mutedUserIds: pref.mutedUserIds || [] } });
    } catch (error) {
        console.error('Error fetching muted users:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch muted users' });
    }
};

// ═══════════════════════════════════════════════════════════
// FCM Topic Subscriptions
// ═══════════════════════════════════════════════════════════

const ALLOWED_TOPICS = ['announcements', 'new_profiles', 'promotions', 'tips', 'events'];

/**
 * POST /api/notifications/topics/subscribe
 * Subscribe to an FCM topic
 * Body: { topic: string }
 */
const subscribeTopic = async (req, res) => {
    try {
        const accountId = req.accountId;
        const { topic } = req.body;

        if (!topic || !ALLOWED_TOPICS.includes(topic)) {
            return res.status(400).json({
                success: false,
                message: `Invalid topic. Allowed: ${ALLOWED_TOPICS.join(', ')}`,
            });
        }

        // Update preference record
        const pref = await getOrCreatePreferences(accountId);
        const subs = Array.isArray(pref.topicSubscriptions) ? [...pref.topicSubscriptions] : [];
        if (!subs.includes(topic)) {
            subs.push(topic);
            await pref.update({ topicSubscriptions: subs });
        }

        // Subscribe device tokens to FCM topic
        try {
            const tokens = await DeviceToken.findAll({
                where: { accountId, isActive: true },
                attributes: ['fcmToken'],
            });
            const validTokens = tokens
                .map(t => t.fcmToken)
                .filter(t => t && !t.includes('placeholder') && !t.includes('web_fcm_token'));

            if (validTokens.length > 0) {
                const messaging = getMessaging();
                await messaging.subscribeToTopic(validTokens, topic);
                console.log(`[Topics] Subscribed ${validTokens.length} tokens to '${topic}' for user ${accountId}`);
            }
        } catch (fcmErr) {
            console.warn(`[Topics] FCM subscribe warning:`, fcmErr.message);
            // Non-fatal — preferences are saved even if FCM call fails
        }

        res.json({ success: true, message: `Subscribed to '${topic}'`, data: { topicSubscriptions: subs } });
    } catch (error) {
        console.error('Error subscribing to topic:', error);
        res.status(500).json({ success: false, message: 'Failed to subscribe to topic' });
    }
};

/**
 * POST /api/notifications/topics/unsubscribe
 * Unsubscribe from an FCM topic
 * Body: { topic: string }
 */
const unsubscribeTopic = async (req, res) => {
    try {
        const accountId = req.accountId;
        const { topic } = req.body;

        if (!topic) {
            return res.status(400).json({ success: false, message: 'topic is required' });
        }

        // Update preference record
        const pref = await getOrCreatePreferences(accountId);
        const subs = Array.isArray(pref.topicSubscriptions) ? pref.topicSubscriptions.filter(t => t !== topic) : [];
        await pref.update({ topicSubscriptions: subs });

        // Unsubscribe device tokens from FCM topic
        try {
            const tokens = await DeviceToken.findAll({
                where: { accountId, isActive: true },
                attributes: ['fcmToken'],
            });
            const validTokens = tokens
                .map(t => t.fcmToken)
                .filter(t => t && !t.includes('placeholder') && !t.includes('web_fcm_token'));

            if (validTokens.length > 0) {
                const messaging = getMessaging();
                await messaging.unsubscribeFromTopic(validTokens, topic);
                console.log(`[Topics] Unsubscribed ${validTokens.length} tokens from '${topic}' for user ${accountId}`);
            }
        } catch (fcmErr) {
            console.warn(`[Topics] FCM unsubscribe warning:`, fcmErr.message);
        }

        res.json({ success: true, message: `Unsubscribed from '${topic}'`, data: { topicSubscriptions: subs } });
    } catch (error) {
        console.error('Error unsubscribing from topic:', error);
        res.status(500).json({ success: false, message: 'Failed to unsubscribe from topic' });
    }
};

/**
 * GET /api/notifications/topics
 * Get user's current topic subscriptions and list of available topics
 */
const getTopics = async (req, res) => {
    try {
        const pref = await getOrCreatePreferences(req.accountId);
        res.json({
            success: true,
            data: {
                subscribed: pref.topicSubscriptions || [],
                available: ALLOWED_TOPICS,
            },
        });
    } catch (error) {
        console.error('Error fetching topics:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch topics' });
    }
};

module.exports = {
    // Existing
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    // Preferences
    getPreferences,
    updatePreferences,
    // Muting
    muteUser,
    unmuteUser,
    getMutedUsers,
    // Topics
    subscribeTopic,
    unsubscribeTopic,
    getTopics,
};

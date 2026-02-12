const { Op } = require('sequelize');
const Notification = require('../models/Notification.model');
const NotificationPreference = require('../models/NotificationPreference.model');
const NotificationQueue = require('../models/NotificationQueue.model');
const { sendPushNotificationToUser } = require('./push-notification.service');

/**
 * Notification Service
 *
 * Central place for creating notifications with full preference support:
 * - Category muting
 * - User muting
 * - Quiet hours deferral
 * - Batching (instant / hourly / daily)
 * - Push + in-app toggles
 */

// Map notification type → preference category flag
const TYPE_TO_PREF = {
  interest_received: 'interestEnabled',
  interest_accepted: 'interestEnabled',
  profile_viewed:    'profileViewEnabled',
  shortlisted:       'shortlistEnabled',
  system:            'systemEnabled',
  match:             'matchEnabled',
  chat:              'chatEnabled',
};

/**
 * Get or create default preferences for a user
 */
const getOrCreatePreferences = async (accountId) => {
  let pref = await NotificationPreference.findOne({ where: { accountId } });
  if (!pref) {
    pref = await NotificationPreference.create({ accountId });
  }
  return pref;
};

/**
 * Check if current time falls within quiet hours for a given preference
 */
const isInQuietHours = (pref) => {
  if (!pref.quietHoursEnabled) return false;

  try {
    // Get current time in user's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: pref.timezone || 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = pref.quietHoursStart.split(':').map(Number);
    const [endH, endM] = pref.quietHoursEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight quiet hours (e.g. 22:00 → 07:00)
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch (err) {
    console.warn('[NotifService] Quiet hours check failed:', err.message);
    return false;
  }
};

/**
 * Calculate when quiet hours end (for scheduling deferred push)
 */
const getQuietHoursEndTime = (pref) => {
  try {
    const [endH, endM] = pref.quietHoursEnd.split(':').map(Number);
    const now = new Date();

    // Create a date in the user's timezone at the end time
    const tz = pref.timezone || 'Asia/Kolkata';
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz }); // YYYY-MM-DD
    const endStr = `${todayStr}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`;

    // Parse in the user's timezone using offset approximation
    const endDate = new Date(endStr + getTimezoneOffsetString(tz, now));

    // If the calculated end time is in the past, it means quiet hours end tomorrow
    if (endDate <= now) {
      endDate.setDate(endDate.getDate() + 1);
    }
    return endDate;
  } catch (err) {
    // Fallback: schedule for 1 hour from now
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 1);
    return fallback;
  }
};

/**
 * Helper: approximate timezone offset string (e.g. "+05:30")
 */
const getTimezoneOffsetString = (tz, date) => {
  try {
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: tz }));
    const diffMs = tzDate - utcDate;
    const diffMin = Math.round(diffMs / 60000);
    const sign = diffMin >= 0 ? '+' : '-';
    const absMin = Math.abs(diffMin);
    const h = String(Math.floor(absMin / 60)).padStart(2, '0');
    const m = String(absMin % 60).padStart(2, '0');
    return `${sign}${h}:${m}`;
  } catch {
    return '+05:30'; // default IST
  }
};

/**
 * Send a notification respecting all user preferences.
 *
 * @param {Object} opts
 * @param {string} opts.userId      - Recipient accountId
 * @param {string} opts.senderId    - Sender accountId (nullable)
 * @param {string} opts.type        - Notification type enum value
 * @param {string} opts.title       - Notification title
 * @param {string} opts.message     - Notification body
 * @param {string} [opts.relatedId] - Related entity ID
 * @param {string} [opts.imageUrl]  - Image URL for rich push notification
 * @param {Object} [opts.pushData]  - Extra FCM data payload
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
const sendSmartNotification = async ({ userId, senderId, type, title, message, relatedId, imageUrl, pushData = {} }) => {
  try {
    const pref = await getOrCreatePreferences(userId);

    // 1. Category mute check
    const prefKey = TYPE_TO_PREF[type];
    if (prefKey && pref[prefKey] === false) {
      console.log(`[NotifService] Category '${type}' muted for user ${userId}`);
      return { sent: false, reason: 'category_muted' };
    }

    // 2. User mute check
    if (senderId && Array.isArray(pref.mutedUserIds) && pref.mutedUserIds.includes(senderId)) {
      console.log(`[NotifService] Sender ${senderId} muted by user ${userId}`);
      return { sent: false, reason: 'sender_muted' };
    }

    // 3. Always save in-app notification (unless in-app disabled)
    if (pref.inAppEnabled !== false) {
      await Notification.create({
        userId,
        senderId: senderId || null,
        type: ['interest_received', 'interest_accepted', 'profile_viewed', 'shortlisted', 'system'].includes(type) ? type : 'system',
        title,
        message,
        relatedId: relatedId || null,
        imageUrl: imageUrl || null,
        isRead: false,
      });
    }

    // 4. Push notification logic
    if (pref.pushEnabled === false) {
      return { sent: true, reason: 'in_app_only' };
    }

    // 5. Quiet hours check — defer push if in quiet hours
    if (isInQuietHours(pref)) {
      const scheduledFor = getQuietHoursEndTime(pref);
      await NotificationQueue.create({
        accountId: userId,
        type,
        title,
        message,
        data: pushData,
        reason: 'quiet_hours',
        scheduledFor,
      });
      console.log(`[NotifService] Push queued (quiet hours) for user ${userId}, scheduled at ${scheduledFor.toISOString()}`);
      return { sent: true, reason: 'queued_quiet_hours' };
    }

    // 6. Batching check — queue if not instant
    if (pref.batchMode !== 'instant') {
      await NotificationQueue.create({
        accountId: userId,
        type,
        title,
        message,
        data: pushData,
        reason: 'batching',
        scheduledFor: null, // sent at next flush
      });
      console.log(`[NotifService] Push queued (batch:${pref.batchMode}) for user ${userId}`);
      return { sent: true, reason: `queued_batch_${pref.batchMode}` };
    }

    // 7. Send push immediately
    const pushNotif = { title, body: message };
    if (imageUrl) pushNotif.image = imageUrl;

    await sendPushNotificationToUser(userId, pushNotif, {
      type,
      relatedId: relatedId || '',
      ...(imageUrl ? { imageUrl } : {}),
      ...pushData,
    });

    return { sent: true, reason: 'sent_immediately' };
  } catch (error) {
    console.error('[NotifService] sendSmartNotification error:', error);
    // Still try to save the in-app notification even if push fails
    return { sent: false, reason: 'error', error: error.message };
  }
};

/**
 * Flush queued notifications that are eligible to be sent now.
 * Called by cron job (e.g. every 15 minutes).
 */
const flushNotificationQueue = async () => {
  const now = new Date();

  try {
    // Find all unsent queued notifications that are ready
    const queued = await NotificationQueue.findAll({
      where: {
        sent: false,
        [Op.or]: [
          { scheduledFor: null },
          { scheduledFor: { [Op.lte]: now } },
        ],
      },
      order: [['createdAt', 'ASC']],
      limit: 500,
    });

    if (queued.length === 0) return { flushed: 0 };

    console.log(`[NotifService] Flushing ${queued.length} queued notifications`);

    // Group by user to batch-send
    const byUser = {};
    for (const item of queued) {
      if (!byUser[item.accountId]) byUser[item.accountId] = [];
      byUser[item.accountId].push(item);
    }

    let flushed = 0;
    for (const [accountId, items] of Object.entries(byUser)) {
      // Check preferences again (user might have changed them)
      const pref = await getOrCreatePreferences(accountId);

      // Skip if still in quiet hours
      if (isInQuietHours(pref)) continue;

      // For batching, create a summary notification if many items
      if (items.length > 3) {
        const summary = {
          title: `You have ${items.length} new notifications`,
          body: items.slice(0, 3).map(i => i.title).join(', ') + '...',
        };
        await sendPushNotificationToUser(accountId, summary, { type: 'batch_summary' });
      } else {
        // Send each individually
        for (const item of items) {
          if (pref.pushEnabled !== false) {
            await sendPushNotificationToUser(accountId, { title: item.title, body: item.message }, {
              type: item.type,
              ...(item.data || {}),
            });
          }
        }
      }

      // Mark as sent
      const ids = items.map(i => i.id);
      await NotificationQueue.update(
        { sent: true, sentAt: now },
        { where: { id: ids } }
      );
      flushed += items.length;
    }

    console.log(`[NotifService] Flushed ${flushed} notifications`);
    return { flushed };
  } catch (error) {
    console.error('[NotifService] flushNotificationQueue error:', error);
    return { flushed: 0, error: error.message };
  }
};

/**
 * Clean up old sent queue entries (> 7 days old)
 */
const cleanupNotificationQueue = async () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const deleted = await NotificationQueue.destroy({
    where: {
      sent: true,
      sentAt: { [Op.lt]: sevenDaysAgo },
    },
  });
  console.log(`[NotifService] Cleaned up ${deleted} old queue entries`);
  return { deleted };
};

module.exports = {
  sendSmartNotification,
  getOrCreatePreferences,
  isInQuietHours,
  flushNotificationQueue,
  cleanupNotificationQueue,
};

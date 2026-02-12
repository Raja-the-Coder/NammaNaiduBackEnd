const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * NotificationQueue Model
 * 
 * Holds notifications that are deferred because of:
 * - Quiet hours (push held until quiet hours end)
 * - Batching (grouped and sent hourly/daily)
 * 
 * A cron job flushes eligible queued notifications.
 */
const NotificationQueue = sequelize.define('NotificationQueue', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  accountId: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: 'Target user account ID',
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Notification type (interest_received, profile_viewed, etc.)',
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  data: {
    type: DataTypes.JSONB,
    defaultValue: {},
    comment: 'Additional FCM data payload',
  },
  reason: {
    type: DataTypes.ENUM('quiet_hours', 'batching'),
    allowNull: false,
    comment: 'Why this notification was queued',
  },
  scheduledFor: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Earliest time this can be sent (null = send at next flush)',
  },
  sent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: 'notification_queue',
  indexes: [
    { fields: ['accountId'] },
    { fields: ['sent', 'scheduledFor'] },
    { fields: ['reason'] },
  ],
});

module.exports = NotificationQueue;

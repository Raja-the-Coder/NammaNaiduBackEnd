const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * NotificationPreference Model
 * 
 * Stores per-user notification preferences:
 * - Enable/disable per category (interest, profile_viewed, shortlisted, system, chat)
 * - Push / in-app toggles
 * - Quiet hours (start/end in HH:MM format, timezone)
 * - Muted users list
 * - Batching preference (instant / hourly / daily)
 * - Topic subscriptions for FCM topic-based push
 */
const NotificationPreference = sequelize.define('NotificationPreference', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  accountId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    comment: 'User account ID',
    references: {
      model: 'users',
      key: 'accountId',
    },
  },

  // ── Per-category toggles ──────────────────────────
  interestEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Receive interest_received & interest_accepted notifications',
  },
  profileViewEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Receive profile_viewed notifications',
  },
  shortlistEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Receive shortlisted notifications',
  },
  chatEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Receive chat/message notifications',
  },
  systemEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Receive system announcements',
  },
  matchEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Receive match notifications',
  },

  // ── Push vs In-app toggles ────────────────────────
  pushEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Master toggle for push notifications',
  },
  inAppEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Master toggle for in-app notifications',
  },
  emailEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Toggle for email notifications (future)',
  },

  // ── Quiet hours ───────────────────────────────────
  quietHoursEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Enable quiet hours',
  },
  quietHoursStart: {
    type: DataTypes.STRING(5),
    defaultValue: '22:00',
    comment: 'Quiet hours start time (HH:MM, 24h format)',
  },
  quietHoursEnd: {
    type: DataTypes.STRING(5),
    defaultValue: '07:00',
    comment: 'Quiet hours end time (HH:MM, 24h format)',
  },
  timezone: {
    type: DataTypes.STRING(50),
    defaultValue: 'Asia/Kolkata',
    comment: 'User timezone for quiet hours calculation',
  },

  // ── Muted users ───────────────────────────────────
  mutedUserIds: {
    type: DataTypes.JSONB,
    defaultValue: [],
    comment: 'Array of accountIds whose notifications are muted',
  },

  // ── Batching preference ───────────────────────────
  batchMode: {
    type: DataTypes.ENUM('instant', 'hourly', 'daily'),
    defaultValue: 'instant',
    comment: 'How to batch non-critical notifications',
  },

  // ── FCM topic subscriptions ───────────────────────
  topicSubscriptions: {
    type: DataTypes.JSONB,
    defaultValue: ['announcements'],
    comment: 'Array of FCM topics the user is subscribed to',
  },
}, {
  timestamps: true,
  tableName: 'notification_preferences',
  indexes: [
    { unique: true, fields: ['accountId'] },
  ],
});

// Associations
const User = require('./User.model');

User.hasOne(NotificationPreference, { foreignKey: 'accountId', sourceKey: 'accountId', as: 'notificationPreference' });
NotificationPreference.belongsTo(User, { foreignKey: 'accountId', targetKey: 'accountId', as: 'user' });

module.exports = NotificationPreference;

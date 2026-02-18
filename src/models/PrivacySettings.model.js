const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const PrivacySettings = sequelize.define(
  'PrivacySettings',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: 'users',
        key: 'accountId',
      },
      onDelete: 'CASCADE',
    },

    // Profile Visibility
    profileVisibility: {
      type: DataTypes.ENUM('public', 'members', 'hidden'),
      defaultValue: 'members',
      comment: 'public = everyone, members = logged-in users, hidden = not shown',
    },

    // Photo Privacy
    showPhotosTo: {
      type: DataTypes.ENUM('everyone', 'accepted_only', 'premium_only', 'nobody'),
      defaultValue: 'everyone',
      comment: 'Who can see unblurred photos',
    },
    blurPhotos: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Apply blur filter for restricted viewers',
    },

    // Contact Privacy
    showPhone: {
      type: DataTypes.ENUM('everyone', 'accepted_only', 'premium_only', 'nobody'),
      defaultValue: 'accepted_only',
      comment: 'Who can see phone number',
    },
    showEmail: {
      type: DataTypes.ENUM('everyone', 'accepted_only', 'nobody'),
      defaultValue: 'nobody',
      comment: 'Who can see email address',
    },

    // Search Privacy
    hideFromSearch: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'If true, profile is excluded from search/browse results',
    },
    hideLastSeen: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Hide last seen timestamp from other users',
    },
    hideOnlineStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Hide online/offline status from other users',
    },

    // Community-Based Visibility
    visibleToCastes: {
      type: DataTypes.JSONB,
      defaultValue: null,
      comment: 'JSON array of caste names. null = visible to all castes',
    },
    visibleToReligions: {
      type: DataTypes.JSONB,
      defaultValue: null,
      comment: 'JSON array of religion names. null = visible to all religions',
    },
  },
  {
    tableName: 'privacy_settings',
    timestamps: true,
  }
);

// Associations
User.hasOne(PrivacySettings, { foreignKey: 'accountId', sourceKey: 'accountId', as: 'privacySettings' });
PrivacySettings.belongsTo(User, { foreignKey: 'accountId', targetKey: 'accountId', as: 'user' });

module.exports = PrivacySettings;

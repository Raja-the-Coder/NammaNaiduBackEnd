const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

/**
 * ConsentLog – tracks every consent event for legal compliance (DPDP Act).
 *
 * Each row represents a single consent action:
 *   - "grant"   : user accepted a policy version
 *   - "withdraw": user withdrew consent (DPDP right to erasure / withdrawal)
 *
 * Versioning: policyVersion ties the consent to a specific published revision
 * so we can prove which text the user agreed to, even after the policy is updated.
 */
const ConsentLog = sequelize.define(
  'ConsentLog',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    accountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'accountId',
      },
      onDelete: 'CASCADE',
      comment: 'The user who performed the consent action',
    },
    action: {
      type: DataTypes.ENUM('grant', 'withdraw'),
      allowNull: false,
      comment: 'grant = user accepted, withdraw = user revoked consent',
    },
    policyType: {
      type: DataTypes.ENUM('terms', 'privacy', 'all'),
      allowNull: false,
      comment: 'Which policy document the action applies to',
    },
    policyVersion: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '1.0',
      comment: 'Semantic version of the policy text the user agreed to / withdrew from',
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'IP address at the time of action (for audit trail)',
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Browser / app user-agent string (for audit trail)',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Extra context: e.g. { source: "registration", platform: "web" }',
    },
  },
  {
    tableName: 'consent_logs',
    timestamps: true,
    updatedAt: false, // Consent events are immutable; only createdAt matters
    indexes: [
      { fields: ['accountId'] },
      { fields: ['action'] },
      { fields: ['policyType'] },
      { fields: ['createdAt'] },
    ],
  }
);

// Associations
User.hasMany(ConsentLog, { foreignKey: 'accountId', sourceKey: 'accountId', as: 'consentLogs' });
ConsentLog.belongsTo(User, { foreignKey: 'accountId', targetKey: 'accountId', as: 'user' });

module.exports = ConsentLog;

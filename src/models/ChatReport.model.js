const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatReport = sequelize.define(
  'ChatReport',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    reporterAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    reportedAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    reason: {
      type: DataTypes.ENUM('inappropriate', 'harassment', 'spam', 'fake_profile', 'other'),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('pending', 'reviewed', 'action_taken', 'dismissed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reviewedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'chat_reports',
    timestamps: true,
    indexes: [
      { fields: ['conversationId'] },
      { fields: ['reporterAccountId'] },
      { fields: ['status'] },
    ],
  }
);

module.exports = ChatReport;

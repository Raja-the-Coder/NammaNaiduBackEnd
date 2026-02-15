const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const UserReport = sequelize.define(
  'UserReport',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    reporterAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'UUID of the user who filed the report',
    },
    reportedAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'UUID of the user being reported',
    },
    reason: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: {
          args: [['fake_profile', 'harassment', 'inappropriate', 'scam', 'underage', 'spam', 'other']],
          msg: 'Invalid report reason',
        },
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: {
          args: [['pending', 'under_review', 'action_taken', 'dismissed']],
          msg: 'Invalid status',
        },
      },
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
    actionTaken: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'warned, blocked, none',
    },
  },
  {
    tableName: 'user_reports',
    timestamps: true,
    indexes: [
      { fields: ['reporterAccountId'] },
      { fields: ['reportedAccountId'] },
      { fields: ['status'] },
      { fields: ['reason'] },
    ],
  }
);

// Associations
UserReport.belongsTo(User, { foreignKey: 'reporterAccountId', targetKey: 'accountId', as: 'reporter' });
UserReport.belongsTo(User, { foreignKey: 'reportedAccountId', targetKey: 'accountId', as: 'reported' });

module.exports = UserReport;

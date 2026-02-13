const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const Referral = sequelize.define(
  'Referral',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    referrerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      comment: 'The user who shared the referral',
    },
    referredId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      comment: 'The user who was referred (signed up with referral code)',
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'rewarded'),
      defaultValue: 'pending',
      comment: 'pending=signed up, completed=made a purchase, rewarded=bonus given',
    },
    referrerReward: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Profile view tokens rewarded to referrer',
    },
    referredReward: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Profile view tokens rewarded to referred user',
    },
    rewardedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'referrals',
    timestamps: true,
    indexes: [
      { fields: ['referrerId'] },
      { fields: ['referredId'] },
      { unique: true, fields: ['referredId'] }, // A user can only be referred once
      { fields: ['status'] },
    ],
  }
);

Referral.belongsTo(User, { foreignKey: 'referrerId', as: 'referrer' });
Referral.belongsTo(User, { foreignKey: 'referredId', as: 'referred' });

module.exports = Referral;

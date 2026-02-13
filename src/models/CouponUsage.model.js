const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');
const Coupon = require('./Coupon.model');

const CouponUsage = sequelize.define(
  'CouponUsage',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    couponId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'coupons', key: 'id' },
      onDelete: 'CASCADE',
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    transactionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'subscription_transactions', key: 'id' },
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
  },
  {
    tableName: 'coupon_usages',
    timestamps: true,
    indexes: [
      { fields: ['couponId'] },
      { fields: ['userId'] },
      { fields: ['couponId', 'userId'] },
    ],
  }
);

CouponUsage.belongsTo(User, { foreignKey: 'userId', as: 'user' });
CouponUsage.belongsTo(Coupon, { foreignKey: 'couponId', as: 'coupon' });

module.exports = CouponUsage;

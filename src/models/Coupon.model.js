const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Coupon = sequelize.define(
  'Coupon',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: { msg: 'Coupon code is required' },
      },
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    discountType: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: false,
      defaultValue: 'percentage',
      comment: 'percentage = % off, fixed = flat INR off',
    },
    discountValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: { args: [0], msg: 'Discount value must be >= 0' },
      },
    },
    maxDiscount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Maximum discount cap (for percentage type)',
    },
    minOrderAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Minimum order amount to apply coupon',
    },
    maxUses: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Total times this coupon can be used (null = unlimited)',
    },
    maxUsesPerUser: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'How many times a single user can use this coupon',
    },
    usedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    applicablePlans: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON array of plan IDs this coupon is valid for (null = all plans)',
      get() {
        const raw = this.getDataValue('applicablePlans');
        return raw ? JSON.parse(raw) : null;
      },
      set(value) {
        this.setDataValue('applicablePlans', value ? JSON.stringify(value) : null);
      },
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'expired'),
      defaultValue: 'active',
    },
  },
  {
    tableName: 'coupons',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['code'] },
      { fields: ['status'] },
      { fields: ['validUntil'] },
    ],
  }
);

module.exports = Coupon;

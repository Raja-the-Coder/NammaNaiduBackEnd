const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Otp = sequelize.define(
  'Otp',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: false,
    },
    code: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    // ── WhatsApp Delivery Tracking ──────────────────────────────
    whatsappMessageId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Meta WhatsApp message ID returned after sending OTP',
    },
    deliveryStatus: {
      type: DataTypes.ENUM('pending', 'sent', 'delivered', 'read', 'failed'),
      defaultValue: 'pending',
      comment: 'WhatsApp delivery status updated via webhook',
    },
    deliveryError: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if WhatsApp delivery failed',
    },
  },
  {
    tableName: 'otps',
    timestamps: true,
  }
);

module.exports = Otp;

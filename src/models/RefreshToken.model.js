const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const crypto = require('crypto');

const RefreshToken = sequelize.define(
  'RefreshToken',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    deviceInfo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    isRevoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: 'refresh_tokens',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'], unique: true },
      { fields: ['expiresAt'] },
    ],
  }
);

/**
 * Generate a cryptographically secure refresh token string
 */
RefreshToken.generateTokenString = () => {
  return crypto.randomBytes(64).toString('hex');
};

module.exports = RefreshToken;

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ChatTokenUsage = sequelize.define(
  'ChatTokenUsage',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    conversationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    otherUserId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    tableName: 'chat_token_usages',
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ['userId', 'conversationId'] },
      { fields: ['userId'] },
    ],
  }
);

module.exports = ChatTokenUsage;

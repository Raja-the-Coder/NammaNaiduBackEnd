const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const Conversation = sequelize.define(
  'Conversation',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user1Id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
    },
    user2Id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'conversations',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['user1Id', 'user2Id'], name: 'unique_conversation_pair' },
      { fields: ['user1Id'] },
      { fields: ['user2Id'] },
      { fields: ['lastMessageAt'] },
    ],
  }
);

Conversation.belongsTo(User, { foreignKey: 'user1Id', targetKey: 'accountId', as: 'user1' });
Conversation.belongsTo(User, { foreignKey: 'user2Id', targetKey: 'accountId', as: 'user2' });

const Message = require('./Message.model');
Conversation.hasMany(Message, { foreignKey: 'conversationId', as: 'messages' });

module.exports = Conversation;

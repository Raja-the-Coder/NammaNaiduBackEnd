const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const UserBlock = sequelize.define(
  'UserBlock',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    blockerAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
      comment: 'UUID of the user who blocked',
    },
    blockedAccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
      comment: 'UUID of the user who was blocked',
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'user_blocks',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['blockerAccountId', 'blockedAccountId'],
        name: 'unique_blocker_blocked',
      },
      { fields: ['blockerAccountId'] },
      { fields: ['blockedAccountId'] },
    ],
  }
);

// Associations
UserBlock.belongsTo(User, { foreignKey: 'blockerAccountId', targetKey: 'accountId', as: 'blocker' });
UserBlock.belongsTo(User, { foreignKey: 'blockedAccountId', targetKey: 'accountId', as: 'blocked' });

module.exports = UserBlock;

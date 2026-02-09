const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const User = require('./User.model');

const Match = sequelize.define(
  'Match',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user1AccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
      comment: 'First user in the match (the one who acted first)',
    },
    user2AccountId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'accountId' },
      onDelete: 'CASCADE',
      comment: 'Second user in the match (the one who reciprocated)',
    },
    matchScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Compatibility score 0-100 at the time of match',
    },
    matchType: {
      type: DataTypes.ENUM('mutual_interest', 'accepted'),
      allowNull: false,
      defaultValue: 'mutual_interest',
      comment: 'How the match was formed',
    },
    status: {
      type: DataTypes.ENUM('active', 'unmatched', 'blocked'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'Current match status',
    },
    unmatchedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'AccountId of user who unmatched',
    },
    unmatchedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'matches',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['user1AccountId', 'user2AccountId'],
        name: 'unique_match_pair',
      },
      { fields: ['user1AccountId'] },
      { fields: ['user2AccountId'] },
      { fields: ['status'] },
      { fields: ['matchScore'] },
      { fields: ['createdAt'] },
    ],
  }
);

// Associations
Match.belongsTo(User, { foreignKey: 'user1AccountId', targetKey: 'accountId', as: 'user1' });
Match.belongsTo(User, { foreignKey: 'user2AccountId', targetKey: 'accountId', as: 'user2' });

module.exports = Match;
